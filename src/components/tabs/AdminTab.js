"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { isRegistrationOpen, setRegistrationOpen, isSelfDeleteEnabled, setSelfDeleteEnabled } from "@/lib/settings";
import { listAllUsers, setUserRole, adminChangeUsername, adminDeleteUser } from "@/lib/admin";
import { isUsernameAvailable } from "@/lib/profile";
import { validateUsername } from "@/lib/validators";
import ConfirmDialog from "@/components/ConfirmDialog";

export default function AdminTab() {
  const { user } = useAuth();
  const [regOpen, setRegOpen] = useState(true);
  const [loadingReg, setLoadingReg] = useState(true);
  const [selfDeleteOn, setSelfDeleteOn] = useState(true);
  const [loadingSelfDelete, setLoadingSelfDelete] = useState(true);
  const [users, setUsers] = useState([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [search, setSearch] = useState("");
  const [busyUid, setBusyUid] = useState(null);
  const [msg, setMsg] = useState("");

  // Konfirmasi jadikan/cabut admin
  const [roleTarget, setRoleTarget] = useState(null); // { user, nextRole }

  // Modal "Ubah Username"
  const [renameTarget, setRenameTarget] = useState(null);
  const [newUsername, setNewUsername] = useState("");
  const [renameErr, setRenameErr] = useState("");
  const [renameBusy, setRenameBusy] = useState(false);

  // Konfirmasi "Hapus Akun"
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  useEffect(() => {
    isRegistrationOpen().then((v) => {
      setRegOpen(v);
      setLoadingReg(false);
    });
    isSelfDeleteEnabled().then((v) => {
      setSelfDeleteOn(v);
      setLoadingSelfDelete(false);
    });
    refreshUsers();
  }, []);

  async function refreshUsers() {
    setLoadingUsers(true);
    try {
      setUsers(await listAllUsers());
    } finally {
      setLoadingUsers(false);
    }
  }

  const filteredUsers = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return users;
    return users.filter(
      (u) =>
        (u.displayName || "").toLowerCase().includes(q) ||
        (u.username || "").toLowerCase().includes(q) ||
        (u.email || "").toLowerCase().includes(q)
    );
  }, [users, search]);

  async function handleToggleRegistration() {
    const next = !regOpen;
    setRegOpen(next);
    try {
      await setRegistrationOpen(next);
    } catch {
      setRegOpen(!next);
      setMsg("Gagal mengubah status pendaftaran.");
    }
  }

  async function handleToggleSelfDelete() {
    const next = !selfDeleteOn;
    setSelfDeleteOn(next);
    try {
      await setSelfDeleteEnabled(next);
    } catch {
      setSelfDeleteOn(!next);
      setMsg("Gagal mengubah pengaturan hapus akun.");
    }
  }

  function askToggleAdmin(target) {
    if (target.uid === user.uid) {
      setMsg("Anda tidak bisa mencabut status admin dari diri sendiri di sini.");
      return;
    }
    setMsg("");
    setRoleTarget({
      user: target,
      nextRole: target.role === "admin" ? "user" : "admin",
    });
  }

  async function handleConfirmToggleAdmin() {
    const { user: target, nextRole } = roleTarget;
    setBusyUid(target.uid);
    try {
      await setUserRole(target.uid, nextRole);
      await refreshUsers();
      setRoleTarget(null);
    } catch {
      setMsg("Gagal mengubah role. Periksa kembali Firestore Security Rules.");
      setRoleTarget(null);
    } finally {
      setBusyUid(null);
    }
  }

  function openRename(target) {
    setRenameTarget(target);
    setNewUsername(target.username || "");
    setRenameErr("");
  }

  async function handleConfirmRename() {
    setRenameErr("");
    const check = validateUsername(newUsername);
    if (!check.valid) {
      setRenameErr(check.errors[0]);
      return;
    }
    setRenameBusy(true);
    try {
      const key = newUsername.toLowerCase();
      if (key !== renameTarget.username) {
        const available = await isUsernameAvailable(key);
        if (!available) {
          setRenameErr("Username sudah dipakai.");
          setRenameBusy(false);
          return;
        }
      }
      await adminChangeUsername(renameTarget.uid, newUsername);
      setRenameTarget(null);
      await refreshUsers();
    } catch (err) {
      if (err.message === "cannot-modify-admin") {
        setRenameErr("Tidak bisa mengubah username akun admin lain.");
      } else if (err.message === "username-taken") {
        setRenameErr("Username baru saja diambil orang lain.");
      } else {
        setRenameErr("Gagal mengubah username.");
      }
    } finally {
      setRenameBusy(false);
    }
  }

  async function handleConfirmDelete() {
    setDeleteBusy(true);
    setMsg("");
    try {
      await adminDeleteUser(deleteTarget.uid);
      setDeleteTarget(null);
      await refreshUsers();
    } catch (err) {
      setMsg(err.message === "delete-failed" ? "Gagal menghapus akun." : err.message);
      setDeleteTarget(null);
    } finally {
      setDeleteBusy(false);
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

      <div className="setting-row">
        <div>
          <div className="setting-row__label">Izinkan pengguna hapus akun sendiri</div>
          <p className="hint-text">
            Kalau dimatikan, tombol "Hapus Akun Saya" di Setting pengguna
            akan dinonaktifkan sementara (ditegakkan di server, bukan cuma
            disembunyikan).
          </p>
        </div>
        {!loadingSelfDelete && (
          <button
            type="button"
            className="switch"
            role="switch"
            aria-checked={selfDeleteOn}
            onClick={handleToggleSelfDelete}
          >
            <span className="switch__thumb" />
          </button>
        )}
      </div>

      <div className="settings-divider" />

      <div className="admin-users-head">
        <h3 className="tab-subtitle" style={{ margin: 0 }}>
          Kelola pengguna{" "}
          <span className="hint-inline">
            ({filteredUsers.length} dari {users.length})
          </span>
        </h3>
        <input
          type="text"
          className="admin-search"
          placeholder="Cari nama, username, atau email..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {msg && <p className="error-text">{msg}</p>}

      {loadingUsers ? (
        <p className="hint-text">Memuat daftar pengguna...</p>
      ) : filteredUsers.length === 0 ? (
        <p className="hint-text">Tidak ada pengguna yang cocok dengan pencarian.</p>
      ) : (
        <div className="user-list">
          {filteredUsers.map((u) => {
            const isSelf = u.uid === user.uid;
            const isOtherAdmin = u.role === "admin" && !isSelf;
            return (
              <div className="user-row" key={u.uid}>
                <div className="user-row__info">
                  <div className="user-row__name">
                    {u.displayName || u.username}{" "}
                    {u.role === "admin" && <span className="badge">Admin</span>}
                    {isSelf && <span className="badge badge--self">Anda</span>}
                  </div>
                  <div className="user-row__sub">
                    @{u.username} · {u.email}
                  </div>
                </div>
                <div className="user-row__actions">
                  <button
                    className="btn btn--ghost btn--sm btn--fixed"
                    disabled={busyUid === u.uid || isSelf}
                    onClick={() => askToggleAdmin(u)}
                  >
                    {busyUid === u.uid ? "..." : u.role === "admin" ? "Cabut Admin" : "Jadikan Admin"}
                  </button>
                  <button
                    className="btn btn--ghost btn--sm btn--fixed"
                    disabled={isOtherAdmin}
                    title={isOtherAdmin ? "Tidak berlaku untuk akun admin lain" : "Ubah username"}
                    onClick={() => openRename(u)}
                  >
                    Ubah Username
                  </button>
                  <button
                    className="btn btn--danger btn--sm btn--fixed"
                    disabled={u.role === "admin"}
                    title={u.role === "admin" ? "Tidak berlaku untuk akun admin" : "Hapus akun"}
                    onClick={() => setDeleteTarget(u)}
                  >
                    Hapus Akun
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal ubah username */}
      {renameTarget && (
        <div className="confirm-backdrop" onClick={() => setRenameTarget(null)}>
          <div className="confirm-card" onClick={(e) => e.stopPropagation()}>
            <h3>Ubah username @{renameTarget.username}</h3>
            <div className="field">
              <label>Username baru</label>
              <input
                value={newUsername}
                onChange={(e) => setNewUsername(e.target.value)}
                autoFocus
              />
            </div>
            {renameErr && <p className="error-text">{renameErr}</p>}
            <div className="confirm-actions">
              <button
                className="btn btn--ghost"
                onClick={() => setRenameTarget(null)}
                disabled={renameBusy}
              >
                Batal
              </button>
              <button className="btn btn--primary" onClick={handleConfirmRename} disabled={renameBusy}>
                {renameBusy ? "Menyimpan..." : "Simpan"}
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={!!roleTarget}
        title={
          roleTarget?.nextRole === "admin"
            ? `Jadikan @${roleTarget?.user.username} admin?`
            : `Cabut status admin @${roleTarget?.user.username}?`
        }
        message={
          roleTarget?.nextRole === "admin"
            ? "Akun ini akan mendapat akses penuh ke menu Admin, termasuk mengelola pengguna lain dan status pendaftaran."
            : "Akun ini akan kembali menjadi pengguna biasa dan kehilangan akses ke menu Admin."
        }
        confirmLabel={roleTarget?.nextRole === "admin" ? "Ya, Jadikan Admin" : "Ya, Cabut Admin"}
        danger={roleTarget?.nextRole !== "admin"}
        busy={busyUid === roleTarget?.user.uid}
        onCancel={() => setRoleTarget(null)}
        onConfirm={handleConfirmToggleAdmin}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        title={`Hapus akun @${deleteTarget?.username || ""}?`}
        message="Tindakan ini permanen — akun, profil, dan akses login pengguna ini akan dihapus sepenuhnya dan tidak bisa dikembalikan."
        confirmLabel="Ya, Hapus Akun"
        danger
        busy={deleteBusy}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={handleConfirmDelete}
      />
    </div>
  );
}
