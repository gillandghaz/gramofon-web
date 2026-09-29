import { NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase-admin";

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

    const { oldName, newName } = await request.json();
    if (!oldName || !newName || !newName.trim()) {
      return NextResponse.json({ error: "Nama kategori tidak valid." }, { status: 400 });
    }
    const cleanNew = newName.trim().slice(0, 60);

    // Ikut memindahkan semua item Explore yang sebelumnya memakai nama
    // lama ini ke nama baru -- supaya pengelompokannya tidak "yatim"
    // setelah kategori diganti namanya.
    const snap = await adminDb().collection("exploreMedia").where("category", "==", oldName).get();
    const batch = adminDb().batch();
    snap.forEach((d) => batch.update(d.ref, { category: cleanNew }));
    if (snap.size > 0) await batch.commit();

    return NextResponse.json({ ok: true, affected: snap.size });
  } catch (err) {
    console.error("rename-category error:", err);
    return NextResponse.json({ error: "Terjadi kesalahan di server." }, { status: 500 });
  }
}
