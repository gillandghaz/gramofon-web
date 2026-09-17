"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { updateSetting, deleteOwnAccount, currentUserAuthProvider } from "@/lib/account";
import { isSelfDeleteEnabled } from "@/lib/settings";
import PasswordInput from "@/components/PasswordInput";

const SKIP_OPTIONS = [5, 10, 15, 30];
const VIEW_OPTIONS = [
  { value: "theater", label: "Theater" },
  { value: "mini", label: "Mini" },
  { value: "audio", label: "Audio" },
  { value: "titles", label: "Titles" },
];
const REPEAT_OPTIONS = [
  { value: "off", label: "Off" },
  { value: "track", label: "Track" },
  { value: "queue", label: "Queue" },
];

export default function SettingTab() {
  const router = useRouter();
  const { user, profile } = useAuth();
  const settings = profile?.settings || {};
  const skipSeconds = settings.skipSeconds || 5;
  const startupView = settings.startupView || "theater";
  const defaultRepeat = settings.defaultRepeat || "off";
  const defaultShuffle = !!settings.defaultShuffle;
  const defaultVolume = settings.defaultVolume ?? 80;
  const reduceMotion = !!settings.reduceMotion;

  const [deleteAllowed, setDeleteAllowed] = useState(true);
  const [checkingAllowed, setCheckingAllowed] = useState(true);
  const [showDangerZone, setShowDangerZone] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteErr, setDeleteErr] = useState("");

  useEffect(() => {
    isSelfDeleteEnabled()
      .then(setDeleteAllowed)
      .finally(() => setCheckingAllowed(false));
  }, []);

  function set(key, value) {
    updateSetting(user.uid, key, value);
    if (key === "reduceMotion" && typeof document !== "undefined") {
      document.documentElement.setAttribute("data-reduce-motion", String(value));
    }
  }

  async function handleDeleteAccount() {
    setDeleteErr("");
    setDeleteBusy(true);
    try {
      const providerId = currentUserAuthProvider();
      await deleteOwnAccount(providerId === "password" ? { password: deletePassword } : {});
      router.push("/");
    } catch (err) {
      if (err.code === "auth/wrong-password" || err.code === "auth/invalid-credential") {
        setDeleteErr("Password salah.");
      } else if (err.message === "password-required") {
        setDeleteErr("Masukkan password Anda untuk konfirmasi.");
      } else if (err.code === "permission-denied") {
        setDeleteErr("Penghapusan akun sedang dinonaktifkan sementara oleh admin.");
        setDeleteAllowed(false);
      } else {
        setDeleteErr("Gagal menghapus akun. Coba login ulang lalu coba lagi.");
      }
    } finally {
      setDeleteBusy(false);
    }
  }

  return (
    <div>
      <h2 className="tab-title">Settings</h2>

      <div className="setting-row">
        <div>
          <div className="setting-row__label">Skip interval</div>
          <p className="hint-text">Seberapa jauh tombol Back/Forward melompat.</p>
        </div>
        <div className="segmented">
          {SKIP_OPTIONS.map((s) => (
            <button
              key={s}
              type="button"
              className={"segmented__btn" + (skipSeconds === s ? " is-active" : "")}
              onClick={() => set("skipSeconds", s)}
            >
              {s}s
            </button>
          ))}
        </div>
      </div>

      <div className="setting-row">
        <div>
          <div className="setting-row__label">Tampilan awal</div>
          <p className="hint-text">Mode tampilan pemutar saat pertama dibuka.</p>
        </div>
        <div className="segmented">
          {VIEW_OPTIONS.map((v) => (
            <button
              key={v.value}
              type="button"
              className={"segmented__btn" + (startupView === v.value ? " is-active" : "")}
              onClick={() => set("startupView", v.value)}
            >
              {v.label}
            </button>
          ))}
        </div>
      </div>

      <div className="setting-row">
        <div>
          <div className="setting-row__label">Repeat default</div>
          <p className="hint-text">Mode ulang bawaan saat mulai memutar antrean.</p>
        </div>
        <div className="segmented">
          {REPEAT_OPTIONS.map((r) => (
            <button
              key={r.value}
              type="button"
              className={"segmented__btn" + (defaultRepeat === r.value ? " is-active" : "")}
              onClick={() => set("defaultRepeat", r.value)}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      <div className="setting-row">
        <div>
          <div className="setting-row__label">Shuffle default</div>
          <p className="hint-text">Acak urutan pemutaran secara otomatis.</p>
        </div>
        <button
          type="button"
          className="switch"
          role="switch"
          aria-checked={defaultShuffle}
          onClick={() => set("defaultShuffle", !defaultShuffle)}
        >
          <span className="switch__thumb" />
        </button>
      </div>

      <div className="setting-row">
        <div>
          <div className="setting-row__label">Volume default</div>
          <p className="hint-text">Volume awal setiap kali membuka pemutar.</p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <input
            type="range"
            min="0"
            max="120"
            value={defaultVolume}
            onChange={(e) => set("defaultVolume", parseInt(e.target.value, 10))}
            style={{ width: 100 }}
          />
          <span className="hint-text" style={{ minWidth: 34, textAlign: "right" }}>
            {defaultVolume}%
          </span>
        </div>
      </div>

      <div className="setting-row" style={{ borderBottom: "none" }}>
        <div>
          <div className="setting-row__label">Kurangi animasi</div>
          <p className="hint-text">Matikan transisi/animasi UI untuk performa lebih ringan.</p>
        </div>
        <button
          type="button"
          className="switch"
          role="switch"
          aria-checked={reduceMotion}
          onClick={() => set("reduceMotion", !reduceMotion)}
        >
          <span className="switch__thumb" />
        </button>
      </div>

      <div className="settings-divider" />

      <div className="danger-zone">
        <h3 className="tab-subtitle" style={{ color: "var(--danger)" }}>
          Danger Zone
        </h3>

        {checkingAllowed ? null : !deleteAllowed ? (
          <p className="hint-text">
            Penghapusan akun sendiri sedang dinonaktifkan sementara oleh
            admin. Hubungi admin lewat menu Kontak kalau Anda tetap perlu
            menghapus akun.
          </p>
        ) : (
          <>
            <p className="hint-text" style={{ marginBottom: 12 }}>
              Menghapus akun bersifat permanen: profil, username, dan foto
              Anda akan hilang dan tidak bisa dikembalikan.
            </p>

            {!showDangerZone ? (
              <button className="btn btn--danger btn--sm" onClick={() => setShowDangerZone(true)}>
                Hapus Akun Saya
              </button>
            ) : (
              <div className="danger-zone__confirm">
                {currentUserAuthProvider() === "password" && (
                  <div className="field" style={{ marginBottom: 10 }}>
                    <label>Masukkan password untuk konfirmasi</label>
                    <PasswordInput
                      value={deletePassword}
                      onChange={(e) => setDeletePassword(e.target.value)}
                      autoComplete="current-password"
                    />
                  </div>
                )}
                {deleteErr && <p className="error-text">{deleteErr}</p>}
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    className="btn btn--ghost btn--sm"
                    onClick={() => {
                      setShowDangerZone(false);
                      setDeleteErr("");
                      setDeletePassword("");
                    }}
                    disabled={deleteBusy}
                  >
                    Batal
                  </button>
                  <button
                    className="btn btn--danger btn--sm"
                    onClick={handleDeleteAccount}
                    disabled={deleteBusy}
                  >
                    {deleteBusy ? "Menghapus..." : "Ya, hapus permanen"}
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
