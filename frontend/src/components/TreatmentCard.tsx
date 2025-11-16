import React from "react";
import { ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";
import type { Treatment } from "../data/types";

interface Props {
  treatment: Treatment;
}

const TreatmentCard: React.FC<Props> = ({ treatment }) => {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 flex flex-col gap-3 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold text-base text-gray-900">
            {treatment.name}
          </h3>
          <p className="text-xs text-gray-500">{treatment.class}</p>
        </div>
        <div className="text-right">
          <div className="text-xs uppercase text-gray-400">Efficacité</div>
          <div className="text-lg font-semibold text-primary">
            {Math.round(treatment.efficacy * 100)}%
          </div>
        </div>
      </div>

      <p className="text-sm text-gray-700">{treatment.summary}</p>

      <div className="flex flex-wrap gap-2 text-xs">
        <span className="px-2 py-1 rounded-full bg-green-50 text-green-700 border border-green-100">
          1ère ligne
        </span>
        {treatment.flags.includes("wellTolerated") && (
          <span className="px-2 py-1 rounded-full bg-blue-50 text-blue-700 border border-blue-100">
            Bien toléré
          </span>
        )}
        {treatment.flags.includes("monitoring") && (
          <span className="px-2 py-1 rounded-full bg-amber-50 text-amber-700 border border-amber-100">
            Surveillance requise
          </span>
        )}
      </div>

      <div className="flex items-center justify-between pt-1 text-xs text-gray-500">
        <span>Basé sur données simulées</span>
        <Link
          to={`/treatment/${encodeURIComponent(treatment.id)}`}
          className="inline-flex items-center gap-1 text-primary hover:underline"
        >
          Détails
          <ArrowRight className="w-3 h-3" />
        </Link>
      </div>
    </div>
  );
};

export default TreatmentCard;
