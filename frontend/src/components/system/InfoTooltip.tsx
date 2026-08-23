import { useState, type ReactNode } from "react";

type InfoTooltipProps = {
    label: string;
    children: ReactNode;
};

export function InfoTooltip({ label, children }: InfoTooltipProps) {
    const [isOpen, setIsOpen] = useState(false);

    return (
        <span
            className="relative inline-block align-middle"
            onPointerEnter={(event) => {
                if (event.pointerType === "mouse") setIsOpen(true);
            }}
            onPointerLeave={(event) => {
                if (event.pointerType === "mouse") setIsOpen(false);
            }}
        >
            <button
                type="button"
                className="ml-1 inline-flex h-5 w-5 cursor-pointer items-center justify-center rounded-full border border-sky-300 bg-sky-50 text-xs font-bold text-sky-800 hover:bg-sky-100 focus:outline-none focus:ring-2 focus:ring-sky-400"
                aria-label={label}
                aria-expanded={isOpen}
                onClick={() => setIsOpen((current) => !current)}
            >
                ?
            </button>
            {isOpen ? (
                <span
                    role="tooltip"
                    className="clinical-info-tip absolute left-0 top-7 z-[70] w-72 max-w-[calc(100vw-2rem)] rounded-lg border border-sky-200 bg-white p-3 text-left text-xs font-normal leading-5 text-slate-700 shadow-lg"
                >
                    {children}
                </span>
            ) : null}
        </span>
    );
}
