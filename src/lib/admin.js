import {
  collection,
  doc,
  getDocs,
  runTransaction,
  updateDoc,
  deleteField,
} from "firebase/firestore";
import { auth, db } from "./firebase";

// PENTING: sebelumnya query ini memakai orderBy("createdAt", "desc").
// Firestore's orderBy() SECARA DIAM-DIAM MENGECUALIKAN dokumen yang tidak
// punya field tersebut dari hasil query — bukan cuma gagal mengurutkan,
// tapi dokumen itu benar-benar tidak pernah muncul. Kalau ada profil user
// yang field createdAt-nya sempat tidak tersimpan (mis. race condition
// lama saat signup), dia akan "hilang" dari daftar Admin. Makanya di sini
// kita ambil SEMUA dokumen dulu, baru urutkan di client — supaya tidak
// ada satu pun akun yang tersembunyi hanya karena field itu.
export async function listAllUsers() {
  const snap = await getDocs(collection(db, "users"));
  const list = snap.docs.map((d) => ({ uid: d.id, ...d.data() }));
  list.sort((a, b) => {
    const at = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
    const bt = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
    return bt - at;
  });
  return list;
}

export async function setUserRole(uid, role) {
  // Update HANYA field "role" — firestore.rules hanya mengizinkan admin
  // menulis kalau field yang diubah cuma "role" (hasOnly(['role'])).
  await updateDoc(doc(db, "users", uid), { role });
}

// Set batas penyimpanan KHUSUS untuk satu akun (override dari default).
export async function setUserStorageLimit(uid, mb) {
  await updateDoc(doc(db, "users", uid), { storageLimitMB: mb });
}

// Kembalikan akun ini ke batas DEFAULT (hapus override-nya).
export async function clearUserStorageLimit(uid) {
  await updateDoc(doc(db, "users", uid), { storageLimitMB: deleteField() });
}

// Admin mengganti username akun MANA PUN, termasuk sesama admin. Memakai
// transaction supaya "bebaskan username lama" + "rebut username baru" +
// "update field username" terjadi atomik.
export async function adminChangeUsername(targetUid, newUsername) {
  const key = newUsername.toLowerCase();
  const targetRef = doc(db, "users", targetUid);
  const newUsernameRef = doc(db, "usernames", key);

  await runTransaction(db, async (tx) => {
    const targetSnap = await tx.get(targetRef);
    if (!targetSnap.exists()) throw new Error("user-not-found");
    const targetData = targetSnap.data();

    const newUsernameSnap = await tx.get(newUsernameRef);
    if (newUsernameSnap.exists()) throw new Error("username-taken");

    const oldUsernameRef = doc(db, "usernames", targetData.username);
    tx.delete(oldUsernameRef);
    tx.set(newUsernameRef, { uid: targetUid });
    tx.update(targetRef, { username: key });
  });
}

// Menghapus akun pengguna lain SUNGGUHAN (termasuk akun Firebase Auth-nya)
// butuh Admin SDK di server — client SDK tidak diizinkan Firebase
// menghapus akun Auth orang lain. Route ini memverifikasi ID token
// pemanggil dan mengecek ulang role admin-nya DI SERVER sebelum menghapus.
export async function adminDeleteUser(targetUid) {
  const idToken = await auth.currentUser.getIdToken();
  const res = await fetch("/api/admin/delete-user", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({ targetUid }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(body.error || "delete-failed");
  }
  return body;
}
