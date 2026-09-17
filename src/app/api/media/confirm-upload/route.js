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

export async function POST(request) {
  try {
    const authHeader = request.headers.get("authorization") || "";
    const idToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!idToken) return NextResponse.json({ error: "Tidak ada token." }, { status: 401 });

    const decoded = await adminAuth().verifyIdToken(idToken);
    const uid = decoded.uid;

    const { publicId, bytes, resourceType, format, secureUrl, title, durationSeconds } =
      await request.json();
    if (!publicId || !bytes || !resourceType || !secureUrl) {
      return NextResponse.json({ error: "Data upload tidak lengkap." }, { status: 400 });
    }
    // Jaga-jaga: public_id yang dikonfirmasi harus benar-benar berada di
    // folder milik uid ini (gramofon/{uid}/...) — mencegah seseorang
    // mengonfirmasi/mengklaim public_id milik orang lain.
    if (!publicId.startsWith(`gramofon/${uid}/`)) {
      return NextResponse.json({ error: "public_id tidak valid untuk akun ini." }, { status: 403 });
    }

    const cloudinary = getCloudinary();

    // PENEGAKAN KUOTA SUNGGUHAN: hitung ulang pemakaian dari data yang
    // SUDAH tersimpan di Firestore (belum termasuk file ini), lalu
    // bandingkan dengan ukuran ASLI file ini yang dilaporkan Cloudinary
    // sendiri (bukan klaim klien). Kalau kelebihan, file yang BARU SAJA
    // ter-upload langsung dihapus lagi dari Cloudinary — jadi tidak
    // pernah benar-benar "tersimpan" atas nama user ini.
    const limitMB = await getEffectiveLimitMB(uid);
    const existingSnap = await adminDb().collection("media").where("uid", "==", uid).get();
    let usedBytes = 0;
    existingSnap.forEach((d) => (usedBytes += d.data().bytes || 0));
    const limitBytes = limitMB * 1024 * 1024;

    if (usedBytes + bytes > limitBytes) {
      await cloudinary.uploader
        .destroy(publicId, { resource_type: resourceType })
        .catch((e) => console.error("Gagal menghapus file yang melebihi kuota:", e));
      return NextResponse.json(
        {
          error: `File ini (${(bytes / 1024 / 1024).toFixed(1)}MB) melebihi sisa kuota Anda. File telah dibatalkan/dihapus.`,
        },
        { status: 400 }
      );
    }

    const docRef = await adminDb()
      .collection("media")
      .add({
        uid,
        title: (title || publicId.split("/").pop()).slice(0, 120),
        publicId,
        resourceType,
        format: format || null,
        bytes,
        durationSeconds: durationSeconds || null,
        url: secureUrl,
        createdAt: new Date(),
      });

    return NextResponse.json({ ok: true, id: docRef.id });
  } catch (err) {
    console.error("confirm-upload error:", err);
    const message = err?.message?.includes("belum dikonfigurasi")
      ? err.message
      : "Terjadi kesalahan di server.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
