import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { requireUser, isAdminUid, readJson, errorResponse, HttpError, DOC_ID_RE } from "@/lib/server-auth";
import { destroyAsset, isPublicIdInFolder, PERSONAL_FOLDER } from "@/lib/cloudinary-admin";

export async function POST(request) {
  try {
    const decoded = await requireUser(request, { requireProfile: false });
    const callerUid = decoded.uid;

    const { mediaId } = await readJson(request);
    // mediaId disisipkan ke path dokumen -- wajib id Firestore yang bersih
    // (tanpa "/" yang bisa menunjuk ke sub-koleksi/dokumen lain).
    if (typeof mediaId !== "string" || !DOC_ID_RE.test(mediaId)) {
      throw new HttpError(400, "mediaId wajib diisi.");
    }

    const ref = adminDb().collection("media").doc(mediaId);
    const mediaSnap = await ref.get();
    if (!mediaSnap.exists) throw new HttpError(404, "Media tidak ditemukan.");
    const media = mediaSnap.data();

    // Boleh dihapus oleh ADMIN, atau oleh PEMILIK media itu sendiri —
    // dicek ulang di server, tidak percaya klaim dari browser.
    const isOwner = typeof media.uid === "string" && media.uid === callerUid;
    if (!isOwner && !(await isAdminUid(callerUid))) {
      throw new HttpError(403, "Tidak punya izin menghapus media ini.");
    }

    // Pertahanan berlapis: hanya hapus file di Cloudinary kalau publicId
    // memang berada di folder milik pemilik media ini. Mencegah dokumen
    // yang publicId-nya dipalsukan dipakai untuk menghapus file orang lain
    // (atau file Explore). Dokumen Firestore-nya tetap dihapus.
    if (typeof media.uid === "string" && isPublicIdInFolder(media.publicId, PERSONAL_FOLDER(media.uid))) {
      await destroyAsset(media.publicId, media.resourceType).catch((e) =>
        console.error("Gagal hapus asset Cloudinary:", e)
      );
    } else {
      console.warn(
        "delete-media: publicId tidak sesuai folder pemilik, file Cloudinary TIDAK dihapus. mediaId:",
        mediaId
      );
    }

    await ref.delete();

    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err, "media delete");
  }
}
