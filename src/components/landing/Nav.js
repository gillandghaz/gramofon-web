"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Logo from "@/components/Logo";

const ITEMS = [
  { id: "fitur", label: "Fitur" },
  { id: "keunggulan", label: "Keunggulan" },
  { id: "faq", label: "FAQ" },
];

// Ikon bergaya sama dengan ikon menu di /app (garis 1.8, ujung bulat, kotak 24).
function Ic({ id }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {id === "fitur" && (
        // sliders: kontrol pemutar
        <>
          <line x1="21" x2="14" y1="4" y2="4" /><line x1="10" x2="3" y1="4" y2="4" />
          <line x1="21" x2="12" y1="12" y2="12" /><line x1="8" x2="3" y1="12" y2="12" />
          <line x1="21" x2="16" y1="20" y2="20" /><line x1="12" x2="3" y1="20" y2="20" />
          <line x1="14" x2="14" y1="2" y2="6" /><line x1="8" x2="8" y1="10" y2="14" /><line x1="16" x2="16" y1="18" y2="22" />
        </>
      )}
      {id === "keunggulan" && (
        // medali: keunggulan
        <>
          <circle cx="12" cy="8" r="6" /><path d="M15.477 12.89 17 22l-5-3-5 3 1.523-9.11" />
        </>
      )}
      {id === "faq" && (
        // tanda tanya dalam lingkaran
        <>
          <circle cx="12" cy="12" r="10" /><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" /><path d="M12 17h.01" />
        </>
      )}
    </svg>
  );
}

export default function Nav() {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState("");
  const burgerRef = useRef(null);
  const panelRef = useRef(null);

  // Menu ponsel: tutup otomatis kalau user menyentuh/mengklik di luar panel
  // menu (selain tombol hamburger, yang punya fungsi buka-tutup sendiri),
  // menekan Esc, atau layar melebar sampai menu desktop yang tampil.
  // pointerdown dipakai (bukan click) karena di iOS Safari elemen non-interaktif
  // tidak selalu menerima event click.
  useEffect(() => {
    if (!open) return;
    function onDown(e) {
      if (panelRef.current?.contains(e.target) || burgerRef.current?.contains(e.target)) return;
      setOpen(false);
    }
    function onKey(e) {
      if (e.key === "Escape") setOpen(false);
    }
    const mq = window.matchMedia("(min-width: 821px)");
    function onMq(e) {
      if (e.matches) setOpen(false);
    }
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    mq.addEventListener("change", onMq);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
      mq.removeEventListener("change", onMq);
    };
  }, [open]);

  // Menandai menu sesuai bagian yang sedang terlihat (scroll-spy).
  useEffect(() => {
    const els = ITEMS.map((i) => document.getElementById(i.id)).filter(Boolean);
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => e.isIntersecting && setActive(e.target.id)),
      { rootMargin: "-45% 0px -50% 0px" }
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

  // Link (bukan <a> biasa) supaya Next mencatat state riwayat dengan benar.
  // Dengan <a href="#x"> polos, tombol Back dari /login berhenti di form login.
  const links = (cls) =>
    ITEMS.map((i) => (
      <Link
        key={i.id}
        href={`/#${i.id}`}
        className={cls + (active === i.id ? " is-active" : "")}
        onClick={() => setOpen(false)}
      >
        <Ic id={i.id} />
        <span>{i.label}</span>
      </Link>
    ));

  return (
    <header className="lp-top">
      <div className="lp-top__in">
        <button type="button" ref={burgerRef} className="lp-burger" aria-label="Menu" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
            <path d={open ? "M5 5l10 10M15 5L5 15" : "M3 6h14M3 10h14M3 14h14"} />
          </svg>
        </button>
        <Link href="/" className="lp-brand" onClick={() => setOpen(false)}>
          <Logo size={26} />
          <span>Gramofon</span>
        </Link>
        <nav className="lp-menu" aria-label="Bagian halaman">{links("lp-mi")}</nav>
        <div className="lp-top__act">
          <Link href="/login" className="btn btn--ghost">Masuk</Link>
          <Link href="/register" className="btn btn--primary">Daftar</Link>
        </div>
      </div>
      {open && <nav ref={panelRef} className="lp-menu-m" aria-label="Menu">{links("lp-mi")}</nav>}
    </header>
  );
}
