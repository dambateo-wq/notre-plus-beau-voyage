export type PlacementAssignment = {
  guest_index: number;
  guest_name: string;
  room_name: string;
};

export type PlacementUpsert = {
  fromGuestIndex: number;
  toGuestIndex: number;
  roomName: string;
};

function comparableName(value: string) {
  return value.trim().toLocaleLowerCase("fr");
}

export function planLodgingPlacementReconciliation(
  assignments: PlacementAssignment[],
  nextGuestNames: string[],
) {
  const availableGuests = nextGuestNames.map((name, index) => ({
    index: index + 1,
    name: comparableName(name),
    used: false,
  }));
  const upserts: PlacementUpsert[] = [];
  const removeGuestIndexes: number[] = [];

  [...assignments]
    .sort((left, right) => left.guest_index - right.guest_index)
    .forEach((assignment) => {
      const match = availableGuests.find(
        (guest) => !guest.used && guest.name === comparableName(assignment.guest_name),
      );
      if (!match) {
        removeGuestIndexes.push(assignment.guest_index);
        return;
      }
      match.used = true;
      if (match.index !== assignment.guest_index) {
        removeGuestIndexes.push(assignment.guest_index);
      }
      upserts.push({
        fromGuestIndex: assignment.guest_index,
        toGuestIndex: match.index,
        roomName: assignment.room_name,
      });
    });

  return { removeGuestIndexes, upserts };
}

export function placementStatusAfterReconciliation(
  previousStatus: "pending" | "in_progress" | "finalized" | undefined,
  guestCount: number,
  placedCount: number,
) {
  if (placedCount === 0 || guestCount === 0) return "pending" as const;
  if (placedCount < guestCount) return "in_progress" as const;
  return previousStatus === "finalized" ? "finalized" as const : "in_progress" as const;
}
