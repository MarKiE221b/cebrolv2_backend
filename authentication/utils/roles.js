/**
 * Centralised role & permission constants for the CEB Repo system.
 *
 * ROLES
 * ─────
 * super_admin            – Full system access. Manages users, offices, all content.
 * communications_secretary – Manages CEB documents, agenda, scheduler, assigned users.
 * assigned_user          – Office-bound user. Access determined by granted permissions.
 *
 * PERMISSIONS
 * ───────────
 * Fine-grained flags stored on each user. Roles carry a default permission set that is
 * seeded on user creation but can be individually overridden by a super_admin.
 */

export const ROLES = Object.freeze({
  SUPER_ADMIN:               "super_admin",
  COMMUNICATIONS_SECRETARY:  "communications_secretary",
  ASSIGNED_USER:             "assigned_user",
});

export const ROLE_LABELS = Object.freeze({
  super_admin:              "Super Administrator",
  communications_secretary: "Communications Secretary",
  assigned_user:            "Assigned User",
});

/** Ordered list used in dropdowns (most privileged first). */
export const ROLE_LIST = [
  ROLES.SUPER_ADMIN,
  ROLES.COMMUNICATIONS_SECRETARY,
  ROLES.ASSIGNED_USER,
];

// ── Granular permission flags ────────────────────────────────────────────────

export const PERMISSIONS = Object.freeze({
  // Users
  USERS_VIEW:        "users:view",
  USERS_CREATE:      "users:create",
  USERS_EDIT:        "users:edit",
  USERS_DELETE:      "users:delete",

  // Offices
  OFFICES_VIEW:      "offices:view",
  OFFICES_MANAGE:    "offices:manage",

  // CEB Repository
  REPO_VIEW:         "repo:view",
  REPO_UPLOAD:       "repo:upload",
  REPO_DELETE:       "repo:delete",

  // Agenda
  AGENDA_VIEW:       "agenda:view",
  AGENDA_MANAGE:     "agenda:manage",

  // Scheduler / Meetings
  SCHEDULER_VIEW:    "scheduler:view",
  SCHEDULER_MANAGE:  "scheduler:manage",

  // Logs
  LOGS_VIEW:         "logs:view",
});

/** Default permissions granted per role on user creation. */
export const DEFAULT_ROLE_PERMISSIONS = Object.freeze({
  [ROLES.SUPER_ADMIN]: Object.values(PERMISSIONS),

  [ROLES.COMMUNICATIONS_SECRETARY]: [
    PERMISSIONS.USERS_VIEW,
    PERMISSIONS.OFFICES_VIEW,
    PERMISSIONS.REPO_VIEW,
    PERMISSIONS.REPO_UPLOAD,
    PERMISSIONS.REPO_DELETE,
    PERMISSIONS.AGENDA_VIEW,
    PERMISSIONS.AGENDA_MANAGE,
    PERMISSIONS.SCHEDULER_VIEW,
    PERMISSIONS.SCHEDULER_MANAGE,
    PERMISSIONS.LOGS_VIEW,
  ],

  [ROLES.ASSIGNED_USER]: [
    PERMISSIONS.REPO_VIEW,
    PERMISSIONS.AGENDA_VIEW,
    PERMISSIONS.SCHEDULER_VIEW,
  ],
});
