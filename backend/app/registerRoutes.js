import appointmentsRouter from "../routes/appointments.js";
import patientsRouter from "../routes/patients.js";
import cliniquesRouter from "../routes/cliniques.js";
import specialistsRouter from "../routes/specialists.js";
import securityIncidentsRouter from "../routes/securityIncidents.js";
import openaiLogsRouter from "../routes/openaiLogs.js";
import clinicianCommentsRouter from "../routes/clinicianComments.js";
import authRouter from "../routes/auth.js";
import translationRouter from "../routes/translation.js";
import mocksRouter from "../routes/mocks.js";
import healthRouter from "../routes/health.js";
import dbStatusRouter from "../routes/dbStatus.js";

import { verifyJWT } from "../middleware/verifyJWT.js";
import { attachOptionalAuth } from "../middleware/attachOptionalAuth.js";
import { requireRole } from "../middleware/requireRole.js";
import { loi25DataLeakGuard } from "../middleware/loi25DataLeakGuard.js";
import { AUTH_ROLES } from "../auth/constants.js";
import { createAiAnalyzeRouter } from "../routes/aiAnalyze.js";

export function registerRoutes(app, deps) {
    const {
        massDownloadRestrictionGuard,
        patientsMassDownloadDetector,
        openAILogsExportMassDownloadDetector,
        aiAnalyzeRouter,
    } = deps;

    app.use("/api/health", healthRouter);

    app.use("/api/ai", aiAnalyzeRouter || createAiAnalyzeRouter({}));

    app.use("/api/auth", authRouter);

    app.use(
        "/api/appointments",
        verifyJWT,
        requireRole(
            AUTH_ROLES.USER,
            AUTH_ROLES.MEDECIN,
            AUTH_ROLES.ADMIN,
            AUTH_ROLES.SUPERADMIN
        ),
        loi25DataLeakGuard,
        appointmentsRouter
    );
    app.use(
        "/api/patients",
        verifyJWT,
        requireRole(
            AUTH_ROLES.USER,
            AUTH_ROLES.MEDECIN,
            AUTH_ROLES.ADMIN,
            AUTH_ROLES.SUPERADMIN
        ),
        massDownloadRestrictionGuard,
        patientsMassDownloadDetector,
        loi25DataLeakGuard,
        patientsRouter
    );
    app.use(
        "/api/cliniques",
        verifyJWT,
        requireRole(AUTH_ROLES.ADMIN, AUTH_ROLES.SUPERADMIN),
        loi25DataLeakGuard,
        cliniquesRouter
    );
    app.use(
        "/api/specialists",
        verifyJWT,
        requireRole(AUTH_ROLES.ADMIN, AUTH_ROLES.SUPERADMIN),
        loi25DataLeakGuard,
        specialistsRouter
    );
    app.use(
        "/api/security/incidents",
        verifyJWT,
        requireRole(AUTH_ROLES.ADMIN, AUTH_ROLES.SUPERADMIN),
        loi25DataLeakGuard,
        securityIncidentsRouter
    );
    app.use(
        "/api/openai-logs",
        verifyJWT,
        requireRole(AUTH_ROLES.ADMIN, AUTH_ROLES.SUPERADMIN),
        massDownloadRestrictionGuard,
        openAILogsExportMassDownloadDetector,
        loi25DataLeakGuard,
        openaiLogsRouter
    );
    app.use(
        "/api/db-status",
        verifyJWT,
        requireRole(AUTH_ROLES.ADMIN, AUTH_ROLES.SUPERADMIN),
        loi25DataLeakGuard,
        dbStatusRouter
    );
    app.use(
        "/api/clinician-comments",
        attachOptionalAuth,
        loi25DataLeakGuard,
        clinicianCommentsRouter
    );
    app.use(
        "/api/mocks",
        verifyJWT,
        requireRole(AUTH_ROLES.ADMIN, AUTH_ROLES.SUPERADMIN),
        mocksRouter
    );
    app.use(
        "/api/auth",
        loi25DataLeakGuard,
        authRouter
    );
    app.use("/api/translation", translationRouter);
}
