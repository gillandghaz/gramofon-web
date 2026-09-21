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

    const { mediaId } = await request.json();
    if (!mediaId) return NextResponse.json({ error: "mediaId wajib diisi." }, { status: 400 });

    const snap = await adminDb().collection("exploreMedia").doc(mediaId).get();
    if (!snap.exists) return NextResponse.json({ error: "Media tidak ditemukan." }, { status: 404 });
    const media = snap.data();

    await destroyAsset(media.publicId, media.resourceType).catch((e) =>
      console.error("Gagal hapus asset Cloudinary Explore:", e)
    );
    await adminDb().collection("exploreMedia").doc(mediaId).delete();

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("explore delete error:", err);
    return NextResponse.json({ error: "Terjadi kesalahan di server." }, { status: 500 });
  }
}
