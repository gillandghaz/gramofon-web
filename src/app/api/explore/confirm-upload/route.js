import { NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase-admin";
import { destroyAsset } from "@/lib/cloudinary-admin";

export async function POST(request) {
  try {
    const authHeader = request.headers.get("authorization") || "";
    const idToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!idToken) return NextResponse.json({ error: "Tidak ada token." }, { status: 401 });

    const decoded = await adminAuth().verifyIdToken(idToken);
    const callerSnap = await adminDb().collection("users").doc(decoded.uid).get();
    if (!callerSnap.exists || callerSnap.data().role !== "admin") {
      return NextResponse.json({ error: "Bukan admin." }, { status: 403 });
    }

    const { publicId, bytes, resourceType, format, secureUrl, title, durationSeconds, category } =
      await request.json();
    if (!publicId || !bytes || !resourceType || !secureUrl) {
      return NextResponse.json({ error: "Data upload tidak lengkap." }, { status: 400 });
    }
    if (!publicId.startsWith("gramofon-explore/")) {
      return NextResponse.json({ error: "public_id tidak valid untuk Explore." }, { status: 403 });
    }

    // PENEGAKAN SUNGGUHAN batas total Explore, pakai ukuran ASLI dari
    // Cloudinary (bukan klaim klien) -- kalau kelebihan, file yang baru
    // ter-upload langsung dihapus lagi.
    const [settingsSnap, existingSnap] = await Promise.all([
      adminDb().collection("settings").doc("app").get(),
      adminDb().collection("exploreMedia").get(),
    ]);
    const limitMB = settingsSnap.exists ? settingsSnap.data().exploreLimitMB ?? 5000 : 5000;
    let usedBytes = 0;
    existingSnap.forEach((d) => (usedBytes += d.data().bytes || 0));
    if (usedBytes + bytes > limitMB * 1024 * 1024) {
      await destroyAsset(publicId, resourceType).catch((e) =>
        console.error("Gagal menghapus file Explore yang melebihi kuota:", e)
      );
      return NextResponse.json(
        { error: `File ini melebihi sisa kuota Explore. File telah dibatalkan.` },
        { status: 400 }
      );
    }

    const docRef = await adminDb()
      .collection("exploreMedia")
      .add({
        title: (title || publicId.split("/").pop()).slice(0, 120),
        publicId,
        resourceType,
        format: format || null,
        bytes,
        durationSeconds: durationSeconds || null,
        // Kategori opsional (dikelola admin lewat menu Explore) --
        // dibatasi panjangnya sebagai jaga-jaga, disimpan null kalau
        // pengguna tidak memilih kategori apa pun.
        category: typeof category === "string" && category.trim() ? category.trim().slice(0, 60) : null,
        url: secureUrl,
        addedBy: decoded.uid,
        createdAt: new Date(),
      });

    return NextResponse.json({ ok: true, id: docRef.id });
  } catch (err) {
    console.error("explore confirm-upload error:", err);
    return NextResponse.json({ error: "Terjadi kesalahan di server." }, { status: 500 });
  }
}
