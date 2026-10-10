import { labels } from "../i18n/uiLabels";
import { useUiLabels } from "../hooks/useUiLabels";
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
    const { locale: uiLocale, t } = useUiLabels();
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
      <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-xs">
        <h3 className="text-sm font-semibold text-gray-800 mb-2">
          {t(labels.componentUi.efficaciteComparativeSimulee)}</h3>
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={efficacyData}>
              <XAxis dataKey="name" />
              <YAxis />
              <Tooltip />
              <Bar dataKey="Efficacité" name={t(labels.componentUi.efficacite)} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-xs">
        <h3 className="text-sm font-semibold text-gray-800 mb-2">
          {t(labels.componentUi.profilDEffetsSecondairesScoreSimule)}</h3>
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <RadarChart data={sideEffectRadar}>
              <PolarGrid />
              <PolarAngleAxis dataKey="subject" />
              <Radar
                name={t(labels.componentUi.effetsSecondaires)}
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
