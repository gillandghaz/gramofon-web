"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signOut } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { useAuth } from "@/lib/auth-context";
import RequireAuth from "@/components/RequireAuth";
import ConfirmDialog from "@/components/ConfirmDialog";
import AccountTab from "@/components/tabs/AccountTab";
import SettingTab from "@/components/tabs/SettingTab";
import AdminTab from "@/components/tabs/AdminTab";
import KontakTab from "@/components/tabs/KontakTab";

const BASE_TABS = [
  { key: "account", label: "Account" },
  { key: "setting", label: "Setting" },
];
const ADMIN_TAB = { key: "admin", label: "Admin" };
const KONTAK_TAB = { key: "kontak", label: "Kontak" };

export default function DashboardPage() {
  return (
    <RequireAuth>
      <DashboardInner />
    </RequireAuth>
  );
}

function DashboardInner() {
  const router = useRouter();
  const { isAdmin } = useAuth();
  const [activeTab, setActiveTab] = useState("account");
  const [confirmingLogout, setConfirmingLogout] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  // Urutan menu sesuai permintaan: Account, Setting, (Admin kalau admin), Kontak.
  const tabs = isAdmin ? [...BASE_TABS, ADMIN_TAB, KONTAK_TAB] : [...BASE_TABS, KONTAK_TAB];

  async function handleLogout() {
    setLoggingOut(true);
    await signOut(auth);
    router.push("/login");
  }

  return (
    <div className="dashboard-page">
      <header className="dashboard-topbar">
        <span className="dashboard-brand">🎧 Gramofon</span>
        <button
          className="btn btn--danger btn--sm logout-btn"
          onClick={() => setConfirmingLogout(true)}
        >
          <LogoutIcon />
          Logout
        </button>
      </header>

      <div className="dashboard-shell">
        <nav className="dashboard-nav">
          {tabs.map((t) => (
            <button
              key={t.key}
              type="button"
              className={"dashboard-nav__btn" + (activeTab === t.key ? " is-active" : "")}
              onClick={() => setActiveTab(t.key)}
            >
              {t.label}
            </button>
          ))}
        </nav>

        {/* Kotak konten berukuran TETAP untuk setiap tab (lihat .dashboard-content
            di globals.css) — supaya dashboard tidak "melompat" ukurannya saat
            pindah menu, dan supaya kontennya bisa scroll sendiri kalau lebih
            panjang dari kotaknya, tanpa mendorong seluruh halaman/window. */}
        <main className="dashboard-content">
          {activeTab === "account" && <AccountTab />}
          {activeTab === "setting" && <SettingTab />}
          {activeTab === "admin" && isAdmin && <AdminTab />}
          {activeTab === "kontak" && <KontakTab />}
        </main>
      </div>

      <ConfirmDialog
        open={confirmingLogout}
        title="Keluar dari akun?"
        message="Anda perlu login kembali untuk mengakses dashboard setelah logout."
        confirmLabel="Ya, Logout"
        danger
        busy={loggingOut}
        onCancel={() => setConfirmingLogout(false)}
        onConfirm={handleLogout}
      />
    </div>
  );
}

function LogoutIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
      <path
        d="M6 2H3.5A1.5 1.5 0 0 0 2 3.5v9A1.5 1.5 0 0 0 3.5 14H6M10.5 11l3-3-3-3M13.2 8H6"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
