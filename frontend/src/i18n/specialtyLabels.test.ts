import { describe, expect, it } from "vitest";
import { SPECIALTIES } from "../data/specialties";
import { displaySpecialty } from "./specialtyLabels";

const expected = [
    ["fr-CA", ["Médecin de famille", "Urgentologue", "Ophtalmologue", "Cardiologue", "Pneumologue", "Neurologue", "Endocrinologue", "Néphrologue", "Rhumatologue"]],
    ["en-CA", ["Family Physician", "Emergency Physician", "Ophthalmologist", "Cardiologist", "Pulmonologist", "Neurologist", "Endocrinologist", "Nephrologist", "Rheumatologist"]],
    ["es", ["Médico de familia", "Médico de urgencias", "Oftalmólogo", "Cardiólogo", "Neumólogo", "Neurólogo", "Endocrinólogo", "Nefrólogo", "Reumatólogo"]],
    ["ko-KR", ["가정의학과 의사", "응급의학과 의사", "안과 의사", "심장내과 의사", "호흡기내과 의사", "신경과 의사", "내분비내과 의사", "신장내과 의사", "류마티스내과 의사"]],
    ["vi", ["Bác sĩ gia đình", "Bác sĩ cấp cứu", "Bác sĩ nhãn khoa", "Bác sĩ tim mạch", "Bác sĩ hô hấp", "Bác sĩ thần kinh", "Bác sĩ nội tiết", "Bác sĩ thận học", "Bác sĩ cơ xương khớp"]],
    ["no-NO", ["Allmennlege", "Akuttlege", "Øyelege", "Kardiolog", "Lungelege", "Nevrolog", "Endokrinolog", "Nyrelege", "Revmatolog"]],
    ["ja", ["家庭医", "救急医", "眼科医", "循環器内科医", "呼吸器内科医", "神経内科医", "内分泌内科医", "腎臓内科医", "リウマチ科医"]],
    ["zh", ["家庭医生", "急诊医生", "眼科医生", "心脏科医生", "呼吸科医生", "神经内科医生", "内分泌科医生", "肾内科医生", "风湿科医生"]],
    ["he", ["רופא משפחה", "רופא לרפואה דחופה", "רופא עיניים", "קרדיולוג", "רופא ריאות", "נוירולוג", "אנדוקרינולוג", "נפרולוג", "ראומטולוג"]],
] as const;

describe("specialty display names", () => {
    it.each(expected)("displays all nine specialties in %s", (locale, names) => {
        expect(SPECIALTIES.map(value => displaySpecialty(value, locale))).toEqual(names);
    });
    it("accepts legacy accent and case variants and preserves unknown specialty names", () => {
        expect(displaySpecialty(" MÉDECIN DE FAMILLE ", "ja-JP")).toBe("家庭医");
        expect(displaySpecialty("nephrologue", "nb-NO")).toBe("Nyrelege");
        expect(displaySpecialty("Urgentologue", "de")).toBe("Emergency Physician");
        expect(displaySpecialty(" Unknown specialty ", "ja")).toBe("Unknown specialty");
        expect(displaySpecialty("constructor", "ja")).toBe("constructor");
    });
});
