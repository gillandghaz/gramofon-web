// "Petunjuk login" disimpan di localStorage supaya halaman publik (landing,
// /login, /register) bisa langsung mengalihkan pengguna yang SUDAH login ke
// /app tanpa menunggu Firebase Auth memulihkan sesi (itu butuh beberapa
// ratus ms). Ini hanya petunjuk kecepatan, BUKAN keamanan: /app tetap
// diperiksa oleh RequireAuth + server, dan petunjuk basi otomatis dibersihkan
// begitu Firebase melaporkan tidak ada sesi.
export const AUTH_HINT_KEY = "gf_auth";

export function setAuthHint(loggedIn) {
  try {
    if (loggedIn) localStorage.setItem(AUTH_HINT_KEY, "1");
    else localStorage.removeItem(AUTH_HINT_KEY);
  } catch {}
}

export function hasAuthHint() {
  try {
    return localStorage.getItem(AUTH_HINT_KEY) === "1";
  } catch {
    return false;
  }
}
