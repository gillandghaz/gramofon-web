"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";

// Landing page sekarang dirender di server (terlihat langsung, ramah SEO).
// Komponen kecil ini yang menangani "kalau sudah login, arahkan ke /app".
//
// hideWhileChecking:
//   false (default) -> landing langsung tampil; user yang SUDAH login
//                      melihatnya sekejap sebelum dialihkan ke /app.
//   true            -> layar kosong selama status login dicek (perilaku
//                      lama), sehingga tidak ada "kedip" bagi user login,
//                      tetapi pengunjung baru menunggu dulu sebelum
//                      melihat apa pun.
const hideWhileChecking = false;

export default function AuthRedirect() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && user) router.replace("/app");
  }, [loading, user, router]);

  if (user || (hideWhileChecking && loading)) {
    return <div className="lp-cover" aria-hidden="true" />;
  }
  return null;
}
