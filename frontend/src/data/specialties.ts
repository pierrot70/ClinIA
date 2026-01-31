export const SPECIALTIES = [
    "Médecin de famille",
    "Ophtalmologue",
    "Cardiologue",
    "Pneumologue",
    "Neurologue",
    "Endocrinologue",
    "Néphrologue",
    "Rhumatologue",
] as const;

export type Specialty = (typeof SPECIALTIES)[number];
