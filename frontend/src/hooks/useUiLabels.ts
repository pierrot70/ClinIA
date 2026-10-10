import { useCallback, useContext, useMemo } from "react";
import { HomeI18nContext } from "../contexts/HomeI18nContext";
import { localizeUiLabel } from "../i18n/localUiTranslations";

export function useUiLabels(fallbackLocale = "fr-CA") {
    const context = useContext(HomeI18nContext);
    const locale = context?.locale ?? fallbackLocale;
    const t = useCallback((source: string) => localizeUiLabel(source, locale), [locale]);
    return useMemo(() => ({ locale, t }), [locale, t]);
}

type LocalizedTree<T> = T extends string ? string : T extends readonly unknown[]
    ? { [K in keyof T]: LocalizedTree<T[K]> } : T extends object
    ? { [K in keyof T]: LocalizedTree<T[K]> } : T;

// Apply only to versioned UI catalog objects, never to patient/API data.
export function useUiLabelTree<T>(source: T, fallbackLocale = "fr-CA"): LocalizedTree<T> {
    const { t } = useUiLabels(fallbackLocale);
    return useMemo(() => {
        const translate = (value: unknown): unknown => {
            if (typeof value === "string") return t(value);
            if (Array.isArray(value)) return value.map(translate);
            if (value && typeof value === "object") return Object.fromEntries(
                Object.entries(value).map(([key, child]) => [key, translate(child)]));
            return value;
        };
        return translate(source) as LocalizedTree<T>;
    }, [source, t]);
}
