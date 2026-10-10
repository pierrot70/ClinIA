import { useUiLabels } from "../../hooks/useUiLabels";

// Resolves fixed labels locally. Never translates patient/clinical content.
export function UiText({ text }: { text: string }) {
    const { t } = useUiLabels();
    return <>{t(text)}</>;
}
