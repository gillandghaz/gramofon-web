import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { requireAdmin, readJson, errorResponse, HttpError } from "@/lib/server-auth";

export async function POST(request) {
  try {
    await requireAdmin(request);

    const { oldName, newName } = await readJson(request);
    if (typeof oldName !== "string" || typeof newName !== "string" || !oldName || !newName.trim()) {
      throw new HttpError(400, "Nama kategori tidak valid.");
    }
    const cleanNew = newName.trim().slice(0, 60);

    // Ikut memindahkan semua item Explore yang sebelumnya memakai nama
    // lama ini ke nama baru -- supaya pengelompokannya tidak "yatim"
    // setelah kategori diganti namanya.
    const snap = await adminDb().collection("exploreMedia").where("category", "==", oldName).get();
    const docs = snap.docs;
    for (let i = 0; i < docs.length; i += 400) {
      const batch = adminDb().batch();
      docs.slice(i, i + 400).forEach((d) => batch.update(d.ref, { category: cleanNew }));
      await batch.commit();
    }

    return NextResponse.json({ ok: true, affected: docs.length });
  } catch (err) {
    return errorResponse(err, "explore rename-category");
  }
}
