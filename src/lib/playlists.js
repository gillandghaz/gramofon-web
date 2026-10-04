import {
  addDoc,
  arrayRemove,
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  getDocs,
  query,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import { db } from "./firebase";

// Query DIBATASI where("uid","==",uid) -- WAJIB cocok dengan firestore.rules
// (lihat catatan panjang "rules bukan filter" di notifications.js/
// NotificationBell.js). Query longgar "ambil semua playlists" akan
// ditolak total, bukan cuma difilter.
export async function listMyPlaylists(uid) {
  const snap = await getDocs(query(collection(db, "playlists"), where("uid", "==", uid)));
  const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  // Urutan tampil: pakai field "order" (hasil drag) kalau sudah pernah
  // diatur; playlist yang belum punya "order" jatuh ke akhir, diurutkan
  // di antara sesamanya berdasarkan waktu dibuat.
  list.sort((a, b) => {
    const ao = typeof a.order === "number" ? a.order : Infinity;
    const bo = typeof b.order === "number" ? b.order : Infinity;
    if (ao !== bo) return ao - bo;
    const at = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
    const bt = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
    return at - bt;
  });
  return list;
}

export async function createPlaylist(uid, name, trackIds = []) {
  const docRef = await addDoc(collection(db, "playlists"), {
    uid,
    name: name.trim(),
    trackIds,
    createdAt: serverTimestamp(),
  });
  return docRef.id;
}

// Menimpa urutan TAMPIL playlist milik user (bukan urutan trackIds di
// dalamnya) -- dipakai fitur drag di kartu "Playlist" Manage Media.
export async function reorderPlaylists(orderedIds) {
  const batch = writeBatch(db);
  orderedIds.forEach((id, idx) => batch.update(doc(db, "playlists", id), { order: idx }));
  await batch.commit();
}

export async function renamePlaylist(playlistId, name) {
  await updateDoc(doc(db, "playlists", playlistId), { name: name.trim() });
}

export async function deletePlaylist(playlistId) {
  await deleteDoc(doc(db, "playlists", playlistId));
}

export async function addTrackToPlaylist(playlistId, mediaId) {
  await updateDoc(doc(db, "playlists", playlistId), { trackIds: arrayUnion(mediaId) });
}

// Versi massal -- SATU tulisan untuk banyak media (dipakai "Pilih semua" di
// Manage Media), bukan satu tulisan per media.
export async function addTracksToPlaylist(playlistId, mediaIds) {
  if (!mediaIds.length) return;
  await updateDoc(doc(db, "playlists", playlistId), { trackIds: arrayUnion(...mediaIds) });
}

export async function removeTracksFromPlaylist(playlistId, mediaIds) {
  if (!mediaIds.length) return;
  await updateDoc(doc(db, "playlists", playlistId), { trackIds: arrayRemove(...mediaIds) });
}

export async function removeTrackFromPlaylist(playlistId, mediaId) {
  await updateDoc(doc(db, "playlists", playlistId), { trackIds: arrayRemove(mediaId) });
}

// Menimpa TOTAL urutan trackIds -- dipakai fitur drag-untuk-mengurutkan.
// Dikirim sebagai array lengkap (bukan arrayUnion/arrayRemove) karena
// yang berubah adalah URUTANNYA, bukan isinya.
export async function reorderPlaylistTracks(playlistId, orderedTrackIds) {
  await updateDoc(doc(db, "playlists", playlistId), { trackIds: orderedTrackIds });
}
