import { useRef } from "react";
import { NavLink } from "react-router-dom";
import { useHomeI18n } from "../../contexts/HomeI18nContext";
import { validationReportLabels } from "../../i18n/validationReportLabels";

// Shared by desktop and mobile; render only within SUPERADMIN navigation.
export function ValidationReportsMenu({ mobile = false, onNavigate }: { mobile?: boolean; onNavigate?: () => void }) {
    const { locale } = useHomeI18n();
    const t = validationReportLabels(locale);
    const menu = useRef<HTMLDetailsElement>(null);
    const concurrency = useRef<HTMLDetailsElement>(null);
    return <details ref={menu} className="relative">
        <summary className="cursor-pointer rounded px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 focus-visible:outline focus-visible:outline-blue-600">{t.title}</summary>
        <nav aria-label={t.title} className={mobile ? "ml-4 border-l pl-2" : "absolute left-0 z-50 mt-1 min-w-56 rounded border bg-white p-1 shadow-lg"}>
            <details ref={concurrency}>
                <summary className="cursor-pointer rounded px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 focus-visible:outline focus-visible:outline-blue-600">{t.concurrency}</summary>
                <div className="ml-3 border-l pl-2">
            <NavLink to="/admin/validation-reports/concurrency/walk-in" onClick={() => { if (concurrency.current) concurrency.current.open = false; if (menu.current) menu.current.open = false; onNavigate?.(); }}
                className={({ isActive }) => `block rounded px-3 py-2 text-sm ${isActive ? "bg-blue-50 font-semibold text-blue-700" : "text-gray-700 hover:bg-gray-50"}`}>
                {t.walkInBooking}
            </NavLink>
                </div>
            </details>
        </nav>
    </details>;
}
