"use client";

import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import RequireAuth from "@/components/RequireAuth";
import NotificationBell from "@/components/NotificationBell";
import ProfileMenu from "@/components/ProfileMenu";
import ConfirmDialog from "@/components/ConfirmDialog";
import { listMyMedia, uploadMediaFile, deleteMedia, formatBytes } from "@/lib/media";
import { getDefaultStorageLimitMB } from "@/lib/settings";

const ACCEPTED_TYPES = "video/*,audio/*";

export default function AppPage() {
  return (
    <RequireAuth>
      <AppInner />
    </RequireAuth>
  );
}

function AppInner() {
  const { user, profile } = useAuth();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [defaultLimit, setDefaultLimit] = useState(200);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [uploadErr, setUploadErr] = useState("");
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [nowPlaying, setNowPlaying] = useState(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const fileInputRef = useRef(null);
  const playerRef = useRef(null);

  useEffect(() => {
    refresh();
    getDefaultStorageLimitMB().then(setDefaultLimit);
  }, []);

  async function refresh() {
    setLoading(true);
    try {
      setItems(await listMyMedia(user.uid));
    } finally {
      setLoading(false);
    }
  }

  const usedBytes = items.reduce((s, m) => s + (m.bytes || 0), 0);
  const limitMB = profile?.storageLimitMB ?? defaultLimit;
  const usedPct = Math.min(100, (usedBytes / (limitMB * 1024 * 1024)) * 100);

  async function handleFileChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    if (!/^(video|audio)\//.test(file.type)) {
      setUploadErr("Hanya file video atau musik yang bisa diunggah.");
      return;
    }
    setUploadErr("");
    setUploading(true);
    setProgress(0);
    try {
      await uploadMediaFile(file, file.name.replace(/\.[^/.]+$/, ""), setProgress);
      await refresh();
    } catch (err) {
      setUploadErr(err.message || "Upload gagal.");
    } finally {
      setUploading(false);
    }
  }

  function playItem(item) {
    setNowPlaying(item);
    setPlaying(true);
    // src di-set lewat effect di bawah (menunggu elemen player siap)
  }

  useEffect(() => {
    if (nowPlaying && playerRef.current) {
      playerRef.current.src = nowPlaying.url;
      playerRef.current.play().catch(() => {});
    }
  }, [nowPlaying]);

  async function handleConfirmDelete() {
    setDeleteBusy(true);
    try {
      await deleteMedia(deleteTarget.id);
      if (nowPlaying?.id === deleteTarget.id) {
        setNowPlaying(null);
        playerRef.current?.pause();
      }
      setDeleteTarget(null);
      await refresh();
    } catch {
      setUploadErr("Gagal menghapus media.");
      setDeleteTarget(null);
    } finally {
      setDeleteBusy(false);
    }
  }

  function formatTime(s) {
    if (!isFinite(s) || s < 0) return "0:00";
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${String(sec).padStart(2, "0")}`;
  }

  return (
    <div className="dashboard-page">
      <header className="dashboard-topbar">
        <span className="dashboard-brand">🎧 Gramofon</span>
        <div className="dashboard-topbar__right">
          <NotificationBell />
          <ProfileMenu />
        </div>
      </header>

      <div className="app-shell">
        <div className="app-quota">
          <div className="app-quota__bar">
            <div className="app-quota__fill" style={{ width: `${usedPct}%` }} />
          </div>
          <span className="hint-text">
            {formatBytes(usedBytes)} dari {limitMB}MB terpakai
          </span>
        </div>

        {/* Area video -- hanya terlihat kalau yang sedang diputar
            berupa VIDEO (bukan musik/audio). Elemen <video> yang sama
            ini juga yang mengeluarkan suara untuk file audio (hanya
            gambarnya yang disembunyikan). */}
        <div className={"app-video-wrap" + (nowPlaying?.resourceType === "video" ? " is-visible" : "")}>
          <video
            ref={playerRef}
            className="app-video-el"
            onPlay={() => setPlaying(true)}
            onPause={() => setPlaying(false)}
            onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
            onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
            onEnded={() => setPlaying(false)}
          />
        </div>

        <div className="app-upload">
          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPTED_TYPES}
            style={{ display: "none" }}
            onChange={handleFileChange}
          />
          <button
            className="btn btn--primary"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
          >
            {uploading ? `Mengunggah... ${progress}%` : "+ Upload Video/Musik"}
          </button>
          {uploadErr && <p className="error-text" style={{ marginTop: 8 }}>{uploadErr}</p>}
        </div>

        <div className="app-library">
          {loading ? (
            <p className="hint-text">Memuat perpustakaan Anda...</p>
          ) : items.length === 0 ? (
            <p className="hint-text">
              Belum ada video/musik. Klik "Upload Video/Musik" di atas untuk mulai.
            </p>
          ) : (
            <div className="user-list">
              {items.map((m) => (
                <div
                  className={"user-row app-media-row" + (nowPlaying?.id === m.id ? " is-playing" : "")}
                  key={m.id}
                  onClick={() => playItem(m)}
                >
                  <div className="user-row__info">
                    <div className="user-row__name">{m.title}</div>
                    <div className="user-row__sub">
                      {m.resourceType} · {m.format?.toUpperCase()} · {formatBytes(m.bytes)}
                    </div>
                  </div>
                  <div className="user-row__actions">
                    <button
                      className="btn btn--danger btn--sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeleteTarget(m);
                      }}
                    >
                      Hapus
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Pemutar dasar -- persisten di bawah. Playlist, shuffle/repeat,
          dan mode tampilan (Mini/Audio/Titles) menyusul di iterasi
          berikutnya; ini baru transport dasar (play/pause + seek). */}
      <footer className="app-playerbar">
        <div className="app-playerbar__meta">
          {nowPlaying ? nowPlaying.title : "Belum ada yang diputar"}
        </div>
        <div className="app-playerbar__controls">
          <button
            className="iconbtn"
            disabled={!nowPlaying}
            onClick={() => {
              if (!playerRef.current) return;
              if (playerRef.current.paused) playerRef.current.play();
              else playerRef.current.pause();
            }}
          >
            {playing ? "⏸" : "▶"}
          </button>
          <span className="app-playerbar__time">{formatTime(currentTime)}</span>
          <input
            type="range"
            className="seekbar"
            min="0"
            max={duration || 0}
            value={currentTime}
            onChange={(e) => {
              if (playerRef.current) playerRef.current.currentTime = Number(e.target.value);
            }}
            disabled={!nowPlaying}
          />
          <span className="app-playerbar__time">{formatTime(duration)}</span>
        </div>
      </footer>

      <ConfirmDialog
        open={!!deleteTarget}
        title={`Hapus "${deleteTarget?.title}"?`}
        message="File ini akan dihapus permanen dari penyimpanan dan tidak bisa dikembalikan."
        confirmLabel="Ya, Hapus"
        danger
        busy={deleteBusy}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={handleConfirmDelete}
      />
    </div>
  );
}
