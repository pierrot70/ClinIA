import { useEffect, useRef } from "react";
import { useUiLabels } from "../../hooks/useUiLabels";
import { getCachedResultNoticeLabels } from "../../i18n/cachedResultNoticeLabels";

export function CachedResultNotice({ onEdit, onView }: { onEdit: () => void; onView: () => void }) {
    const { locale } = useUiLabels();
    const cachedResultNoticeLabels = getCachedResultNoticeLabels(locale);
    const cachedResultDialogRef = useRef<HTMLDivElement>(null);
    const viewCachedResultRef = useRef<HTMLButtonElement>(null);

    useEffect(() => {
        const previousFocus = document.activeElement instanceof HTMLElement
            ? document.activeElement : null;
        viewCachedResultRef.current?.focus();
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") {
                event.preventDefault();
                onView();
            }
            if (event.key === "Tab") {
                const buttons = cachedResultDialogRef.current?.querySelectorAll<HTMLButtonElement>("button");
                if (!buttons?.length) return;
                const first = buttons[0];
                const last = buttons[buttons.length - 1];
                if (event.shiftKey && document.activeElement === first) {
                    event.preventDefault();
                    last.focus();
                } else if (!event.shiftKey && document.activeElement === last) {
                    event.preventDefault();
                    first.focus();
                }
            }
        };
        document.addEventListener("keydown", handleKeyDown);
        return () => {
            document.removeEventListener("keydown", handleKeyDown);
            if (previousFocus?.isConnected) previousFocus.focus();
        };
    }, [onView]);

    return (
        <div
            className="fixed inset-0 z-[1200] flex items-center justify-center bg-slate-950/75 px-4"
            ref={cachedResultDialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="cached-analysis-title"
            aria-describedby="cached-analysis-description"
        >
            <section className="w-full max-w-2xl rounded-lg border-2 border-amber-300 bg-white p-7 text-center shadow-2xl">
                <h2
                    id="cached-analysis-title"
                    className="text-2xl font-semibold text-slate-950"
                >
                    {cachedResultNoticeLabels.title}
                </h2>
                <p id="cached-analysis-description" className="mx-auto mt-4 max-w-xl text-base leading-7 text-slate-700">
                    {cachedResultNoticeLabels.description}
                </p>
                <p className="mx-auto mt-5 max-w-xl rounded-lg border border-sky-200 bg-sky-50 px-4 py-3 text-sm leading-6 text-sky-950">
                    {cachedResultNoticeLabels.refreshHint}
                </p>
                <div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row">
                    <button
                        type="button"
                        onClick={onEdit}
                        className="inline-flex min-h-12 items-center justify-center rounded-lg border border-blue-300 bg-white px-6 py-3 text-base font-semibold text-blue-700 shadow-xs transition hover:bg-blue-50 focus:outline-hidden focus:ring-4 focus:ring-blue-200"
                    >
                        {cachedResultNoticeLabels.editParametersAction}
                    </button>
                    <button
                        type="button"
                        ref={viewCachedResultRef}
                        onClick={onView}
                        className="inline-flex min-h-12 items-center justify-center rounded-lg bg-blue-600 px-6 py-3 text-base font-semibold text-white shadow-xs transition hover:bg-blue-700 focus:outline-hidden focus:ring-4 focus:ring-blue-200"
                    >
                        {cachedResultNoticeLabels.viewResultAction}
                    </button>
                </div>
            </section>
        </div>
    );
}
