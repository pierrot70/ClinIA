import type { Specialty } from "../data/specialties";
import { UI_LABELS_FR } from "./uiLabels.fr";
import { baseUiLocale, UI_LOCALES } from "./uiLocales";

// Shared local display names for appointment and specialist interfaces. API specialty values and the
// English-only policy for treatment descriptions and other clinical panels stay unchanged.
const source = UI_LABELS_FR.appointmentSpecialties;
const translations: Record<Specialty, readonly string[]> = {
    "Medecin de famille": [source["Medecin de famille"], "Family Physician", "Médico de familia", "가정의학과 의사", "Bác sĩ gia đình", "Allmennlege", "家庭医", "家庭医生", "רופא משפחה"],
    "Urgentologue": [source["Urgentologue"], "Emergency Physician", "Médico de urgencias", "응급의학과 의사", "Bác sĩ cấp cứu", "Akuttlege", "救急医", "急诊医生", "רופא לרפואה דחופה"],
    "Ophtalmologue": [source["Ophtalmologue"], "Ophthalmologist", "Oftalmólogo", "안과 의사", "Bác sĩ nhãn khoa", "Øyelege", "眼科医", "眼科医生", "רופא עיניים"],
    "Cardiologue": [source["Cardiologue"], "Cardiologist", "Cardiólogo", "심장내과 의사", "Bác sĩ tim mạch", "Kardiolog", "循環器内科医", "心脏科医生", "קרדיולוג"],
    "Pneumologue": [source["Pneumologue"], "Pulmonologist", "Neumólogo", "호흡기내과 의사", "Bác sĩ hô hấp", "Lungelege", "呼吸器内科医", "呼吸科医生", "רופא ריאות"],
    "Neurologue": [source["Neurologue"], "Neurologist", "Neurólogo", "신경과 의사", "Bác sĩ thần kinh", "Nevrolog", "神経内科医", "神经内科医生", "נוירולוג"],
    "Endocrinologue": [source["Endocrinologue"], "Endocrinologist", "Endocrinólogo", "내분비내과 의사", "Bác sĩ nội tiết", "Endokrinolog", "内分泌内科医", "内分泌科医生", "אנדוקרינולוג"],
    "Néphrologue": [source["Néphrologue"], "Nephrologist", "Nefrólogo", "신장내과 의사", "Bác sĩ thận học", "Nyrelege", "腎臓内科医", "肾内科医生", "נפרולוג"],
    "Rhumatologue": [source["Rhumatologue"], "Rheumatologist", "Reumatólogo", "류마티스내과 의사", "Bác sĩ cơ xương khớp", "Revmatolog", "リウマチ科医", "风湿科医生", "ראומטולוג"],
};

export function appointmentSpecialtyLabel(value: string, locale: string): string {
    const row = translations[value as Specialty];
    if (!row) return value;
    const index = UI_LOCALES.findIndex(language => baseUiLocale(language) === baseUiLocale(locale));
    return row[index < 0 ? 1 : index];
}

// The shared coverage audit resolves labels by their versioned French source,
// whereas the appointment form keeps the canonical API value as its key.
export function localizeAppointmentSpecialtyLabel(text: string, locale: string): string | null {
    const row = Object.values(translations).find(values => values[0] === text);
    const index = UI_LOCALES.findIndex(language => baseUiLocale(language) === baseUiLocale(locale));
    return row && index >= 0 ? row[index] : null;
}
