import { NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase-admin";
import { destroyAsset } from "@/lib/cloudinary-admin";

export async function POST(request) {
  try {
    const authHeader = request.headers.get("authorization") || "";
    const idToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!idToken) return NextResponse.json({ error: "Tidak ada token." }, { status: 401 });

    const decoded = await adminAuth().verifyIdToken(idToken);
    const callerUid = decoded.uid;

    const { mediaId } = await request.json();
    if (!mediaId) return NextResponse.json({ error: "mediaId wajib diisi." }, { status: 400 });

    const mediaSnap = await adminDb().collection("media").doc(mediaId).get();
    if (!mediaSnap.exists) {
      return NextResponse.json({ error: "Media tidak ditemukan." }, { status: 404 });
    }
    const media = mediaSnap.data();

    // Boleh dihapus oleh ADMIN, atau oleh PEMILIK media itu sendiri —
    // dicek ulang di server, tidak percaya klaim dari browser.
    const isOwner = media.uid === callerUid;
    let isAdmin = false;
    if (!isOwner) {
      const callerSnap = await adminDb().collection("users").doc(callerUid).get();
      isAdmin = callerSnap.exists && callerSnap.data().role === "admin";
    }
    if (!isOwner && !isAdmin) {
      return NextResponse.json({ error: "Tidak punya izin menghapus media ini." }, { status: 403 });
    }

    // Pertahanan berlapis: hanya hapus file di Cloudinary kalau publicId
    // memang berada di folder milik pemilik media ini. Mencegah dokumen
    // yang publicId-nya dipalsukan dipakai untuk menghapus file orang lain
    // (atau file Explore). Dokumen Firestore-nya tetap dihapus.
    const expectedPrefix = `gramofon/${media.uid}/`;
    if (typeof media.publicId === "string" && media.publicId.startsWith(expectedPrefix)) {
      await destroyAsset(media.publicId, media.resourceType).catch((e) =>
        console.error("Gagal hapus asset Cloudinary:", e)
      );
    } else {
      console.warn(
        "delete-media: publicId tidak sesuai folder pemilik, file Cloudinary TIDAK dihapus. mediaId:",
        mediaId
      );
    }

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
