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
} from "firebase/firestore";
import { db } from "./firebase";

// Query DIBATASI where("uid","==",uid) -- WAJIB cocok dengan firestore.rules
// (lihat catatan panjang "rules bukan filter" di notifications.js/
// NotificationBell.js). Query longgar "ambil semua playlists" akan
// ditolak total, bukan cuma difilter.
export async function listMyPlaylists(uid) {
  const snap = await getDocs(query(collection(db, "playlists"), where("uid", "==", uid)));
  const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  list.sort((a, b) => {
    const at = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
    const bt = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
    return at - bt;
  });
  return list;
}

export async function createPlaylist(uid, name) {
  const docRef = await addDoc(collection(db, "playlists"), {
    uid,
    name: name.trim(),
    trackIds: [],
    createdAt: serverTimestamp(),
  });
  return docRef.id;
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

export async function removeTrackFromPlaylist(playlistId, mediaId) {
  await updateDoc(doc(db, "playlists", playlistId), { trackIds: arrayRemove(mediaId) });
}

// Menimpa TOTAL urutan trackIds -- dipakai fitur drag-untuk-mengurutkan.
// Dikirim sebagai array lengkap (bukan arrayUnion/arrayRemove) karena
// yang berubah adalah URUTANNYA, bukan isinya.
export async function reorderPlaylistTracks(playlistId, orderedTrackIds) {
  await updateDoc(doc(db, "playlists", playlistId), { trackIds: orderedTrackIds });
}
