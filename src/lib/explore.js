import { collection, getDocs } from "firebase/firestore";
import { auth, db } from "./firebase";

export async function listExploreMedia() {
  const snap = await getDocs(collection(db, "exploreMedia"));
  const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  list.sort((a, b) => {
    const at = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
    const bt = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
    return bt - at;
  });
  return list;
}

// Sama alurnya dengan uploadMediaFile di media.js, tapi lewat endpoint
// /api/explore/* (admin-only, akun Cloudinary terpisah, tanpa cek kuota).
export async function uploadExploreFile(file, title, onProgress) {
  const idToken = await auth.currentUser.getIdToken();

  const signRes = await fetch("/api/explore/sign-upload", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
    body: JSON.stringify({ fileSizeBytes: file.size }),
  });
  const signBody = await signRes.json().catch(() => ({}));
  if (!signRes.ok) throw new Error(signBody.error || "Gagal meminta izin upload.");
  const { signature, timestamp, folder, apiKey, cloudName } = signBody;

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

  const confirmRes = await fetch("/api/explore/confirm-upload", {
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

export async function deleteExploreMedia(mediaId) {
  const idToken = await auth.currentUser.getIdToken();
  const res = await fetch("/api/explore/delete", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
    body: JSON.stringify({ mediaId }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || "delete-failed");
  return body;
}
