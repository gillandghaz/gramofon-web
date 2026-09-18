"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import {
  isRegistrationOpen,
  setRegistrationOpen,
  isSelfDeleteEnabled,
  setSelfDeleteEnabled,
  getDefaultStorageLimitMB,
  setDefaultStorageLimitMB,
} from "@/lib/settings";
import {
  listAllUsers,
  setUserRole,
  adminChangeUsername,
  adminDeleteUser,
  setUserStorageLimit,
  clearUserStorageLimit,
} from "@/lib/admin";
import { isUsernameAvailable } from "@/lib/profile";
import { validateUsername } from "@/lib/validators";
import {
  listNotifications,
  sendNotification,
  deleteNotification,
} from "@/lib/notifications";
import { listAllMedia, adminDeleteMedia, formatBytes } from "@/lib/media";
import ConfirmDialog from "@/components/ConfirmDialog";

function formatDate(ts) {
  if (!ts?.toDate) return "";
  return ts.toDate().toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const SECTIONS = [
  { key: "umum", label: "Umum" },
  { key: "pengguna", label: "Pengguna" },
  { key: "notifikasi", label: "Notifikasi" },
  { key: "media", label: "Media" },
];
const PAGE_SIZE = 10;

// Komponen paginasi kecil, dipakai ulang di Pengguna & Media.
function Pagination({ page, totalPages, onChange }) {
  if (totalPages <= 1) return null;
  const pages = Array.from({ length: totalPages }, (_, i) => i + 1);
  return (
    <div className="pagination">
      <button className="pagination__btn" disabled={page === 1} onClick={() => onChange(page - 1)}>
        ‹
      </button>
      {pages.map((p) => (
        <button
          key={p}
          className={"pagination__btn" + (p === page ? " is-active" : "")}
          onClick={() => onChange(p)}
        >
          {p}
        </button>
      ))}
      <button
        className="pagination__btn"
        disabled={page === totalPages}
        onClick={() => onChange(page + 1)}
      >
        ›
      </button>
    </div>
  );
}

export default function AdminTab() {
  const { user } = useAuth();
  const [section, setSection] = useState("umum");

  return (
    <div>
      <h2 className="tab-title">Admin</h2>

      <div className="admin-subnav">
        {SECTIONS.map((s) => (
          <button
            key={s.key}
            type="button"
            className={"admin-subnav__btn" + (section === s.key ? " is-active" : "")}
            onClick={() => setSection(s.key)}
          >
            {s.label}
          </button>
        ))}
      </div>

      {section === "umum" && <UmumSection />}
      {section === "pengguna" && <PenggunaSection currentUser={user} />}
      {section === "notifikasi" && <NotifikasiSection />}
      {section === "media" && <MediaSection />}
    </div>
  );
}

// ======================================================================
// UMUM
// ======================================================================
function UmumSection() {
  const [regOpen, setRegOpen] = useState(true);
  const [loadingReg, setLoadingReg] = useState(true);
  const [regMsg, setRegMsg] = useState("");
  const [selfDeleteOn, setSelfDeleteOn] = useState(true);
  const [loadingSelfDelete, setLoadingSelfDelete] = useState(true);
  const [selfDeleteMsg, setSelfDeleteMsg] = useState("");
  const [defaultQuota, setDefaultQuota] = useState(200);
  const [loadingQuota, setLoadingQuota] = useState(true);
  const [quotaInput, setQuotaInput] = useState("200");
  const [quotaScope, setQuotaScope] = useState("unset");
  const [confirmingQuota, setConfirmingQuota] = useState(false);
  const [quotaBusy, setQuotaBusy] = useState(false);
  const [quotaMsg, setQuotaMsg] = useState("");

  useEffect(() => {
    isRegistrationOpen().then((v) => {
      setRegOpen(v);
      setLoadingReg(false);
    });
    isSelfDeleteEnabled().then((v) => {
      setSelfDeleteOn(v);
      setLoadingSelfDelete(false);
    });
    getDefaultStorageLimitMB().then((v) => {
      setDefaultQuota(v);
      setQuotaInput(String(v));
      setLoadingQuota(false);
    });
  }, []);

  async function handleToggleRegistration() {
    const next = !regOpen;
    setRegOpen(next);
    try {
      await setRegistrationOpen(next);
    } catch {
      setRegOpen(!next);
      setRegMsg("Gagal mengubah status pendaftaran.");
    }
  }

  async function handleToggleSelfDelete() {
    const next = !selfDeleteOn;
    setSelfDeleteOn(next);
    try {
      await setSelfDeleteEnabled(next);
    } catch {
      setSelfDeleteOn(!next);
      setSelfDeleteMsg("Gagal mengubah pengaturan hapus akun.");
    }
  }

  function handleSaveQuotaClick() {
    const mb = parseInt(quotaInput, 10);
    setQuotaMsg("");
    if (!mb || mb <= 0) {
      setQuotaMsg("Isi angka batas penyimpanan yang valid (MB).");
      return;
    }
    setConfirmingQuota(true);
  }

  async function handleConfirmSaveQuota() {
    const mb = parseInt(quotaInput, 10);
    setQuotaBusy(true);
    try {
      const affected = await setDefaultStorageLimitMB(mb, quotaScope);
      setDefaultQuota(mb);
      setConfirmingQuota(false);
      setQuotaMsg(
        quotaScope === "all" && affected > 0
          ? `Default disimpan. ${affected} akun dengan batas khusus direset ke default baru.`
          : "Batas penyimpanan default disimpan."
      );
    } catch {
      setQuotaMsg("Gagal menyimpan batas penyimpanan default.");
      setConfirmingQuota(false);
    } finally {
      setQuotaBusy(false);
    }
  }

  return (
    <div>
      <div className="setting-row">
        <div className="setting-row__label">
          <span>Pendaftaran akun baru</span>
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
      {regMsg && <p className="error-text">{regMsg}</p>}

      <div className="setting-row">
        <div className="setting-row__label">
          <span>Izinkan pengguna hapus akun sendiri</span>
          <p className="hint-text">
            Kalau dimatikan, tombol "Hapus Akun Saya" di Setting pengguna
            dinonaktifkan sementara (ditegakkan di server).
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
      {selfDeleteMsg && <p className="error-text">{selfDeleteMsg}</p>}

      <div className="settings-divider" />

      <h3 className="tab-subtitle">Batas penyimpanan pengguna</h3>
      <p className="hint-text" style={{ marginBottom: 10 }}>
        Batas per-akun khusus diatur di sub-tab "Pengguna".
      </p>
      {!loadingQuota && (
        <div className="quota-form">
          <div className="quota-form__row">
            <label className="hint-text" style={{ margin: 0 }}>
              Default per akun:
            </label>
            <input
              type="number"
              min="1"
              value={quotaInput}
              onChange={(e) => setQuotaInput(e.target.value)}
            />
            <span className="hint-text">MB (saat ini: {defaultQuota}MB)</span>
          </div>

          <div className="quota-scope">
            <label>
              <input
                type="radio"
                name="quotaScope"
                checked={quotaScope === "unset"}
                onChange={() => setQuotaScope("unset")}
              />
              <span>
                Terapkan hanya untuk pengguna yang <strong>belum</strong>{" "}
                diatur khusus (yang sudah punya batas kustom tetap dengan
                angkanya sendiri).
              </span>
            </label>
            <label>
              <input
                type="radio"
                name="quotaScope"
                checked={quotaScope === "all"}
                onChange={() => setQuotaScope("all")}
              />
              <span>
                Terapkan ke <strong>SEMUA</strong> pengguna — menghapus batas
                kustom yang sudah pernah diatur, semua kembali memakai
                default baru.
              </span>
            </label>
          </div>

          {/* Pesan sukses/gagal ditampilkan DI SINI (dalam kotak kuota),
              bukan di puncak tab — supaya tidak ikut nongol di sub-tab lain. */}
          {quotaMsg && <p className="hint-text" style={{ marginBottom: 10 }}>{quotaMsg}</p>}

          <button className="btn btn--primary btn--sm" onClick={handleSaveQuotaClick}>
            Simpan
          </button>
        </div>
      )}

      <ConfirmDialog
        open={confirmingQuota}
        title="Simpan batas penyimpanan default?"
        message={
          quotaScope === "all"
            ? `Default menjadi ${quotaInput}MB, dan SEMUA batas khusus yang sudah diatur akan dihapus (semua pengguna kembali memakai angka default ini).`
            : `Default menjadi ${quotaInput}MB. Pengguna yang sudah punya batas khusus tidak berubah.`
        }
        confirmLabel="Ya, Simpan"
        danger={quotaScope === "all"}
        busy={quotaBusy}
        onCancel={() => setConfirmingQuota(false)}
        onConfirm={handleConfirmSaveQuota}
      />
    </div>
  );
}

// ======================================================================
// PENGGUNA — dengan paginasi 10/halaman
// ======================================================================
function PenggunaSection({ currentUser }) {
  const [users, setUsers] = useState([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [busyUid, setBusyUid] = useState(null);
  const [msg, setMsg] = useState("");
  const [defaultQuota, setDefaultQuota] = useState(200);

  const [roleTarget, setRoleTarget] = useState(null);
  const [renameTarget, setRenameTarget] = useState(null);
  const [newUsername, setNewUsername] = useState("");
  const [renameErr, setRenameErr] = useState("");
  const [renameBusy, setRenameBusy] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [quotaTarget, setQuotaTarget] = useState(null);
  const [quotaTargetInput, setQuotaTargetInput] = useState("");
  const [quotaTargetBusy, setQuotaTargetBusy] = useState(false);
  const [quotaTargetErr, setQuotaTargetErr] = useState("");

  useEffect(() => {
    refreshUsers();
    getDefaultStorageLimitMB().then(setDefaultQuota);
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

  // Reset ke halaman 1 setiap kali pencarian berubah, supaya tidak
  // "nyangkut" di halaman kosong.
  useEffect(() => {
    setPage(1);
  }, [search]);

  const totalPages = Math.max(1, Math.ceil(filteredUsers.length / PAGE_SIZE));
  const pageUsers = filteredUsers.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  function askToggleAdmin(target) {
    if (target.uid === currentUser.uid) {
      setMsg("Anda tidak bisa mencabut status admin dari diri sendiri di sini.");
      return;
    }
    setMsg("");
    setRoleTarget({ user: target, nextRole: target.role === "admin" ? "user" : "admin" });
  }

  async function handleConfirmToggleAdmin() {
    const { user: target, nextRole } = roleTarget;
    setBusyUid(target.uid);
    try {
      await setUserRole(target.uid, nextRole);
      await refreshUsers();
      setRoleTarget(null);
    } catch {
      setMsg("Gagal mengubah role.");
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
      setRenameErr(
        err.message === "username-taken" ? "Username baru saja diambil orang lain." : "Gagal mengubah username."
      );
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

  function openQuotaTarget(target) {
    setQuotaTarget(target);
    setQuotaTargetInput(target.storageLimitMB !== undefined ? String(target.storageLimitMB) : "");
    setQuotaTargetErr("");
  }

  async function handleSaveQuotaTarget() {
    const mb = parseInt(quotaTargetInput, 10);
    if (!mb || mb <= 0) {
      setQuotaTargetErr("Isi angka batas penyimpanan yang valid (MB).");
      return;
    }
    setQuotaTargetBusy(true);
    try {
      await setUserStorageLimit(quotaTarget.uid, mb);
      setQuotaTarget(null);
      await refreshUsers();
    } catch {
      setQuotaTargetErr("Gagal menyimpan.");
    } finally {
      setQuotaTargetBusy(false);
    }
  }

  async function handleResetQuotaTarget() {
    setQuotaTargetBusy(true);
    try {
      await clearUserStorageLimit(quotaTarget.uid);
      setQuotaTarget(null);
      await refreshUsers();
    } catch {
      setQuotaTargetErr("Gagal mereset ke default.");
    } finally {
      setQuotaTargetBusy(false);
    }
  }

  return (
    <div>
      <div className="admin-users-head">
        <h3 className="tab-subtitle" style={{ margin: 0 }}>
          {filteredUsers.length} dari {users.length} pengguna
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
        <>
          <div className="user-list">
            {pageUsers.map((u) => {
              const isSelf = u.uid === currentUser.uid;
              const hasCustomQuota = u.storageLimitMB !== undefined;
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
                    <div className="user-row__quota">
                      Batas: {hasCustomQuota ? `${u.storageLimitMB}MB (khusus)` : `${defaultQuota}MB (default)`}
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
                    <button className="btn btn--ghost btn--sm btn--fixed" onClick={() => openRename(u)}>
                      Ubah Username
                    </button>
                    <button className="btn btn--ghost btn--sm btn--fixed" onClick={() => openQuotaTarget(u)}>
                      Batas Simpan
                    </button>
                    <button
                      className="btn btn--danger btn--sm btn--fixed"
                      disabled={isSelf}
                      title={isSelf ? "Gunakan Setting untuk hapus akun sendiri" : "Hapus akun"}
                      onClick={() => setDeleteTarget(u)}
                    >
                      Hapus Akun
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
          <Pagination page={page} totalPages={totalPages} onChange={setPage} />
        </>
      )}

      {renameTarget && (
        <div className="confirm-backdrop" onClick={() => setRenameTarget(null)}>
          <div className="confirm-card" onClick={(e) => e.stopPropagation()}>
            <h3>Ubah username @{renameTarget.username}</h3>
            <div className="field">
              <label>Username baru</label>
              <input value={newUsername} onChange={(e) => setNewUsername(e.target.value)} autoFocus />
            </div>
            {renameErr && <p className="error-text">{renameErr}</p>}
            <div className="confirm-actions">
              <button className="btn btn--ghost" onClick={() => setRenameTarget(null)} disabled={renameBusy}>
                Batal
              </button>
              <button className="btn btn--primary" onClick={handleConfirmRename} disabled={renameBusy}>
                {renameBusy ? "Menyimpan..." : "Simpan"}
              </button>
            </div>
          </div>
        </div>
      )}

      {quotaTarget && (
        <div className="confirm-backdrop" onClick={() => setQuotaTarget(null)}>
          <div className="confirm-card" onClick={(e) => e.stopPropagation()}>
            <h3>Batas penyimpanan @{quotaTarget.username}</h3>
            <div className="field">
              <label>Batas khusus (MB)</label>
              <input
                type="number"
                min="1"
                value={quotaTargetInput}
                onChange={(e) => setQuotaTargetInput(e.target.value)}
                placeholder={`Default: ${defaultQuota}`}
                autoFocus
              />
            </div>
            {quotaTargetErr && <p className="error-text">{quotaTargetErr}</p>}
            <div className="confirm-actions">
              <button className="btn btn--ghost" onClick={handleResetQuotaTarget} disabled={quotaTargetBusy} title="Kembali ke default">
                Gunakan Default
              </button>
              <button className="btn btn--primary" onClick={handleSaveQuotaTarget} disabled={quotaTargetBusy}>
                {quotaTargetBusy ? "Menyimpan..." : "Simpan"}
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
            ? "Akun ini akan mendapat akses penuh ke menu Admin."
            : "Akun ini akan kembali menjadi pengguna biasa."
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
        message="Tindakan ini permanen — akun, profil, dan akses login pengguna ini (termasuk admin lain) akan dihapus sepenuhnya."
        confirmLabel="Ya, Hapus Akun"
        danger
        busy={deleteBusy}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={handleConfirmDelete}
      />
    </div>
  );
}

// ======================================================================
// NOTIFIKASI
// ======================================================================
function NotifikasiSection() {
  const [notifTitle, setNotifTitle] = useState("");
  const [notifMessage, setNotifMessage] = useState("");
  const [notifs, setNotifs] = useState([]);
  const [loadingNotifs, setLoadingNotifs] = useState(true);
  const [confirmingSend, setConfirmingSend] = useState(false);
  const [sendBusy, setSendBusy] = useState(false);
  const [notifErr, setNotifErr] = useState("");
  const [manageErr, setManageErr] = useState("");
  const [deleteNotifTarget, setDeleteNotifTarget] = useState(null);
  const [deleteNotifBusy, setDeleteNotifBusy] = useState(false);

  useEffect(() => {
    refreshNotifs();
  }, []);

  async function refreshNotifs() {
    setLoadingNotifs(true);
    try {
      setNotifs(await listNotifications());
    } finally {
      setLoadingNotifs(false);
    }
  }

  function handleSendClick() {
    setNotifErr("");
    if (!notifTitle.trim() || !notifMessage.trim()) {
      setNotifErr("Judul dan isi pesan wajib diisi.");
      return;
    }
    setConfirmingSend(true);
  }

  async function handleConfirmSend() {
    setSendBusy(true);
    try {
      await sendNotification({ title: notifTitle, message: notifMessage });
      setNotifTitle("");
      setNotifMessage("");
      setConfirmingSend(false);
      await refreshNotifs();
    } catch {
      setNotifErr("Gagal mengirim notifikasi.");
      setConfirmingSend(false);
    } finally {
      setSendBusy(false);
    }
  }

  async function handleConfirmDeleteNotif() {
    setDeleteNotifBusy(true);
    try {
      await deleteNotification(deleteNotifTarget.id);
      setDeleteNotifTarget(null);
      await refreshNotifs();
    } catch {
      setManageErr("Gagal menghapus notifikasi.");
      setDeleteNotifTarget(null);
    } finally {
      setDeleteNotifBusy(false);
    }
  }

  return (
    <div>
      <h3 className="tab-subtitle">Kirim Notifikasi</h3>
      <p className="hint-text" style={{ marginBottom: 10 }}>
        Dikirim ke seluruh pengguna, selalu tampil dengan nama pengirim "Gramofon".
      </p>
      <div className="notif-compose">
        <div className="field">
          <label>Judul</label>
          <input value={notifTitle} onChange={(e) => setNotifTitle(e.target.value)} maxLength={80} />
        </div>
        <div className="field">
          <label>
            Pesan{" "}
            <span className="hint-inline">({notifMessage.length}/5000)</span>
          </label>
          <textarea
            value={notifMessage}
            onChange={(e) => setNotifMessage(e.target.value)}
            maxLength={5000}
            style={{ minHeight: 140 }}
          />
          <p className="hint-text" style={{ marginTop: 4 }}>
            Sisipkan tautan dengan{" "}
            <code>[[https://contoh.com]]</code> atau{" "}
            <code>[[https://contoh.com|Teks tautan]]</code> untuk kasih label sendiri.
          </p>
        </div>
        {notifErr && <p className="error-text">{notifErr}</p>}
        <button className="btn btn--primary btn--sm" onClick={handleSendClick}>
          Kirim ke Semua Pengguna
        </button>
      </div>

      <div className="settings-divider" />

      <h3 className="tab-subtitle">Kelola Notifikasi Terkirim</h3>
      {manageErr && <p className="error-text">{manageErr}</p>}
      {loadingNotifs ? (
        <p className="hint-text">Memuat...</p>
      ) : notifs.length === 0 ? (
        <p className="hint-text">Belum ada notifikasi yang dikirim.</p>
      ) : (
        notifs.map((n) => (
          <div className="notif-manage-item" key={n.id}>
            <div className="notif-manage-item__body">
              <div className="notif-manage-item__title">{n.title}</div>
              <div className="notif-manage-item__msg">{n.message}</div>
              <div className="hint-text" style={{ marginTop: 4 }}>{formatDate(n.createdAt)}</div>
            </div>
            <button className="btn btn--danger btn--sm" onClick={() => setDeleteNotifTarget(n)}>
              Hapus
            </button>
          </div>
        ))
      )}

      <ConfirmDialog
        open={confirmingSend}
        title="Kirim notifikasi ini?"
        message={`Notifikasi "${notifTitle}" akan langsung terkirim ke SEMUA pengguna sebagai pesan dari "Gramofon".`}
        confirmLabel="Ya, Kirim"
        busy={sendBusy}
        onCancel={() => setConfirmingSend(false)}
        onConfirm={handleConfirmSend}
      />

      <ConfirmDialog
        open={!!deleteNotifTarget}
        title="Hapus notifikasi ini?"
        message="Notifikasi akan hilang sepenuhnya dari daftar semua pengguna, tanpa bekas apa pun."
        confirmLabel="Ya, Hapus"
        danger
        busy={deleteNotifBusy}
        onCancel={() => setDeleteNotifTarget(null)}
        onConfirm={handleConfirmDeleteNotif}
      />
    </div>
  );
}

// ======================================================================
// MEDIA — lihat semua / per-pengguna, urutkan alfabet/ukuran/terbaru
// ======================================================================
function MediaSection() {
  const [items, setItems] = useState([]);
  const [userMap, setUserMap] = useState({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [groupMode, setGroupMode] = useState("all"); // "all" | "byUser"
  const [sortBy, setSortBy] = useState("newest"); // newest | title | sizeDesc | sizeAsc
  const [page, setPage] = useState(1);
  const [msg, setMsg] = useState("");
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  useEffect(() => {
    refresh();
  }, []);

  async function refresh() {
    setLoading(true);
    try {
      const [media, users] = await Promise.all([listAllMedia(), listAllUsers()]);
      setItems(media);
      const map = {};
      for (const u of users) map[u.uid] = u.displayName || `@${u.username}` || u.uid;
      setUserMap(map);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    setPage(1);
  }, [search, groupMode, sortBy]);

  function sortItems(list) {
    const copy = [...list];
    if (sortBy === "title") copy.sort((a, b) => (a.title || "").localeCompare(b.title || ""));
    else if (sortBy === "sizeDesc") copy.sort((a, b) => (b.bytes || 0) - (a.bytes || 0));
    else if (sortBy === "sizeAsc") copy.sort((a, b) => (a.bytes || 0) - (b.bytes || 0));
    else
      copy.sort((a, b) => {
        const at = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
        const bt = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
        return bt - at;
      });
    return copy;
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const base = q ? items.filter((m) => (m.title || "").toLowerCase().includes(q)) : items;
    return sortItems(base);
  }, [items, search, sortBy]);

  const totalBytes = items.reduce((sum, m) => sum + (m.bytes || 0), 0);

  async function handleConfirmDelete() {
    setDeleteBusy(true);
    try {
      await adminDeleteMedia(deleteTarget.id);
      setDeleteTarget(null);
      await refresh();
    } catch {
      setMsg("Gagal menghapus media.");
      setDeleteTarget(null);
    } finally {
      setDeleteBusy(false);
    }
  }

  function renderRow(m) {
    return (
      <div className="user-row" key={m.id}>
        <div className="user-row__info">
          <div className="user-row__name">{m.title}</div>
          <div className="user-row__sub">
            {m.resourceType} · {m.format?.toUpperCase()} · {formatBytes(m.bytes)}
          </div>
          <div className="user-row__quota">{formatDate(m.createdAt)}</div>
        </div>
        <div className="user-row__actions">
          <a className="btn btn--ghost btn--sm btn--fixed" href={m.url} target="_blank" rel="noopener noreferrer">
            Buka
          </a>
          <button className="btn btn--danger btn--sm btn--fixed" onClick={() => setDeleteTarget(m)}>
            Hapus
          </button>
        </div>
      </div>
    );
  }

  let bodyContent;
  if (loading) {
    bodyContent = <p className="hint-text">Memuat...</p>;
  } else if (items.length === 0) {
    bodyContent = (
      <p className="hint-text">
        Belum ada video/musik yang diunggah pengguna. Daftar ini akan
        otomatis terisi begitu fitur unggah untuk pengguna sudah aktif.
      </p>
    );
  } else if (filtered.length === 0) {
    bodyContent = <p className="hint-text">Tidak ada yang cocok dengan pencarian.</p>;
  } else if (groupMode === "byUser") {
    const groups = new Map();
    for (const m of filtered) {
      const key = m.uid;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(m);
    }
    bodyContent = Array.from(groups.entries()).map(([uid, list]) => {
      const groupBytes = list.reduce((s, m) => s + (m.bytes || 0), 0);
      return (
        <div className="media-group" key={uid}>
          <div className="media-group__head">
            <strong>{userMap[uid] || uid}</strong>
            <span className="hint-text">
              {list.length} berkas · {formatBytes(groupBytes)}
            </span>
          </div>
          <div className="user-list">{list.map(renderRow)}</div>
        </div>
      );
    });
  } else {
    const pageItems = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
    const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
    bodyContent = (
      <>
        <div className="user-list">{pageItems.map(renderRow)}</div>
        <Pagination page={page} totalPages={totalPages} onChange={setPage} />
      </>
    );
  }

  return (
    <div>
      <div className="admin-users-head">
        <h3 className="tab-subtitle" style={{ margin: 0 }}>
          {filtered.length} dari {items.length} berkas{" "}
          <span className="hint-inline">(total {formatBytes(totalBytes)})</span>
        </h3>
        <input
          type="text"
          className="admin-search"
          placeholder="Cari judul..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="media-controls">
        <div className="media-controls__field">
          <label>Tampilkan</label>
          <select value={groupMode} onChange={(e) => setGroupMode(e.target.value)}>
            <option value="all">Semua media</option>
            <option value="byUser">Per pengguna</option>
          </select>
        </div>
        <div className="media-controls__field">
          <label>Urutkan</label>
          <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
            <option value="newest">Terbaru</option>
            <option value="title">Judul (A-Z)</option>
            <option value="sizeDesc">Ukuran terbesar</option>
            <option value="sizeAsc">Ukuran terkecil</option>
          </select>
        </div>
      </div>

      {msg && <p className="error-text">{msg}</p>}

      {bodyContent}

      <ConfirmDialog
        open={!!deleteTarget}
        title={`Hapus "${deleteTarget?.title}"?`}
        message="File ini akan dihapus permanen dari penyimpanan (Cloudinary) dan tidak bisa dikembalikan."
        confirmLabel="Ya, Hapus"
        danger
        busy={deleteBusy}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={handleConfirmDelete}
      />
    </div>
  );
}
