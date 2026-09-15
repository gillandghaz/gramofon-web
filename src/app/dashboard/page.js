"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signOut } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { useAuth } from "@/lib/auth-context";
import RequireAuth from "@/components/RequireAuth";
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

  // Urutan menu sesuai permintaan: Account, Setting, (Admin kalau admin), Kontak.
  const tabs = isAdmin ? [...BASE_TABS, ADMIN_TAB, KONTAK_TAB] : [...BASE_TABS, KONTAK_TAB];

  async function handleLogout() {
    await signOut(auth);
    router.push("/login");
  }

  return (
    <div className="dashboard-page">
      <header className="dashboard-topbar">
        <span className="dashboard-brand">🎧 Gramofon</span>
        <button className="btn btn--ghost btn--sm" onClick={handleLogout}>
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
    </div>
  );
}
