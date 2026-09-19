"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  signInWithEmailAndPassword,
  signInWithPopup,
  sendPasswordResetEmail,
} from "firebase/auth";
import { auth, googleProvider } from "@/lib/firebase";
import { ensureUserProfile } from "@/lib/profile";
import PasswordInput from "@/components/PasswordInput";

// Pesan error Firebase asli sering berbahasa Inggris & teknis (mis.
// "auth/invalid-credential") — kita terjemahkan ke pesan yang aman dan
// tidak membocorkan apakah suatu email TERDAFTAR atau tidak (mencegah
// "user enumeration").
function friendlyAuthError(code) {
  switch (code) {
    case "auth/invalid-credential":
    case "auth/wrong-password":
    case "auth/user-not-found":
      return "Email atau password salah.";
    case "auth/too-many-requests":
      return "Terlalu banyak percobaan gagal. Coba lagi beberapa saat lagi.";
    case "auth/invalid-email":
      return "Format email tidak valid.";
    case "auth/user-disabled":
      return "Akun ini telah dinonaktifkan.";
    default:
      return "Terjadi kesalahan. Silakan coba lagi.";
  }
}

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleEmailLogin(e) {
    e.preventDefault();
    setError("");
    setInfo("");
    setBusy(true);
    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);
      router.push("/app");
    } catch (err) {
      // Firebase Auth SUDAH menerapkan rate limiting bawaan: setelah
      // beberapa kali gagal berturut-turut dari kombinasi
      // email+device yang sama, ia otomatis menolak percobaan lebih
      // lanjut untuk sementara (error "auth/too-many-requests") tanpa
      // perlu kode tambahan dari kita.
      setError(friendlyAuthError(err.code));
    } finally {
      setBusy(false);
    }
  }

  async function handleGoogleLogin() {
    setError("");
    setInfo("");
    setBusy(true);
    try {
      const result = await signInWithPopup(auth, googleProvider);
      await ensureUserProfile(result.user);
      router.push("/app");
    } catch (err) {
      if (err.code !== "auth/popup-closed-by-user") {
        setError(friendlyAuthError(err.code));
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleForgotPassword() {
    setError("");
    setInfo("");
    if (!email.trim()) {
      setError("Isi email Anda dulu di kolom di atas, lalu klik lagi.");
      return;
    }
    setBusy(true);
    try {
      // Firebase mengatur sendiri masa berlaku link reset (default 1 jam,
      // lihat catatan mengenai penyesuaian ke 5 menit di bawah form ini).
      await sendPasswordResetEmail(auth, email.trim());
      setInfo(
        "Jika email tersebut terdaftar, link reset password telah dikirim."
      );
    } catch (err) {
      // Sengaja tidak membedakan pesan untuk email yang tidak terdaftar,
      // supaya orang lain tidak bisa memakai form ini untuk menebak email
      // mana saja yang punya akun (user enumeration).
      setInfo(
        "Jika email tersebut terdaftar, link reset password telah dikirim."
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-shell">
      <div className="auth-card">
        <h1>Masuk ke Gramofon</h1>
        <p className="sub">Lanjutkan mendengarkan dan menonton.</p>

        <button
          type="button"
          className="btn btn--ghost btn--block google-btn"
          onClick={handleGoogleLogin}
          disabled={busy}
        >
          <GoogleIcon />
          Masuk dengan Google
        </button>

        <div className="auth-divider">ATAU</div>

        <form onSubmit={handleEmailLogin}>
          <div className="field">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="password">Password</label>
            <PasswordInput
              id="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          {error && <p className="error-text">{error}</p>}
          {info && (
            <p className="hint-text" style={{ marginBottom: 12 }}>
              {info}
            </p>
          )}

          <button
            type="submit"
            className="btn btn--primary btn--block"
            disabled={busy}
          >
            {busy ? "Memproses..." : "Masuk"}
          </button>
        </form>

        <p style={{ marginTop: 10 }}>
          <button
            type="button"
            onClick={handleForgotPassword}
            disabled={busy}
            style={{
              background: "none",
              border: "none",
              color: "var(--text-faint)",
              fontSize: 12.5,
              cursor: "pointer",
              padding: 0,
            }}
          >
            Lupa password?
          </button>
        </p>

        <p className="auth-switch">
          Belum punya akun?{" "}
          <Link href="/register">Klik untuk daftar</Link>
        </p>
      </div>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18">
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.9c1.7-1.57 2.7-3.88 2.7-6.62z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.9-2.26c-.8.54-1.84.86-3.06.86-2.35 0-4.34-1.59-5.05-3.72H.96v2.33A9 9 0 0 0 9 18z"
      />
      <path
        fill="#FBBC05"
        d="M3.95 10.7A5.4 5.4 0 0 1 3.67 9c0-.59.1-1.17.28-1.7V4.97H.96A9 9 0 0 0 0 9c0 1.45.35 2.83.96 4.03l2.99-2.33z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.97l2.99 2.33C4.66 5.17 6.65 3.58 9 3.58z"
      />
    </svg>
  );
}
