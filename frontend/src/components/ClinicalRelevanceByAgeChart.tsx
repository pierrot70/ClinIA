import React, { useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type ClinicalRelevanceLevel = 1 | 2 | 3 | 4 | 5;

type ClinicalRelevanceSeries = {
  name: string;
  values: ClinicalRelevanceLevel[];
};

type ClinicalRelevanceSource = {
  label: string;
  url: string;
};

interface ClinicalRelevanceByAgeChartProps {
  title: string;
  subtitle: string;
  interpretationNote: string;
  ageBuckets: string[];
  levelLabels: Record<ClinicalRelevanceLevel, string>;
  series: ClinicalRelevanceSeries[];
  sources: ClinicalRelevanceSource[];
}

const SERIES_COLORS = [
  "#2563eb",
  "#0f766e",
  "#ea580c",
  "#9333ea",
  "#65a30d",
];

const ClinicalRelevanceByAgeChart: React.FC<ClinicalRelevanceByAgeChartProps> = ({
  title,
  subtitle,
  interpretationNote,
  ageBuckets,
  levelLabels,
  series,
  sources,
}) => {
  const [highlightedSeries, setHighlightedSeries] = useState<string | null>(null);

  const chartData = ageBuckets.map((ageBucket, index) => {
    const row: Record<string, string | number> = { ageBucket };

    for (const item of series) {
      row[item.name] = item.values[index];
    }

    return row;
  });

  function toggleSeriesHighlight(seriesName: string) {
    setHighlightedSeries((current) => (current === seriesName ? null : seriesName));
  }

  return (
    <section className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
      <div className="flex flex-col gap-2 mb-4">
        <h2 className="text-sm font-semibold text-gray-900">{title}</h2>
        <p className="text-xs text-gray-600">{subtitle}</p>
        <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          {interpretationNote}
        </p>
      </div>

      <div className="h-80">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={chartData}
            margin={{ top: 8, right: 20, left: 0, bottom: 8 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis
              dataKey="ageBucket"
              tick={{ fontSize: 12, fill: "#4b5563" }}
              axisLine={{ stroke: "#d1d5db" }}
              tickLine={{ stroke: "#d1d5db" }}
            />
            <YAxis
              domain={[1, 5]}
              ticks={[1, 2, 3, 4, 5]}
              tickFormatter={(value) => levelLabels[value as ClinicalRelevanceLevel]}
              width={148}
              tick={{ fontSize: 11, fill: "#4b5563" }}
              axisLine={{ stroke: "#d1d5db" }}
              tickLine={{ stroke: "#d1d5db" }}
            />
            <Tooltip
              formatter={(value) => levelLabels[value as ClinicalRelevanceLevel]}
              labelFormatter={(label) => `Age: ${label}`}
              contentStyle={{
                borderRadius: "0.75rem",
                borderColor: "#d1d5db",
                fontSize: "12px",
              }}
            />
            {series.map((item, index) => (
              <Line
                key={item.name}
                type="monotone"
                dataKey={item.name}
                stroke={SERIES_COLORS[index % SERIES_COLORS.length]}
                strokeWidth={highlightedSeries === item.name ? 4 : 2.5}
                strokeOpacity={
                  highlightedSeries && highlightedSeries !== item.name ? 0.2 : 1
                }
                dot={{
                  r: highlightedSeries === item.name ? 4 : 3,
                  strokeWidth: highlightedSeries === item.name ? 2 : 1,
                }}
                activeDot={{ r: highlightedSeries === item.name ? 6 : 5 }}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {series.map((item, index) => {
          const isHighlighted = highlightedSeries === item.name;
          const isDimmed = highlightedSeries && !isHighlighted;

          return (
            <button
              key={item.name}
              type="button"
              onClick={() => toggleSeriesHighlight(item.name)}
              className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs transition ${
                isHighlighted
                  ? "border-gray-900 bg-gray-900 text-white"
                  : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
              } ${isDimmed ? "opacity-50" : ""}`}
              aria-pressed={isHighlighted}
            >
              <span
                className="inline-block h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: SERIES_COLORS[index % SERIES_COLORS.length] }}
                aria-hidden="true"
              />
              {item.name}
            </button>
          );
        })}
      </div>

      <p className="mt-3 text-[11px] text-gray-500">
        Aide visuelle clinique simulee. La decision therapeutique finale appartient
        toujours au medecin.
      </p>

      <div className="mt-3 rounded-lg border border-gray-200 bg-gray-50 p-3">
        <h3 className="text-xs font-semibold text-gray-800 mb-2">
          Provenance clinique
        </h3>
        <ul className="space-y-1 text-[11px] text-gray-600">
          {sources.map((source) => (
            <li key={source.url}>
              <a
                href={source.url}
                target="_blank"
                rel="noreferrer"
                className="text-primary hover:underline"
              >
                {source.label}
              </a>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
};

export default ClinicalRelevanceByAgeChart;
