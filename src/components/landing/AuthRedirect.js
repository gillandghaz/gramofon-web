"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { hasAuthHint } from "@/lib/auth-hint";

// Mengalihkan pengguna yang sudah login ke /app. Dipakai di landing, /login,
// dan /register.
//
// Cepat: /app di-prefetch begitu halaman dibuka, dan kalau ada "petunjuk
// login" (lihat lib/auth-hint.js) pengalihan terjadi seketika, tanpa
// menunggu Firebase memulihkan sesi. Petunjuk basi tidak berbahaya: /app
// memeriksa sesi sendiri dan melempar balik ke /login kalau tidak valid.
//
// requireProfile (untuk /login & /register): jangan mengalihkan sebelum
// profil akun ada. Akun Google baru yang ditolak karena pendaftaran ditutup
// tidak punya profil, jadi halaman ini tetap tampil dan menampilkan pesannya.
//
// cover (khusus landing): tutup halaman saat pengalihan berlangsung.
export default function AuthRedirect({ requireProfile = false, cover = false }) {
  const { user, profile, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    router.prefetch("/app");
    if (hasAuthHint()) router.replace("/app");
  }, [router]);

  const ready = !!user && (!requireProfile || !!profile);
  useEffect(() => {
    if (!loading && ready) router.replace("/app");
  }, [loading, ready, router]);

  if (cover && user) return <div className="lp-cover" aria-hidden="true" />;
  return null;
}
