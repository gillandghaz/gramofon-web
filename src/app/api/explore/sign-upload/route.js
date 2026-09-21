import { NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase-admin";
import { signParams } from "@/lib/cloudinary-admin";

async function requireAdmin(idToken) {
  const decoded = await adminAuth().verifyIdToken(idToken);
  const callerSnap = await adminDb().collection("users").doc(decoded.uid).get();
  if (!callerSnap.exists || callerSnap.data().role !== "admin") {
    throw new Error("not-admin");
  }
  return decoded.uid;
}

export async function POST(request) {
  try {
    const authHeader = request.headers.get("authorization") || "";
    const idToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!idToken) return NextResponse.json({ error: "Tidak ada token." }, { status: 401 });

    await requireAdmin(idToken);

    const { fileSizeBytes } = await request.json().catch(() => ({}));

    // Pre-check batas total Explore (bukan per-akun) -- pengecekan
    // CEPAT sebelum upload dimulai. Penegakan sungguhan (pakai ukuran
    // asli dari Cloudinary) terjadi di /api/explore/confirm-upload.
    if (fileSizeBytes) {
      const [settingsSnap, existingSnap] = await Promise.all([
        adminDb().collection("settings").doc("app").get(),
        adminDb().collection("exploreMedia").get(),
      ]);
      const limitMB = settingsSnap.exists ? settingsSnap.data().exploreLimitMB ?? 5000 : 5000;
      let usedBytes = 0;
      existingSnap.forEach((d) => (usedBytes += d.data().bytes || 0));
      if (usedBytes + fileSizeBytes > limitMB * 1024 * 1024) {
        const remainingMB = Math.max(0, (limitMB * 1024 * 1024 - usedBytes) / (1024 * 1024)).toFixed(1);
        return NextResponse.json(
          { error: `Kuota Explore tidak cukup. Sisa: ${remainingMB}MB dari ${limitMB}MB.` },
          { status: 400 }
        );
      }
    }

    // Explore memakai akun Cloudinary yang SAMA dengan media pribadi,
    // hanya dibedakan lewat folder.
    const timestamp = Math.round(Date.now() / 1000);
    const folder = "gramofon-explore";
    const { signature, apiKey, cloudName } = signParams({ timestamp, folder });

    return NextResponse.json({ signature, timestamp, folder, apiKey, cloudName });
  } catch (err) {
    if (err.message === "not-admin") {
      return NextResponse.json({ error: "Bukan admin." }, { status: 403 });
    }
    console.error("explore sign-upload error:", err);
    const message = err?.message?.includes("belum dikonfigurasi")
      ? err.message
      : "Terjadi kesalahan di server.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
