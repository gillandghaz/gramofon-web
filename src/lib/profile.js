import {
  doc,
  getDoc,
  runTransaction,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "./firebase";

// Firestore tidak punya "unique constraint" bawaan. Pola standarnya:
// simpan username sebagai ID dokumen di koleksi terpisah "usernames"
// (usernames/{username} -> { uid }). Karena ID dokumen di Firestore
// dijamin unik, dan kita pakai transaction (baca+tulis atomik) supaya dua
// orang tidak bisa "balapan" merebut username yang sama di saat bersamaan.
export async function isUsernameAvailable(username) {
  const snap = await getDoc(doc(db, "usernames", username.toLowerCase()));
  return !snap.exists();
}

// Gerbang pendaftaran di server (lihat /api/auth/gate). Melempar
// Error("registration-closed") kalau pendaftaran ditutup -- akun Auth yang
// baru terbentuk itu sudah dihapus server, klien cukup keluar (signOut).
export async function gateRegistration(user) {
  const idToken = await user.getIdToken();
  const res = await fetch("/api/auth/gate", {
    method: "POST",
    headers: { Authorization: `Bearer ${idToken}` },
  });
  if (res.status === 403) throw new Error("registration-closed");
  if (!res.ok) throw new Error("gate-failed");
}

export async function createUserProfile(user, { username, displayName }) {
  const usernameKey = username.toLowerCase();
  const usernameRef = doc(db, "usernames", usernameKey);
  const userRef = doc(db, "users", user.uid);

  await runTransaction(db, async (tx) => {
    const existing = await tx.get(usernameRef);
    if (existing.exists()) {
      throw new Error("username-taken");
    }
    tx.set(usernameRef, { uid: user.uid });
    tx.set(userRef, {
      email: user.email,
      username: usernameKey,
      displayName: displayName || username,
      role: "user", // default — hanya admin (lewat rules) yang boleh mengubah ini nanti
      createdAt: serverTimestamp(),
    });
  });
}

// Dipakai setelah login Google pertama kali: kalau user belum punya profil
// (baru pertama kali login), buatkan otomatis dengan username sementara
// dari bagian depan emailnya. User tetap bisa/harus melengkapi username
// permanennya di halaman Account kalau mau (lihat catatan Fase 4).
// Beberapa pemanggil (halaman login + self-heal di auth-context) bisa memanggil
// ini bersamaan untuk akun yang sama -- satu proses saja yang dijalankan,
// hasil/errornya dibagikan (supaya gerbang server tidak dipanggil dua kali).
const inflight = new Map();
export function ensureUserProfile(user) {
  if (!inflight.has(user.uid)) {
    const p = ensureUserProfileOnce(user).finally(() => inflight.delete(user.uid));
    inflight.set(user.uid, p);
  }
  return inflight.get(user.uid);
}

async function ensureUserProfileOnce(user) {
  const userRef = doc(db, "users", user.uid);
  const existing = await getDoc(userRef);
  if (existing.exists()) return;

  await gateRegistration(user);

  const base = (user.email || "user").split("@")[0].replace(/[^a-zA-Z0-9_]/g, "");
  let candidate = base || `user${Date.now()}`;
  let attempt = 0;
  while (!(await isUsernameAvailable(candidate))) {
    attempt += 1;
    candidate = `${base}${Math.floor(Math.random() * 10000)}`;
    if (attempt > 8) {
      candidate = `user${user.uid.slice(0, 8)}`;
      break;
    }
  }

  await createUserProfile(user, {
    username: candidate,
    displayName: user.displayName || candidate,
  });
}
