import { UI_LABELS_FR } from "./uiLabels.fr";

const m = UI_LABELS_FR.dbStatus.messages;
// Exact server-owned messages only. Unknown driver diagnostics and identifiers
// remain intact; never send operational details to a translation service.
const serverMessages: Readonly<Record<string, string>> = {
    "Mongo replica set is healthy.": m.healthy,
    "Mongo replica set metadata is unavailable; majority may be unavailable.": m.metadataUnavailable,
    "Mongo does not have one healthy primary with majority available.": m.noPrimary,
    "Mongo majority is available, but at least one member is unhealthy.": m.unhealthyMember,
    "Backup directory is not mounted or does not exist.": m.backupDirectoryMissing,
    "Backup metadata unavailable.": m.backupMetadataUnavailable,
    "Mongo connection is not ready.": m.connectionNotReady,
    "Replica set metadata unavailable.": m.replicaMetadataUnavailable,
    "Replica write safety drill status unavailable.": m.drillUnavailable,
    "Starting write safety drill": m.drillStarting,
    "Write safety drill completed successfully": m.drillComplete,
};

export function dbConnectionLabel(status: string, t: (source: string) => string) {
    const sources: Readonly<Record<string, string>> = {
        connected: m.connected, disconnected: m.disconnected,
        connecting: m.connecting, disconnecting: m.disconnecting, unknown: m.unknown,
    };
    return t(Object.prototype.hasOwnProperty.call(sources, status) ? sources[status] : m.unknown);
}

export function dbStatusMessage(message: string | null | undefined, t: (source: string) => string) {
    if (!message) return message;
    const source = Object.prototype.hasOwnProperty.call(serverMessages, message) ? serverMessages[message] : null;
    if (source) return t(source);
    const lag = /^Mongo replica lag is above (\d+(?:\.\d+)?) seconds\.$/.exec(message);
    if (lag) return t(m.lagging).replace("{seconds}", lag[1]);
    const failure = /^Drill failed at cycle (\d+)$/.exec(message);
    if (failure) return t(m.drillFailed).replace("{cycle}", failure[1]);
    return message;
}
