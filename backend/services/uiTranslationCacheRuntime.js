import { EventEmitter } from "events";

const runtimeEvents = new EventEmitter();

export function notifyUiTranslationCacheChanged({
    namespace,
    targetLang,
    sourceHash,
}) {
    runtimeEvents.emit("changed", {
        namespace,
        targetLang,
        sourceHash,
    });
}

export function onUiTranslationCacheChanged(listener) {
    runtimeEvents.on("changed", listener);
}
