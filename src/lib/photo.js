import { doc, updateDoc } from "firebase/firestore";
import { db } from "./firebase";

// Ukuran & kualitas sengaja dijaga kecil supaya hasil base64-nya jauh di
// bawah batas 1 MiB per dokumen Firestore (foto sekitar 20-60 KB setelah
// ini, aman ditumpangkan bersama field lain di dokumen users/{uid}).
const MAX_DIMENSION = 220;
const JPEG_QUALITY = 0.82;

// Disimpan langsung sebagai data URL base64 di Firestore — TIDAK memakai
// Firebase Storage sama sekali. Alasan: sejak Feb 2026, Firebase Storage
// mewajibkan project berada di paket Blaze (perlu kartu kredit terdaftar,
// meski pemakaian kecil tetap $0). Menyimpan di Firestore menghindari
// kebutuhan itu sepenuhnya — sama seperti pendekatan aplikasi lokal lama
// (canvas resize -> base64 -> disimpan di database).
function resizeImageToDataUrl(file, maxDim = MAX_DIMENSION) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("read-failed"));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("decode-failed"));
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = maxDim;
        canvas.height = maxDim;
        const ctx = canvas.getContext("2d");
        const scale = Math.max(maxDim / img.width, maxDim / img.height);
        const dw = img.width * scale;
        const dh = img.height * scale;
        ctx.drawImage(img, (maxDim - dw) / 2, (maxDim - dh) / 2, dw, dh);
        resolve(canvas.toDataURL("image/jpeg", JPEG_QUALITY));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

export async function uploadProfilePhoto(uid, file) {
  if (!file.type.startsWith("image/")) {
    throw new Error("not-an-image");
  }
  if (file.size > 8 * 1024 * 1024) {
    throw new Error("too-large"); // batas file mentah sebelum di-resize
  }

  const dataUrl = await resizeImageToDataUrl(file);

  // Sanity check terakhir: pastikan hasil akhir masih jauh di bawah batas
  // dokumen Firestore (1 MiB) sebelum benar-benar ditulis.
  if (dataUrl.length > 700 * 1024) {
    throw new Error("still-too-large");
  }

  await updateDoc(doc(db, "users", uid), { photoURL: dataUrl });
  return dataUrl;
}
