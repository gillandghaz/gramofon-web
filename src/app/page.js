"use client";

import Link from "next/link";
import { useAuth } from "@/lib/auth-context";

export default function LandingPage() {
  const { user, loading } = useAuth();

  return (
    <main
      style={{
        minHeight: "100dvh",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "18px clamp(16px, 5vw, 48px)",
        }}
      >
        <span style={{ fontWeight: 700, fontSize: 17, letterSpacing: 0.3 }}>
          🎧 Gramofon
        </span>
        {!loading && (
          <Link
            href={user ? "/dashboard" : "/login"}
            className="btn btn--primary"
          >
            {user ? "Buka Dashboard" : "Login"}
          </Link>
        )}
      </header>

      <section
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          textAlign: "center",
          padding: "24px clamp(16px, 8vw, 120px)",
          gap: 18,
        }}
      >
        <h1
          style={{
            fontSize: "clamp(28px, 6vw, 46px)",
            margin: 0,
            maxWidth: 720,
            lineHeight: 1.15,
          }}
        >
          Perpustakaan video &amp; musik pribadi Anda,{" "}
          <span
            style={{
              background: "var(--accent-grad)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
            }}
          >
            di mana saja
          </span>
          .
        </h1>
        <p
          style={{
            color: "var(--text-secondary)",
            maxWidth: 520,
            fontSize: 15.5,
            lineHeight: 1.6,
            margin: 0,
          }}
        >
          Kelola playlist, putar video dan musik favorit Anda, dan lanjutkan
          dari perangkat mana pun — semuanya tersimpan aman di akun Anda.
        </p>
        <Link
          href={user ? "/dashboard" : "/login"}
          className="btn btn--primary"
          style={{ padding: "13px 28px", fontSize: 15 }}
        >
          {user ? "Buka Dashboard" : "Mulai Sekarang"}
        </Link>
      </section>

      <footer
        style={{
          textAlign: "center",
          padding: "18px",
          color: "var(--text-faint)",
          fontSize: 12,
        }}
      >
        © {new Date().getFullYear()} Gramofon
      </footer>
    </main>
  );
}
