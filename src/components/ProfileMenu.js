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
            {/* span polos (bukan <a>) + style inline anti-autolink, supaya
                Safari/iOS tidak mengubah alamat email ini jadi tautan
                bergaris bawah secara otomatis. */}
            <span
              className="profile-menu__email"
              style={{ textDecoration: "none", cursor: "default", pointerEvents: "none" }}
            >
              {user.email}
            </span>
          </div>
          <div className="profile-menu__divider" />
          <button
            type="button"
            className="profile-menu__item"
            onClick={() => {
              setOpen(false);
              router.push("/app?view=theater");
            }}
          >
            <HomeIcon />
            Beranda
          </button>
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

function HomeIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
      <path
        d="M2 7.2 8 2.5l6 4.7V13a1 1 0 0 1-1 1h-3v-4H6v4H3a1 1 0 0 1-1-1V7.2z"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
    </svg>
  );
}
function SettingsIcon() {
  // Ikon gear sederhana (dibersihkan dari versi sebelumnya yang terlalu
  // detail/rumit di ukuran kecil) -- lebih jelas dan tegas.
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="3.2" stroke="currentColor" strokeWidth="1.8" />
      <path
        d="M12 3v2.4M12 18.6V21M21 12h-2.4M5.4 12H3M18.4 5.6l-1.7 1.7M7.3 16.7l-1.7 1.7M18.4 18.4l-1.7-1.7M7.3 7.3 5.6 5.6"
        stroke="currentColor"
        strokeWidth="1.8"
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
