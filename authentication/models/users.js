import mongoose from "mongoose";
import { ROLES, DEFAULT_ROLE_PERMISSIONS } from "../utils/roles.js";

const userSchema = new mongoose.Schema(
  {
    // ── Identity ──────────────────────────────────────────────────────────
    name: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    passwordHash: {
      type: String,
      required: true,
    },

    // ── Role & Permissions ────────────────────────────────────────────────
    /**
     * Primary role determines base access level.
     * super_admin | communications_secretary | assigned_user
     */
    role: {
      type: String,
      enum: Object.values(ROLES),
      required: true,
      default: ROLES.ASSIGNED_USER,
    },
    /**
     * Granular permission flags. Seeded from DEFAULT_ROLE_PERMISSIONS on
     * creation; can be individually overridden by a super_admin.
     */
    permissions: {
      type: [String],
      default: [],
    },

    // ── Office assignment ─────────────────────────────────────────────────
    /** The office / division this user belongs to. */
    office: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Office",
      default: null,
    },

    // ── Profile ───────────────────────────────────────────────────────────
    position: {
      type: String,
      trim: true,
      default: "",
    },
    contactNumber: {
      type: String,
      trim: true,
      default: "",
    },
    /** URL or path of profile picture. */
    avatar: {
      type: String,
      default: "",
    },

    // ── Account state ─────────────────────────────────────────────────────
    isActive: {
      type: Boolean,
      default: true,
    },
    /** Timestamp of the last successful login. */
    lastLogin: {
      type: Date,
      default: null,
    },
    /** Which super_admin created this account. */
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    /** Optional note set when deactivating an account. */
    deactivationReason: {
      type: String,
      default: "",
    },
  },
  { timestamps: true },
);

// ── Indexes ────────────────────────────────────────────────────────────────
userSchema.index({ role: 1 });
userSchema.index({ office: 1 });
userSchema.index({ isActive: 1 });

// ── Pre-save: seed default permissions when role is first set ──────────────
userSchema.pre("save", async function () {
  if (this.isNew && (!this.permissions || this.permissions.length === 0)) {
    this.permissions = DEFAULT_ROLE_PERMISSIONS[this.role] ?? [];
  }
});

// ── Safe public projection ─────────────────────────────────────────────────
userSchema.methods.toPublic = function () {
  const obj = this.toObject();
  delete obj.passwordHash;
  return obj;
};

const User = mongoose.models.User || mongoose.model("User", userSchema);

export default User;
