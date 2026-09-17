import { NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase-admin";

export async function POST(request) {
  try {
    const authHeader = request.headers.get("authorization") || "";
    const idToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!idToken) {
      return NextResponse.json({ error: "Tidak ada token." }, { status: 401 });
    }

    // Verifikasi token ID Firebase milik PEMANGGIL request ini — ini yang
    // memastikan orang yang memanggil endpoint ini benar-benar sedang
    // login sebagai dirinya (token ditandatangani Firebase, tidak bisa
    // dipalsukan dari browser).
    const decoded = await adminAuth().verifyIdToken(idToken);
    const callerUid = decoded.uid;

    // Cek ulang status admin LANGSUNG DI SERVER dari Firestore — sengaja
    // TIDAK memercayai klaim "saya admin" dari body request atau dari
    // state React di browser, karena keduanya bisa dipalsukan.
    const callerSnap = await adminDb().collection("users").doc(callerUid).get();
    if (!callerSnap.exists || callerSnap.data().role !== "admin") {
      return NextResponse.json({ error: "Bukan admin." }, { status: 403 });
    }

    const { targetUid } = await request.json();
    if (!targetUid) {
      return NextResponse.json({ error: "targetUid wajib diisi." }, { status: 400 });
    }
    if (targetUid === callerUid) {
      return NextResponse.json(
        { error: "Tidak bisa menghapus akun sendiri lewat halaman ini." },
        { status: 400 }
      );
    }

    const targetSnap = await adminDb().collection("users").doc(targetUid).get();
    if (!targetSnap.exists) {
      return NextResponse.json({ error: "User tidak ditemukan." }, { status: 404 });
    }
    const targetData = targetSnap.data();
    // Catatan: larangan "tidak bisa menghapus akun admin lain" sudah
    // dicabut sesuai permintaan — admin sekarang boleh menghapus akun
    // admin lain juga. Larangan menghapus DIRI SENDIRI lewat jalur ini
    // (di atas) tetap dipertahankan dengan sengaja.

    // Hapus profil Firestore + reservasi username, lalu hapus akun Auth-nya.
    if (targetData.username) {
      await adminDb().collection("usernames").doc(targetData.username).delete().catch(() => {});
    }
    await adminDb().collection("users").doc(targetUid).delete();
    await adminAuth().deleteUser(targetUid);

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("delete-user error:", err);
    const message =
      err?.message?.includes("Firebase Admin belum dikonfigurasi")
        ? err.message
        : "Terjadi kesalahan di server.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
