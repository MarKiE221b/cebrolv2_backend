import "dotenv/config";
import express from "express";
import helmet from "helmet";
import cors from "cors";
import rateLimit from "express-rate-limit";
import hpp from "hpp";
import morgan from "morgan";
import mongoose from "mongoose";
import { clerkMiddleware } from "@clerk/express";
import authRouter from "./authentication/routes/auth.js";
import officesRouter from "./authentication/routes/offices.js";
import systemsRouter from "./website/routes/systems.js";
import newsRouter from "./website/routes/news.js";
import schoolsRouter from "./website/routes/schools.js";
import bannersRouter from "./website/routes/banners.js";
import fileSpacesRoutes from "./website/routes/fileSpacesRoutes.js";
import { authSession } from "./authentication/middlewares/authSession.js";
import meetingRouter       from "./cebrol/routes/meeting.js";
import agendaRouter        from "./cebrol/routes/agenda.js";
import cebDocumentRouter   from "./cebrol/routes/cebDocument.js";
import accessRequestRouter from "./cebrol/routes/accessRequest.js";
import logsRouter          from "./cebrol/routes/activityLog.js";
import { getDashboardStats, getUserStats } from "./authentication/controllers/stats.js";
import { requireRole } from "./authentication/middlewares/authSession.js";
import { ROLES } from "./authentication/utils/roles.js";
const app = express();

// Connect to MongoDB
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log("Connected to MongoDB"))
  .catch((err) => console.error("MongoDB connection error:", err));

// Middleware
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
  }),
);

app.use(
  cors({
    origin: function (origin, callback) {
      const allowedOrigins = (
        process.env.ALLOWED_ORIGINS?.split(",") ?? ["http://localhost:5173"]
      )
        .map((o) => String(o).trim())
        .filter(Boolean);
      // Allow requests with no origin (like mobile apps or curl requests)
      if (!origin) return callback(null, true);
      if (!allowedOrigins.includes(origin)) {
        const msg =
          "The CORS policy for this site does not allow access from the specified Origin.";
        return callback(new Error(msg), false);
      }
      return callback(null, origin);
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    preflightContinue: false,
    optionsSuccessStatus: 204,
  }),
);

// Body parser
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));
app.use(hpp());
app.use(morgan("combined"));
app.use(rateLimit({ windowMs: 1 * 60 * 1000, max: 100 })); // 100 requests per 1 min

// Clerk authentication middleware (must be before routes)
app.set("trust proxy", 1);
app.use(clerkMiddleware());

// Routes
app.use("/api/auth", authRouter);
app.use("/api/offices", officesRouter);

// Website routes
app.use("/api/systems", systemsRouter);
app.use("/api/news", newsRouter);
app.use("/api/schools", schoolsRouter);
app.use("/api/banners", bannersRouter);
app.use("/api/files", fileSpacesRoutes);

// CEB Repository / Secretary routes
app.use("/api/meetings",        authSession, meetingRouter);
app.use("/api/agenda",          authSession, agendaRouter);
app.use("/api/ceb-documents",   authSession, cebDocumentRouter);
app.use("/api/access-requests", authSession, accessRequestRouter);
app.use("/api/logs",            authSession, requireRole(ROLES.SUPER_ADMIN, ROLES.COMMUNICATIONS_SECRETARY), logsRouter);
app.get("/api/stats",           authSession, requireRole(ROLES.SUPER_ADMIN, ROLES.COMMUNICATIONS_SECRETARY), getDashboardStats);
app.get("/api/stats/me",        authSession, getUserStats);

app.get("/health", (req, res) => {
  res.json({ ok: true });
});

// Error handler
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: "Internal server error" });
});

// start the server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
