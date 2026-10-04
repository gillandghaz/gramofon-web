import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { requireAdmin, readJson, errorResponse, HttpError, DOC_ID_RE } from "@/lib/server-auth";
import { destroyAsset, destroyImage, EXPLORE_FOLDER, EXPLORE_THUMB_FOLDER } from "@/lib/cloudinary-admin";

export async function POST(request) {
  try {
    await requireAdmin(request);

    const { mediaId } = await readJson(request);
    if (typeof mediaId !== "string" || !DOC_ID_RE.test(mediaId)) {
      throw new HttpError(400, "mediaId wajib diisi.");
    }

    const ref = adminDb().collection("exploreMedia").doc(mediaId);
    const snap = await ref.get();
    if (!snap.exists) throw new HttpError(404, "Media tidak ditemukan.");
    const media = snap.data();

    // Hanya hapus file di Cloudinary kalau public_id memang berada di folder
    // Explore (pertahanan berlapis terhadap dokumen yang dipalsukan).
    if (typeof media.publicId === "string" && media.publicId.startsWith(`${EXPLORE_FOLDER}/`)) {
      await destroyAsset(media.publicId, media.resourceType).catch((e) =>
        console.error("Gagal hapus asset Cloudinary Explore:", e)
      );
    }
    if (typeof media.thumbPublicId === "string" && media.thumbPublicId.startsWith(`${EXPLORE_THUMB_FOLDER(mediaId)}/`)) {
      await destroyImage(media.thumbPublicId).catch((e) =>
        console.error("Gagal hapus thumbnail Cloudinary Explore:", e)
      );
    }
    await ref.delete();

    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err, "explore delete");
  }
}
