export const PARIS_ZONE = "Europe/Paris";

type Calendar = { year: number; month: number; day: number; hour: number; minute: number; second: number };
const formatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: PARIS_ZONE, year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
});

function calendar(date: Date): Calendar {
  if (!Number.isFinite(date.getTime())) throw new Error("invalid_date");
  const parts = Object.fromEntries(formatter.formatToParts(date).map(p => [p.type, p.value]));
  return Object.fromEntries(["year", "month", "day", "hour", "minute", "second"].map(key => [key, Number(parts[key])])) as Calendar;
}

function utc(c: Calendar) {
  return Date.UTC(c.year, c.month - 1, c.day, c.hour, c.minute, c.second);
}

// 18:00 is unambiguous even on the two French clock-change Sundays.
function paris18(date: Date) {
  const target = { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate(), hour: 18, minute: 0, second: 0 };
  let instant = utc(target);
  for (let attempt = 0; attempt < 3; attempt++) instant += utc(target) - utc(calendar(new Date(instant)));
  return new Date(instant);
}

export type DigestWindow = { start: string; end: string };

export function windowEndingAt(end: string): DigestWindow {
  const instant = new Date(end);
  const local = calendar(instant);
  const day = new Date(Date.UTC(local.year, local.month - 1, local.day));
  if (day.getUTCDay() !== 0 || local.hour !== 18 || local.minute || local.second || instant.getUTCMilliseconds()) {
    throw new Error("period_must_end_sunday_18_paris");
  }
  day.setUTCDate(day.getUTCDate() - 7);
  return { start: paris18(day).toISOString(), end: instant.toISOString() };
}

export function latestDigestWindow(now = new Date()): DigestWindow {
  const local = calendar(now);
  const sunday = new Date(Date.UTC(local.year, local.month - 1, local.day));
  sunday.setUTCDate(sunday.getUTCDate() - sunday.getUTCDay());
  let end = paris18(sunday);
  if (end.getTime() > now.getTime()) {
    sunday.setUTCDate(sunday.getUTCDate() - 7);
    end = paris18(sunday);
  }
  return windowEndingAt(end.toISOString());
}

export function withinScheduledWindow(now: Date, window: DigestWindow) {
  const delay = now.getTime() - Date.parse(window.end);
  return delay >= 0 && delay < 24 * 60 * 60 * 1000;
}

export function frenchDate(value: string, includeTime = false) {
  return new Intl.DateTimeFormat("fr-FR", {
    timeZone: PARIS_ZONE, day: "2-digit", month: "2-digit", year: "numeric",
    ...(includeTime ? { hour: "2-digit", minute: "2-digit" } as const : {}),
  }).format(new Date(value));
}
