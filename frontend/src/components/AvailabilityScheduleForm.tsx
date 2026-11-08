import { useState, type FormEvent } from "react";
import { useUiLabels, useUiLabelTree } from "../hooks/useUiLabels";
import { labels } from "../i18n/uiLabels";

export type WeeklyRange = {
    clinique: string;
    weekday: number;
    start: string;
    end: string;
    slotType: "regular" | "walk_in";
};

export type AvailabilityTemplate = {
    clinics: { id: string; name: string }[];
    slotTypes: WeeklyRange["slotType"][];
    todayWeekday: number;
    shifts: Pick<WeeklyRange, "start" | "end">[];
    ranges: WeeklyRange[];
};

type Props = {
    template: AvailabilityTemplate;
    pending: boolean;
    onSubmit: (ranges: WeeklyRange[]) => void;
    onCancel: () => void;
};

const inputClass = "mt-1 w-full rounded-md border border-amber-700 bg-white p-2";
const weekdayOrder = [1, 2, 3, 4, 5, 6, 0];

export function AvailabilityScheduleForm({ template, pending, onSubmit, onCancel }: Props) {
    const { locale, t } = useUiLabels();
    const copy = useUiLabelTree(labels.availabilityReminder);
    const fieldLabels = labels.specialistsPage.form;
    const weekdayFormatter = new Intl.DateTimeFormat(locale, { weekday: "long", timeZone: "UTC" });
    const [rows, setRows] = useState(() => {
        const saved = template.ranges.length ? template.ranges : [emptyRange()];
        return saved.map((range, id) => ({ id, range }));
    });
    const [nextId, setNextId] = useState(rows.length);

    function emptyRange(): WeeklyRange {
        return {
            clinique: template.clinics[0].id,
            weekday: template.todayWeekday,
            start: "",
            end: "",
            slotType: template.slotTypes[0],
        };
    }

    function updateRange(id: number, change: Partial<WeeklyRange>) {
        setRows(current => current.map(row => row.id === id
            ? { ...row, range: { ...row.range, ...change } } : row));
    }

    function submit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        onSubmit(rows.map(row => row.range));
    }

    return (
        <form onSubmit={submit} className="space-y-4 border-t border-amber-300 pt-4">
            <div>
                <h2 className="text-lg font-semibold">{copy.schedule}</h2>
                <p className="mt-1 text-sm">{copy.scheduleHelp}</p>
            </div>
            <fieldset disabled={pending} className="space-y-3">
                {rows.map(({ id, range }) => (
                    <div key={id} className="grid grid-cols-2 items-end gap-2 rounded-md bg-amber-50 p-3 sm:grid-cols-3 xl:grid-cols-5">
                        <label className="col-span-2 text-sm sm:col-span-1">
                            {t(fieldLabels.availabilityClinic)}
                            <select className={inputClass} value={range.clinique} onChange={e => updateRange(id, { clinique: e.target.value })}>
                                {template.clinics.map(clinic => <option key={clinic.id} value={clinic.id}>{clinic.name}</option>)}
                            </select>
                        </label>
                        <label className="text-sm">
                            {copy.weekday}
                            <select className={inputClass} value={range.weekday} onChange={e => updateRange(id, { weekday: Number(e.target.value) })}>
                                {weekdayOrder.map(day => <option key={day} value={day}>{weekdayFormatter.format(Date.UTC(2026, 0, 4 + day))}</option>)}
                            </select>
                        </label>
                        <label className="text-sm">
                            {t(fieldLabels.slotTypeLabel)}
                            <select className={inputClass} value={range.slotType} onChange={e => updateRange(id, { slotType: e.target.value as WeeklyRange["slotType"] })}>
                                {template.slotTypes.map(type => (
                                    <option key={type} value={type}>{t(type === "regular" ? fieldLabels.regularSlots : fieldLabels.walkInSlots)}</option>
                                ))}
                            </select>
                        </label>
                        <label className="text-sm">
                            {copy.shift}
                            <select
                                className={inputClass}
                                required
                                value={template.shifts.find(shift => shift.start === range.start && shift.end === range.end)?.start ?? ""}
                                onChange={event => {
                                    const shift = template.shifts.find(shift => shift.start === event.target.value);
                                    updateRange(id, shift ?? { start: "", end: "" });
                                }}
                            >
                                <option value="">{copy.selectShift}</option>
                                {template.shifts.map(shift => (
                                    <option key={shift.start} value={shift.start}>{shift.start} – {shift.end}</option>
                                ))}
                            </select>
                        </label>
                        <button type="button" disabled={rows.length === 1} className="rounded-md p-2 text-sm font-medium underline disabled:opacity-50" onClick={() => setRows(current => current.filter(row => row.id !== id))}>
                            {t(fieldLabels.removeDay)}
                        </button>
                    </div>
                ))}
                <div className="flex flex-wrap gap-3">
                    <button type="button" disabled={rows.length >= 28} className="rounded-md border border-amber-800 bg-white px-3 py-2 text-sm font-semibold disabled:opacity-50" onClick={() => {
                        setRows(current => [...current, { id: nextId, range: emptyRange() }]);
                        setNextId(id => id + 1);
                    }}>
                        {copy.addRange}
                    </button>
                    <button type="submit" className="rounded-md bg-amber-950 px-3 py-2 text-sm font-semibold text-white">
                        {copy.saveAndComplete}
                    </button>
                    <button type="button" className="rounded-md px-3 py-2 text-sm font-semibold underline" onClick={onCancel}>
                        {t(fieldLabels.cancel)}
                    </button>
                </div>
            </fieldset>
        </form>
    );
}
