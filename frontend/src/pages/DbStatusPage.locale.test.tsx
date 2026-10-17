import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HomeI18nContext } from "../contexts/HomeI18nContext";
import { HOME_STRINGS_FR } from "../i18n/homeStrings";
import { DbStatusPage } from "./DbStatusPage";
import type { DbStatusPayload } from "../services/dbStatusApi";

const api = vi.hoisted(() => ({ fetch: vi.fn(), protect: vi.fn() }));
vi.mock("../services/dbStatusApi", () => ({ fetchDbStatus: api.fetch, updateBackupProtection: api.protect }));
const payload: DbStatusPayload = {
    checkedAt: "2026-10-17T13:00:00.000Z", responseTimeMs: 10,
    connection: { readyState: 1, status: "connected", databaseName: "synthetic-db", host: "synthetic-host", port: 27017 },
    ping: { ok: true, latencyMs: 1 }, database: null, collections: [],
    replicaSet: {
        available: true, setName: "synthetic-rs", isWritablePrimary: true, secondary: false,
        primary: "synthetic-host:27017", hosts: [], members: [], error: null,
        summary: { status: "OK", message: "Mongo replica set is healthy.", memberCount: 3, healthyCount: 3,
            primaryCount: 1, secondaryCount: 2, majorityCount: 2, majorityAvailable: true,
            maxLagSeconds: 0, laggingThresholdSeconds: 10 },
    },
    backups: { available: false, directory: "/synthetic/backups", keepDirectory: "/synthetic/keep", retentionDays: 7,
        maxBackups: 20, expectedFrequencyHours: 24, checksumMode: "recorded", latestAgeHours: null,
        latestStatus: "unavailable", backups: [], error: "Backup directory is not mounted or does not exist." },
    writeSafetyDrill: null,
};

function Page({ locale }: { locale: string }) {
    return <HomeI18nContext.Provider value={{ locale, strings: HOME_STRINGS_FR, isTranslating: false,
        setLocaleFromDropdown: vi.fn(), setLocaleFromVoice: vi.fn() }}><DbStatusPage /></HomeI18nContext.Provider>;
}
beforeEach(() => { vi.clearAllMocks(); api.fetch.mockResolvedValue({ data: payload }); });
afterEach(cleanup);

const expected = [
    ["fr-CA", "Connexion Mongo établie", "Le jeu de réplicas Mongo fonctionne normalement.", "Le dossier des sauvegardes n’est pas monté ou n’existe pas."],
    ["en-CA", "Connected", "Mongo replica set is healthy.", "Backup directory is not mounted or does not exist."],
    ["es", "Conectado", "El conjunto de réplicas Mongo funciona correctamente.", "La carpeta de copias de seguridad no está montada o no existe."],
    ["ko-KR", "연결됨", "Mongo 복제 세트가 정상입니다.", "백업 폴더가 마운트되지 않았거나 존재하지 않습니다."],
    ["vi", "Đã kết nối", "Bộ bản sao Mongo hoạt động bình thường.", "Thư mục sao lưu chưa được gắn hoặc không tồn tại."],
    ["no-NO", "Tilkoblet", "Mongo-replikasettet fungerer normalt.", "Sikkerhetskopimappen er ikke montert eller finnes ikke."],
    ["ja", "接続済み", "Mongoレプリカセットは正常です。", "バックアップフォルダーがマウントされていないか、存在しません。"],
    ["zh", "已连接", "Mongo 副本集运行正常。", "备份目录未挂载或不存在。"],
    ["he", "מחובר", "מערך ההעתקים של Mongo תקין.", "תיקיית הגיבויים אינה מחוברת או אינה קיימת."],
];

describe("database status localized server messages", () => {
    it.each(expected)("renders connection, replica health and backup warning in %s", async (locale, connected, healthy, backup) => {
        render(<Page locale={locale} />);
        expect(await screen.findByText(healthy)).toBeVisible();
        expect(screen.getByText(connected)).toBeVisible();
        expect(screen.getByText(backup)).toBeVisible();
        expect(screen.getByText(text => text.includes("synthetic-db") && text.includes("synthetic-host"))).toBeVisible();
        expect(screen.getByText("/synthetic/backups")).toBeVisible();
        expect(api.protect).not.toHaveBeenCalled();
    });

    it("retranslates the displayed payload immediately without another request or database mutation", async () => {
        const { rerender } = render(<Page locale="en-CA" />);
        await screen.findByText("Mongo replica set is healthy.");
        const requestCount = api.fetch.mock.calls.length;
        rerender(<Page locale="ja" />);
        expect(screen.getByText("Mongoレプリカセットは正常です。")).toBeVisible();
        expect(screen.queryByText("Mongo replica set is healthy.")).not.toBeInTheDocument();
        expect(api.fetch).toHaveBeenCalledTimes(requestCount);
        expect(api.protect).not.toHaveBeenCalled();
        expect(payload.connection.status).toBe("connected");
        expect(payload.replicaSet.summary.message).toBe("Mongo replica set is healthy.");
    });
});
