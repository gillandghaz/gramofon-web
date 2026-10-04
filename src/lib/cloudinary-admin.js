// HANYA boleh diimpor dari kode server (API routes) — kredensial di sini
// (API Secret) TIDAK BOLEH pernah sampai ke browser.
//
// SEMUA file media (video, musik, thumbnail Explore, foto profil) disimpan
// di Cloudinary. Firebase/Firestore hanya menyimpan data teks (URL,
// public_id, judul, dst). Satu akun Cloudinary dibedakan lewat folder:
//   gramofon/{uid}                      -> media pribadi pengguna
//   gramofon-explore                    -> video/musik Explore
//   gramofon-explore-thumbs/{mediaId}   -> thumbnail item Explore
//   gramofon-avatars/{uid}              -> foto profil pengguna

import { v2 as cloudinary } from "cloudinary";

export const PERSONAL_FOLDER = (uid) => `gramofon/${uid}`;
export const EXPLORE_FOLDER = "gramofon-explore";
export const EXPLORE_THUMB_FOLDER = (mediaId) => `gramofon-explore-thumbs/${mediaId}`;
export const AVATAR_FOLDER = (uid) => `gramofon-avatars/${uid}`;

// Format yang diizinkan Cloudinary SAAT upload (ikut ditandatangani, jadi
// browser tidak bisa menggantinya). Tanpa ini, endpoint "auto" menerima
// file apa pun (HTML, zip, exe, dst) dan menyimpannya sebagai "raw" di
// folder pengguna -- di luar hitungan kuota.
export const MEDIA_ALLOWED_FORMATS =
  "mp4,m4v,mov,webm,mkv,avi,wmv,flv,3gp,ogv,mpg,mpeg,ts," +
  "mp3,wav,ogg,oga,m4a,aac,flac,opus,wma,aiff,amr,weba,mka";
export const IMAGE_ALLOWED_FORMATS = "jpg,jpeg,png,webp,gif,avif";

export const MAX_THUMB_BYTES = 5 * 1024 * 1024; // thumbnail Explore
export const MAX_AVATAR_BYTES = 1024 * 1024; // foto profil (klien memperkecil ke ~256px)

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

// Paket lengkap yang dikirim ke browser untuk satu kali upload bertanda
// tangan: browser WAJIB mengirim persis isi "params" (tanpa tambahan/
// pengurangan) bersama signature + api_key, kalau tidak Cloudinary menolak.
// timestamp/folder/allowed_formats dikembalikan juga sebagai field datar
// supaya klien versi lama tetap kompatibel.
export function signedUploadPayload({ folder, allowedFormats }) {
  const params = {
    timestamp: Math.round(Date.now() / 1000),
    folder,
    allowed_formats: allowedFormats,
  };
  const { signature, apiKey, cloudName } = signParams(params);
  return {
    signature,
    apiKey,
    cloudName,
    params,
    timestamp: params.timestamp,
    folder,
    allowedFormats,
  };
}

// Cloudinary tidak punya resource_type "audio" — file musik disimpan
// sebagai "video" (lihat catatan di lib/media.js). Aplikasi ini menyimpan
// "audio" di Firestore, jadi harus dipetakan balik ke "video" di sini;
// kalau tidak, penghapusan musik ditolak Cloudinary dan filenya tertinggal.
function toCloudinaryType(resourceType) {
  return resourceType === "audio" ? "video" : resourceType;
}

function authOpts() {
  const creds = getCloudinaryCreds();
  return { cloud_name: creds.cloud_name, api_key: creds.api_key, api_secret: creds.api_secret };
}

// Ambil data ASLI sebuah file video/musik langsung dari Cloudinary (ukuran,
// URL, durasi), supaya server tidak perlu memercayai angka dari browser.
export async function getAssetInfo(publicId) {
  return cloudinary.api.resource(publicId, { resource_type: "video", ...authOpts() });
}

// Sama, untuk gambar (thumbnail Explore & foto profil).
export async function getImageInfo(publicId) {
  return cloudinary.api.resource(publicId, { resource_type: "image", ...authOpts() });
}

export async function destroyAsset(publicId, resourceType) {
  return cloudinary.uploader.destroy(publicId, {
    resource_type: toCloudinaryType(resourceType),
    ...authOpts(),
  });
}

export async function destroyImage(publicId) {
  return cloudinary.uploader.destroy(publicId, { resource_type: "image", invalidate: true, ...authOpts() });
}
