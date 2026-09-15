import { collection, doc, getDocs, orderBy, query, updateDoc } from "firebase/firestore";
import { db } from "./firebase";

// Catatan keamanan: fungsi ini bisa dipanggil siapa pun yang sudah login
// (bukan hanya admin) karena rules "users/{userId}" mengizinkan READ untuk
// semua user yang sudah login (perlu supaya fitur dasar aplikasi bisa
// jalan). Yang benar-benar dikunci hanya admin adalah AKSI TULIS-nya
// (setUserRole di bawah) — itu ditegakkan oleh firestore.rules, bukan
// hanya disembunyikan di UI. Kalau ke depan Anda ingin daftar user juga
// tidak bisa dibaca non-admin, itu perlu penyesuaian rules terpisah.
export async function listAllUsers() {
  const snap = await getDocs(query(collection(db, "users"), orderBy("createdAt", "desc")));
  return snap.docs.map((d) => ({ uid: d.id, ...d.data() }));
}

export async function setUserRole(uid, role) {
  // Update HANYA field "role" — ini penting, karena firestore.rules
  // mengizinkan admin menulis hanya kalau field yang diubah cuma "role"
  // (hasOnly(['role'])). Kalau nanti field lain ikut dikirim di sini,
  // Firestore akan menolak seluruh operasi ini.
  await updateDoc(doc(db, "users", uid), { role });
}
