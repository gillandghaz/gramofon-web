import { NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase-admin";
import { getCloudinary } from "@/lib/cloudinary-admin";

const DEFAULT_LIMIT_MB = 200;

async function getEffectiveLimitMB(uid) {
  const [userSnap, settingsSnap] = await Promise.all([
    adminDb().collection("users").doc(uid).get(),
    adminDb().collection("settings").doc("app").get(),
  ]);
  const userLimit = userSnap.exists ? userSnap.data().storageLimitMB : undefined;
  if (userLimit !== undefined) return userLimit;
  const defaultLimit = settingsSnap.exists ? settingsSnap.data().defaultStorageLimitMB : undefined;
  return defaultLimit ?? DEFAULT_LIMIT_MB;
}

async function getCurrentUsageBytes(uid) {
  const snap = await adminDb().collection("media").where("uid", "==", uid).get();
  let total = 0;
  snap.forEach((d) => (total += d.data().bytes || 0));
  return total;
}

export async function POST(request) {
  try {
    const authHeader = request.headers.get("authorization") || "";
    const idToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!idToken) return NextResponse.json({ error: "Tidak ada token." }, { status: 401 });

    const decoded = await adminAuth().verifyIdToken(idToken);
    const uid = decoded.uid;

    const { fileSizeBytes } = await request.json();
    if (!fileSizeBytes || fileSizeBytes <= 0) {
      return NextResponse.json({ error: "Ukuran file tidak valid." }, { status: 400 });
    }

    // Pre-check kuota — pengecekan CEPAT sebelum upload dimulai, berdasar
    // ukuran yang DIKLAIM klien. Ini BUKAN penegakan akhir (klien nakal
    // bisa saja mengunggah file yang sebenarnya lebih besar) — penegakan
    // sungguhan terjadi di /api/media/confirm-upload SETELAH file benar-
    // benar sampai di Cloudinary dan ukuran aslinya diketahui pasti.
    const limitMB = await getEffectiveLimitMB(uid);
    const usedBytes = await getCurrentUsageBytes(uid);
    const limitBytes = limitMB * 1024 * 1024;
    if (usedBytes + fileSizeBytes > limitBytes) {
      const remainingMB = Math.max(0, ((limitBytes - usedBytes) / (1024 * 1024))).toFixed(1);
      return NextResponse.json(
        { error: `Kuota tidak cukup. Sisa ruang Anda: ${remainingMB}MB dari ${limitMB}MB.` },
        { status: 400 }
      );
    }

    const cloudinary = getCloudinary();
    const timestamp = Math.round(Date.now() / 1000);
    const folder = `gramofon/${uid}`;
    const paramsToSign = { timestamp, folder };
    const signature = cloudinary.utils.api_sign_request(
      paramsToSign,
      process.env.CLOUDINARY_API_SECRET
    );

    return NextResponse.json({
      signature,
      timestamp,
      folder,
      apiKey: process.env.CLOUDINARY_API_KEY,
      cloudName: process.env.CLOUDINARY_CLOUD_NAME,
    });
  } catch (err) {
    console.error("sign-upload error:", err);
    const message = err?.message?.includes("belum dikonfigurasi")
      ? err.message
      : "Terjadi kesalahan di server.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
