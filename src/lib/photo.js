import { auth } from "./firebase";
import { uploadToCloudinary, postJson } from "./cloudinary-upload";

// Foto profil kini disimpan di Cloudinary (BUKAN lagi base64 di Firestore).
// Firestore hanya menyimpan URL + public_id (teks), dan penulisannya
// dilakukan server setelah memverifikasi file-nya (lihat
// /api/profile/photo/confirm) -- klien tidak boleh menulis photoURL sendiri.
//
// Gambar tetap diperkecil dulu di browser (persegi 256px, JPEG) supaya
// upload cepat dan hemat kuota Cloudinary.
const OUTPUT_DIMENSION = 256;
const JPEG_QUALITY = 0.85;

function resizeImageToBlob(file, dim = OUTPUT_DIMENSION) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("decode-failed"));
    };
    img.onload = () => {
      URL.revokeObjectURL(url);
      const canvas = document.createElement("canvas");
      canvas.width = dim;
      canvas.height = dim;
      const ctx = canvas.getContext("2d");
      const scale = Math.max(dim / img.width, dim / img.height);
      const dw = img.width * scale;
      const dh = img.height * scale;
      ctx.drawImage(img, (dim - dw) / 2, (dim - dh) / 2, dw, dh);
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error("encode-failed"))),
        "image/jpeg",
        JPEG_QUALITY
      );
    };
    img.src = url;
  });
}

export async function uploadProfilePhoto(uid, file) {
  if (!file.type.startsWith("image/")) {
    throw new Error("not-an-image");
  }
  if (file.size > 8 * 1024 * 1024) {
    throw new Error("too-large"); // batas file mentah sebelum di-resize
  }

  const blob = await resizeImageToBlob(file);
  if (blob.size > 700 * 1024) {
    throw new Error("still-too-large");
  }

  const idToken = await auth.currentUser.getIdToken();
  const payload = await postJson("/api/profile/photo/sign-upload", idToken, {}, "Gagal meminta izin upload foto.");
  const result = await uploadToCloudinary({
    payload,
    file: new File([blob], "avatar.jpg", { type: "image/jpeg" }),
    resourceType: "image",
  });
  const confirmed = await postJson(
    "/api/profile/photo/confirm",
    idToken,
    { publicId: result.public_id },
    "Gagal menyimpan foto profil."
  );
  return confirmed.photoURL;
}
