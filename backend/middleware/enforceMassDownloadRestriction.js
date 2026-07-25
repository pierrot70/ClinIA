import { recordAuthAuditEvent } from "../audit/authAudit.js";
import { AdminUser } from "../models/AdminUser.js";
import { getTrustedRequestIp } from "../utils/requestIp.js";

export function enforceMassDownloadRestriction() {
    return async function massDownloadRestrictionMiddleware(req, res, next) {
        const userId = req.auth?.userId;

        if (!userId) {
            return next();
        }

        const userQuery = AdminUser.findById(userId)
            .select("_id username role massDownloadRestrictedUntil");
        const user =
            typeof userQuery?.lean === "function"
                ? await userQuery.lean()
                : await userQuery;

        if (!user?.massDownloadRestrictedUntil) {
            return next();
        }

        const restrictedUntil = new Date(user.massDownloadRestrictedUntil);
        if (restrictedUntil.getTime() <= Date.now()) {
            return next();
        }

        await recordAuthAuditEvent({
            action: "RESTRICTED_ACCESS_BLOCKED",
            outcome: "BLOCKED",
            userId: String(user._id),
            username: user.username,
            role: user.role,
            ip: getTrustedRequestIp(req),
            reason: "MASS_DOWNLOAD_RESTRICTION_ACTIVE",
        });

        return res.status(423).json({
            error: {
                code: "ACCOUNT_TEMPORARILY_RESTRICTED",
                message:
                    "Acces temporairement restreint apres un incident de securite. Reessayez plus tard ou contactez un SUPERADMIN.",
                retryable: false,
                restrictedUntil: restrictedUntil.toISOString(),
            },
        });
    };
}
