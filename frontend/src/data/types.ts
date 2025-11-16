export interface Treatment {
  id: string;
  name: string;
  shortName: string;
  class: string;
  efficacy: number; // 0-1
  sideEffectScore: number; // 0-100 (higher = more effets)
  summary: string;
  details: string;
  flags: ("wellTolerated" | "monitoring")[];
}
