import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { requireAdmin, readJson, errorResponse, HttpError, DOC_ID_RE } from "@/lib/server-auth";
import { getImageInfo, destroyImage, EXPLORE_THUMB_FOLDER, MAX_THUMB_BYTES } from "@/lib/cloudinary-admin";

export async function POST(request) {
  try {
    await requireAdmin(request);

    const { mediaId, publicId } = await readJson(request);
    if (typeof mediaId !== "string" || !DOC_ID_RE.test(mediaId) || typeof publicId !== "string") {
      throw new HttpError(400, "Data thumbnail tidak lengkap.");
    }
    // public_id harus berada di folder thumbnail item INI -- tidak bisa
    // mengklaim file lain di akun Cloudinary.
    if (!publicId.startsWith(`${EXPLORE_THUMB_FOLDER(mediaId)}/`)) {
      throw new HttpError(403, "public_id thumbnail tidak valid.");
    }

    const ref = adminDb().collection("exploreMedia").doc(mediaId);
    const snap = await ref.get();
    if (!snap.exists) {
      await destroyImage(publicId).catch(() => {});
      throw new HttpError(404, "Media tidak ditemukan.");
    }

    let asset;
    try {
      asset = await getImageInfo(publicId);
    } catch (e) {
      console.error("thumbnail confirm: asset tidak ditemukan:", e?.error?.message || e);
      throw new HttpError(400, "Thumbnail tidak ditemukan di Cloudinary. Coba upload ulang.");
    }
    const bytes = Number(asset?.bytes);
    if (!Number.isFinite(bytes) || bytes <= 0 || !asset?.secure_url) {
      throw new HttpError(400, "Data thumbnail dari Cloudinary tidak valid.");
    }
    if (bytes > MAX_THUMB_BYTES) {
      await destroyImage(publicId).catch(() => {});
      throw new HttpError(400, "Ukuran thumbnail maksimal 5MB. File telah dibatalkan.");
    }

    const oldPublicId = snap.data().thumbPublicId;
    await ref.update({ thumbUrl: asset.secure_url, thumbPublicId: publicId });

    // Thumbnail lama (kalau ada & berbeda) dibersihkan supaya tidak menumpuk.
    if (
      typeof oldPublicId === "string" &&
      oldPublicId !== publicId &&
      oldPublicId.startsWith(`${EXPLORE_THUMB_FOLDER(mediaId)}/`)
    ) {
      await destroyImage(oldPublicId).catch((e) => console.error("Gagal hapus thumbnail lama:", e));
    }

    return NextResponse.json({ ok: true, thumbUrl: asset.secure_url });
  } catch (err) {
    return errorResponse(err, "explore thumbnail confirm");
  }
}
