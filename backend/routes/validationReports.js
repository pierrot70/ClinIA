import express from "express";
import { verifyJWT } from "../middleware/verifyJWT.js";
import { requireRole } from "../middleware/requireRole.js";
import { ValidationReportAudit } from "../models/ValidationReportAudit.js";
import { getValidationReport, listValidationReports } from "../services/validationReports.js";
import { evidenceBundle, reportPdf, sha256 } from "../services/validationReportFormat.js";
const router = express.Router();
router.use(verifyJWT, requireRole("SUPERADMIN"));
router.use((_req, res, next) => { res.set("Cache-Control", "no-store"); res.set("X-Content-Type-Options", "nosniff"); next(); });
const audit = (req, action, runId = null, format = null) => ValidationReportAudit.create({ userId: req.auth.userId, ip: req.ip, action, runId, format });
const fail = (res, err) => res.status(err.status === 404 ? 404 : 503).json({ error: { code: err.status === 404 ? "REPORT_NOT_FOUND" : "REPORT_UNAVAILABLE", message: "Rapport indisponible.", retryable: false } });
router.get("/", async (req, res) => {
    try { const data = await listValidationReports(); await audit(req, "LIST"); res.json({ data }); }
    catch (err) { fail(res, err); }
});
router.get("/:id/:format", async (req, res) => {
    if (!["pdf", "bundle"].includes(req.params.format)) return res.status(404).end();
    try {
        const report = await getValidationReport(req.params.id);
        const pdf = req.params.format === "pdf";
        const bytes = pdf ? reportPdf(report) : evidenceBundle(report);
        // Fail closed: no export if the audit cannot be persisted.
        await audit(req, "DOWNLOAD", report.runId, req.params.format);
        res.set("Content-Disposition", `attachment; filename="clinia-validation-${report.runId}.${pdf ? "pdf" : "json"}"`);
        res.set("X-Content-SHA256", sha256(bytes));
        res.type(pdf ? "application/pdf" : "application/json").send(bytes);
    } catch (err) { fail(res, err); }
});
export default router;
