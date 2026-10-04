import "server-only";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

const COOKIE = "wedding_photos_session";
const LIFETIME = 60 * 60 * 24 * 30;

function equal(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function photosPasswordConfigured() {
  return Boolean(process.env.WEDDING_PHOTOS_PASSWORD);
}

export function validPhotosPassword(value: string) {
  const password = process.env.WEDDING_PHOTOS_PASSWORD;
  return Boolean(password && value.length <= 1024 && equal(value, password));
}

function signature(payload: string) {
  return createHmac("sha256", process.env.WEDDING_PHOTOS_PASSWORD!)
    .update(`wedding-photos:${payload}`).digest("hex");
}

export async function createPhotosSession() {
  if (!photosPasswordConfigured()) throw new Error("Photos access unavailable");
  const payload = `${Math.floor(Date.now() / 1000) + LIFETIME}.${randomBytes(24).toString("hex")}`;
  (await cookies()).set(COOKIE, `${payload}.${signature(payload)}`, {
    httpOnly: true, secure: process.env.NODE_ENV === "production",
    sameSite: "strict", path: "/photos", maxAge: LIFETIME,
  });
}

export async function photosAuthenticated() {
  if (!photosPasswordConfigured()) return false;
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token || token.length > 200) return false;
  const parts = token.split(".");
  if (parts.length !== 3 || !/^\d+$/.test(parts[0]) || !/^[a-f0-9]{48}$/.test(parts[1])) return false;
  const expiry = Number(parts[0]);
  const now = Math.floor(Date.now() / 1000);
  return expiry > now && expiry <= now + LIFETIME && equal(signature(`${parts[0]}.${parts[1]}`), parts[2]);
}

export async function clearPhotosSession() {
  (await cookies()).set(COOKIE, "", { path: "/photos", maxAge: 0, httpOnly: true,
    secure: process.env.NODE_ENV === "production", sameSite: "strict" });
}
