export const DIETARY_OPTIONS = ["none", "vegetarian"] as const;

export type DietaryOption = (typeof DIETARY_OPTIONS)[number];

export type DietaryRequirement = {
  participantIndex: number;
  participantName: string;
  diet: DietaryOption;
  allergies: string;
};

export function normalizeDietaryRequirements(value: unknown): DietaryRequirement[] | null {
  if (!Array.isArray(value)) return null;

  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const entry = item as Record<string, unknown>;
    const participantIndex = Number(entry.participantIndex);
    const participantName = typeof entry.participantName === "string" ? entry.participantName.trim() : "";
    const diet = entry.diet === "vegetarian" ? "vegetarian" : entry.diet === "none" ? "none" : null;
    const allergies = typeof entry.allergies === "string" ? entry.allergies.trim() : "";

    if (!Number.isInteger(participantIndex) || participantIndex < 0 || !participantName || !diet) return [];
    return [{ participantIndex, participantName, diet, allergies }];
  });
}

export function hasDietaryRequirement(entry: DietaryRequirement) {
  return entry.diet === "vegetarian" || Boolean(entry.allergies.trim());
}
