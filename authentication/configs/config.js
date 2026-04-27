import Credentials from "@auth/express/providers/credentials";
import User from "../models/users.js";
import ActivityLog from "../../cebrol/models/activityLog.js";
import { verifyPassword } from "../utils/password.js";
import { ROLES } from "../utils/roles.js";

const isProd = process.env.NODE_ENV === "production";
const frontendUrl = String(process.env.FRONTEND_URL ?? "").replace(/\/+$/, "");

export const authConfig = {
  trustHost: true,
  secret: process.env.AUTH_SECRET,
  useSecureCookies: isProd,
  cookies: {
    // Ensure cookies work cross-site (Vercel -> DigitalOcean) in production.
    // Also avoid setting a Domain attribute (can be invalid on platform domains).
    sessionToken: {
      name: isProd ? "__Host-authjs.session-token" : "authjs.session-token",
      options: {
        httpOnly: true,
        sameSite: isProd ? "lax" : "lax",
        path: "/",
        secure: isProd,
      },
    },
    csrfToken: {
      name: isProd ? "__Host-authjs.csrf-token" : "authjs.csrf-token",
      options: {
        httpOnly: true,
        sameSite: isProd ? "lax" : "lax",
        path: "/",
        secure: isProd,
      },
    },
    callbackUrl: {
      name: isProd ? "__Host-authjs.callback-url" : "authjs.callback-url",
      options: {
        httpOnly: true,
        sameSite: isProd ? "lax" : "lax",
        path: "/",
        secure: isProd,
      },
    },
  },
  session: {
    // Default is JWT when no database adapter is configured.
    strategy: "jwt",
  },
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      authorize: async (credentials) => {
        const email = String(credentials?.email ?? "").toLowerCase().trim();
        const password = String(credentials?.password ?? "");

        if (!email || !password) return null;

        const user = await User.findOne({ email }).lean();
        if (!user || user.isActive === false) return null;

        const ok = await verifyPassword(password, user.passwordHash);
        if (!ok) return null;

        // Update lastLogin
        await User.updateOne({ _id: user._id }, { lastLogin: new Date() });

        // Fire-and-forget login activity log (no req context here)
        ActivityLog.create({
          actor:     String(user._id),
          actorName: user.name ?? email,
          actorRole: user.role ?? ROLES.ASSIGNED_USER,
          category:  "Login",
          action:    "login",
          target:    user.email,
          ip:        "",
        }).catch(() => {});

        return {
          id:          String(user._id),
          name:        user.name ?? email,
          email:       user.email,
          role:        user.role ?? ROLES.ASSIGNED_USER,
          permissions: user.permissions ?? [],
          office:      user.office ? String(user.office) : null,
          position:    user.position ?? "",
        };
      },
    }),
  ],
  callbacks: {
    async redirect({ url, baseUrl }) {
      // If frontend URL is provided, always bring users back there.
      // This prevents redirecting to the backend domain after sign-in/sign-out.
      if (frontendUrl) {
        // url may be relative like "/admin/dashboard"
        if (url.startsWith("/")) return `${frontendUrl}${url}`;
        // allow absolute URLs only if they point to the frontend
        if (url.startsWith(frontendUrl)) return url;
        return frontendUrl;
      }

      // Default behavior: allow same-origin redirects; fallback to baseUrl.
      if (url.startsWith("/")) return `${baseUrl}${url}`;
      if (url.startsWith(baseUrl)) return url;
      return baseUrl;
    },
    async jwt({ token, user }) {
      if (user) {
        token.id          = user.id;
        token.role        = user.role;
        token.permissions = user.permissions ?? [];
        token.office      = user.office ?? null;
        token.position    = user.position ?? "";
      }
      return token;
    },
    async session({ session, token }) {
      if (session?.user) {
        session.user.id          = token?.id;
        session.user.role        = token?.role;
        session.user.permissions = token?.permissions ?? [];
        session.user.office      = token?.office ?? null;
        session.user.position    = token?.position ?? "";
      }
      return session;
    },
  },
};
