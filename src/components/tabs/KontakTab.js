"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import {
  subscribeContacts,
  saveContacts,
  contactHref,
  DEFAULT_CONTACTS,
} from "@/lib/contacts";

export default function KontakTab() {
  const { isAdmin } = useAuth();
  const [items, setItems] = useState(DEFAULT_CONTACTS);
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(true);

  const [editingId, setEditingId] = useState(null); // id item yang sedang diedit, atau "new"
  const [editLabel, setEditLabel] = useState("");
  const [editValue, setEditValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

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
    setEditValue(item.value);
    setErr("");
  }

  function openNew() {
    setEditingId("new");
    setEditLabel("");
    setEditValue("");
    setErr("");
  }

  function closeEdit() {
    setEditingId(null);
  }

  async function handleSaveItem() {
    if (!editLabel.trim()) {
      setErr("Nama jenis kontak wajib diisi.");
      return;
    }
    setBusy(true);
    try {
      let nextItems;
      if (editingId === "new") {
        const id = `${editLabel.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${Date.now()
          .toString(36)
          .slice(-4)}`;
        nextItems = [...items, { id, label: editLabel.trim(), value: editValue.trim() }];
      } else {
        nextItems = items.map((it) =>
          it.id === editingId ? { ...it, label: editLabel.trim(), value: editValue.trim() } : it
        );
      }
      await saveContacts({ items: nextItems, description });
      setEditingId(null);
    } catch {
      setErr("Gagal menyimpan.");
    } finally {
      setBusy(false);
    }
  }

  async function handleRemoveItem(id) {
    setBusy(true);
    try {
      await saveContacts({ items: items.filter((it) => it.id !== id), description });
      setEditingId(null);
    } catch {
      setErr("Gagal menghapus.");
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
      // biarkan modal tetap terbuka kalau gagal, tanpa pesan berlebihan
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
                  {item.value}
                </a>
              ) : (
                <span className="contact-item__value">{item.value}</span>
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

      {/* Deskripsi: tanpa judul "Deskripsi" sama sekali -- hanya isinya.
          Hilang total kalau kosong (kecuali admin, yang tetap melihat
          tombol Edit supaya bisa mengisi pertama kali). */}
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
          <div className="confirm-card" onClick={(e) => e.stopPropagation()}>
            <h3>{editingId === "new" ? "Tambah kontak" : "Edit kontak"}</h3>
            <div className="field">
              <label>Nama jenis kontak</label>
              <input value={editLabel} onChange={(e) => setEditLabel(e.target.value)} placeholder="mis. Instagram" autoFocus />
            </div>
            <div className="field">
              <label>Tautan / isi</label>
              <input
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                placeholder="Kosongkan untuk tampilkan 'Kontak menyusul'"
              />
            </div>
            {err && <p className="error-text">{err}</p>}
            <div className="confirm-actions" style={{ justifyContent: "space-between" }}>
              {editingId !== "new" ? (
                <button className="btn btn--danger btn--sm" onClick={() => handleRemoveItem(editingId)} disabled={busy}>
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
