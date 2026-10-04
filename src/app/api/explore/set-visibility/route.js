import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { requireAdmin, readJson, errorResponse, HttpError, DOC_ID_RE } from "@/lib/server-auth";

// Admin menyembunyikan / menampilkan satu media Explore untuk SEMUA pengguna.
export async function POST(request) {
  try {
    await requireAdmin(request);

    const { mediaId, hidden } = await readJson(request);
    if (typeof mediaId !== "string" || !DOC_ID_RE.test(mediaId) || typeof hidden !== "boolean") {
      throw new HttpError(400, "Data tidak valid.");
    }
    const ref = adminDb().collection("exploreMedia").doc(mediaId);
    const snap = await ref.get();
    if (!snap.exists) throw new HttpError(404, "Media tidak ditemukan.");

    await ref.update({ hidden });
    return NextResponse.json({ ok: true, hidden });
  } catch (err) {
    return errorResponse(err, "explore set-visibility");
  }
}
