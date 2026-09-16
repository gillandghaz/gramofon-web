import { doc, updateDoc, getDoc, deleteDoc } from "firebase/firestore";
import {
  sendPasswordResetEmail,
  EmailAuthProvider,
  reauthenticateWithCredential,
  reauthenticateWithPopup,
  deleteUser,
} from "firebase/auth";
import { auth, db, googleProvider } from "./firebase";

export async function updateDisplayName(uid, displayName) {
  await updateDoc(doc(db, "users", uid), { displayName });
}

export async function updateSetting(uid, key, value) {
  await updateDoc(doc(db, "users", uid), { [`settings.${key}`]: value });
}

export async function requestPasswordChange() {
  const user = auth.currentUser;
  if (!user?.email) {
    throw new Error("no-email");
  }
  await sendPasswordResetEmail(auth, user.email);
}

export function currentUserAuthProvider() {
  const user = auth.currentUser;
  return user?.providerData?.[0]?.providerId || null; // "password" | "google.com"
}

// Firebase MEWAJIBKAN "recent login" sebelum sebuah akun boleh dihapus —
// makanya di sini kita re-autentikasi dulu (password ulang, atau ulang
// popup Google) tepat sebelum penghapusan. Catatan: kalau admin sedang
// menonaktifkan fitur ini (settings/app.selfDeleteEnabled = false),
// panggilan ini akan ditolak Firestore di langkah hapus profil —
// firestore.rules yang menegakkan ini, bukan cuma tombolnya disembunyikan.
export async function deleteOwnAccount({ password } = {}) {
  const user = auth.currentUser;
  if (!user) throw new Error("not-signed-in");

  const providerId = currentUserAuthProvider();
  if (providerId === "password") {
    if (!password) throw new Error("password-required");
    const cred = EmailAuthProvider.credential(user.email, password);
    await reauthenticateWithCredential(user, cred);
  } else {
    await reauthenticateWithPopup(user, googleProvider);
  }

  const userSnap = await getDoc(doc(db, "users", user.uid));
  const username = userSnap.exists() ? userSnap.data().username : null;
  if (username) {
    await deleteDoc(doc(db, "usernames", username)).catch(() => {});
  }
  // Kalau baris ini ditolak rules (selfDeleteEnabled=false), exception-nya
  // akan menyebar ke pemanggil (SettingTab) dan ditampilkan sebagai error —
  // TIDAK ditelan diam-diam.
  await deleteDoc(doc(db, "users", user.uid));
  await deleteUser(user);
}
