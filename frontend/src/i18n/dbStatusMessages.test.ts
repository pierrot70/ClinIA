import { describe, expect, it } from "vitest";
import { dbConnectionLabel, dbStatusMessage } from "./dbStatusMessages";
import { getLocalUiTranslation } from "./localUiTranslations";
import { UI_LABELS_FR } from "./uiLabels.fr";
import { UI_LOCALES } from "./uiLocales";

describe("database status server message boundary", () => {
    it.each(UI_LOCALES)("localizes incident, degradation and dynamic lag in %s", locale => {
        const t = (source: string) => getLocalUiTranslation(source, locale) ?? source;
        const m = UI_LABELS_FR.dbStatus.messages;
        for (const [message, source] of [
            ["Mongo replica set metadata is unavailable; majority may be unavailable.", m.metadataUnavailable],
            ["Mongo does not have one healthy primary with majority available.", m.noPrimary],
            ["Mongo majority is available, but at least one member is unhealthy.", m.unhealthyMember],
            ["Mongo connection is not ready.", m.connectionNotReady],
            ["Replica set metadata unavailable.", m.replicaMetadataUnavailable],
            ["Backup metadata unavailable.", m.backupMetadataUnavailable],
            ["Replica write safety drill status unavailable.", m.drillUnavailable],
            ["Starting write safety drill", m.drillStarting],
            ["Write safety drill completed successfully", m.drillComplete],
        ]) expect(dbStatusMessage(message, t)).toBe(t(source));
        expect(dbStatusMessage("Mongo replica lag is above 12.5 seconds.", t)).toBe(t(m.lagging).replace("{seconds}", "12.5"));
        expect(dbStatusMessage("Drill failed at cycle 7", t)).toBe(t(m.drillFailed).replace("{cycle}", "7"));
        for (const state of ["connected", "disconnected", "connecting", "disconnecting", "unknown"] as const)
            expect(dbConnectionLabel(state, t)).toBe(t(m[state]));
        expect(dbConnectionLabel("unexpected-new-state", t)).toBe(t(m.unknown));
    });

    it("preserves unknown driver diagnostics and only recognizes complete server messages", () => {
        const t = (source: string) => `translated: ${source}`;
        for (const diagnostic of ["constructor", "toString", "ECONNREFUSED synthetic-host:27017", "Mongo replica lag is above invalid seconds.", "PRIMARY", "Mongo replica set is healthy. Additional detail"])
            expect(dbStatusMessage(diagnostic, t)).toBe(diagnostic);
        expect(dbStatusMessage(null, t)).toBeNull();
        expect(dbStatusMessage(undefined, t)).toBeUndefined();
    });
});
