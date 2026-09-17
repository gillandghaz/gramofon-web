import { NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase-admin";
import { getCloudinary } from "@/lib/cloudinary-admin";

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

    const mediaSnap = await adminDb().collection("media").doc(mediaId).get();
    if (!mediaSnap.exists) {
      return NextResponse.json({ error: "Media tidak ditemukan." }, { status: 404 });
    }
    const media = mediaSnap.data();

    const cloudinary = getCloudinary();
    await cloudinary.uploader
      .destroy(media.publicId, { resource_type: media.resourceType })
      .catch((e) => console.error("Gagal hapus asset Cloudinary:", e));

    await adminDb().collection("media").doc(mediaId).delete();

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("delete-media error:", err);
    const message = err?.message?.includes("belum dikonfigurasi")
      ? err.message
      : "Terjadi kesalahan di server.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
