import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { requireAdmin, readJson, errorResponse, HttpError, DOC_ID_RE } from "@/lib/server-auth";

const MAX_IDS = 400; // batch Firestore maksimal 500 operasi

function cleanIds(value, label) {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > MAX_IDS || !value.every((v) => typeof v === "string" && DOC_ID_RE.test(v))) {
    throw new HttpError(400, `Daftar ${label} tidak valid.`);
  }
  return [...new Set(value)];
}

// Atur keanggotaan sebuah kategori Explore:
//   addIds    -> media ini dipindahkan KE kategori tersebut
//   removeIds -> media ini dikeluarkan dari kategori tersebut (jadi "tanpa
//                kategori"), hanya kalau memang sedang berada di kategori itu
// Satu media hanya bisa punya satu kategori.
export async function POST(request) {
  try {
    await requireAdmin(request);

    const body = await readJson(request);
    const category = typeof body.category === "string" ? body.category.trim().slice(0, 60) : "";
    if (!category) throw new HttpError(400, "Nama kategori tidak valid.");
    const addIds = cleanIds(body.addIds, "media yang ditambahkan");
    const removeIds = cleanIds(body.removeIds, "media yang dikeluarkan");
    if (addIds.length === 0 && removeIds.length === 0) {
      return NextResponse.json({ ok: true, added: 0, removed: 0 });
    }

    const settingsSnap = await adminDb().collection("settings").doc("app").get();
    const known = settingsSnap.exists && Array.isArray(settingsSnap.data().exploreCategories)
      ? settingsSnap.data().exploreCategories
      : [];
    if (!known.includes(category)) throw new HttpError(400, "Kategori tidak dikenal.");

    const col = adminDb().collection("exploreMedia");
    const batch = adminDb().batch();
    let added = 0;
    let removed = 0;

    if (addIds.length) {
      const snaps = await adminDb().getAll(...addIds.map((id) => col.doc(id)));
      snaps.forEach((s) => {
        if (s.exists) {
          batch.update(s.ref, { category });
          added += 1;
        }
      });
    }
    if (removeIds.length) {
      const snaps = await adminDb().getAll(...removeIds.map((id) => col.doc(id)));
      snaps.forEach((s) => {
        if (s.exists && s.data().category === category) {
          batch.update(s.ref, { category: null });
          removed += 1;
        }
      });
    }
    if (added + removed > 0) await batch.commit();

    return NextResponse.json({ ok: true, added, removed });
  } catch (err) {
    return errorResponse(err, "explore set-category");
  }
}
