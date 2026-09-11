import { authFetch } from "./authService";
export type ValidationReport = {
    runId: string; commit: string; dirty: boolean; finishedAt: string; passed: boolean; cleanup: boolean;
    correspondence: "match" | "mismatch" | "unknown" | "dirty";
    points: { point: number; passed: number; expected: number; total: number }[];
};
export type ReportList = { deployment: { commit: string | null }; reports: ValidationReport[]; rejected: number };
export async function fetchValidationReports(): Promise<ReportList> {
    const response = await authFetch("/api/validation-reports");
    if (!response.ok) throw new Error("REPORT_UNAVAILABLE");
    return (await response.json()).data;
}
export async function downloadValidationReport(id: string, format: "pdf" | "bundle") {
    const response = await authFetch(`/api/validation-reports/${encodeURIComponent(id)}/${format}`);
    if (!response.ok) throw new Error("REPORT_UNAVAILABLE");
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    try {
        const a = document.createElement("a"); a.href = url; a.download = `clinia-validation-${id}.${format === "pdf" ? "pdf" : "json"}`;
        document.body.appendChild(a); a.click(); a.remove();
    } finally { setTimeout(() => URL.revokeObjectURL(url), 1000); }
}
