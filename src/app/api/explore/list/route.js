import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { requireUser, isAdminUid, errorResponse } from "@/lib/server-auth";

// Daftar Explore untuk SEMUA pengguna yang login. Media yang disembunyikan
// admin (hidden: true) HANYA dikirim ke admin -- pengguna biasa tidak
// pernah menerimanya sama sekali (bukan sekadar disembunyikan di UI).
// Karena itu firestore.rules membatasi baca langsung koleksi ini ke admin.
export async function POST(request) {
  try {
    const decoded = await requireUser(request);
    const admin = await isAdminUid(decoded.uid);

    const snap = await adminDb().collection("exploreMedia").get();
    const items = [];
    snap.forEach((d) => {
      const data = d.data();
      const hidden = data.hidden === true;
      if (hidden && !admin) return;

      const createdAtMs = data.createdAt?.toMillis ? data.createdAt.toMillis() : 0;
      const item = {
        id: d.id,
        title: data.title || "",
        resourceType: data.resourceType,
        format: data.format || null,
        bytes: data.bytes || 0,
        durationSeconds: data.durationSeconds || null,
        category: data.category || null,
        url: data.url,
        thumbUrl: data.thumbUrl || null,
        hidden,
        createdAtMs,
      };
      // Detail internal hanya untuk admin.
      if (admin) {
        item.publicId = data.publicId || null;
        item.addedBy = data.addedBy || null;
      }
      items.push(item);
    });
    items.sort((a, b) => b.createdAtMs - a.createdAtMs);

    return NextResponse.json({ items });
  } catch (err) {
    return errorResponse(err, "explore list");
  }
}
