"use server";

import {
  createAdminSession,
  deleteAdminSession,
  isAdminAuthenticated,
  isValidAdminPassword,
} from "@/lib/admin-auth";
import { deleteCarpoolOffer, deleteWeddingResponse } from "@/lib/admin-data";
import { updateLodgingReservation } from "@/lib/lodging";
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
