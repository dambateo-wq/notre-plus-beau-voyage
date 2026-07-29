import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

const COOKIE_NAME = "wedding_admin_session";
const SESSION_VALUE = "notre-plus-beau-voyage-admin";

function getAdminPassword() {
  const password = process.env.ADMIN_PASSWORD;

  if (!password) {
    throw new Error("L’accès administrateur n’est pas encore configuré.");
  }

  return password;
}

function createSessionToken() {
  return createHmac("sha256", getAdminPassword())
    .update(SESSION_VALUE)
    .digest("hex");
}

export function isValidAdminPassword(password: string) {
  const expected = Buffer.from(getAdminPassword());
  const supplied = Buffer.from(password);

  return (
    expected.length === supplied.length && timingSafeEqual(expected, supplied)
  );
}

export async function createAdminSession() {
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, createSessionToken(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: 60 * 60 * 12,
    path: "/admin",
  });
}

export async function deleteAdminSession() {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
}

export async function isAdminAuthenticated() {
  const supplied = (await cookies()).get(COOKIE_NAME)?.value;
  if (!supplied) return false;

  const expectedBuffer = Buffer.from(createSessionToken());
  const suppliedBuffer = Buffer.from(supplied);

  return (
    expectedBuffer.length === suppliedBuffer.length &&
    timingSafeEqual(expectedBuffer, suppliedBuffer)
  );
}
