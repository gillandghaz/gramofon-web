// PENTING: file ini HANYA boleh diimpor dari kode server (API routes),
// tidak pernah dari komponen "use client". Firebase Admin SDK punya akses
// PENUH ke seluruh project Firebase Anda (bisa baca/tulis/hapus apa pun,
// tanpa terikat Security Rules) — kredensialnya (Service Account) TIDAK
// BOLEH pernah sampai ke browser.

import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

let adminApp = null;

// Inisialisasi dilakukan LAZY (baru saat benar-benar dipanggil, bukan saat
// file di-import) — ini sengaja, supaya proses build Next.js tidak gagal
// hanya karena env var Service Account belum diisi.
export function getAdminApp() {
  if (adminApp) return adminApp;
  if (getApps().length) {
    adminApp = getApps()[0];
    return adminApp;
  }

  const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
  // Private key disimpan dengan "\n" literal di Environment Variables
  // (karena env var tidak bisa menyimpan newline sungguhan) — di sini kita
  // ubah kembali jadi newline asli sebelum dipakai.
  const privateKey = (process.env.FIREBASE_ADMIN_PRIVATE_KEY || "").replace(/\\n/g, "\n");

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error(
      "Firebase Admin belum dikonfigurasi. Isi FIREBASE_ADMIN_PROJECT_ID, " +
        "FIREBASE_ADMIN_CLIENT_EMAIL, dan FIREBASE_ADMIN_PRIVATE_KEY di Environment Variables."
    );
  }

  adminApp = initializeApp({
    credential: cert({ projectId, clientEmail, privateKey }),
  });
  return adminApp;
}

export function adminAuth() {
  return getAuth(getAdminApp());
}

export function adminDb() {
  return getFirestore(getAdminApp());
}
