// HANYA untuk kode server (API routes). Satu tempat untuk: verifikasi token
// Firebase, cek admin, baca body JSON dengan batas ukuran, dan menyusun
// respons error yang seragam -- supaya tiap route tidak menyalin ulang
// logika yang sama (dan tidak ada route yang lupa salah satu pengecekan).

import { NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase-admin";

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function bearerToken(request) {
  const header = request.headers.get("authorization") || "";
  return header.startsWith("Bearer ") ? header.slice(7).trim() : null;
}

// checkRevoked=true: token milik akun yang sudah dinonaktifkan/dicabut
// langsung ditolak (bukan menunggu token kedaluwarsa, bisa sampai 1 jam).
// Dipakai untuk semua aksi admin.
//
// requireProfile=true (default): akun Firebase Auth WAJIB sudah punya profil
// di Firestore (users/{uid}). Firebase Auth sendiri tetap bisa membuat akun
// kosong lewat API publiknya (tidak bisa dicegah dari sisi aplikasi), jadi
// akun tanpa profil -- yang tidak lolos saat pendaftaran ditutup -- ditolak
// di SEMUA endpoint server, termasuk izin upload ke Cloudinary.
export async function requireUser(request, { checkRevoked = false, requireProfile = true } = {}) {
  const token = bearerToken(request);
  if (!token) throw new HttpError(401, "Tidak ada token.");
  let decoded;
  try {
    decoded = await adminAuth().verifyIdToken(token, checkRevoked);
  } catch (err) {
    if (err?.message?.includes("belum dikonfigurasi")) throw err;
    throw new HttpError(401, "Sesi tidak valid. Silakan login ulang.");
  }
  if (requireProfile) {
    const snap = await adminDb().collection("users").doc(decoded.uid).get();
    if (!snap.exists) throw new HttpError(403, "Akun belum terdaftar.");
  }
  return decoded;
}

// Status "pendaftaran dibuka" dibaca di SERVER (Admin SDK) -- bukan dari
// klaim browser. Default terbuka kalau belum pernah di-set.
export async function isRegistrationOpenServer() {
  const snap = await adminDb().collection("settings").doc("app").get();
  return !snap.exists || snap.data().registrationOpen !== false;
}

// Status admin SELALU dicek ulang di server dari Firestore -- tidak pernah
// percaya klaim dari browser.
export async function requireAdmin(request) {
  const decoded = await requireUser(request, { checkRevoked: true, requireProfile: false });
  const snap = await adminDb().collection("users").doc(decoded.uid).get();
  if (!snap.exists || snap.data().role !== "admin") {
    throw new HttpError(403, "Bukan admin.");
  }
  return decoded;
}

export async function isAdminUid(uid) {
  const snap = await adminDb().collection("users").doc(uid).get();
  return snap.exists && snap.data().role === "admin";
}

// Body JSON dibatasi ukurannya (default 64KB) -- semua endpoint di sini
// hanya menerima data kecil (id, nama, daftar id).
export async function readJson(request, maxBytes = 64 * 1024) {
  const declared = Number(request.headers.get("content-length") || 0);
  if (declared > maxBytes) throw new HttpError(413, "Permintaan terlalu besar.");
  const text = await request.text();
  if (text.length > maxBytes) throw new HttpError(413, "Permintaan terlalu besar.");
  if (!text) return {};
  try {
    const data = JSON.parse(text);
    return data && typeof data === "object" ? data : {};
  } catch {
    throw new HttpError(400, "Format JSON tidak valid.");
  }
}

export function errorResponse(err, label = "api") {
  if (err instanceof HttpError) {
    return NextResponse.json({ error: err.message }, { status: err.status });
  }
  console.error(`${label} error:`, err);
  // Pesan konfigurasi (env var belum diisi) aman & berguna ditampilkan.
  const message = err?.message?.includes("belum dikonfigurasi")
    ? err.message
    : "Terjadi kesalahan di server.";
  // "code" (mis. auth/..., app/..., 7) membantu melacak masalah konfigurasi
  // tanpa membocorkan detail rahasia.
  const code = typeof err?.code === "string" || typeof err?.code === "number" ? String(err.code).slice(0, 60) : undefined;
  return NextResponse.json({ error: message, code }, { status: 500 });
}

// ID dokumen Firestore auto-generated: 20 karakter alfanumerik. Validasi
// ketat dipakai setiap kali id dari klien disisipkan ke path (folder
// Cloudinary / referensi dokumen) -- mencegah "../" dan karakter aneh.
export const DOC_ID_RE = /^[A-Za-z0-9]{1,40}$/;
