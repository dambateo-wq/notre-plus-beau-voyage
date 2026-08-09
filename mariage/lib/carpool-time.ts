const LOCAL_DATE_TIME = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

const offsetFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: "Europe/Paris",
  timeZoneName: "longOffset",
});

function parseLocalDateTime(value: string) {
  const match = LOCAL_DATE_TIME.exec(value);
  if (!match) return null;

  const [, year, month, day, hour, minute] = match;
  const parts = {
    year: Number(year),
    month: Number(month),
    day: Number(day),
    hour: Number(hour),
    minute: Number(minute),
  };
  const probe = new Date(
    Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute),
  );

  if (
    probe.getUTCFullYear() !== parts.year ||
    probe.getUTCMonth() !== parts.month - 1 ||
    probe.getUTCDate() !== parts.day ||
    parts.hour > 23 ||
    parts.minute > 59
  ) {
    return null;
  }

  return parts;
}

function parisOffsetMinutes(date: Date) {
  const zone = offsetFormatter
    .formatToParts(date)
    .find((part) => part.type === "timeZoneName")?.value;
  const match = zone?.match(/^GMT([+-])(\d{2}):(\d{2})$/);
  if (!match) throw new Error("Le fuseau Europe/Paris est indisponible.");
  const minutes = Number(match[2]) * 60 + Number(match[3]);
  return match[1] === "+" ? minutes : -minutes;
}

export function isAllowedCarpoolDate(value: string) {
  return Boolean(
    parseLocalDateTime(value) &&
      value >= "2027-05-25T00:00" &&
      value <= "2027-06-02T23:59",
  );
}

export function parisLocalToInstant(value: string) {
  const parts = parseLocalDateTime(value);
  if (!parts) throw new Error("Date locale invalide.");

  const localAsUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
  );
  let instant = new Date(localAsUtc - parisOffsetMinutes(new Date(localAsUtc)) * 60_000);
  instant = new Date(localAsUtc - parisOffsetMinutes(instant) * 60_000);
  return instant;
}

export function formatCarpoolDate(value: string, includeDateStyle = false) {
  return new Intl.DateTimeFormat("fr-FR", {
    ...(includeDateStyle
      ? { dateStyle: "long" as const, timeStyle: "short" as const }
      : {
          weekday: "long" as const,
          day: "numeric" as const,
          month: "long" as const,
          hour: "2-digit" as const,
          minute: "2-digit" as const,
        }),
    timeZone: "Europe/Paris",
  }).format(parisLocalToInstant(value));
}

export function legacyUtcClockToLocal(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}T${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}`;
}
