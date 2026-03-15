import User         from "../../authentication/models/users.js";
import CebDocument  from "../../cebrol/models/cebDocument.js";
import Agenda       from "../../cebrol/models/agenda.js";
import Meeting      from "../../cebrol/models/meeting.js";
import AccessRequest from "../../cebrol/models/accessRequest.js";
import ActivityLog  from "../../cebrol/models/activityLog.js";
import { MEETING_STATUS, ACCESS_STATUS } from "../../cebrol/utils/constants.js";

export const getDashboardStats = async (req, res, next) => {
  try {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfWeek  = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay());

    const [
      totalUsers,
      newUsersThisMonth,
      totalDocs,
      docsThisWeek,
      totalAgendas,
      totalMeetings,
      scheduledMeetings,
      nextMeeting,
      pendingAccess,
      recentLogs,
    ] = await Promise.all([
      User.countDocuments({}),
      User.countDocuments({ createdAt: { $gte: startOfMonth } }),
      CebDocument.countDocuments({}),
      CebDocument.countDocuments({ createdAt: { $gte: startOfWeek } }),
      Agenda.countDocuments({}),
      Meeting.countDocuments({}),
      Meeting.countDocuments({ status: MEETING_STATUS.SCHEDULED }),
      Meeting.findOne({ status: MEETING_STATUS.SCHEDULED, scheduledDate: { $gte: now } })
        .sort({ scheduledDate: 1 })
        .select("title scheduledDate meetingCode meetingRef")
        .lean(),
      AccessRequest.countDocuments({ status: ACCESS_STATUS.PENDING }),
      ActivityLog.find({})
        .sort({ createdAt: -1 })
        .limit(8)
        .lean(),
    ]);

    return res.json({
      ok: true,
      data: {
        totalUsers,
        newUsersThisMonth,
        totalDocs,
        docsThisWeek,
        totalAgendas,
        totalMeetings,
        scheduledMeetings,
        nextMeeting,
        pendingAccess,
        recentActivity: recentLogs,
      },
    });
  } catch (err) {
    next(err);
  }
};

export const getUserStats = async (req, res, next) => {
  try {
    const userId = res.locals.session?.user?.id;

    const [myRequests, pendingReqs, approvedReqs, recentLogs] = await Promise.all([
      AccessRequest.countDocuments({ requestedBy: userId }),
      AccessRequest.countDocuments({ requestedBy: userId, status: ACCESS_STATUS.PENDING }),
      AccessRequest.countDocuments({ requestedBy: userId, status: ACCESS_STATUS.APPROVED }),
      ActivityLog.find({ actor: userId })
        .sort({ createdAt: -1 })
        .limit(5)
        .lean(),
    ]);

    return res.json({
      ok: true,
      data: {
        myRequests,
        pendingReqs,
        approvedReqs,
        recentActivity: recentLogs,
      },
    });
  } catch (err) {
    next(err);
  }
};
