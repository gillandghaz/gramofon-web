import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { requireAdmin, readJson, errorResponse, HttpError, DOC_ID_RE } from "@/lib/server-auth";
import { signedUploadPayload, EXPLORE_THUMB_FOLDER, IMAGE_ALLOWED_FORMATS } from "@/lib/cloudinary-admin";

// Izin upload THUMBNAIL satu item Explore. HANYA admin. Thumbnail berupa
// gambar kecil di Cloudinary (folder per-item) dan tidak dihitung ke kuota
// Explore (video/musik).
export async function POST(request) {
  try {
    await requireAdmin(request);

    const { mediaId } = await readJson(request);
    if (typeof mediaId !== "string" || !DOC_ID_RE.test(mediaId)) {
      throw new HttpError(400, "mediaId wajib diisi.");
    }
    const snap = await adminDb().collection("exploreMedia").doc(mediaId).get();
    if (!snap.exists) throw new HttpError(404, "Media tidak ditemukan.");

    return NextResponse.json(
      signedUploadPayload({ folder: EXPLORE_THUMB_FOLDER(mediaId), allowedFormats: IMAGE_ALLOWED_FORMATS })
    );
  } catch (err) {
    return errorResponse(err, "explore thumbnail sign-upload");
  }
}
