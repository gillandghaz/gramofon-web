import { doc, updateDoc } from "firebase/firestore";
import { sendPasswordResetEmail } from "firebase/auth";
import { auth, db } from "./firebase";

export async function updateDisplayName(uid, displayName) {
  // Hanya mengirim field "displayName" — sesuai rules, user boleh update
  // profilnya sendiri asal tidak menyentuh field "role".
  await updateDoc(doc(db, "users", uid), { displayName });
}

// Pengaturan pemutar (skip interval, startup view, dst) disimpan sebagai
// map "settings" di dalam dokumen users/{uid} sendiri — masih terhitung
// "bukan field role", jadi tetap diizinkan rules untuk diubah user sendiri.
export async function updateSetting(uid, key, value) {
  await updateDoc(doc(db, "users", uid), { [`settings.${key}`]: value });
}

// Sesuai permintaan: ganti password lewat dashboard memakai mekanisme
// verifikasi email yang SAMA dengan "lupa password" (bukan re-auth
// langsung di halaman). Firebase akan mengirim link ke email akun yang
// sedang login; begitu link itu dibuka & password baru disetel, sesi
// yang lama otomatis tidak berlaku lagi.
export async function requestPasswordChange() {
  const user = auth.currentUser;
  if (!user?.email) {
    throw new Error("no-email");
  }
  await sendPasswordResetEmail(auth, user.email);
}
