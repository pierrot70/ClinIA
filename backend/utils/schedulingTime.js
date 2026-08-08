export const SCHEDULING_TIME_ZONE = "America/Toronto";

function dateTimeParts(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;

    const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: SCHEDULING_TIME_ZONE,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
    }).formatToParts(date);
    const valueFor = (type) => parts.find((part) => part.type === type)?.value;

    return {
        year: valueFor("year"),
        month: valueFor("month"),
        day: valueFor("day"),
        hour: valueFor("hour"),
        minute: valueFor("minute"),
    };
}

export function toSchedulingDateKey(value) {
    const parts = dateTimeParts(value);
    return parts ? `${parts.year}-${parts.month}-${parts.day}` : null;
}

export function toSchedulingTime(value) {
    const parts = dateTimeParts(value);
    return parts ? `${parts.hour}:${parts.minute}` : null;
}

export function isSchedulingDatePast(date, now = new Date()) {
    const today = toSchedulingDateKey(now);
    return Boolean(today && date < today);
}

export function isSchedulingDateTimePast(date, time, now = new Date()) {
    const today = toSchedulingDateKey(now);
    const currentTime = toSchedulingTime(now);
    if (!today || !currentTime) return false;

    return date < today || (date === today && time <= currentTime);
}
