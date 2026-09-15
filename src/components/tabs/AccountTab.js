"use client";

import { useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { updateDisplayName, requestPasswordChange } from "@/lib/account";

export default function AccountTab() {
  const { user, profile } = useAuth();
  const [displayName, setDisplayName] = useState(profile?.displayName || "");
  const [savingName, setSavingName] = useState(false);
  const [nameMsg, setNameMsg] = useState("");
  const [pwBusy, setPwBusy] = useState(false);
  const [pwMsg, setPwMsg] = useState("");

  async function handleSaveName(e) {
    e.preventDefault();
    setNameMsg("");
    setSavingName(true);
    try {
      await updateDisplayName(user.uid, displayName.trim());
      setNameMsg("Nama tampilan berhasil disimpan.");
    } catch {
      setNameMsg("Gagal menyimpan. Coba lagi.");
    } finally {
      setSavingName(false);
    }
  }

  async function handleChangePassword() {
    setPwMsg("");
    setPwBusy(true);
    try {
      await requestPasswordChange();
      setPwMsg(
        `Link untuk mengganti password telah dikirim ke ${user.email}. Cek inbox (atau folder spam), lalu buka link tersebut untuk menyetel password baru.`
      );
    } catch {
      setPwMsg("Gagal mengirim email. Coba lagi beberapa saat lagi.");
    } finally {
      setPwBusy(false);
    }
  }

  return (
    <div>
      <h2 className="tab-title">Account</h2>

      <div className="field">
        <label>Email</label>
        <input value={user.email || ""} disabled />
      </div>

      <div className="field">
        <label>
          Username <span className="hint-inline">(permanen, tidak bisa diubah)</span>
        </label>
        <input value={profile?.username ? `@${profile.username}` : ""} disabled />
      </div>

      <form onSubmit={handleSaveName}>
        <div className="field">
          <label htmlFor="displayName">Nama tampilan</label>
          <input
            id="displayName"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            maxLength={40}
          />
        </div>
        {nameMsg && <p className="hint-text">{nameMsg}</p>}
        <button className="btn btn--primary" type="submit" disabled={savingName}>
          {savingName ? "Menyimpan..." : "Simpan nama tampilan"}
        </button>
      </form>

      <div className="settings-divider" />

      <h3 className="tab-subtitle">Ganti Password</h3>
      <p className="hint-text" style={{ marginBottom: 12 }}>
        Untuk keamanan, mengganti password memerlukan verifikasi lewat email
        Anda — sama seperti proses lupa password.
      </p>
      <button className="btn btn--ghost" onClick={handleChangePassword} disabled={pwBusy}>
        {pwBusy ? "Mengirim..." : "Kirim link ganti password ke email"}
      </button>
      {pwMsg && <p className="hint-text" style={{ marginTop: 10 }}>{pwMsg}</p>}
    </div>
  );
}
