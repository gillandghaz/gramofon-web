"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createUserWithEmailAndPassword, signInWithPopup } from "firebase/auth";
import { auth, googleProvider } from "@/lib/firebase";
import { validatePassword, validateUsername, validateEmail } from "@/lib/validators";
import { createUserProfile, isUsernameAvailable, ensureUserProfile } from "@/lib/profile";
import { isRegistrationOpen } from "@/lib/settings";
import PasswordInput from "@/components/PasswordInput";

function friendlyAuthError(code) {
  switch (code) {
    case "auth/email-already-in-use":
      return "Email ini sudah terdaftar. Coba masuk (login) saja.";
    case "auth/invalid-email":
      return "Format email tidak valid.";
    case "auth/weak-password":
      return "Password terlalu lemah.";
    default:
      return "Terjadi kesalahan. Silakan coba lagi.";
  }
}

export default function RegisterPage() {
  const router = useRouter();
  const [checkingOpen, setCheckingOpen] = useState(true);
  const [open, setOpen] = useState(true);

  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    isRegistrationOpen()
      .then(setOpen)
      .finally(() => setCheckingOpen(false));
  }, []);

  const pwCheck = validatePassword(password);
  const userCheck = validateUsername(username);

  async function handleRegister(e) {
    e.preventDefault();
    setError("");

    if (!validateEmail(email)) {
      setError("Format email tidak valid.");
      return;
    }
    if (!userCheck.valid) {
      setError(userCheck.errors[0]);
      return;
    }
    if (!pwCheck.valid) {
      setError(pwCheck.errors[0]);
      return;
    }
    if (password !== confirmPassword) {
      setError("Konfirmasi password tidak cocok.");
      return;
    }

    setBusy(true);
    try {
      const available = await isUsernameAvailable(username);
      if (!available) {
        setError("Username sudah dipakai. Coba username lain.");
        setBusy(false);
        return;
      }

      const cred = await createUserWithEmailAndPassword(
        auth,
        email.trim(),
        password
      );
      // Force-refresh token sebelum menulis ke Firestore — tanpa ini,
      // pernah ada kasus di mana penulisan profil langsung setelah
      // signup gagal karena SDK Firestore belum sepenuhnya "mengenali"
      // token akun yang baru saja dibuat (race condition singkat).
      await cred.user.getIdToken(true);
      await createUserProfile(cred.user, {
        username,
        displayName: displayName.trim() || username,
      });
      router.push("/app");
    } catch (err) {
      console.error("Register error:", err);
      if (err.message === "username-taken") {
        setError("Username baru saja diambil orang lain. Coba yang lain.");
      } else {
        setError(friendlyAuthError(err.code));
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleGoogleRegister() {
    setError("");
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

  if (checkingOpen) {
    return <div className="auth-shell" />;
  }

  if (!open) {
    return (
      <div className="auth-shell">
        <div className="auth-card" style={{ textAlign: "center" }}>
          <h1>Pendaftaran ditutup</h1>
          <p className="sub">
            Pendaftaran akun baru sedang dinonaktifkan oleh admin saat ini.
            Silakan coba lagi nanti.
          </p>
          <Link href="/login" className="btn btn--ghost btn--block">
            Kembali ke Login
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-shell">
      <div className="auth-card">
        <h1>Buat akun Gramofon</h1>
        <p className="sub">Gratis, dan hanya perlu sebentar.</p>

        <button
          type="button"
          className="btn btn--ghost btn--block google-btn"
          onClick={handleGoogleRegister}
          disabled={busy}
        >
          Daftar dengan Google
        </button>

        <div className="auth-divider">ATAU</div>

        <form onSubmit={handleRegister}>
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
            <label htmlFor="username">
              Username <span style={{ color: "var(--text-faint)" }}>(permanen, unik)</span>
            </label>
            <input
              id="username"
              type="text"
              autoComplete="off"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
            />
            {username && !userCheck.valid && (
              <span className="hint-text" style={{ color: "var(--danger)" }}>
                {userCheck.errors[0]}
              </span>
            )}
          </div>

          <div className="field">
            <label htmlFor="displayName">
              Nama tampilan <span style={{ color: "var(--text-faint)" }}>(bisa diubah kapan saja)</span>
            </label>
            <input
              id="displayName"
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder={username || "Nama Anda"}
            />
          </div>

          <div className="field">
            <label htmlFor="password">Password</label>
            <PasswordInput
              id="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            {password && !pwCheck.valid && (
              <ul
                className="hint-text"
                style={{ color: "var(--danger)", margin: "2px 0 0", paddingLeft: 16 }}
              >
                {pwCheck.errors.map((e2) => (
                  <li key={e2}>{e2}</li>
                ))}
              </ul>
            )}
          </div>

          <div className="field">
            <label htmlFor="confirmPassword">Konfirmasi password</label>
            <PasswordInput
              id="confirmPassword"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
            />
          </div>

          {error && <p className="error-text">{error}</p>}

          <button
            type="submit"
            className="btn btn--primary btn--block"
            disabled={busy}
          >
            {busy ? "Memproses..." : "Daftar"}
          </button>
        </form>

        <p className="auth-switch">
          Sudah punya akun? <Link href="/login">Klik untuk masuk</Link>
        </p>
      </div>
    </div>
  );
}
