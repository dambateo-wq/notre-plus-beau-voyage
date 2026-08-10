export const COUPLE_LODGING = {
  name: "PALMIERS",
  capacity: 2,
  occupants: ["Julie Jacques", "Damien Ollier"],
} as const;

export const LODGING_ROOMS = [
  { name: "LAURIERS HAUT", capacity: 6 },
  { name: "LAURIERS BAS", capacity: 4 },
  { name: "LAURIERS TERRASSE", capacity: 4 },
  { name: "YUCCAS CHAMBRE", capacity: 2 },
  { name: "YUCCAS STUDIO", capacity: 2 },
  { name: "A1", capacity: 4 }, { name: "A2", capacity: 2 },
  { name: "A3", capacity: 4 }, { name: "A4", capacity: 3 },
  { name: "A5", capacity: 4 }, { name: "A6", capacity: 2 },
  { name: "A7", capacity: 3 }, { name: "A8", capacity: 2 },
  { name: "A9", capacity: 5 }, { name: "A10", capacity: 5 },
  { name: "A11", capacity: 2 }, { name: "A12", capacity: 3 },
  { name: "B1", capacity: 4 }, { name: "B2", capacity: 3 },
  { name: "B3", capacity: 3 }, { name: "B4", capacity: 3 },
  { name: "B5", capacity: 2 }, { name: "B6", capacity: 3 },
  { name: "B7", capacity: 2 }, { name: "B8", capacity: 4 },
  { name: "B9", capacity: 2 }, { name: "B10", capacity: 4 },
  { name: "B11", capacity: 2 }, { name: "B12", capacity: 4 },
  { name: "B13", capacity: 2 }, { name: "B14", capacity: 4 },
  { name: "B15", capacity: 7 },
] as const;

export const LODGING_ROOM_NAMES = LODGING_ROOMS.map((room) => room.name);

export function getRoomCapacity(name: string) {
  return LODGING_ROOMS.find((room) => room.name === name)?.capacity ?? 0;
}
