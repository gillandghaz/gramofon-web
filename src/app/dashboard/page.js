"use client";

import { useState } from "react";
import { useAuth } from "@/lib/auth-context";
import RequireAuth from "@/components/RequireAuth";
import NotificationBell from "@/components/NotificationBell";
import ProfileMenu from "@/components/ProfileMenu";
import AccountTab from "@/components/tabs/AccountTab";
import SettingTab from "@/components/tabs/SettingTab";
import AdminTab from "@/components/tabs/AdminTab";
import KontakTab from "@/components/tabs/KontakTab";

const BASE_TABS = [
  { key: "account", label: "Account" },
  { key: "setting", label: "Settings" },
];
const ADMIN_TAB = { key: "admin", label: "Admin" };
const KONTAK_TAB = { key: "kontak", label: "Contact" };

export default function DashboardPage() {
  return (
    <RequireAuth>
      <DashboardInner />
    </RequireAuth>
  );
}

function DashboardInner() {
  const { isAdmin } = useAuth();
  const [activeTab, setActiveTab] = useState("account");

  // Urutan menu sesuai permintaan: Account, Settings, (Admin kalau admin), Contact.
  const tabs = isAdmin ? [...BASE_TABS, ADMIN_TAB, KONTAK_TAB] : [...BASE_TABS, KONTAK_TAB];

  return (
    <div className="dashboard-page">
      <header className="dashboard-topbar">
        <span className="dashboard-brand">🎧 Gramofon</span>
        {/* Kanan atas HANYA profil + notifikasi. Klik avatar -> dropdown
            Settings/Logout (gaya Google), bukan tombol Logout terpisah. */}
        <div className="dashboard-topbar__right">
          <NotificationBell />
          <ProfileMenu onOpenSettings={() => setActiveTab("setting")} />
        </div>
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
