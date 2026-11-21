import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { requireUser, readJson, errorResponse, HttpError } from "@/lib/server-auth";
import { destroyAsset, getAssetInfo, isPublicIdInFolder, PERSONAL_FOLDER } from "@/lib/cloudinary-admin";
import { getEffectiveLimitMB } from "@/lib/quota";

export async function POST(request) {
  try {
    const decoded = await requireUser(request);
    const uid = decoded.uid;

    // Dari browser kita HANYA terima publicId, resourceType, dan title.
    // Ukuran, URL, format, dan durasi TIDAK dipercaya dari browser — semuanya
    // diambil langsung dari Cloudinary di bawah.
    const { publicId, resourceType, title } = await readJson(request);
    if (typeof publicId !== "string" || !publicId || !["audio", "video"].includes(resourceType)) {
      throw new HttpError(400, "Data upload tidak lengkap.");
    }
    // public_id yang dikonfirmasi harus benar-benar berada LANGSUNG di folder
    // milik uid ini (gramofon/{uid}/<id>) — mencegah mengklaim file orang lain.
    if (!isPublicIdInFolder(publicId, PERSONAL_FOLDER(uid))) {
      throw new HttpError(403, "public_id tidak valid untuk akun ini.");
    }

    // Ambil data ASLI dari Cloudinary. Kalau file tidak ada di sana,
    // tolak — tidak ada catatan Firestore tanpa file nyata.
    let asset;
    try {
      asset = await getAssetInfo(publicId);
    } catch (e) {
      console.error("confirm-upload: asset tidak ditemukan di Cloudinary:", e?.error?.message || e);
      throw new HttpError(400, "File tidak ditemukan di Cloudinary. Coba upload ulang.");
    }
    const bytes = Number(asset?.bytes);
    if (!Number.isFinite(bytes) || bytes <= 0 || !asset?.secure_url) {
      throw new HttpError(400, "Data file dari Cloudinary tidak valid.");
    }

    const limitBytes = (await getEffectiveLimitMB(uid)) * 1024 * 1024;
    const cleanTitle = String(
      typeof title === "string" && title.trim() ? title : publicId.split("/").pop()
    ).slice(0, 120);

    // PENEGAKAN KUOTA SUNGGUHAN di dalam TRANSAKSI: hitung pemakaian dan
    // tambah catatan baru secara atomik, supaya beberapa konfirmasi yang
    // dikirim bersamaan tidak bisa sama-sama lolos dan melewati kuota.
    const db = adminDb();
    const outcome = await db.runTransaction(async (tx) => {
      const existingSnap = await tx.get(db.collection("media").where("uid", "==", uid));
      let usedBytes = 0;
      let alreadyRegistered = false;
      existingSnap.forEach((d) => {
        const data = d.data();
        if (data.publicId === publicId) alreadyRegistered = true;
        usedBytes += typeof data.bytes === "number" && data.bytes > 0 ? data.bytes : 0;
      });
      // File yang sama tidak boleh didaftarkan dua kali (dan jangan sampai
      // terhapus oleh jalur "melebihi kuota" padahal sudah terdaftar).
      if (alreadyRegistered) return { status: "duplicate" };
      if (usedBytes + bytes > limitBytes) return { status: "over-quota" };

      const ref = db.collection("media").doc();
      tx.set(ref, {
        uid,
        title: cleanTitle,
        publicId,
        resourceType,
        format: typeof asset.format === "string" ? asset.format : null,
        bytes,
        durationSeconds: typeof asset.duration === "number" ? asset.duration : null,
        url: asset.secure_url,
        createdAt: new Date(),
      });
      return { status: "ok", id: ref.id };
    });

    if (outcome.status === "duplicate") throw new HttpError(409, "File ini sudah terdaftar.");
    if (outcome.status === "over-quota") {
      await destroyAsset(publicId, resourceType).catch((e) =>
        console.error("Gagal menghapus file yang melebihi kuota:", e)
      );
      throw new HttpError(
        400,
        `File ini (${(bytes / 1024 / 1024).toFixed(1)}MB) melebihi sisa kuota Anda. File telah dibatalkan/dihapus.`
      );
    }

    return NextResponse.json({ ok: true, id: outcome.id });
  } catch (err) {
    return errorResponse(err, "media confirm-upload");
  }
}
