import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { requireUser, readJson, errorResponse, HttpError } from "@/lib/server-auth";
import { getImageInfo, destroyImage, AVATAR_FOLDER, MAX_AVATAR_BYTES } from "@/lib/cloudinary-admin";

// Setelah upload ke Cloudinary: server memverifikasi file-nya benar-benar
// ada di folder milik pemanggil, lalu MENULIS photoURL ke profil lewat
// Admin SDK. Klien tidak boleh menulis photoURL/photoPublicId sendiri
// (diblokir di firestore.rules), jadi isinya selalu URL Cloudinary yang
// sudah terverifikasi -- tidak bisa diisi base64 atau URL sembarang.
export async function POST(request) {
  try {
    const decoded = await requireUser(request);
    const uid = decoded.uid;

    const { publicId } = await readJson(request);
    if (typeof publicId !== "string" || !publicId.startsWith(`${AVATAR_FOLDER(uid)}/`)) {
      throw new HttpError(403, "public_id tidak valid untuk akun ini.");
    }

    const ref = adminDb().collection("users").doc(uid);
    const snap = await ref.get();
    if (!snap.exists) {
      await destroyImage(publicId).catch(() => {});
      throw new HttpError(404, "Profil tidak ditemukan.");
    }

    let asset;
    try {
      asset = await getImageInfo(publicId);
    } catch (e) {
      console.error("photo confirm: asset tidak ditemukan:", e?.error?.message || e);
      throw new HttpError(400, "Foto tidak ditemukan di Cloudinary. Coba upload ulang.");
    }
    const bytes = Number(asset?.bytes);
    if (!Number.isFinite(bytes) || bytes <= 0 || !asset?.secure_url) {
      throw new HttpError(400, "Data foto dari Cloudinary tidak valid.");
    }
    if (bytes > MAX_AVATAR_BYTES) {
      await destroyImage(publicId).catch(() => {});
      throw new HttpError(400, "Foto terlalu besar. File telah dibatalkan.");
    }

    const oldPublicId = snap.data().photoPublicId;
    await ref.update({ photoURL: asset.secure_url, photoPublicId: publicId });

    if (typeof oldPublicId === "string" && oldPublicId !== publicId && oldPublicId.startsWith(`${AVATAR_FOLDER(uid)}/`)) {
      await destroyImage(oldPublicId).catch((e) => console.error("Gagal hapus foto lama:", e));
    }

    return NextResponse.json({ ok: true, photoURL: asset.secure_url });
  } catch (err) {
    return errorResponse(err, "profile photo confirm");
  }
}
