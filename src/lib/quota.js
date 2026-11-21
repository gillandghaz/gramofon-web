// HANYA untuk kode server. Perhitungan kuota penyimpanan pribadi, dipakai
// bersama oleh /api/media/sign-upload dan /api/media/confirm-upload supaya
// aturannya tidak berbeda di dua tempat.

import { adminDb } from "@/lib/firebase-admin";

export const DEFAULT_LIMIT_MB = 200;

export async function getEffectiveLimitMB(uid) {
  const [userSnap, settingsSnap] = await Promise.all([
    adminDb().collection("users").doc(uid).get(),
    adminDb().collection("settings").doc("app").get(),
  ]);
  const userLimit = userSnap.exists ? userSnap.data().storageLimitMB : undefined;
  if (typeof userLimit === "number" && Number.isFinite(userLimit)) return userLimit;
  const defaultLimit = settingsSnap.exists ? settingsSnap.data().defaultStorageLimitMB : undefined;
  return typeof defaultLimit === "number" && Number.isFinite(defaultLimit)
    ? defaultLimit
    : DEFAULT_LIMIT_MB;
}

export function sumBytes(snap) {
  let total = 0;
  snap.forEach((d) => {
    const b = d.data().bytes;
    total += typeof b === "number" && b > 0 ? b : 0;
  });
  return total;
}
