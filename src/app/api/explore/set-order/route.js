import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { requireAdmin, readJson, errorResponse, HttpError, DOC_ID_RE } from "@/lib/server-auth";

const MAX_IDS = 400;
const CHUNK = 400; // batch Firestore maksimal 500 operasi

// Kunci urut tampilan Explore: media yang belum pernah diurutkan (tanpa
// "order") tampil PALING DEPAN, terbaru dulu; sisanya mengikuti "order".
function sortKey(data) {
  if (typeof data.order === "number") return data.order;
  const ms = data.createdAt?.toMillis ? data.createdAt.toMillis() : 0;
  return -ms - 1;
}

// Atur URUTAN media Explore (admin). orderedIds boleh berisi sebagian media
// saja (mis. isi satu kategori): media itu saling bertukar tempat di "slot"
// yang sudah mereka tempati dalam urutan global, jadi urutan media lain
// tidak berubah dan urutan di kategori & di "Semua" tetap konsisten.
export async function POST(request) {
  try {
    await requireAdmin(request);

    const body = await readJson(request);
    const ids = body.orderedIds;
    if (!Array.isArray(ids) || ids.length > MAX_IDS || !ids.every((v) => typeof v === "string" && DOC_ID_RE.test(v))) {
      throw new HttpError(400, "Daftar urutan tidak valid.");
    }
    const wanted = [...new Set(ids)];

    const col = adminDb().collection("exploreMedia");
    const snap = await col.get();
    const docs = snap.docs.map((d) => ({ ref: d.ref, id: d.id, key: sortKey(d.data()), order: d.data().order }));
    docs.sort((a, b) => a.key - b.key);

    const byId = new Map(docs.map((d) => [d.id, d]));
    const valid = wanted.filter((id) => byId.has(id));
    if (valid.length === 0) return NextResponse.json({ ok: true, updated: 0 });

    // Slot (posisi global) yang ditempati media-media ini sekarang.
    const slots = docs.map((d, i) => (valid.includes(d.id) ? i : -1)).filter((i) => i >= 0);
    const sequence = docs.map((d) => d.id);
    slots.forEach((slot, n) => {
      sequence[slot] = valid[n];
    });

    const writes = [];
    sequence.forEach((id, index) => {
      const d = byId.get(id);
      if (d.order !== index) writes.push({ ref: d.ref, index });
    });
    for (let i = 0; i < writes.length; i += CHUNK) {
      const batch = adminDb().batch();
      writes.slice(i, i + CHUNK).forEach((w) => batch.update(w.ref, { order: w.index }));
      await batch.commit();
    }
    return NextResponse.json({ ok: true, updated: writes.length });
  } catch (err) {
    return errorResponse(err, "explore set-order");
  }
}
