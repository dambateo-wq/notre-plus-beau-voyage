"use server";

import {
  createAdminSession,
  deleteAdminSession,
  isValidAdminPassword,
} from "@/lib/admin-auth";
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
