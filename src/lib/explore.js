import { mediaKind } from "./media-kind";
import { auth } from "./firebase";
import { uploadToCloudinary, postJson } from "./cloudinary-upload";

async function token() {
  return auth.currentUser.getIdToken();
}

// Daftar Explore datang dari server (bukan baca Firestore langsung), karena
// media yang disembunyikan admin (hidden) tidak boleh sampai ke browser
// pengguna biasa sama sekali. Admin menerima semuanya, termasuk yang hidden.
export async function listExploreMedia() {
  const data = await postJson("/api/explore/list", await token(), {}, "Gagal memuat Explore.");
  return (data.items || []).map((m) => ({
    ...m,
    // Kompatibel dengan kode pengurut yang memakai createdAt.toMillis().
    createdAt: { toMillis: () => m.createdAtMs || 0 },
  }));
}

// Alur 3 langkah (HANYA admin -- dicek ulang di server):
//   1) minta tanda tangan, 2) upload langsung ke Cloudinary,
//   3) konfirmasi ke server (ukuran asli diambil dari Cloudinary).
export async function uploadExploreFile(file, title, onProgress, category) {
  const idToken = await token();

  const payload = await postJson(
    "/api/explore/sign-upload",
    idToken,
    { fileSizeBytes: file.size },
    "Gagal meminta izin upload."
  );

  // Endpoint "video" menangani video DAN musik; file lain ditolak Cloudinary.
  const result = await uploadToCloudinary({ payload, file, resourceType: "video", onProgress });

  // Cloudinary melaporkan musik sebagai "video" -- bedakan lewat MIME asli.
  const resourceType = mediaKind(file) === "audio" ? "audio" : "video";

  return postJson(
    "/api/explore/confirm-upload",
    idToken,
    { publicId: result.public_id, resourceType, title: title || file.name, category: category || null },
    "Gagal menyimpan data media."
  );
}

export async function deleteExploreMedia(mediaId) {
  return postJson("/api/explore/delete", await token(), { mediaId }, "delete-failed");
}

// Upload/ganti thumbnail satu item Explore (HANYA admin). Gambar disimpan di
// Cloudinary; Firestore hanya menyimpan URL-nya.
export async function uploadExploreThumbnail(mediaId, file) {
  const idToken = await token();

  const payload = await postJson(
    "/api/explore/thumbnail/sign-upload",
    idToken,
    { mediaId },
    "Gagal meminta izin upload thumbnail."
  );
  const result = await uploadToCloudinary({ payload, file, resourceType: "image" });

  return postJson(
    "/api/explore/thumbnail/confirm",
    idToken,
    { mediaId, publicId: result.public_id },
    "Gagal menyimpan thumbnail."
  );
}

// Ganti nama kategori -- ikut memindahkan semua item Explore yang memakai
// nama lama ke nama baru.
export async function renameExploreCategory(oldName, newName) {
  return postJson("/api/explore/rename-category", await token(), { oldName, newName }, "rename-failed");
}

// Admin: sembunyikan / tampilkan satu media untuk SEMUA pengguna.
export async function setExploreMediaHidden(mediaId, hidden) {
  return postJson("/api/explore/set-visibility", await token(), { mediaId, hidden }, "Gagal mengubah visibilitas.");
}

// Admin: atur isi sebuah kategori. addIds dipindahkan KE kategori,
// removeIds dikeluarkan dari kategori (jadi tanpa kategori).
export async function setExploreCategoryMembers(category, addIds = [], removeIds = []) {
  return postJson(
    "/api/explore/set-category",
    await token(),
    { category, addIds, removeIds },
    "Gagal menyimpan kategori."
  );
}

// Admin: simpan URUTAN media Explore. orderedIds boleh sebagian saja (mis. isi
// satu kategori) -- media itu bertukar tempat di slot yang sudah mereka
// tempati, urutan media lain tidak berubah.
export async function setExploreOrder(orderedIds) {
  return postJson("/api/explore/set-order", await token(), { orderedIds }, "Gagal menyimpan urutan.");
}
