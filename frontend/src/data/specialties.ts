export const SPECIALTIES = [
    "Medecin de famille",
    "Ophtalmologue",
    "Cardiologue",
    "Pneumologue",
    "Neurologue",
    "Endocrinologue",
    "Néphrologue",
    "Rhumatologue",
] as const;

export type Specialty = (typeof SPECIALTIES)[number];
