import { NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase-admin";
import { requireAdmin, readJson, errorResponse, HttpError } from "@/lib/server-auth";
import { destroyImage, isPublicIdInFolder, AVATAR_FOLDER } from "@/lib/cloudinary-admin";

// UID Firebase Auth: string alfanumerik (maks 128). Divalidasi sebelum
// disisipkan ke path dokumen Firestore.
const UID_RE = /^[A-Za-z0-9_-]{1,128}$/;
// Kunci dokumen usernames/{username} (lihat lib/profile.js).
const USERNAME_KEY_RE = /^[a-z0-9_]{1,80}$/;

export async function POST(request) {
  try {
    // Token pemanggil diverifikasi (termasuk cek dicabut/dinonaktifkan) dan
    // status admin dicek ulang LANGSUNG di server dari Firestore — tidak
    // memercayai klaim "saya admin" dari body request atau state browser.
    const decoded = await requireAdmin(request);
    const callerUid = decoded.uid;

    const { targetUid } = await readJson(request);
    if (typeof targetUid !== "string" || !UID_RE.test(targetUid)) {
      throw new HttpError(400, "targetUid wajib diisi.");
    }
    // Larangan menghapus DIRI SENDIRI lewat jalur ini tetap dipertahankan
    // dengan sengaja (supaya tidak melewati saklar selfDeleteAllowed).
    // Admin boleh menghapus akun admin lain (sesuai permintaan).
    if (targetUid === callerUid) {
      throw new HttpError(400, "Tidak bisa menghapus akun sendiri lewat halaman ini.");
    }

    const targetRef = adminDb().collection("users").doc(targetUid);
    const targetSnap = await targetRef.get();
    if (!targetSnap.exists) throw new HttpError(404, "User tidak ditemukan.");
    const targetData = targetSnap.data();

    // Hapus reservasi username -- hanya kalau memang milik akun ini.
    if (typeof targetData.username === "string" && USERNAME_KEY_RE.test(targetData.username)) {
      const unameRef = adminDb().collection("usernames").doc(targetData.username);
      const unameSnap = await unameRef.get().catch(() => null);
      if (unameSnap?.exists && unameSnap.data().uid === targetUid) {
        await unameRef.delete().catch(() => {});
      }
    }
    // Foto profil ada di Cloudinary -- ikut dibersihkan (best-effort).
    if (isPublicIdInFolder(targetData.photoPublicId, AVATAR_FOLDER(targetUid))) {
      await destroyImage(targetData.photoPublicId).catch((e) => console.error("Gagal hapus foto profil:", e));
    }
    await targetRef.delete();
    await adminAuth().deleteUser(targetUid);

    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err, "delete-user");
  }
}
