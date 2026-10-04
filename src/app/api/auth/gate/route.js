import { NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase-admin";
import { requireUser, isRegistrationOpenServer, errorResponse, HttpError } from "@/lib/server-auth";

// Gerbang pendaftaran di SERVER. Dipanggil klien tepat sebelum profil akun
// BARU dibuat -- baik lewat email+password maupun Google (login Google untuk
// pertama kali otomatis membuat akun Firebase Auth).
//
//  - Akun sudah punya profil  -> lolos (login biasa, tidak terpengaruh).
//  - Akun belum punya profil dan pendaftaran DITUTUP -> akun Auth yang baru
//    terbentuk itu DIHAPUS di server dan permintaan ditolak (403).
//  - Akun belum punya profil dan pendaftaran dibuka -> lolos; klien lalu
//    membuat profilnya (itu pun dijaga lagi oleh firestore.rules).
export async function POST(request) {
  try {
    const decoded = await requireUser(request, { requireProfile: false });

    const snap = await adminDb().collection("users").doc(decoded.uid).get();
    if (snap.exists) return NextResponse.json({ ok: true, hasProfile: true });

    if (!(await isRegistrationOpenServer())) {
      try {
        await adminAuth().deleteUser(decoded.uid);
      } catch (e) {
        console.error("auth gate: gagal menghapus akun Auth tanpa profil:", e);
      }
      throw new HttpError(403, "Pendaftaran akun baru sedang dinonaktifkan oleh admin.");
    }
    return NextResponse.json({ ok: true, hasProfile: false });
  } catch (err) {
    return errorResponse(err, "auth gate");
  }
}
