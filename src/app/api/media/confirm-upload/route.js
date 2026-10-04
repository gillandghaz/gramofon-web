import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { requireUser, errorResponse } from "@/lib/server-auth";
import { destroyAsset, getAssetInfo } from "@/lib/cloudinary-admin";

const DEFAULT_LIMIT_MB = 200;

async function getEffectiveLimitMB(uid) {
  const [userSnap, settingsSnap] = await Promise.all([
    adminDb().collection("users").doc(uid).get(),
    adminDb().collection("settings").doc("app").get(),
  ]);
  const userLimit = userSnap.exists ? userSnap.data().storageLimitMB : undefined;
  if (typeof userLimit === "number" && Number.isFinite(userLimit)) return userLimit;
  const defaultLimit = settingsSnap.exists ? settingsSnap.data().defaultStorageLimitMB : undefined;
  return typeof defaultLimit === "number" && Number.isFinite(defaultLimit)
    ? defaultLimit
    : DEFAULT_LIMIT_MB;
}

export async function POST(request) {
  try {
    const authHeader = request.headers.get("authorization") || "";
    const idToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!idToken) return NextResponse.json({ error: "Tidak ada token." }, { status: 401 });

    const decoded = await requireUser(request);
    const uid = decoded.uid;

    // Dari browser kita HANYA terima publicId, resourceType, dan title.
    // Ukuran, URL, format, dan durasi TIDAK dipercaya dari browser — semuanya
    // diambil langsung dari Cloudinary di bawah.
    const body = await request.json().catch(() => ({}));
    const { publicId, resourceType, title } = body;
    if (typeof publicId !== "string" || !publicId || !["audio", "video"].includes(resourceType)) {
      return NextResponse.json({ error: "Data upload tidak lengkap." }, { status: 400 });
    }
    // public_id yang dikonfirmasi harus benar-benar berada di folder milik
    // uid ini (gramofon/{uid}/...) — mencegah mengklaim file orang lain.
    if (!publicId.startsWith(`gramofon/${uid}/`)) {
      return NextResponse.json({ error: "public_id tidak valid untuk akun ini." }, { status: 403 });
    }

    // Ambil data ASLI dari Cloudinary. Kalau file tidak ada di sana,
    // tolak — tidak ada catatan Firestore tanpa file nyata.
    let asset;
    try {
      asset = await getAssetInfo(publicId);
    } catch (e) {
      console.error("confirm-upload: asset tidak ditemukan di Cloudinary:", e?.error?.message || e);
      return NextResponse.json(
        { error: "File tidak ditemukan di Cloudinary. Coba upload ulang." },
        { status: 400 }
      );
    }
    const bytes = Number(asset?.bytes);
    if (!Number.isFinite(bytes) || bytes <= 0 || !asset?.secure_url) {
      return NextResponse.json({ error: "Data file dari Cloudinary tidak valid." }, { status: 400 });
    }

    // PENEGAKAN KUOTA SUNGGUHAN: pemakaian dihitung dari data yang SUDAH
    // tersimpan, dibandingkan dengan ukuran ASLI file ini dari Cloudinary.
    const limitMB = await getEffectiveLimitMB(uid);
    const existingSnap = await adminDb().collection("media").where("uid", "==", uid).get();
    let usedBytes = 0;
    let alreadyRegistered = false;
    existingSnap.forEach((d) => {
      const data = d.data();
      if (data.publicId === publicId) alreadyRegistered = true;
      usedBytes += typeof data.bytes === "number" && data.bytes > 0 ? data.bytes : 0;
    });
    // File yang sama tidak boleh didaftarkan dua kali (dan jangan sampai
    // terhapus oleh jalur "melebihi kuota" di bawah padahal sudah terdaftar).
    if (alreadyRegistered) {
      return NextResponse.json({ error: "File ini sudah terdaftar." }, { status: 409 });
    }
    const limitBytes = limitMB * 1024 * 1024;

    if (usedBytes + bytes > limitBytes) {
      await destroyAsset(publicId, resourceType).catch((e) =>
        console.error("Gagal menghapus file yang melebihi kuota:", e)
      );
      return NextResponse.json(
        {
          error: `File ini (${(bytes / 1024 / 1024).toFixed(1)}MB) melebihi sisa kuota Anda. File telah dibatalkan/dihapus.`,
        },
        { status: 400 }
      );
    }

    const cleanTitle = String(
      typeof title === "string" && title.trim() ? title : publicId.split("/").pop()
    ).slice(0, 120);

    const docRef = await adminDb()
      .collection("media")
      .add({
        uid,
        title: cleanTitle,
        publicId,
        resourceType,
        format: typeof asset.format === "string" ? asset.format : null,
        bytes,
        durationSeconds: typeof asset.duration === "number" ? asset.duration : null,
        url: asset.secure_url,
        createdAt: new Date(),
      });

    return NextResponse.json({ ok: true, id: docRef.id });
  } catch (err) {
    return errorResponse(err, "media confirm-upload");
  }
}
