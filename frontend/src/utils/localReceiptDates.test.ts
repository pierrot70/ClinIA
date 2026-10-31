import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import { localReceiptBounds } from "./localReceiptDates";

const helperUrl = pathToFileURL(resolve(process.cwd(), "src/utils/localReceiptDates.ts")).href;
function nativeCalendar(zone: string, instant: string, day: string) {
    const script = `import {localReceiptDate,localReceiptBounds} from ${JSON.stringify(helperUrl)};
        console.log(JSON.stringify({today:localReceiptDate(new Date(${JSON.stringify(instant)})),...localReceiptBounds(${JSON.stringify(day)},${JSON.stringify(day)})}));`;
    return JSON.parse(execFileSync(process.execPath, ["--input-type=module", "-e", script], {
        env: { ...process.env, TZ: zone }, encoding: "utf8",
    }));
}

describe("native browser-style receipt calendar across time zones", () => {
    it.each([
        ["Europe/Paris", "2026-11-01", "2026-10-31T23:00:00.000Z", "2026-11-01T23:00:00.000Z"],
        ["America/Toronto", "2026-10-31", "2026-10-31T04:00:00.000Z", "2026-11-01T04:00:00.000Z"],
        ["Asia/Tokyo", "2026-11-01", "2026-10-31T15:00:00.000Z", "2026-11-01T15:00:00.000Z"],
        ["Pacific/Honolulu", "2026-10-31", "2026-10-31T10:00:00.000Z", "2026-11-01T10:00:00.000Z"],
        ["Asia/Kathmandu", "2026-11-01", "2026-10-31T18:15:00.000Z", "2026-11-01T18:15:00.000Z"],
        ["Pacific/Kiritimati", "2026-11-01", "2026-10-31T10:00:00.000Z", "2026-11-01T10:00:00.000Z"],
    ])("uses the actual local day in %s at the same global instant", (zone, today, startAt, endBefore) => {
        expect(nativeCalendar(zone, "2026-10-31T23:30:00Z", today)).toEqual({ today, startAt, endBefore });
    });

    it.each([
        ["Europe/Paris", "2026-03-29", "2026-03-28T23:00:00.000Z", "2026-03-29T22:00:00.000Z", 23],
        ["Europe/Paris", "2026-10-25", "2026-10-24T22:00:00.000Z", "2026-10-25T23:00:00.000Z", 25],
        ["America/Toronto", "2026-03-08", "2026-03-08T05:00:00.000Z", "2026-03-09T04:00:00.000Z", 23],
        ["America/Toronto", "2026-11-01", "2026-11-01T04:00:00.000Z", "2026-11-02T05:00:00.000Z", 25],
    ] as const)("covers the entire %s day %s across daylight saving", (zone, day, startAt, endBefore, hours) => {
        const result = nativeCalendar(zone, `${day}T12:00:00Z`, day);
        expect(result).toMatchObject({ startAt, endBefore });
        expect((Date.parse(result.endBefore) - Date.parse(result.startAt)) / 3_600_000).toBe(hours);
    });

    it("keeps each cleared boundary absent", () => {
        expect(localReceiptBounds()).toEqual({ startAt: undefined, endBefore: undefined });
        expect(localReceiptBounds("2026-10-31").endBefore).toBeUndefined();
        expect(localReceiptBounds(undefined, "2026-10-31").startAt).toBeUndefined();
    });
    it.each(["2026-02-30", "2026-13-01", "not-a-date"])("rejects invalid date %s without silently rolling it over", invalid => {
        expect(() => localReceiptBounds(invalid)).toThrow(RangeError);
    });
    it("rejects a range whose end day precedes its start day", () => {
        expect(() => localReceiptBounds("2026-11-01", "2026-10-31")).toThrow(RangeError);
    });
});
