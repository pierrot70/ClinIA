import { useContext } from "react";
import { HomeI18nContext } from "../../contexts/HomeI18nContext";
import { clinicalCareAccessLabels } from "../../i18n/clinicalCareAccessLabels";
import { displaySpecialty } from "../../i18n/specialtyLabels";
import { userRoleLabel } from "../../i18n/userRoleLabels";
import { useUiLabels } from "../../hooks/useUiLabels";
import type { CareNote } from "../../services/clinicalCareAccessApi";

export function CareNoteList({ notes, title, truncated = false }: { notes: CareNote[]; title: string; truncated?: boolean }) {
    const { locale } = useContext(HomeI18nContext) || { locale: "fr" };
    const text = clinicalCareAccessLabels(locale);
    const { t } = useUiLabels(locale);
    return <section className="space-y-2">
        <h3 className="font-semibold">{title}</h3>
        {truncated && <p role="status">{text.notesTruncated}</p>}
        {!notes.length && <p>{text.noNotes}</p>}
        {notes.map(note => <article key={note._id} className="space-y-2 rounded border border-slate-200 bg-white p-3">
            <p className="text-sm text-slate-600">
                {text.author.replace("{name}", note.author?.username || note.authorUserId)}
                {" — "}{note.authorSpecialty ? displaySpecialty(note.authorSpecialty, locale) : note.authorRole ? userRoleLabel(note.authorRole, t) : text.professionUnknown}
                {" — "}{new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(note.createdAt))}
            </p>
            <p className="whitespace-pre-wrap" translate="no" data-content-kind="medical">{note.note}</p>
        </article>)}
    </section>;
}
