"use client";

import { useRef, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { updateDisplayName, requestPasswordChange } from "@/lib/account";
import { uploadProfilePhoto } from "@/lib/photo";

function initialsFor(name) {
  const trimmed = (name || "").trim();
  return trimmed ? trimmed[0].toUpperCase() : "G";
}

export default function AccountTab() {
  const { user, profile } = useAuth();
  const [displayName, setDisplayName] = useState(profile?.displayName || "");
  const [savingName, setSavingName] = useState(false);
  const [nameMsg, setNameMsg] = useState("");
  const [pwBusy, setPwBusy] = useState(false);
  const [pwMsg, setPwMsg] = useState("");
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoErr, setPhotoErr] = useState("");
  const fileInputRef = useRef(null);

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

  async function handlePhotoChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoErr("");
    setPhotoBusy(true);
    try {
      await uploadProfilePhoto(user.uid, file);
    } catch (err) {
      console.error("Upload foto profil gagal:", err);
      if (err.message === "not-an-image") setPhotoErr("File harus berupa gambar.");
      else if (err.message === "too-large") setPhotoErr("Ukuran file maksimal 8MB.");
      else if (err.message === "still-too-large")
        setPhotoErr("Gambar masih terlalu besar setelah diperkecil. Coba foto lain.");
      else if (err.code === "permission-denied")
        setPhotoErr("Ditolak Firestore Security Rules — pastikan rules terbaru sudah dipasang.");
      else setPhotoErr(`Gagal mengunggah foto (${err.code || err.message || "unknown"}).`);
    } finally {
      setPhotoBusy(false);
      e.target.value = "";
    }
  }

  return (
    <div>
      <h2 className="tab-title">Account</h2>

      <div className="avatar-row">
        <button
          type="button"
          className="avatar-btn"
          onClick={() => fileInputRef.current?.click()}
          disabled={photoBusy}
          title="Ganti foto profil"
        >
          {profile?.photoURL ? (
            <img src={profile.photoURL} alt="" />
          ) : (
            <span className="avatar-btn__initial">
              {initialsFor(profile?.displayName || user.email)}
            </span>
          )}
          <span className="avatar-btn__overlay">{photoBusy ? "..." : "Ganti"}</span>
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          style={{ display: "none" }}
          onChange={handlePhotoChange}
        />
        <div>
          <div style={{ fontSize: 13, fontWeight: 600 }}>Foto profil</div>
          <p className="hint-text">JPG/PNG, otomatis diperkecil, maks 8MB.</p>
          {photoErr && <p className="error-text" style={{ margin: 0 }}>{photoErr}</p>}
        </div>
      </div>

      <div className="settings-divider" />

      <div className="field">
        <label>Email</label>
        <input value={user.email || ""} disabled />
      </div>

      <div className="field">
        <label>
          Username <span className="hint-inline">(permanen, hanya admin yang bisa mengubah)</span>
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
