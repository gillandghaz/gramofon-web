import { collection, getDocs, query, where } from "firebase/firestore";
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

// Hanya media milik user ini sendiri (dipakai halaman /app - perpustakaan
// pribadi). Query dibatasi where("uid","==",uid) supaya cocok dengan
// firestore.rules (lihat catatan "rules bukan filter" di notifications.js).
export async function listMyMedia(uid) {
  const snap = await getDocs(query(collection(db, "media"), where("uid", "==", uid)));
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

// ---------------------------------------------------------------------
// Upload: alur 3 langkah, lihat penjelasan lengkap di
// /api/media/sign-upload dan /api/media/confirm-upload.
//   1) minta tanda tangan (server cek kuota SEKILAS lebih dulu)
//   2) upload LANGSUNG ke Cloudinary dari browser (bukan lewat server kita)
//   3) lapor balik ke server kita untuk penegakan kuota SUNGGUHAN +
//      baru setelah itu dokumen Firestore-nya benar-benar dibuat
// ---------------------------------------------------------------------
export async function uploadMediaFile(file, title, onProgress) {
  const idToken = await auth.currentUser.getIdToken();

  // Langkah 1: minta tanda tangan
  const signRes = await fetch("/api/media/sign-upload", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
    body: JSON.stringify({ fileSizeBytes: file.size }),
  });
  const signBody = await signRes.json().catch(() => ({}));
  if (!signRes.ok) throw new Error(signBody.error || "Gagal meminta izin upload.");
  const { signature, timestamp, folder, apiKey, cloudName } = signBody;

  // Langkah 2: upload langsung ke Cloudinary (pakai XHR, bukan fetch,
  // supaya bisa melaporkan progres upload ke UI lewat onProgress).
  const cloudinaryResult = await new Promise((resolve, reject) => {
    const form = new FormData();
    form.append("file", file);
    form.append("api_key", apiKey);
    form.append("timestamp", timestamp);
    form.append("signature", signature);
    form.append("folder", folder);

    const xhr = new XMLHttpRequest();
    xhr.open("POST", `https://api.cloudinary.com/v1_1/${cloudName}/auto/upload`);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      try {
        const data = JSON.parse(xhr.responseText);
        if (xhr.status >= 200 && xhr.status < 300) resolve(data);
        else reject(new Error(data?.error?.message || "Upload ke Cloudinary gagal."));
      } catch {
        reject(new Error("Respons Cloudinary tidak terbaca."));
      }
    };
    xhr.onerror = () => reject(new Error("Koneksi terputus saat upload."));
    xhr.send(form);
  });

  // Langkah 3: konfirmasi ke server kita — di sinilah kuota BENAR-BENAR
  // ditegakkan (pakai ukuran asli dari Cloudinary, bukan klaim browser).
  const confirmRes = await fetch("/api/media/confirm-upload", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
    body: JSON.stringify({
      publicId: cloudinaryResult.public_id,
      bytes: cloudinaryResult.bytes,
      resourceType: cloudinaryResult.resource_type,
      format: cloudinaryResult.format,
      secureUrl: cloudinaryResult.secure_url,
      durationSeconds: cloudinaryResult.duration || null,
      title: title || file.name,
    }),
  });
  const confirmBody = await confirmRes.json().catch(() => ({}));
  if (!confirmRes.ok) throw new Error(confirmBody.error || "Gagal menyimpan data media.");
  return confirmBody;
}

// Dipakai admin (Admin -> Media) MAUPUN pengguna biasa menghapus
// miliknya sendiri (halaman /app) — satu endpoint server yang sama,
// server yang memutuskan boleh/tidaknya (lihat /api/media/delete).
export async function deleteMedia(mediaId) {
  const idToken = await auth.currentUser.getIdToken();
  const res = await fetch("/api/media/delete", {
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

// Alias supaya kode Admin (AdminTab.js) yang sudah ada tidak perlu diubah.
export const adminDeleteMedia = deleteMedia;
