/**
 * CEB Module — shared constants.
 * Keep in sync with the frontend mirror in cebrepo/src/pages/user_secretary/utils/cebConstants.js
 */

/** Meeting type codes */
export const MEETING_CODES = Object.freeze({
  CEB: "CEB", // Commission en Banc only meetings
  EXE: "EXE", // Executive Session Meetings
  MAN: "MAN", // ManComm
  NDM: "NDM", // National Directorate Meeting
  REF: "REF", // Resolutions issued by referendum
});

export const MEETING_CODE_LABELS = Object.freeze({
  CEB: "Commission en Banc",
  EXE: "Executive Session",
  MAN: "ManComm",
  NDM: "National Directorate Meeting",
  REF: "Referendum Resolution",
});

export const MEETING_CODE_LIST = Object.values(MEETING_CODES);

/** Document classification */
export const DOC_STATUS = Object.freeze({
  DRAFT:     "DRAFT",
  PUBLISHED: "PUBLISHED",
  ARCHIVED:  "ARCHIVED",
});

/** Access request status */
export const ACCESS_STATUS = Object.freeze({
  PENDING:  "PENDING",
  APPROVED: "APPROVED",
  DENIED:   "DENIED",
  REVOKED:  "REVOKED",
});

/** Meeting status */
export const MEETING_STATUS = Object.freeze({
  SCHEDULED:   "SCHEDULED",
  IN_PROGRESS: "IN_PROGRESS",
  COMPLETED:   "COMPLETED",
  CANCELLED:   "CANCELLED",
});

/** Board action taken on a CEB document */
export const BOARD_ACTION = Object.freeze({
  APPROVED:               "APPROVED",
  CONDITIONALLY_APPROVED: "CONDITIONALLY_APPROVED",
  DISAPPROVED:            "DISAPPROVED",
});

/** Per-office compliance status for assigned offices on a CEB document */
export const OFFICE_STATUS = Object.freeze({
  PENDING:        "PENDING",
  RECEIVED:       "RECEIVED",
  IN_PROGRESS:    "IN_PROGRESS",
  COMPLIED:       "COMPLIED",
  NOT_APPLICABLE: "NOT_APPLICABLE",
});
