import { NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase-admin";
import { signParams } from "@/lib/cloudinary-admin";

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

    const { mediaId } = await request.json().catch(() => ({}));
    if (!mediaId) return NextResponse.json({ error: "mediaId wajib diisi." }, { status: 400 });

    const timestamp = Math.round(Date.now() / 1000);
    // Folder per-item supaya gampang ditelusuri/dihapus; thumbnail HANYA
    // gambar kecil jadi tidak dihitung ke kuota Explore (video/musik).
    const folder = `gramofon-explore-thumbs/${mediaId}`;
    const { signature, apiKey, cloudName } = signParams({ timestamp, folder });

    return NextResponse.json({ signature, timestamp, folder, apiKey, cloudName });
  } catch (err) {
    console.error("explore thumbnail sign-upload error:", err);
    const message = err?.message?.includes("belum dikonfigurasi") ? err.message : "Terjadi kesalahan di server.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
