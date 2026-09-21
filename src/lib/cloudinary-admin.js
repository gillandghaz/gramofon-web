// HANYA boleh diimpor dari kode server (API routes) — kredensial di sini
// (API Secret) TIDAK BOLEH pernah sampai ke browser.
//
// Media pribadi pengguna DAN Explore memakai akun Cloudinary yang SAMA
// (sesuai permintaan), dibedakan hanya lewat folder: "gramofon/{uid}"
// untuk pribadi, "gramofon-explore" untuk Explore.

import { v2 as cloudinary } from "cloudinary";

export function getCloudinaryCreds() {
  const cloud_name = process.env.CLOUDINARY_CLOUD_NAME;
  const api_key = process.env.CLOUDINARY_API_KEY;
  const api_secret = process.env.CLOUDINARY_API_SECRET;
  if (!cloud_name || !api_key || !api_secret) {
    throw new Error(
      "Cloudinary belum dikonfigurasi. Isi CLOUDINARY_CLOUD_NAME, " +
        "CLOUDINARY_API_KEY, dan CLOUDINARY_API_SECRET di Environment Variables."
    );
  }
  return { cloud_name, api_key, api_secret };
}

export function signParams(paramsToSign) {
  const creds = getCloudinaryCreds();
  const signature = cloudinary.utils.api_sign_request(paramsToSign, creds.api_secret);
  return { signature, apiKey: creds.api_key, cloudName: creds.cloud_name };
}

export async function destroyAsset(publicId, resourceType) {
  const creds = getCloudinaryCreds();
  return cloudinary.uploader.destroy(publicId, {
    resource_type: resourceType,
    cloud_name: creds.cloud_name,
    api_key: creds.api_key,
    api_secret: creds.api_secret,
  });
}
