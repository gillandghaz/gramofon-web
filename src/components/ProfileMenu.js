"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { signOut } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { useAuth } from "@/lib/auth-context";
import ConfirmDialog from "@/components/ConfirmDialog";

export default function ProfileMenu() {
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
              router.push("/dashboard?tab=setting");
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
    <svg width="15" height="15" viewBox="0 0 20 20" fill="none">
      <path
        d="M8.3 2.6c.2-.9 1.2-.9 1.4 0l.14.63a1 1 0 0 0 1.35.71l.6-.25c.87-.36 1.6.53 1.16 1.33l-.32.56a1 1 0 0 0 .5 1.44l.6.22c.9.32.9 1.5 0 1.82l-.6.22a1 1 0 0 0-.5 1.44l.32.56c.44.8-.29 1.69-1.16 1.33l-.6-.25a1 1 0 0 0-1.35.71l-.14.63c-.2.9-1.2.9-1.4 0l-.14-.63a1 1 0 0 0-1.35-.71l-.6.25c-.87.36-1.6-.53-1.16-1.33l.32-.56a1 1 0 0 0-.5-1.44l-.6-.22c-.9-.32-.9-1.5 0-1.82l.6-.22a1 1 0 0 0 .5-1.44l-.32-.56c-.44-.8.29-1.69 1.16-1.33l.6.25a1 1 0 0 0 1.35-.71l.14-.63z"
        stroke="currentColor"
        strokeWidth="1.15"
        strokeLinejoin="round"
      />
      <circle cx="9" cy="9" r="2.1" stroke="currentColor" strokeWidth="1.15" />
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
