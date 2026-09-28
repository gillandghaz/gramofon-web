import { doc, getDoc, setDoc, collection, getDocs, writeBatch, deleteField } from "firebase/firestore";
import { db } from "./firebase";

const SETTINGS_DOC = doc(db, "settings", "app");
const DEFAULT_STORAGE_LIMIT_MB = 200;

// Catatan jujur: pengecekan ini mencegah pembuatan PROFIL user baru di
// Firestore lewat aplikasi. Ini TIDAK mencegah seseorang memanggil Firebase
// Auth SDK secara langsung untuk membuat akun Auth murni (tanpa profil).
// Penegakan 100% butuh Firebase Cloud Functions (Blocking Functions, perlu
// paket Blaze) — bisa ditambahkan di fase lanjutan kalau dibutuhkan.
export async function isRegistrationOpen() {
  const snap = await getDoc(SETTINGS_DOC);
  if (!snap.exists()) return true; // default: terbuka kalau belum pernah di-set
  return snap.data().registrationOpen !== false;
}

export async function setRegistrationOpen(open) {
  await setDoc(SETTINGS_DOC, { registrationOpen: open }, { merge: true });
}

// Saklar admin: izinkan/nonaktifkan sementara fitur "Hapus Akun Saya" di
// Setting. Default TRUE (diizinkan) kalau belum pernah di-set. Ditegakkan
// juga di firestore.rules (bukan cuma disembunyikan di UI) — lihat fungsi
// selfDeleteAllowed() di sana.
export async function isSelfDeleteEnabled() {
  const snap = await getDoc(SETTINGS_DOC);
  if (!snap.exists()) return true;
  return snap.data().selfDeleteEnabled !== false;
}

export async function setSelfDeleteEnabled(enabled) {
  await setDoc(SETTINGS_DOC, { selfDeleteEnabled: enabled }, { merge: true });
}

// Saklar admin: tampilkan/sembunyikan menu Explore untuk pengguna biasa.
// Admin SELALU melihat menu Explore apa pun nilainya (supaya tetap bisa
// mengelola isinya) — pengecualian itu ditangani di UI (/app/page.js),
// bukan di sini. Default TRUE kalau belum pernah di-set.
export async function isExploreEnabled() {
  const snap = await getDoc(SETTINGS_DOC);
  if (!snap.exists()) return true;
  return snap.data().exploreEnabled !== false;
}

export async function setExploreEnabled(enabled) {
  await setDoc(SETTINGS_DOC, { exploreEnabled: enabled }, { merge: true });
}

// Batas total penyimpanan utuk seluruh Explore (bukan per-akun) —
// diatur & dilihat LANGSUNG di menu Explore (khusus admin), bukan di
// dashboard. Default 5000MB (5GB) kalau belum pernah diatur.
export async function getExploreLimitMB() {
  const snap = await getDoc(SETTINGS_DOC);
  if (!snap.exists()) return 5000;
  return snap.data().exploreLimitMB ?? 5000;
}

export async function setExploreLimitMB(mb) {
  await setDoc(SETTINGS_DOC, { exploreLimitMB: mb }, { merge: true });
}

// ---- Kategori Explore ----
// Daftar kategori yang bisa dikelola admin (mis. "Musik", "Podcast",
// "Film Pendek"). Kalau daftar ini kosong, UI kategori disembunyikan
// total untuk pengguna biasa (lihat /app/page.js) — admin tetap melihat
// panel kelola kategori supaya bisa membuat kategori pertama.
export async function getExploreCategories() {
  const snap = await getDoc(SETTINGS_DOC);
  if (!snap.exists()) return [];
  const list = snap.data().exploreCategories;
  return Array.isArray(list) ? list : [];
}

export async function setExploreCategories(list) {
  await setDoc(SETTINGS_DOC, { exploreCategories: list }, { merge: true });
}

// ---- Kuota penyimpanan per akun ----
// Batas EFEKTIF seorang user = users/{uid}.storageLimitMB (kalau diset
// khusus lewat Kelola Pengguna) ATAU settings/app.defaultStorageLimitMB
// kalau tidak diset. Nilai ini baru benar-benar DITEGAKKAN saat fitur
// upload media (Fase 5) ditulis — untuk saat ini fitur ini menyiapkan
// angkanya di database, dicek nanti sebelum upload diterima.
export async function getDefaultStorageLimitMB() {
  const snap = await getDoc(SETTINGS_DOC);
  if (!snap.exists()) return DEFAULT_STORAGE_LIMIT_MB;
  return snap.data().defaultStorageLimitMB ?? DEFAULT_STORAGE_LIMIT_MB;
}

// scope "unset" -> ubah angka default saja; pengguna yang SUDAH punya
// batas khusus (override) di Kelola Pengguna tidak ikut berubah.
// scope "all"   -> ubah angka default, DAN hapus semua batas khusus yang
// sudah ada di setiap pengguna, supaya semua orang benar-benar memakai
// angka default yang baru (operasi ini yang butuh konfirmasi tegas di UI,
// karena menghapus pengaturan kustom yang sudah ada).
export async function setDefaultStorageLimitMB(mb, scope) {
  await setDoc(SETTINGS_DOC, { defaultStorageLimitMB: mb }, { merge: true });

  if (scope === "all") {
    const snap = await getDocs(collection(db, "users"));
    const batch = writeBatch(db);
    let count = 0;
    snap.forEach((d) => {
      if (d.data().storageLimitMB !== undefined) {
        batch.update(d.ref, { storageLimitMB: deleteField() });
        count += 1;
      }
    });
    if (count > 0) await batch.commit();
    return count; // jumlah user yang batas khususnya ikut dihapus
  }
  return 0;
}
