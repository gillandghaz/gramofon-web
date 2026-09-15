import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "./firebase";

const SETTINGS_DOC = doc(db, "settings", "app");

// Catatan jujur: pengecekan ini mencegah pembuatan PROFIL user baru di
// Firestore lewat aplikasi. Ini TIDAK mencegah seseorang memanggil Firebase
// Auth SDK secara langsung untuk membuat akun Auth murni (tanpa profil).
// Penegakan 100% butuh Firebase Cloud Functions (Blocking Functions, perlu
// paket Blaze) — bisa ditambahkan di fase lanjutan kalau dibutuhkan.
export async function isRegistrationOpen() {
  const snap = await getDoc(SETTINGS_DOC);
  if (!snap.exists()) return true; // default: terbuka kalau belum pernah di-set
  return snap.data().registrationOpen !== false;
}

export async function setRegistrationOpen(open) {
  await setDoc(SETTINGS_DOC, { registrationOpen: open }, { merge: true });
}
