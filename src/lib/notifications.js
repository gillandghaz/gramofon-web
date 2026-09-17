import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import { auth, db } from "./firebase";

// Nama pengirim yang ditampilkan SELALU "Gramofon", terlepas dari admin
// mana yang sebenarnya mengirim (uid pengirim tetap dicatat di field
// "sentBy" untuk akuntabilitas internal, tapi TIDAK PERNAH ditampilkan
// di UI manapun).
export async function sendNotification({ title, message }) {
  await addDoc(collection(db, "notifications"), {
    title: title.trim(),
    message: message.trim(),
    sentBy: auth.currentUser?.uid || null,
    createdAt: serverTimestamp(),
  });
}

// Sama seperti listAllUsers(): ambil semua dulu, urutkan di client —
// menghindari bug orderBy() yang bisa menyembunyikan dokumen tanpa field
// createdAt (lihat catatan panjang di admin.js/listAllUsers).
export async function listNotifications() {
  const snap = await getDocs(collection(db, "notifications"));
  const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  list.sort((a, b) => {
    const at = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
    const bt = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
    return bt - at;
  });
  return list;
}

// Hapus SUNGGUHAN (bukan soft-delete) — begitu dihapus, notifikasi ini
// otomatis hilang dari daftar semua pengguna (mereka baca dari koleksi
// yang sama), TANPA bekas "pesan telah dihapus" di mana pun.
export async function deleteNotification(id) {
  await deleteDoc(doc(db, "notifications", id));
}

// Status baca disimpan sebagai map di dalam dokumen user sendiri
// (users/{uid}.readNotifications = { [notifId]: true, ... }) — bukan
// subcollection terpisah, supaya tidak perlu query tambahan yang rumit,
// dan sudah otomatis diizinkan firestore.rules (user boleh update field
// apa pun di dokumennya sendiri, kecuali role/username).
export async function markNotificationRead(uid, notifId) {
  await updateDoc(doc(db, "users", uid), {
    [`readNotifications.${notifId}`]: true,
  });
}

export async function markAllNotificationsRead(uid, notifIds) {
  if (!notifIds.length) return;
  const patch = {};
  for (const id of notifIds) patch[`readNotifications.${id}`] = true;
  await updateDoc(doc(db, "users", uid), patch);
}
