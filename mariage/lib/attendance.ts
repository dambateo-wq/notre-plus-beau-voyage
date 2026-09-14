export const ATTENDANCE_OPTIONS = [
  { value: "2027-05-28", label: "Vendredi 28 mai 2027" },
  { value: "2027-05-29-morning", label: "Samedi 29 mai 2027 au matin" },
  { value: "2027-05-29-afternoon", label: "Samedi 29 mai 2027 l’après-midi et le soir" },
  { value: "2027-05-30", label: "Dimanche 30 mai 2027 midi" },
] as const;

export const ALLOWED_ATTENDANCE_DAYS = new Set<string>([
  ...ATTENDANCE_OPTIONS.map((option) => option.value),
  "2027-05-29",
]);

const ATTENDANCE_LABELS: Record<string, string> = {
  "2027-05-28": "Vendredi 28 mai 2027",
  "2027-05-29-morning": "Samedi 29 mai 2027 au matin",
  "2027-05-29-afternoon": "Samedi 29 mai 2027 l’après-midi et le soir",
  "2027-05-29": "Samedi 29 mai 2027",
  "2027-05-30": "Dimanche 30 mai 2027 midi",
};

export function normalizeAttendanceDays(days: string[]) {
  return [...new Set(days.flatMap((day) =>
    day === "2027-05-29"
      ? ["2027-05-29-morning", "2027-05-29-afternoon"]
      : [day],
  ))];
}

export function formatAttendanceDay(day: string) {
  return ATTENDANCE_LABELS[day] ?? day;
}

export function formatAttendanceDays(days: string[], separator = " · ") {
  return days.map(formatAttendanceDay).join(separator);
}
