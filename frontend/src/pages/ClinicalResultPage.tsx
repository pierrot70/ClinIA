import { DiagnosticHeader } from "../components/clinical/DiagnosticHeader";
import { TreatmentCard } from "../components/clinical/TreatmentCard";
import { AlternativesPanel } from "../components/clinical/AlternativesPanel";
import { RedFlagsPanel } from "../components/clinical/RedFlagsPanel";
import { PatientSummary } from "../components/clinical/PatientSummary";

export function ClinicalResultPage({ data }: { data: any }) {
    return (
        <div className="max-w-4xl mx-auto p-6 space-y-6 bg-gray-50 min-h-screen">

            {/* Diagnostic */}
            <DiagnosticHeader
                diagnosis={data.diagnosis.suspected}
                certainty={data.diagnosis.certainty_level}
                justification={data.diagnosis.justification}
            />

            {/* Traitement principal */}
            {data.treatments.length > 0 ? (
                <TreatmentCard treatment={data.treatments[0]} />
            ) : (
                <div className="p-4 bg-yellow-50 border border-yellow-200 rounded text-sm">
                    Aucun traitement ne peut être recommandé avec les données actuelles.
                </div>
            )}

            {/* Alternatives */}
            {data.alternatives.length > 0 && (
                <AlternativesPanel alternatives={data.alternatives} />
            )}

            {/* Red flags */}
            {data.red_flags.length > 0 && (
                <RedFlagsPanel flags={data.red_flags} />
            )}

            {/* Résumé patient */}
            <PatientSummary summary={data.patient_summary} />

        </div>
    );
}
