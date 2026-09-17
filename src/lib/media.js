import { collection, getDocs } from "firebase/firestore";
import { auth, db } from "./firebase";

// Sama seperti listAllUsers()/listNotifications(): ambil semua dulu,
// urutkan di client — menghindari bug orderBy() yang menyembunyikan
// dokumen tanpa field createdAt.
export async function listAllMedia() {
  const snap = await getDocs(collection(db, "media"));
  const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  list.sort((a, b) => {
    const at = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
    const bt = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
    return bt - at;
  });
  return list;
}

export function formatBytes(bytes) {
  if (!bytes) return "0MB";
  const mb = bytes / (1024 * 1024);
  if (mb < 1) return `${(bytes / 1024).toFixed(0)}KB`;
  if (mb < 1024) return `${mb.toFixed(1)}MB`;
  return `${(mb / 1024).toFixed(2)}GB`;
}

// Penghapusan media oleh admin lewat server (perlu Cloudinary API Secret
// untuk menghapus asset sungguhan — tidak bisa dilakukan aman dari client).
export async function adminDeleteMedia(mediaId) {
  const idToken = await auth.currentUser.getIdToken();
  const res = await fetch("/api/admin/delete-media", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({ mediaId }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || "delete-failed");
  return body;
}
