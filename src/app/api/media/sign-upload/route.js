import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { requireUser, readJson, errorResponse, HttpError } from "@/lib/server-auth";
import { signedUploadPayload, PERSONAL_FOLDER, MEDIA_ALLOWED_FORMATS } from "@/lib/cloudinary-admin";
import { getEffectiveLimitMB, sumBytes } from "@/lib/quota";

export async function POST(request) {
  try {
    const decoded = await requireUser(request);
    const uid = decoded.uid;

    const body = await readJson(request);
    const fileSizeBytes = body.fileSizeBytes;
    if (typeof fileSizeBytes !== "number" || !Number.isFinite(fileSizeBytes) || fileSizeBytes <= 0) {
      throw new HttpError(400, "Ukuran file tidak valid.");
    }

    // Pre-check kuota — pengecekan CEPAT sebelum upload dimulai, berdasar
    // ukuran yang DIKLAIM klien. Ini BUKAN penegakan akhir (klien nakal
    // bisa saja mengunggah file yang sebenarnya lebih besar) — penegakan
    // sungguhan terjadi di /api/media/confirm-upload SETELAH file benar-
    // benar sampai di Cloudinary dan ukuran aslinya diketahui pasti.
    const [limitMB, existingSnap] = await Promise.all([
      getEffectiveLimitMB(uid),
      adminDb().collection("media").where("uid", "==", uid).get(),
    ]);
    const usedBytes = sumBytes(existingSnap);
    const limitBytes = limitMB * 1024 * 1024;
    if (usedBytes + fileSizeBytes > limitBytes) {
      const remainingMB = Math.max(0, (limitBytes - usedBytes) / (1024 * 1024)).toFixed(1);
      throw new HttpError(400, `Kuota tidak cukup. Sisa ruang Anda: ${remainingMB}MB dari ${limitMB}MB.`);
    }

    // allowed_formats ikut ditandatangani: Cloudinary menolak file selain
    // video/audio, sehingga tidak ada file "raw" liar yang menumpuk di
    // luar hitungan kuota.
    return NextResponse.json(
      signedUploadPayload({ folder: PERSONAL_FOLDER(uid), allowedFormats: MEDIA_ALLOWED_FORMATS })
    );
  } catch (err) {
    return errorResponse(err, "media sign-upload");
  }
}
