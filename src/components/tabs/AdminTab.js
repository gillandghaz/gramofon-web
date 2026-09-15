"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { isRegistrationOpen, setRegistrationOpen } from "@/lib/settings";
import { listAllUsers, setUserRole } from "@/lib/admin";

export default function AdminTab() {
  const { user } = useAuth();
  const [regOpen, setRegOpen] = useState(true);
  const [loadingReg, setLoadingReg] = useState(true);
  const [users, setUsers] = useState([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [busyUid, setBusyUid] = useState(null);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    isRegistrationOpen().then((v) => {
      setRegOpen(v);
      setLoadingReg(false);
    });
    refreshUsers();
  }, []);

  async function refreshUsers() {
    setLoadingUsers(true);
    try {
      const list = await listAllUsers();
      setUsers(list);
    } finally {
      setLoadingUsers(false);
    }
  }

  async function handleToggleRegistration() {
    const next = !regOpen;
    setRegOpen(next); // optimistic
    try {
      await setRegistrationOpen(next);
    } catch {
      setRegOpen(!next); // rollback kalau gagal (mis. rules menolak)
      setMsg("Gagal mengubah status pendaftaran.");
    }
  }

  async function handleToggleAdmin(target) {
    if (target.uid === user.uid) {
      setMsg("Anda tidak bisa mencabut status admin dari diri sendiri di sini.");
      return;
    }
    setBusyUid(target.uid);
    setMsg("");
    try {
      const nextRole = target.role === "admin" ? "user" : "admin";
      await setUserRole(target.uid, nextRole);
      await refreshUsers();
    } catch {
      setMsg("Gagal mengubah role. Periksa kembali Firestore Security Rules.");
    } finally {
      setBusyUid(null);
    }
  }

  return (
    <div>
      <h2 className="tab-title">Admin</h2>

      <div className="setting-row">
        <div>
          <div className="setting-row__label">Pendaftaran akun baru</div>
          <p className="hint-text">
            Kalau dimatikan, halaman /register akan menolak pendaftaran baru.
          </p>
        </div>
        {!loadingReg && (
          <button
            type="button"
            className="switch"
            role="switch"
            aria-checked={regOpen}
            onClick={handleToggleRegistration}
          >
            <span className="switch__thumb" />
          </button>
        )}
      </div>

      <p className="hint-text" style={{ margin: "4px 0 20px" }}>
        Catatan: ini menutup pembuatan profil di aplikasi. Penegakan penuh di
        level akun Firebase Authentication butuh Cloud Functions terpisah
        (lihat penjelasan sebelumnya).
      </p>

      <h3 className="tab-subtitle">Kelola pengguna</h3>
      {msg && <p className="error-text">{msg}</p>}
      {loadingUsers ? (
        <p className="hint-text">Memuat daftar pengguna...</p>
      ) : (
        <div className="user-list">
          {users.map((u) => (
            <div className="user-row" key={u.uid}>
              <div className="user-row__info">
                <div className="user-row__name">
                  {u.displayName || u.username}{" "}
                  {u.role === "admin" && <span className="badge">Admin</span>}
                </div>
                <div className="user-row__sub">
                  @{u.username} · {u.email}
                </div>
              </div>
              <button
                className="btn btn--ghost btn--sm"
                disabled={busyUid === u.uid || u.uid === user.uid}
                onClick={() => handleToggleAdmin(u)}
              >
                {busyUid === u.uid
                  ? "..."
                  : u.role === "admin"
                  ? "Cabut Admin"
                  : "Jadikan Admin"}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
