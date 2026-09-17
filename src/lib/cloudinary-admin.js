// HANYA boleh diimpor dari kode server (API routes) — sama seperti
// firebase-admin.js, kredensial di sini (API Secret) TIDAK BOLEH pernah
// sampai ke browser.

import { v2 as cloudinary } from "cloudinary";

let configured = false;

export function getCloudinary() {
  if (!configured) {
    const cloud_name = process.env.CLOUDINARY_CLOUD_NAME;
    const api_key = process.env.CLOUDINARY_API_KEY;
    const api_secret = process.env.CLOUDINARY_API_SECRET;

    if (!cloud_name || !api_key || !api_secret) {
      throw new Error(
        "Cloudinary belum dikonfigurasi. Isi CLOUDINARY_CLOUD_NAME, " +
          "CLOUDINARY_API_KEY, dan CLOUDINARY_API_SECRET di Environment Variables."
      );
    }
    cloudinary.config({ cloud_name, api_key, api_secret, secure: true });
    configured = true;
  }
  return cloudinary;
}
