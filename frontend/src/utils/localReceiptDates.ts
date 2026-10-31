/** Browser calendar only: no location permission, cloud call or language inference. */
export function localReceiptDate(now = new Date()) {
    return `${String(now.getFullYear()).padStart(4, "0")}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function localMidnight(value: string) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new RangeError("Invalid receipt date");
    const date = new Date(`${value}T00:00:00`);
    if (!Number.isFinite(date.getTime()) || localReceiptDate(date) !== value) throw new RangeError("Invalid receipt date");
    return date;
}

/** A local calendar day can span 23 or 25 hours. The next midnight is exclusive. */
export function localReceiptBounds(startDate?: string, endDate?: string) {
    const startAt = startDate ? localMidnight(startDate).toISOString() : undefined;
    let endBefore: string | undefined;
    if (endDate) {
        const nextDay = localMidnight(endDate);
        nextDay.setDate(nextDay.getDate() + 1);
        nextDay.setHours(0, 0, 0, 0);
        endBefore = nextDay.toISOString();
    }
    if (startAt && endBefore && Date.parse(startAt) >= Date.parse(endBefore)) throw new RangeError("Invalid receipt range");
    return { startAt, endBefore };
}
