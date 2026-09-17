"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { signOut } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { useAuth } from "@/lib/auth-context";
import ConfirmDialog from "@/components/ConfirmDialog";

export default function ProfileMenu({ onOpenSettings }) {
  const router = useRouter();
  const { user, profile } = useAuth();
  const [open, setOpen] = useState(false);
  const [confirmingLogout, setConfirmingLogout] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const wrapRef = useRef(null);

  useEffect(() => {
    function onDocClick(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("click", onDocClick);
    return () => document.removeEventListener("click", onDocClick);
  }, []);

  async function handleLogout() {
    setLoggingOut(true);
    await signOut(auth);
    router.push("/login");
  }

  const initials = (profile?.displayName || user.email || "G").trim()[0]?.toUpperCase() || "G";

  return (
    <div className="profile-menu-wrap" ref={wrapRef}>
      <button
        type="button"
        className="topbar-avatar"
        title={profile?.displayName || user.email}
        onClick={() => setOpen((v) => !v)}
      >
        {profile?.photoURL ? <img src={profile.photoURL} alt="" /> : <span>{initials}</span>}
      </button>

      {open && (
        <div className="profile-menu">
          <div className="profile-menu__header">
            <div className="profile-menu__name">{profile?.displayName || "Listener"}</div>
            <div className="profile-menu__email">{user.email}</div>
          </div>
          <div className="profile-menu__divider" />
          <button
            type="button"
            className="profile-menu__item"
            onClick={() => {
              setOpen(false);
              onOpenSettings();
            }}
          >
            <SettingsIcon />
            Settings
          </button>
          <button
            type="button"
            className="profile-menu__item profile-menu__item--danger"
            onClick={() => {
              setOpen(false);
              setConfirmingLogout(true);
            }}
          >
            <LogoutIcon />
            Logout
          </button>
        </div>
      )}

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

function SettingsIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="8" r="2.3" stroke="currentColor" strokeWidth="1.4" />
      <path
        d="M8 1.8v1.6M8 12.6v1.6M14.2 8h-1.6M3.4 8H1.8M12.1 3.9l-1.1 1.1M5 10l-1.1 1.1M12.1 12.1 11 11M5 6 3.9 3.9"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}
function LogoutIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
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
