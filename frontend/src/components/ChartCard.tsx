import React from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  Radar
} from "recharts";
import type { Treatment } from "../data/types";

interface Props {
  treatments: Treatment[];
}

const ChartCard: React.FC<Props> = ({ treatments }) => {
  const efficacyData = treatments.map((t) => ({
    name: t.shortName,
    Efficacité: Math.round(t.efficacy * 100)
  }));

  const sideEffectRadar = treatments.map((t) => ({
    subject: t.shortName,
    EffetsSecondaires: t.sideEffectScore
  }));

  return (
    <div className="grid md:grid-cols-2 gap-4">
      <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
        <h3 className="text-sm font-semibold text-gray-800 mb-2">
          Efficacité comparative (simulée)
        </h3>
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={efficacyData}>
              <XAxis dataKey="name" />
              <YAxis />
              <Tooltip />
              <Bar dataKey="Efficacité" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
        <h3 className="text-sm font-semibold text-gray-800 mb-2">
          Profil d&apos;effets secondaires (score simulé)
        </h3>
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <RadarChart data={sideEffectRadar}>
              <PolarGrid />
              <PolarAngleAxis dataKey="subject" />
              <Radar
                name="Effets secondaires"
                dataKey="EffetsSecondaires"
                stroke="#2563eb"
                fill="#2563eb"
                fillOpacity={0.4}
              />
              <Tooltip />
            </RadarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
};

export default ChartCard;
