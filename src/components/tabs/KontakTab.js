"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import {
  subscribeContacts,
  saveContacts,
  contactHref,
  DEFAULT_CONTACTS,
} from "@/lib/contacts";
import ConfirmDialog from "@/components/ConfirmDialog";

export default function KontakTab() {
  const { isAdmin } = useAuth();
  const [items, setItems] = useState(DEFAULT_CONTACTS);
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(true);

  const [editingId, setEditingId] = useState(null); // id item yang sedang diedit, atau "new"
  const [editLabel, setEditLabel] = useState("");
  const [editTitle, setEditTitle] = useState("");
  const [editValue, setEditValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [confirmingRemove, setConfirmingRemove] = useState(false);

  const [editingDesc, setEditingDesc] = useState(false);
  const [descDraft, setDescDraft] = useState("");
  const [descBusy, setDescBusy] = useState(false);

  useEffect(() => {
    const unsub = subscribeContacts(({ items: i, description: d }) => {
      setItems(i);
      setDescription(d);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  function openEdit(item) {
    setEditingId(item.id);
    setEditLabel(item.label);
    setEditTitle(item.title || "");
    setEditValue(item.value);
    setErr("");
  }

  function openNew() {
    setEditingId("new");
    setEditLabel("");
    setEditTitle("");
    setEditValue("");
    setErr("");
  }

  function closeEdit() {
    setEditingId(null);
    setConfirmingRemove(false);
  }

  async function handleSaveItem() {
    if (!editLabel.trim()) {
      setErr("Nama jenis kontak wajib diisi.");
      return;
    }
    setBusy(true);
    try {
      let nextItems;
      const payload = { label: editLabel.trim(), title: editTitle.trim(), value: editValue.trim() };
      if (editingId === "new") {
        const id = `${editLabel.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${Date.now()
          .toString(36)
          .slice(-4)}`;
        nextItems = [...items, { id, ...payload }];
      } else {
        nextItems = items.map((it) => (it.id === editingId ? { ...it, ...payload } : it));
      }
      await saveContacts({ items: nextItems, description });
      setEditingId(null);
    } catch {
      setErr("Gagal menyimpan.");
    } finally {
      setBusy(false);
    }
  }

  async function handleConfirmRemoveItem() {
    setBusy(true);
    try {
      await saveContacts({ items: items.filter((it) => it.id !== editingId), description });
      setEditingId(null);
      setConfirmingRemove(false);
    } catch {
      setErr("Gagal menghapus.");
      setConfirmingRemove(false);
    } finally {
      setBusy(false);
    }
  }

  function openEditDesc() {
    setDescDraft(description);
    setEditingDesc(true);
  }

  async function handleSaveDesc() {
    setDescBusy(true);
    try {
      await saveContacts({ items, description: descDraft.trim() });
      setEditingDesc(false);
    } catch {
      // biarkan modal tetap terbuka kalau gagal
    } finally {
      setDescBusy(false);
    }
  }

  if (loading) return <div />;

  return (
    <div>
      <h2 className="tab-title">Contact</h2>
      <p className="hint-text" style={{ marginBottom: 18 }}>
        Informasi kontak pembuat aplikasi ini.
      </p>

      {items.map((item) => {
        const href = contactHref(item.value);
        const displayText = item.title || item.value;
        return (
          <div className="contact-item" key={item.id}>
            <span className="contact-item__label">
              {isAdmin && (
                <button
                  type="button"
                  className="contact-edit-btn"
                  onClick={() => openEdit(item)}
                  title="Edit kontak ini"
                  aria-label="Edit kontak ini"
                >
                  <EditIcon />
                </button>
              )}
              {item.label}
            </span>
            {item.value ? (
              href ? (
                <a className="contact-item__link" href={href} target="_blank" rel="noopener noreferrer">
                  {displayText}
                </a>
              ) : (
                <span className="contact-item__value">{displayText}</span>
              )
            ) : (
              <span className="contact-item__value">Kontak menyusul</span>
            )}
          </div>
        );
      })}

      {isAdmin && (
        <button type="button" className="btn btn--ghost btn--sm" style={{ marginTop: 10 }} onClick={openNew}>
          + Tambah kontak
        </button>
      )}

      {(description || isAdmin) && (
        <div className="contact-desc">
          {description && <p className="contact-desc__text">{description}</p>}
          {isAdmin && (
            <button type="button" className="btn btn--ghost btn--sm" onClick={openEditDesc}>
              Edit deskripsi
            </button>
          )}
        </div>
      )}

      {/* Modal edit item kontak */}
      {editingId && (
        <div className="confirm-backdrop" onClick={closeEdit}>
          <div className="confirm-card confirm-card--wide" onClick={(e) => e.stopPropagation()}>
            <h3>{editingId === "new" ? "Tambah kontak" : "Edit kontak"}</h3>
            <div className="field">
              <label>Nama jenis kontak</label>
              <input value={editLabel} onChange={(e) => setEditLabel(e.target.value)} placeholder="mis. Instagram" autoFocus />
            </div>
            <div className="field">
              <label>
                Judul kontak <span className="hint-inline">(teks yang tampil, opsional)</span>
              </label>
              <input
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                placeholder="mis. @gramofon.app — kosongkan untuk pakai isi tautan apa adanya"
              />
            </div>
            <div className="field">
              <label>Tautan / isi</label>
              <input
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                placeholder='Kosongkan untuk tampilkan "Kontak menyusul"'
              />
            </div>
            {err && <p className="error-text">{err}</p>}
            <div className="confirm-actions" style={{ justifyContent: "space-between" }}>
              {editingId !== "new" ? (
                <button className="btn btn--danger btn--sm" onClick={() => setConfirmingRemove(true)} disabled={busy}>
                  Hapus
                </button>
              ) : (
                <span />
              )}
              <div style={{ display: "flex", gap: 8 }}>
                <button className="btn btn--ghost" onClick={closeEdit} disabled={busy}>
                  Batal
                </button>
                <button className="btn btn--primary" onClick={handleSaveItem} disabled={busy}>
                  {busy ? "Menyimpan..." : "Simpan"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirmingRemove}
        title="Hapus kontak ini?"
        message={`Jenis kontak "${editLabel}" akan dihapus dari halaman Contact dan tidak bisa dikembalikan.`}
        confirmLabel="Ya, Hapus"
        danger
        busy={busy}
        onCancel={() => setConfirmingRemove(false)}
        onConfirm={handleConfirmRemoveItem}
      />

      {/* Modal edit deskripsi */}
      {editingDesc && (
        <div className="confirm-backdrop" onClick={() => setEditingDesc(false)}>
          <div className="confirm-card" onClick={(e) => e.stopPropagation()}>
            <h3>Edit deskripsi</h3>
            <div className="field">
              <textarea
                value={descDraft}
                onChange={(e) => setDescDraft(e.target.value)}
                placeholder="Kosongkan untuk menyembunyikan deskripsi"
                style={{ minHeight: 100 }}
                autoFocus
              />
            </div>
            <div className="confirm-actions">
              <button className="btn btn--ghost" onClick={() => setEditingDesc(false)} disabled={descBusy}>
                Batal
              </button>
              <button className="btn btn--primary" onClick={handleSaveDesc} disabled={descBusy}>
                {descBusy ? "Menyimpan..." : "Simpan"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function EditIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
      <path
        d="M11 2.5 13.5 5 5.5 13 2.5 13.5 3 10.5 11 2.5z"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
    </svg>
  );
}
