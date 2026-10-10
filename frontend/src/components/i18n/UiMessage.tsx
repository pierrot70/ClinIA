import { useUiLabels } from "../../hooks/useUiLabels";
import { getLocalUiMessage } from "../../i18n/localUiTranslations";
import { UI_LABELS_FR } from "../../i18n/uiLabels.fr";

// Unknown server prose is not sent to a translator. Preserve known messages;
// otherwise display a fixed localized error rather than a foreign-language
// message. The original remains in the page state, never in logs or storage.
export function UiMessage({ message, fallback = UI_LABELS_FR.generalUi.error }: { message: string; fallback?: string }) {
    const { locale, t } = useUiLabels();
    return <>{getLocalUiMessage(message, locale) ?? t(fallback)}</>;
}
