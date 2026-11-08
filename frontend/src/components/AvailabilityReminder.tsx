import { CalendarDays } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { useUiLabelTree } from "../hooks/useUiLabels";
import { labels } from "../i18n/uiLabels";
import { AvailabilityScheduleForm, type AvailabilityTemplate, type WeeklyRange } from "./AvailabilityScheduleForm";

const LOW_AVAILABILITY_THRESHOLD = 20;
const AVAILABILITY_API = "/api/my-availability";
const secondaryButton = "rounded-md border border-amber-800 bg-white px-3 py-2 text-sm font-semibold hover:bg-amber-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-800 disabled:opacity-50";

type Completion = { availableCount: number; added: number };

export function AvailabilityReminder() {
    const { authFetch } = useAuth();
    const { pathname } = useLocation();
    const copy = useUiLabelTree(labels.availabilityReminder);
    const [availableCount, setAvailableCount] = useState<number | null>(null);
    const [template, setTemplate] = useState<AvailabilityTemplate | null>(null);
    const [completion, setCompletion] = useState<Completion | null>(null);
    const [pending, setPending] = useState(false);
    const [errorCode, setErrorCode] = useState<string | null>(null);
    const operation = useRef<AbortController | null>(null);
    const onLoginPage = /\/login\/?$/i.test(pathname);

    useEffect(() => {
        const controller = new AbortController();
        async function loadAvailability() {
            try {
                const response = await authFetch("/api/appointments/my-availability-summary", {
                    signal: controller.signal,
                    retryOnUnauthorized: false,
                });
                if (!response.ok) return;

                const { data } = await response.json();
                const count = data?.availableCount;
                if (!controller.signal.aborted && Number.isInteger(count) && count >= 0 && count < LOW_AVAILABILITY_THRESHOLD) {
                    setAvailableCount(count);
                }
            } catch {
                // Availability is optional and never blocks a clinician's session.
            }
        }

        void loadAvailability();
        return () => {
            controller.abort();
            operation.current?.abort();
        };
    }, [authFetch]);

    async function request<T>(path: string, method: string, signal: AbortSignal, ranges?: WeeklyRange[]): Promise<T> {
        const response = await authFetch(AVAILABILITY_API + path, {
            method,
            signal,
            ...(ranges ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ranges }) } : {}),
        });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload?.error?.code ?? "PERSISTENCE_FAILED");
        return payload.data as T;
    }

    async function runOperation(run: (signal: AbortSignal) => Promise<void>) {
        if (operation.current) return;

        const controller = new AbortController();
        operation.current = controller;
        setPending(true);
        setErrorCode(null);
        try {
            await run(controller.signal);
        } catch (error) {
            if (!controller.signal.aborted) setErrorCode(error instanceof Error ? error.message : "PERSISTENCE_FAILED");
        } finally {
            operation.current = null;
            if (!controller.signal.aborted) setPending(false);
        }
    }

    async function openSchedule(signal: AbortSignal) {
        const saved = await request<AvailabilityTemplate>("/template", "GET", signal);
        if (!signal.aborted) setTemplate(saved);
    }

    function complete(ranges?: WeeklyRange[]) {
        void runOperation(async signal => {
            if (ranges) {
                await request("/template", "PUT", signal, ranges);
                if (signal.aborted) return;
            }
            try {
                const result = await request<Completion>("/complete", "POST", signal);
                if (signal.aborted) return;
                setAvailableCount(result.availableCount);
                setCompletion(result);
                setTemplate(null);
            } catch (error) {
                if (signal.aborted) return;
                if (error instanceof Error && error.message === "SCHEDULE_REQUIRED") {
                    await openSchedule(signal);
                } else {
                    throw error;
                }
            }
        });
    }

    if (onLoginPage || availableCount === null) return null;

    const errorLabels: Record<string, string> = {
        OVERLAPPING_SCHEDULE: copy.overlap,
        INVALID_SCHEDULE: copy.invalid,
        SCHEDULE_UNAVAILABLE: copy.unavailable,
    };

    return (
        <div className="px-4 pt-4 sm:px-6">
            <div className="mx-auto max-w-6xl space-y-4 rounded-lg border border-amber-300 border-s-4 border-s-amber-600 bg-amber-100 px-4 py-4 text-amber-950 sm:px-5">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    <div className="flex min-w-0 items-start gap-3">
                        <CalendarDays aria-hidden="true" className="mt-0.5 size-6 shrink-0 text-amber-800" />
                        <div role="status" className="min-w-0">
                            <p className="text-sm font-semibold">{copy.title}</p>
                            <p className="mt-1 text-lg font-semibold leading-snug sm:text-xl">
                                {completion
                                    ? copy.result.replace("{added}", String(completion.added)).replace("{count}", String(availableCount))
                                    : copy.body.replace("{count}", String(availableCount))}
                            </p>
                            {completion && availableCount < LOW_AVAILABILITY_THRESHOLD && <p className="mt-1 text-sm">{copy.partial}</p>}
                        </div>
                    </div>
                    <div className="flex shrink-0 flex-wrap items-center gap-2">
                        {!template && !completion && availableCount < LOW_AVAILABILITY_THRESHOLD && (
                            <button type="button" disabled={pending} className="rounded-md bg-amber-950 px-3 py-2 text-sm font-semibold text-white hover:bg-amber-900 disabled:opacity-50" onClick={() => complete()}>
                                {pending ? copy.working : copy.complete}
                            </button>
                        )}
                        {!template && (
                            <button type="button" disabled={pending} className={secondaryButton} onClick={() => void runOperation(openSchedule)}>
                                {copy.schedule}
                            </button>
                        )}
                        <button type="button" disabled={pending} className={secondaryButton} onClick={() => setAvailableCount(null)}>
                            {copy.dismiss}
                        </button>
                    </div>
                </div>
                {template && (
                    <AvailabilityScheduleForm
                        template={template}
                        pending={pending}
                        onSubmit={complete}
                        onCancel={() => { setTemplate(null); setErrorCode(null); }}
                    />
                )}
                {errorCode && <p role="alert" className="font-medium text-red-900">{errorLabels[errorCode] ?? copy.failed}</p>}
            </div>
        </div>
    );
}
