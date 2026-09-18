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
//
// targetUids: array uid untuk kirim ke pengguna TERTENTU saja, atau
// null/tidak diisi untuk broadcast ke semua pengguna.
//
// Catatan jujur soal privasi: filter "notifikasi ini untuk saya atau
// bukan" dilakukan di CLIENT (lihat NotificationBell.js), karena
// Firestore tidak bisa query "array berisi uid saya ATAU field kosong"
// dalam satu query. Ini berarti notifikasi bertarget TETAP bisa dibaca
// lewat akses Firestore langsung oleh pengguna lain yang login (rules
// mengizinkan baca semua dokumen notifications) — hanya TIDAK ditampilkan
// di UI mereka. Untuk pesan yang isinya benar-benar rahasia/sensitif,
// mekanisme ini belum cukup; beri tahu saya kalau itu dibutuhkan, karena
// perlu desain berbeda (subcollection per-user).
export async function sendNotification({ title, message, targetUids }) {
  await addDoc(collection(db, "notifications"), {
    title: title.trim(),
    message: message.trim(),
    sentBy: auth.currentUser?.uid || null,
    targetUids: targetUids && targetUids.length ? targetUids : null,
    createdAt: serverTimestamp(),
  });
}

export async function updateNotification(id, { title, message }) {
  await updateDoc(doc(db, "notifications", id), {
    title: title.trim(),
    message: message.trim(),
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
