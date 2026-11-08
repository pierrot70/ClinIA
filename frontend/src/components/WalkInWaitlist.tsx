import { useRef, useState, type FormEvent } from "react";
import { UI_LABELS_FR } from "../i18n/uiLabels.fr";
import { receptionLabel } from "../i18n/receptionLabels";
import { walkInWaitlistLabels } from "../i18n/walkInWaitlistLabels";
import {
    enrollWalkInWaitlist,
    type WaitlistPatientContext, type WalkInContactChannel,
} from "../services/receptionWaitlistApi";

const inputClass = "block w-full rounded border border-slate-300 bg-white px-3 py-2";

export function WalkInWaitlistForm({ locale, context }: {
    locale: string;
    context: WaitlistPatientContext;
}) {
    const text = walkInWaitlistLabels(locale);
    const [channel, setChannel] = useState<WalkInContactChannel | "">("");
    const [prenom, setFirstName] = useState("");
    const [nom, setLastName] = useState("");
    const [telephone, setTelephone] = useState("");
    const [courriel, setEmail] = useState("");
    const [consent, setConsent] = useState(false);
    const [state, setState] = useState<"editing" | "saving" | "saved">("editing");
    const [error, setError] = useState("");
    const pending = useRef(false);

    async function save(event: FormEvent) {
        event.preventDefault();
        if (!channel || !consent || pending.current) return;
        pending.current = true;
        setError("");
        setState("saving");
        try {
            const response = await enrollWalkInWaitlist({
                ...context, channel, consent: true,
                ...(!context.patientId ? { prenom: prenom.trim(), nom: nom.trim() } : {}),
                ...(telephone.trim() ? { telephone: telephone.trim() } : {}),
                ...(courriel.trim() ? { courriel: courriel.trim() } : {}),
            });
            if ("error" in response) {
                setState("editing");
                setError(response.error.code === "WAITLIST_ALREADY_ENROLLED" ? text.duplicate
                    : ["WAITLIST_SEARCH_CHANGED", "RECEPTION_LOOKUP_REQUIRED", "RECEPTION_REPLAN_REQUIRED"].includes(response.error.code) ? text.searchChanged
                    : ["INVALID_INPUT", "WAITLIST_CONTACT_IN_USE"].includes(response.error.code) ? text.invalid : text.unavailable);
                return;
            }
            if (!response.data?._id) {
                setState("editing");
                setError(text.unavailable);
                return;
            }
            setTelephone("");
            setEmail("");
            setState("saved");
        } finally {
            pending.current = false;
        }
    }

    if (state === "saved") return <p role="status" className="rounded bg-emerald-50 p-3 text-emerald-900">{text.saved}</p>;

    return <form className="space-y-3 rounded border border-blue-200 bg-blue-50 p-4" onSubmit={save}>
        <h3 className="font-semibold">{text.enroll}</h3>
        <fieldset className="space-y-3 disabled:opacity-70" disabled={state === "saving"}>
            {!context.patientId && <div className="grid gap-3 sm:grid-cols-2">
                <label>{receptionLabel(locale, "firstNameLabel", UI_LABELS_FR.walkInArrival.firstNameLabel)}
                    <input className={inputClass} value={prenom} maxLength={120} required onChange={event => setFirstName(event.target.value)} />
                </label>
                <label>{receptionLabel(locale, "lastNameLabel", UI_LABELS_FR.walkInArrival.lastNameLabel)}
                    <input className={inputClass} value={nom} maxLength={120} required onChange={event => setLastName(event.target.value)} />
                </label>
            </div>}
            <label>{text.channel}<select className={inputClass} value={channel} required onChange={event => setChannel(event.target.value as WalkInContactChannel | "")}>
                <option value="">{text.chooseChannel}</option>
                <option value="sms">{text.sms}</option>
                <option value="email">{text.email}</option>
                <option value="phone">{text.phone}</option>
            </select></label>
            {channel && <div className="grid gap-3 sm:grid-cols-2">
                <label>{text.phoneNumber}
                    <input className={inputClass} type="tel" value={telephone} maxLength={32} required={channel !== "email"} onChange={event => setTelephone(event.target.value)} />
                </label>
                <label>{text.emailAddress}
                    <input className={inputClass} type="email" value={courriel} maxLength={254} required={channel === "email"} onChange={event => setEmail(event.target.value)} />
                </label>
            </div>}
            <label className="flex items-start gap-2">
                <input type="checkbox" className="mt-1" checked={consent} required onChange={event => setConsent(event.target.checked)} />
                {text.consent}
            </label>
            <button type="submit" className="rounded bg-blue-700 px-3 py-2 text-white disabled:opacity-50" disabled={!consent || !channel}>
                {state === "saving" ? text.saving : text.save}
            </button>
        </fieldset>
        {error && <p role="alert" className="text-red-800">{error}</p>}
    </form>;
}
