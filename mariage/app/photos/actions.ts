"use server";

import { redirect } from "next/navigation";
import { clearPhotosSession, createPhotosSession, photosPasswordConfigured, validPhotosPassword } from "@/lib/photos-auth";

export async function enterPhotos(form: FormData) {
  if (!photosPasswordConfigured()) redirect("/photos?error=unavailable");
  const password = form.get("password");
  if (typeof password !== "string" || !validPhotosPassword(password)) redirect("/photos?error=password");
  await createPhotosSession();
  redirect("/photos");
}

export async function leavePhotos() {
  await clearPhotosSession();
  redirect("/photos");
}
