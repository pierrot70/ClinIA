import React from "react";

const PatientSummary: React.FC = () => {
  return (
    <div className="max-w-3xl mx-auto px-4 py-10 space-y-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold text-gray-900">
          Résumé patient (exemple)
        </h1>
        <p className="text-sm text-gray-600">
          Cette page illustre comment ClinIA pourrait, à terme, pré-remplir
          un résumé à partager avec le patient ou à consigner au dossier médical.
          Toutes les données affichées sont simulées.
        </p>
      </header>

      <section className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm text-sm space-y-3">
        <div>
          <h2 className="text-sm font-semibold text-gray-800 mb-1">
            Exemple de contenu pour le patient
          </h2>
          <p className="text-gray-800">
            Aujourd&apos;hui, nous avons discuté de votre tension artérielle élevée.
            Un traitement a été proposé pour aider à la contrôler et réduire les risques
            à long terme sur le coeur, le cerveau et les reins.
          </p>
        </div>

        <div className="border-t border-dashed border-gray-200 pt-3 space-y-1">
          <p className="text-gray-800">
            Le médicament simulé choisi : <span className="font-semibold">Indapamide</span>.
          </p>
          <ul className="list-disc ml-4 text-gray-700">
            <li>À prendre une fois par jour, le matin.</li>
            <li>Surveiller l&apos;apparition de vertiges ou de fatigue inhabituelle.</li>
            <li>Revenir en consultation ou contacter la clinique en cas de symptômes inquiétants.</li>
          </ul>
        </div>

        <p className="text-xs text-gray-500">
          Dans un projet réel, ce type de texte serait personnalisé et rédigé avec l&apos;appui de
          médecins, puis validé d&apos;un point de vue clinique, éthique et légal.
        </p>
      </section>
    </div>
  );
};

export default PatientSummary;
