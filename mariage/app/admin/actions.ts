"use server";

import {
  createAdminSession,
  deleteAdminSession,
  isAdminAuthenticated,
  isValidAdminPassword,
} from "@/lib/admin-auth";
import { deleteWeddingResponse } from "@/lib/admin-data";
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
