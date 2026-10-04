import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { requireAdmin, readJson, errorResponse, HttpError } from "@/lib/server-auth";
import { destroyAsset, getAssetInfo, EXPLORE_FOLDER } from "@/lib/cloudinary-admin";

const DEFAULT_EXPLORE_LIMIT_MB = 5000;
// public_id hasil upload ke folder Explore: "gramofon-explore/<id acak>".
const EXPLORE_PUBLIC_ID_RE = new RegExp(`^${EXPLORE_FOLDER}/[A-Za-z0-9_-]{1,120}$`);

export async function POST(request) {
  try {
    const decoded = await requireAdmin(request);

    // Dari browser HANYA diterima publicId, resourceType, title, category.
    // Ukuran, URL, format, durasi diambil langsung dari Cloudinary -- tidak
    // pernah dipercaya dari browser.
    const body = await readJson(request);
    const { publicId, resourceType, title, category } = body;
    if (typeof publicId !== "string" || !["audio", "video"].includes(resourceType)) {
      throw new HttpError(400, "Data upload tidak lengkap.");
    }
    if (!EXPLORE_PUBLIC_ID_RE.test(publicId)) {
      throw new HttpError(403, "public_id tidak valid untuk Explore.");
    }

    let asset;
    try {
      asset = await getAssetInfo(publicId);
    } catch (e) {
      console.error("explore confirm-upload: asset tidak ditemukan:", e?.error?.message || e);
      throw new HttpError(400, "File tidak ditemukan di Cloudinary. Coba upload ulang.");
    }
    const bytes = Number(asset?.bytes);
    if (!Number.isFinite(bytes) || bytes <= 0 || !asset?.secure_url) {
      throw new HttpError(400, "Data file dari Cloudinary tidak valid.");
    }

    // Kategori (opsional) harus salah satu kategori yang memang ada.
    const [settingsSnap, existingSnap] = await Promise.all([
      adminDb().collection("settings").doc("app").get(),
      adminDb().collection("exploreMedia").get(),
    ]);
    const settings = settingsSnap.exists ? settingsSnap.data() : {};
    let cleanCategory = null;
    if (typeof category === "string" && category.trim()) {
      const wanted = category.trim().slice(0, 60);
      const known = Array.isArray(settings.exploreCategories) ? settings.exploreCategories : [];
      if (!known.includes(wanted)) {
        await destroyAsset(publicId, resourceType).catch(() => {});
        throw new HttpError(400, "Kategori tidak dikenal. File telah dibatalkan.");
      }
      cleanCategory = wanted;
    }

    // PENEGAKAN SUNGGUHAN batas total Explore pakai ukuran ASLI dari
    // Cloudinary. Kalau kelebihan, file yang baru ter-upload dihapus lagi.
    const limitMB = settings.exploreLimitMB ?? DEFAULT_EXPLORE_LIMIT_MB;
    let usedBytes = 0;
    let alreadyRegistered = false;
    existingSnap.forEach((d) => {
      const data = d.data();
      usedBytes += data.bytes || 0;
      if (data.publicId === publicId) alreadyRegistered = true;
    });
    if (alreadyRegistered) throw new HttpError(409, "File ini sudah terdaftar.");
    if (usedBytes + bytes > limitMB * 1024 * 1024) {
      await destroyAsset(publicId, resourceType).catch((e) =>
        console.error("Gagal menghapus file Explore yang melebihi kuota:", e)
      );
      throw new HttpError(400, "File ini melebihi sisa kuota Explore. File telah dibatalkan.");
    }

    const cleanTitle = String(
      typeof title === "string" && title.trim() ? title : publicId.split("/").pop()
    )
      .trim()
      .slice(0, 120);

    const docRef = await adminDb()
      .collection("exploreMedia")
      .add({
        title: cleanTitle,
        publicId,
        resourceType,
        format: typeof asset.format === "string" ? asset.format : null,
        bytes,
        durationSeconds: typeof asset.duration === "number" ? asset.duration : null,
        category: cleanCategory,
        url: asset.secure_url,
        hidden: false, // tampil untuk semua pengguna sampai admin menyembunyikannya
        addedBy: decoded.uid,
        createdAt: new Date(),
      });

    return NextResponse.json({ ok: true, id: docRef.id });
  } catch (err) {
    return errorResponse(err, "explore confirm-upload");
  }
}
