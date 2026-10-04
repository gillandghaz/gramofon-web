"use client";

// Context ini membaca status login Firebase Auth DAN dokumen profil user di
// Firestore (termasuk field "role"), lalu membagikannya ke seluruh komponen
// lewat useAuth(). Ini satu-satunya tempat "apakah user ini admin?" dibaca
// di sisi client — komponen lain tinggal memanggil useAuth().isAdmin.

import { createContext, useContext, useEffect, useState } from "react";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { doc, onSnapshot } from "firebase/firestore";
import { auth, db } from "./firebase";
import { ensureUserProfile } from "./profile";
import { setAuthHint } from "./auth-hint";

const AuthContext = createContext({
  user: null,
  profile: null,
  isAdmin: false,
  loading: true,
});

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Dengarkan status login Firebase Auth.
    const unsubAuth = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
      setAuthHint(!!firebaseUser);
      if (!firebaseUser) {
        setProfile(null);
        setLoading(false);
      }
    });
    return () => unsubAuth();
  }, []);

  useEffect(() => {
    if (!user) return;
    let healed = false;
    // Dengarkan dokumen profil user secara realtime (termasuk field role) —
    // jadi kalau admin lain mengubah role Anda, UI ikut update tanpa reload.
    const unsubProfile = onSnapshot(doc(db, "users", user.uid), (snap) => {
      const data = snap.exists() ? snap.data() : null;

      // Self-healing: kalau akun Auth ada tapi profil Firestore-nya TIDAK
      // ADA (mis. sebelumnya penulisan profil sempat gagal separuh jalan
      // karena race condition saat signup), buatkan otomatis di sini —
      // supaya akun ini tidak selamanya "hilang" dari daftar Admin.
      // onSnapshot lalu otomatis terpanggil ulang setelah profil terbuat.
      if (!data && !healed) {
        healed = true;
        ensureUserProfile(user).catch((err) => {
          // Pendaftaran ditutup: server sudah menghapus akun kosong ini.
          if (err?.message === "registration-closed") signOut(auth).catch(() => {});
          else console.error("Gagal self-heal profil:", err);
        });
      }

      setProfile(data);
      setLoading(false);
      // Terapkan preferensi "kurangi animasi" secara site-wide, bukan
      // hanya saat sedang berada di tab Setting.
      if (typeof document !== "undefined") {
        document.documentElement.setAttribute(
          "data-reduce-motion",
          String(!!data?.settings?.reduceMotion)
        );
      }
    });
    return () => unsubProfile();
  }, [user]);

  // Pemeriksaan sesi berkala: kalau akun dinonaktifkan di Firebase Console
  // (atau token dicabut), server menjawab 401 dan kita langsung logout.
  // Tanpa ini, browser baru sadar saat tokennya diperbarui (bisa ~1 jam).
  useEffect(() => {
    if (!user) return;
    let stopped = false;
    const DEAD = ["auth/user-disabled", "auth/user-token-expired", "auth/user-not-found", "auth/id-token-revoked"];

    async function check() {
      if (stopped) return;
      try {
        const idToken = await user.getIdToken();
        const res = await fetch("/api/auth/session", {
          method: "POST",
          headers: { Authorization: `Bearer ${idToken}` },
        });
        if (res.status === 401 && !stopped) signOut(auth).catch(() => {});
      } catch (err) {
        if (DEAD.includes(err?.code) && !stopped) signOut(auth).catch(() => {});
        // Gangguan jaringan biasa: abaikan, coba lagi pada putaran berikutnya.
      }
    }

    const onVisible = () => {
      if (document.visibilityState === "visible") check();
    };
    const timer = setInterval(check, 60 * 1000);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", check);
    check();
    return () => {
      stopped = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", check);
    };
  }, [user]);

  const isAdmin = profile?.role === "admin";

  return (
    <AuthContext.Provider value={{ user, profile, isAdmin, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
