"use server";

import {
  createAdminSession,
  deleteAdminSession,
  isAdminAuthenticated,
  isValidAdminPassword,
} from "@/lib/admin-auth";
import { deleteCarpoolOffer, deleteWeddingResponse } from "@/lib/admin-data";
import { getLodgingAssignments, getLodgingReservations, saveLodgingAssignment, updateLodgingReservation } from "@/lib/lodging";
import { getRoomCapacity, LODGING_ROOM_NAMES } from "@/lib/lodging-rooms";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export async function login(formData: FormData) {
  const password = String(formData.get("password") ?? "");

  if (!isValidAdminPassword(password)) {
    await new Promise((resolve) => setTimeout(resolve, 800));
    redirect("/admin?error=1");
  }

  await createAdminSession();
  redirect("/admin");
}

export async function logout() {
  await deleteAdminSession();
  redirect("/admin");
}

export async function deleteResponse(formData: FormData) {
  if (!(await isAdminAuthenticated())) {
    redirect("/admin");
  }

  const id = String(formData.get("id") ?? "");
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    throw new Error("Cette réponse est invalide.");
  }

  await deleteWeddingResponse(id);
  revalidatePath("/admin");
}

export async function deleteCarpool(formData: FormData) {
  if (!(await isAdminAuthenticated())) {
    redirect("/admin");
  }

  const id = String(formData.get("id") ?? "");
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    throw new Error("Ce trajet est invalide.");
  }

  await deleteCarpoolOffer(id);
  revalidatePath("/admin");
  revalidatePath("/");
}

export async function updateLodging(formData: FormData) {
  if (!(await isAdminAuthenticated())) {
    redirect("/admin");
  }

  const id = String(formData.get("id") ?? "");
  const action = String(formData.get("action") ?? "");
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    throw new Error("Cette réservation est invalide.");
  }

  if (action === "confirm") {
    await updateLodgingReservation(id, { payment_status: "confirmed" });
  } else if (action === "cancel") {
    await updateLodgingReservation(id, { booking_status: "cancelled" });
  } else {
    throw new Error("Cette action est invalide.");
  }

  revalidatePath("/admin");
  revalidatePath("/");
}

export async function saveLodgingPlacement(formData: FormData) {
  if (!(await isAdminAuthenticated())) redirect("/admin");
  const id = String(formData.get("id") ?? "");
  const roomName = String(formData.get("roomName") ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(id) || !LODGING_ROOM_NAMES.includes(roomName as never)) {
    throw new Error("Le placement est invalide.");
  }
  const count = (name: string) => {
    const value = Number(formData.get(name) ?? 0);
    if (!Number.isInteger(value) || value < 0 || value > 20) throw new Error("Les effectifs sont invalides.");
    return value;
  };
  const values = {
    room_name: roomName,
    friday_adults: count("fridayAdults"), friday_children: count("fridayChildren"), friday_babies: count("fridayBabies"),
    saturday_adults: count("saturdayAdults"), saturday_children: count("saturdayChildren"), saturday_babies: count("saturdayBabies"),
  };
  const reservations = await getLodgingReservations();
  const reservation = reservations.find((item) => item.id === id);
  if (!reservation || reservation.booking_status !== "active" || reservation.payment_status !== "confirmed") {
    throw new Error("Seules les réservations actives dont le paiement est confirmé peuvent être placées.");
  }
  const fridayTotal = values.friday_adults + values.friday_children + values.friday_babies;
  const saturdayTotal = values.saturday_adults + values.saturday_children + values.saturday_babies;
  if ((reservation.nights.includes("2027-05-28") && fridayTotal !== reservation.guests_count) ||
      (reservation.nights.includes("2027-05-29") && saturdayTotal !== reservation.guests_count)) {
    throw new Error("Le total de chaque nuit doit correspondre au nombre de personnes réservées.");
  }
  const assignments = await getLodgingAssignments();
  const capacity = getRoomCapacity(roomName);
  const already = (night: "friday" | "saturday") => assignments
    .filter((item) => item.reservation_id !== id && item.room_name === roomName)
    .reduce((sum, item) => sum + (night === "friday" ? item.friday_adults + item.friday_children + item.friday_babies : item.saturday_adults + item.saturday_children + item.saturday_babies), 0);
  if (already("friday") + fridayTotal > capacity || already("saturday") + saturdayTotal > capacity) {
    throw new Error("Cette chambre n’a pas assez de places libres pour ce placement.");
  }
  await saveLodgingAssignment(id, values);
  revalidatePath("/admin");
}
