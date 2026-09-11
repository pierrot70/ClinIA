import { useEffect, useState } from "react";
import { useHomeI18n } from "../contexts/HomeI18nContext";
import { validationReportLabels } from "../i18n/validationReportLabels";
import { downloadValidationReport, fetchValidationReports, type ReportList, type ValidationReport } from "../services/validationReportsApi";

function formatValidationDate(value: string, locale: string) {
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return "—";
    return new Intl.DateTimeFormat(locale, {
        timeZone: "America/Toronto", year: "numeric", month: "2-digit", day: "2-digit",
        hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23", timeZoneName: "short",
    }).format(date);
}

export function ValidationReportsPage() {
    const { locale } = useHomeI18n();
    const t = validationReportLabels(locale);
    const [data, setData] = useState<ReportList | null>(null);
    const [loading, setLoading] = useState(true), [error, setError] = useState(false), [busy, setBusy] = useState(false);
    async function load() { setLoading(true); setError(false); setData(null); try { setData(await fetchValidationReports()); } catch { setError(true); } finally { setLoading(false); } }
    useEffect(() => { void load(); }, []);
    async function download(id: string, format: "pdf" | "bundle") { setBusy(true); setError(false); try { await downloadValidationReport(id, format); } catch { setError(true); } finally { setBusy(false); } }
    const groups = new Map<string, ValidationReport[]>();
    // Use the full hash, never a shortened prefix. Keep every execution, including
    // failures and dirty runs, ordered from newest to oldest within each commit.
    for (const report of [...(data?.reports || [])].sort((a, b) => b.finishedAt.localeCompare(a.finishedAt))) {
        const runs = groups.get(report.commit) || [];
        runs.push(report); groups.set(report.commit, runs);
    }
    return <section className="mx-auto max-w-5xl space-y-4 px-4 py-6">
        <p className="text-sm text-gray-600">{t.title} → {t.concurrency}</p>
        <h1 className="text-2xl font-semibold">{t.walkInBooking}</h1>
        <p className="rounded border border-amber-300 bg-amber-50 p-3">{t.scope}</p>
        <button disabled={loading} onClick={() => void load()} className="rounded bg-blue-600 px-4 py-2 text-white disabled:opacity-50">{t.refresh}</button>
        {error && <p role="alert" className="text-red-700">{t.error}</p>}
        {loading ? <p>{t.loading}</p> : data && <>
            <p>{t.version}: <code className="break-all">{data.deployment.commit || t.unknown}</code></p>
            {data.rejected > 0 && <p role="alert" className="text-red-700">{t.rejected}</p>}
            {data.reports.length === 0 && <p>{t.empty}</p>}
            {[...groups].map(([commit, runs]) => <details key={commit} className="rounded border bg-white">
                <summary className="cursor-pointer rounded p-4 font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600">
                    {t.tested}: <code className="break-all">{commit}</code>
                    <span className="ml-3 text-sm font-normal">{t.runs}: {runs.length}</span>
                    <span className="ml-3 text-sm font-normal">{t.latestValidation}: <time dateTime={runs[0].finishedAt} title="America/Toronto">{formatValidationDate(runs[0].finishedAt, locale)}</time></span>
                    {runs.some(run => !run.passed) && <span className="ml-3 text-sm text-red-700">{t.failed}: {runs.filter(run => !run.passed).length}</span>}
                </summary>
                <div className="divide-y border-t">{runs.map(report => <article key={report.runId} className="space-y-3 p-4">
                <h2 className="break-all font-semibold">{t.run}: {report.runId}</h2>
                <p className={report.correspondence === "match" ? "text-blue-800" : "font-semibold text-red-700"}>{t[report.correspondence]}</p>
                {report.dirty && report.correspondence !== "dirty" && <p className="text-red-700">{t.dirty}</p>}
                <p className={report.passed ? "text-green-800" : "font-semibold text-red-700"}>{report.passed ? t.passed : t.failed}</p>
                <p>{t.date}: {report.finishedAt}</p>
                <p>{t.cleanup}: {report.cleanup ? t.yes : t.no}</p>
                <ul>{report.points.filter(p => p.point > 0).map(p => <li key={p.point}>{t[`point${p.point}` as keyof typeof t]}: {p.passed}/{p.expected}</li>)}</ul>
                <div className="flex flex-wrap gap-3"><button disabled={busy} onClick={() => void download(report.runId, "pdf")} className="rounded border px-3 py-2">{t.pdf}</button>
                    <button disabled={busy} onClick={() => void download(report.runId, "bundle")} className="rounded border px-3 py-2">{t.bundle}</button></div>
            </article>)}</div>
            </details>)}
        </>}
    </section>;
}
