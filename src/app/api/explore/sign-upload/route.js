import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { requireAdmin, readJson, errorResponse, HttpError } from "@/lib/server-auth";
import { signedUploadPayload, EXPLORE_FOLDER, MEDIA_ALLOWED_FORMATS } from "@/lib/cloudinary-admin";

const DEFAULT_EXPLORE_LIMIT_MB = 5000;

// Izin upload VIDEO/MUSIK ke Explore. HANYA admin. (Thumbnail punya
// endpoint sendiri: /api/explore/thumbnail/sign-upload.)
export async function POST(request) {
  try {
    await requireAdmin(request);

    const body = await readJson(request);
    const fileSizeBytes = body.fileSizeBytes;
    if (typeof fileSizeBytes !== "number" || !Number.isFinite(fileSizeBytes) || fileSizeBytes <= 0) {
      throw new HttpError(400, "Ukuran file tidak valid.");
    }

    // Pre-check kuota total Explore (cepat, berdasar ukuran yang DIKLAIM
    // klien). Penegakan sungguhan ada di /api/explore/confirm-upload.
    const [settingsSnap, existingSnap] = await Promise.all([
      adminDb().collection("settings").doc("app").get(),
      adminDb().collection("exploreMedia").get(),
    ]);
    const limitMB = settingsSnap.exists ? settingsSnap.data().exploreLimitMB ?? DEFAULT_EXPLORE_LIMIT_MB : DEFAULT_EXPLORE_LIMIT_MB;
    let usedBytes = 0;
    existingSnap.forEach((d) => (usedBytes += d.data().bytes || 0));
    if (usedBytes + fileSizeBytes > limitMB * 1024 * 1024) {
      const remainingMB = Math.max(0, limitMB - usedBytes / (1024 * 1024)).toFixed(1);
      throw new HttpError(400, `Kuota Explore tidak cukup. Sisa ruang: ${remainingMB}MB dari ${limitMB}MB.`);
    }

    return NextResponse.json(
      signedUploadPayload({ folder: EXPLORE_FOLDER, allowedFormats: MEDIA_ALLOWED_FORMATS })
    );
  } catch (err) {
    return errorResponse(err, "explore sign-upload");
  }
}
