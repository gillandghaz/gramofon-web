// Validasi dijalankan di CLIENT (untuk feedback instan ke user) DAN
// harus tetap dianggap tidak tepercaya — Firebase Auth sendiri yang jadi
// penegak akhir minimal panjang password di sisi server.

export function validatePassword(password) {
  const errors = [];
  if (!password || password.length < 8) {
    errors.push("Minimal 8 karakter.");
  }
  if (!/[A-Z]/.test(password || "")) {
    errors.push("Harus mengandung minimal 1 huruf besar (A-Z).");
  }
  if (!/[a-z]/.test(password || "")) {
    errors.push("Harus mengandung minimal 1 huruf kecil (a-z).");
  }
  return { valid: errors.length === 0, errors };
}

export function validateUsername(username) {
  const errors = [];
  const u = (username || "").trim();
  if (u.length < 3 || u.length > 20) {
    errors.push("Username harus 3–20 karakter.");
  }
  if (!/^[a-zA-Z0-9_]+$/.test(u)) {
    errors.push("Username hanya boleh huruf, angka, dan underscore (_).");
  }
  return { valid: errors.length === 0, errors };
}

export function validateEmail(email) {
  // Validasi ringan di client saja — Firebase Auth memvalidasi ulang di server.
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email || "");
}
