import { useEffect, useId, useRef } from "react";

export type GuidedStep = {
    title: string;
    description: string;
    current: number;
    total: number;
    action?: { label: string; disabled?: boolean; run: () => void };
};

/** A local UI only. Actions are provided explicitly by the owning workflow. */
export function GuidedWorkflow({ active, step, text, onStart, onStop }: {
    active: boolean;
    step: GuidedStep;
    text: { start: string; title: string; introduction: string; privacy: string; stop: string; progress: string };
    onStart: () => void;
    onStop: () => void;
}) {
    const titleId = useId();
    const stepId = useId();
    const startButton = useRef<HTMLButtonElement>(null);
    const wasActive = useRef(active);
    useEffect(() => {
        if (wasActive.current && !active) startButton.current?.focus();
        wasActive.current = active;
    }, [active]);
    if (!active) return <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
        <button ref={startButton} type="button" onClick={onStart} className="rounded bg-blue-700 px-4 py-2 text-sm font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700">
            {text.start}
        </button>
        <p className="mt-2 text-sm text-slate-700">{text.introduction}</p>
    </div>;

    const progress = text.progress.replace("{current}", String(step.current)).replace("{total}", String(step.total));
    return <aside aria-labelledby={titleId} className="rounded-lg border border-blue-300 bg-blue-50 p-4 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 id={titleId} className="font-semibold text-blue-950">{text.title}</h2>
            <button type="button" onClick={onStop} className="rounded border border-blue-300 bg-white px-3 py-2 text-sm font-medium text-blue-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700">
                {text.stop}
            </button>
        </div>
        <div aria-live="polite" aria-atomic="true" className="mt-3">
            <p className="text-xs font-medium text-blue-800">{progress}</p>
            <progress aria-label={progress} value={step.current} max={step.total} className="mt-1 h-1.5 w-full accent-blue-700" />
            <h3 id={stepId} className="mt-3 font-semibold text-slate-950">{step.title}</h3>
            <p className="mt-1 text-sm text-slate-800">{step.description}</p>
        </div>
        {step.action && <button type="button" onClick={step.action.run} disabled={step.action.disabled} aria-describedby={stepId}
            className="mt-3 rounded bg-blue-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700">
            {step.action.label}
        </button>}
        <p className="mt-3 border-t border-blue-200 pt-3 text-xs text-slate-700">{text.privacy}</p>
    </aside>;
}
