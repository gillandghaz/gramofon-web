// Util sisi-browser: upload langsung ke Cloudinary memakai paket tanda
// tangan dari server kita (lihat signedUploadPayload di cloudinary-admin.js).
// Dipakai bersama oleh media pribadi, Explore, thumbnail, dan foto profil.
//
// "params" dikirim PERSIS seperti yang ditandatangani server; menambah/
// mengurangi field membuat Cloudinary menolak upload.

export function uploadToCloudinary({ payload, file, resourceType, onProgress }) {
  const { cloudName, apiKey, signature, params } = payload;
  return new Promise((resolve, reject) => {
    const form = new FormData();
    form.append("file", file);
    form.append("api_key", apiKey);
    form.append("signature", signature);
    Object.entries(params).forEach(([k, v]) => form.append(k, String(v)));

    const xhr = new XMLHttpRequest();
    xhr.open("POST", `https://api.cloudinary.com/v1_1/${cloudName}/${resourceType}/upload`);
    if (onProgress) {
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
      };
    }
    xhr.onload = () => {
      let data = null;
      try {
        data = JSON.parse(xhr.responseText);
      } catch {
        return reject(new Error("Respons Cloudinary tidak terbaca."));
      }
      if (xhr.status >= 200 && xhr.status < 300) resolve(data);
      else reject(new Error(data?.error?.message || "Upload ke Cloudinary gagal."));
    };
    xhr.onerror = () => reject(new Error("Koneksi terputus saat upload."));
    xhr.send(form);
  });
}

// Panggilan JSON ke API route kita dengan token Firebase milik pengguna.
export async function postJson(url, idToken, body, fallbackError) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
    body: JSON.stringify(body || {}),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || fallbackError || "Permintaan gagal.");
  return data;
}
