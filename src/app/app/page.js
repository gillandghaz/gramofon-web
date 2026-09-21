"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import RequireAuth from "@/components/RequireAuth";
import NotificationBell from "@/components/NotificationBell";
import ProfileMenu from "@/components/ProfileMenu";
import ConfirmDialog from "@/components/ConfirmDialog";
import Logo from "@/components/Logo";
import { listMyMedia, uploadMediaFile, deleteMedia, formatBytes } from "@/lib/media";
import { listExploreMedia, uploadExploreFile, deleteExploreMedia } from "@/lib/explore";
import {
  getDefaultStorageLimitMB,
  isExploreEnabled,
  getExploreLimitMB,
  setExploreLimitMB,
} from "@/lib/settings";
import {
  listMyPlaylists,
  createPlaylist,
  renamePlaylist,
  deletePlaylist,
  addTrackToPlaylist,
  removeTrackFromPlaylist,
} from "@/lib/playlists";

const ACCEPTED_TYPES = "video/*,audio/*";
const VIEW_MODES = [
  { key: "theater", label: "Theater", icon: "▶" },
  { key: "mini", label: "Mini", icon: "▣" },
  { key: "audio", label: "Audio Only", icon: "♪" },
  { key: "manage", label: "Manage Media", icon: "☰" },
  { key: "explore", label: "Explore", icon: "✦" },
];

export default function AppPage() {
  return (
    <RequireAuth>
      <AppInner />
    </RequireAuth>
  );
}

function formatTime(s) {
  if (!isFinite(s) || s < 0) return "0:00";
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${String(sec).padStart(2, "0")}`;
}

function AppInner() {
  const { user, profile, isAdmin } = useAuth();
  const searchParams = useSearchParams();
  const initialView = VIEW_MODES.some((v) => v.key === searchParams.get("view"))
    ? searchParams.get("view")
    : "theater";
  const [viewMode, setViewMode] = useState(initialView);

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [defaultLimit, setDefaultLimit] = useState(200);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [uploadErr, setUploadErr] = useState("");
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const fileInputRef = useRef(null);

  const [nowPlaying, setNowPlaying] = useState(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const playerRef = useRef(null);

  const miniWrapRef = useRef(null);
  const dragState = useRef(null);

  const audioCtxRef = useRef(null);
  const analyserRef = useRef(null);
  const barsRef = useRef([]);
  const rafRef = useRef(null);

  const [playlists, setPlaylists] = useState([]);
  const [activePlaylistId, setActivePlaylistId] = useState(null);
  const [newPlaylistName, setNewPlaylistName] = useState("");
  const [renamingPlaylist, setRenamingPlaylist] = useState(null);
  const [renameInput, setRenameInput] = useState("");
  const [deletePlaylistTarget, setDeletePlaylistTarget] = useState(null);
  const [addToPlaylistFor, setAddToPlaylistFor] = useState(null);

  const [exploreItems, setExploreItems] = useState([]);
  const [loadingExplore, setLoadingExplore] = useState(true);
  const [exploreOn, setExploreOn] = useState(true);
  const [exploreLimitMB, setExploreLimitMBState] = useState(5000);
  const [exploreLimitInput, setExploreLimitInput] = useState("5000");
  const [exploreUploading, setExploreUploading] = useState(false);
  const [exploreProgress, setExploreProgress] = useState(0);
  const [exploreErr, setExploreErr] = useState("");
  const [deleteExploreTarget, setDeleteExploreTarget] = useState(null);
  const exploreFileInputRef = useRef(null);

  useEffect(() => {
    refresh();
    getDefaultStorageLimitMB().then(setDefaultLimit);
    listMyPlaylists(user.uid).then(setPlaylists);
    isExploreEnabled().then((v) => {
      setExploreOn(v);
      setLoadingExplore(false);
    });
    getExploreLimitMB().then((v) => {
      setExploreLimitMBState(v);
      setExploreLimitInput(String(v));
    });
    listExploreMedia().then(setExploreItems);
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
  const exploreUsedBytes = exploreItems.reduce((s, m) => s + (m.bytes || 0), 0);
  const exploreUsedPct = Math.min(100, (exploreUsedBytes / (exploreLimitMB * 1024 * 1024)) * 100);

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

  // ---- Playback ----
  // PENTING (bug yang diperbaiki): .src dan .play() HARUS dipanggil
  // SECARA LANGSUNG di dalam handler klik yang sama (bukan lewat
  // useEffect yang terpicu belakangan oleh perubahan state) -- kalau
  // tidak, browser tidak menganggapnya sebagai reaksi langsung dari
  // gestur klik pengguna, dan diam-diam MENOLAK memutar (autoplay
  // policy), padahal judulnya sudah ter-update seolah berhasil.
  function playItem(item, source = "own") {
    setNowPlaying({ ...item, source });
    setPlaying(true);
    const el = playerRef.current;
    if (el) {
      el.src = item.url;
      el.play()
        .then(() => ensureAudioGraph())
        .catch((e) => console.warn("Gagal memutar:", e));
    }
  }

  function togglePlay() {
    if (!playerRef.current || !nowPlaying) return;
    if (playerRef.current.paused) {
      playerRef.current.play().then(() => ensureAudioGraph()).catch(() => {});
    } else {
      playerRef.current.pause();
    }
  }

  function selectView(key) {
    setViewMode(key);
  }

  // ---- Mini player drag ----
  function handleDragStart(e) {
    if (viewMode !== "mini" || !miniWrapRef.current) return;
    const rect = miniWrapRef.current.getBoundingClientRect();
    dragState.current = { offsetX: e.clientX - rect.left, offsetY: e.clientY - rect.top };
    document.addEventListener("pointermove", handleDragMove);
    document.addEventListener("pointerup", handleDragEnd);
  }
  function handleDragMove(e) {
    if (!dragState.current || !miniWrapRef.current) return;
    const { offsetX, offsetY } = dragState.current;
    const maxLeft = window.innerWidth - miniWrapRef.current.offsetWidth;
    const maxTop = window.innerHeight - miniWrapRef.current.offsetHeight;
    const left = Math.min(Math.max(0, e.clientX - offsetX), Math.max(0, maxLeft));
    const top = Math.min(Math.max(0, e.clientY - offsetY), Math.max(0, maxTop));
    miniWrapRef.current.style.left = `${left}px`;
    miniWrapRef.current.style.top = `${top}px`;
  }
  function handleDragEnd() {
    dragState.current = null;
    document.removeEventListener("pointermove", handleDragMove);
    document.removeEventListener("pointerup", handleDragEnd);
  }

  // ---- Audio visualizer ----
  function ensureAudioGraph() {
    if (audioCtxRef.current) {
      if (audioCtxRef.current.state === "suspended") audioCtxRef.current.resume();
      return;
    }
    if (!playerRef.current) return;
    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      const ctx = new AudioContextClass();
      const source = ctx.createMediaElementSource(playerRef.current);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 128;
      analyser.smoothingTimeConstant = 0.82;
      source.connect(analyser);
      analyser.connect(ctx.destination);
      audioCtxRef.current = ctx;
      analyserRef.current = analyser;
      if (ctx.state === "suspended") ctx.resume();
    } catch (e) {
      console.warn("Web Audio visualizer tidak tersedia:", e);
    }
  }

  useEffect(() => {
    function draw() {
      rafRef.current = requestAnimationFrame(draw);
      if (viewMode !== "audio" || !analyserRef.current || !playing) return;
      const data = new Uint8Array(analyserRef.current.frequencyBinCount);
      analyserRef.current.getByteFrequencyData(data);
      const bars = barsRef.current;
      const step = Math.max(1, Math.floor(data.length / bars.length));
      for (let i = 0; i < bars.length; i++) {
        if (!bars[i]) continue;
        let sum = 0;
        for (let j = 0; j < step; j++) sum += data[i * step + j] || 0;
        bars[i].style.height = `${4 + (sum / step / 255) * 60}px`;
      }
    }
    rafRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafRef.current);
  }, [viewMode, playing]);

  // ---- Playlist ----
  async function handleCreatePlaylist() {
    if (!newPlaylistName.trim()) return;
    const id = await createPlaylist(user.uid, newPlaylistName);
    setNewPlaylistName("");
    setPlaylists(await listMyPlaylists(user.uid));
    setActivePlaylistId(id);
  }
  async function handleConfirmRenamePlaylist() {
    if (!renameInput.trim()) return;
    await renamePlaylist(renamingPlaylist.id, renameInput);
    setRenamingPlaylist(null);
    setPlaylists(await listMyPlaylists(user.uid));
  }
  async function handleConfirmDeletePlaylist() {
    await deletePlaylist(deletePlaylistTarget.id);
    if (activePlaylistId === deletePlaylistTarget.id) setActivePlaylistId(null);
    setDeletePlaylistTarget(null);
    setPlaylists(await listMyPlaylists(user.uid));
  }
  async function handleAddToPlaylist(playlistId) {
    await addTrackToPlaylist(playlistId, addToPlaylistFor.id);
    setAddToPlaylistFor(null);
    setPlaylists(await listMyPlaylists(user.uid));
  }
  async function handleRemoveFromPlaylist(playlistId, mediaId) {
    await removeTrackFromPlaylist(playlistId, mediaId);
    setPlaylists(await listMyPlaylists(user.uid));
  }

  // ---- Explore ----
  async function handleExploreFileChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    if (!/^(video|audio)\//.test(file.type)) {
      setExploreErr("Hanya file video atau musik yang bisa diunggah.");
      return;
    }
    setExploreErr("");
    setExploreUploading(true);
    setExploreProgress(0);
    try {
      await uploadExploreFile(file, file.name.replace(/\.[^/.]+$/, ""), setExploreProgress);
      setExploreItems(await listExploreMedia());
    } catch (err) {
      setExploreErr(err.message || "Upload gagal.");
    } finally {
      setExploreUploading(false);
    }
  }
  async function handleConfirmDeleteExplore() {
    await deleteExploreMedia(deleteExploreTarget.id);
    if (nowPlaying?.id === deleteExploreTarget.id) setNowPlaying(null);
    setDeleteExploreTarget(null);
    setExploreItems(await listExploreMedia());
  }
  async function handleSaveExploreLimit() {
    const mb = parseInt(exploreLimitInput, 10);
    if (!mb || mb <= 0) return;
    await setExploreLimitMB(mb);
    setExploreLimitMBState(mb);
  }

  const activePlaylist = playlists.find((p) => p.id === activePlaylistId);

  return (
    <div className="dashboard-page">
      {/* Satu baris topbar: logo, navigasi mode (desktop), notifikasi+profil */}
      <header className="app-topbar">
        <span className="dashboard-brand app-topbar__brand">
          <Logo size={22} /> Gramofon
        </span>

        <nav className="segmented app-topbar__nav">
          {VIEW_MODES.map((v) => (
            <button
              key={v.key}
              type="button"
              className={"segmented__btn" + (viewMode === v.key ? " is-active" : "")}
              onClick={() => selectView(v.key)}
            >
              {v.label}
            </button>
          ))}
        </nav>

        <div className="dashboard-topbar__right">
          <NotificationBell />
          <ProfileMenu />
        </div>
      </header>

      {/* Elemen <video> SATU-SATUNYA di seluruh halaman, tidak pernah
          di-unmount saat ganti mode -- hanya posisinya yang berubah. */}
      <div
        ref={miniWrapRef}
        className={
          "app-video-wrap" +
          (viewMode === "mini"
            ? " is-mini"
            : viewMode === "theater" && nowPlaying?.resourceType === "video"
            ? " is-theater"
            : " is-hidden")
        }
      >
        {viewMode === "mini" && (
          <div className="app-video-drag" onPointerDown={handleDragStart}>
            ⠿⠿
          </div>
        )}
        <video
          ref={playerRef}
          className="app-video-el"
          playsInline
          crossOrigin="anonymous"
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
          onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
          onEnded={() => setPlaying(false)}
        />
        {viewMode === "mini" && (
          <div className="app-video-mini-controls">
            <button className="iconbtn" onClick={togglePlay}>
              {playing ? "⏸" : "▶"}
            </button>
          </div>
        )}
      </div>

      <div className="app-shell">
        {viewMode === "theater" && (
          <div>
            <div className="app-quota">
              <div className="app-quota__bar">
                <div className="app-quota__fill" style={{ width: `${usedPct}%` }} />
              </div>
              <span className="hint-text">
                {formatBytes(usedBytes)} dari {limitMB}MB terpakai
              </span>
            </div>
            <MediaList items={items} loading={loading} onPlay={(m) => playItem(m, "own")} nowPlayingId={nowPlaying?.id} />
          </div>
        )}

        {viewMode === "mini" && (
          <div>
            <p className="hint-text" style={{ marginBottom: 12 }}>
              Video mengambang di pojok — geser lewat titik ⠿⠿ di atasnya.
            </p>
            <MediaList items={items} loading={loading} onPlay={(m) => playItem(m, "own")} nowPlayingId={nowPlaying?.id} />
          </div>
        )}

        {viewMode === "audio" && <AudioOnlyView nowPlaying={nowPlaying} barsRef={barsRef} />}

        {viewMode === "manage" && (
          <ManageMediaView
            items={items}
            loading={loading}
            usedBytes={usedBytes}
            limitMB={limitMB}
            usedPct={usedPct}
            uploading={uploading}
            progress={progress}
            uploadErr={uploadErr}
            fileInputRef={fileInputRef}
            onFileChange={handleFileChange}
            onPlay={(m) => playItem(m, "own")}
            onDelete={setDeleteTarget}
            nowPlayingId={nowPlaying?.id}
            playlists={playlists}
            activePlaylist={activePlaylist}
            activePlaylistId={activePlaylistId}
            setActivePlaylistId={setActivePlaylistId}
            newPlaylistName={newPlaylistName}
            setNewPlaylistName={setNewPlaylistName}
            onCreatePlaylist={handleCreatePlaylist}
            onOpenRename={(pl) => {
              setRenamingPlaylist(pl);
              setRenameInput(pl.name);
            }}
            onDeletePlaylistClick={setDeletePlaylistTarget}
            onAddToPlaylistClick={setAddToPlaylistFor}
            onRemoveFromPlaylist={handleRemoveFromPlaylist}
          />
        )}

        {viewMode === "explore" && (
          <ExploreView
            isAdmin={isAdmin}
            exploreOn={exploreOn}
            loadingExplore={loadingExplore}
            items={exploreItems}
            onPlay={(m) => playItem(m, "explore")}
            onDelete={setDeleteExploreTarget}
            uploading={exploreUploading}
            progress={exploreProgress}
            err={exploreErr}
            fileInputRef={exploreFileInputRef}
            onFileChange={handleExploreFileChange}
            nowPlayingId={nowPlaying?.id}
            usedBytes={exploreUsedBytes}
            limitMB={exploreLimitMB}
            usedPct={exploreUsedPct}
            limitInput={exploreLimitInput}
            setLimitInput={setExploreLimitInput}
            onSaveLimit={handleSaveExploreLimit}
          />
        )}
      </div>

      {/* Navigasi mode untuk HP -- bar tersendiri di bawah, di atas
          player bar (di desktop navigasi sudah ada di topbar). */}
      <nav className="app-bottomnav">
        {VIEW_MODES.map((v) => (
          <button
            key={v.key}
            type="button"
            className={"app-bottomnav__btn" + (viewMode === v.key ? " is-active" : "")}
            onClick={() => selectView(v.key)}
          >
            <span className="app-bottomnav__icon">{v.icon}</span>
            {v.label}
          </button>
        ))}
      </nav>

      <footer className="app-playerbar">
        <div className="app-playerbar__meta">{nowPlaying ? nowPlaying.title : "Belum ada yang diputar"}</div>
        <div className="app-playerbar__controls">
          <button className="iconbtn" disabled={!nowPlaying} onClick={togglePlay}>
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

      {renamingPlaylist && (
        <div className="confirm-backdrop" onClick={() => setRenamingPlaylist(null)}>
          <div className="confirm-card" onClick={(e) => e.stopPropagation()}>
            <h3>Ubah nama playlist</h3>
            <div className="field">
              <input value={renameInput} onChange={(e) => setRenameInput(e.target.value)} autoFocus />
            </div>
            <div className="confirm-actions">
              <button className="btn btn--ghost" onClick={() => setRenamingPlaylist(null)}>
                Batal
              </button>
              <button className="btn btn--primary" onClick={handleConfirmRenamePlaylist}>
                Simpan
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={!!deletePlaylistTarget}
        title={`Hapus playlist "${deletePlaylistTarget?.name}"?`}
        message="Playlist ini akan dihapus (track aslinya tetap aman di perpustakaan Anda)."
        confirmLabel="Ya, Hapus"
        danger
        onCancel={() => setDeletePlaylistTarget(null)}
        onConfirm={handleConfirmDeletePlaylist}
      />

      {addToPlaylistFor && (
        <div className="confirm-backdrop" onClick={() => setAddToPlaylistFor(null)}>
          <div className="confirm-card" onClick={(e) => e.stopPropagation()}>
            <h3>Tambahkan "{addToPlaylistFor.title}" ke playlist</h3>
            {playlists.length === 0 ? (
              <p className="hint-text">Belum ada playlist — buat dulu di bawah.</p>
            ) : (
              <div className="user-picker-list">
                {playlists.map((pl) => (
                  <button key={pl.id} type="button" className="addmenu-item" onClick={() => handleAddToPlaylist(pl.id)}>
                    {pl.name} <span className="hint-text">({pl.trackIds?.length || 0})</span>
                  </button>
                ))}
              </div>
            )}
            <div className="confirm-actions">
              <button className="btn btn--ghost" onClick={() => setAddToPlaylistFor(null)}>
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={!!deleteExploreTarget}
        title={`Hapus "${deleteExploreTarget?.title}" dari Explore?`}
        message="File ini akan dihapus permanen dari penyimpanan Explore untuk semua pengguna."
        confirmLabel="Ya, Hapus"
        danger
        onCancel={() => setDeleteExploreTarget(null)}
        onConfirm={handleConfirmDeleteExplore}
      />
    </div>
  );
}

function MediaList({ items, loading, onPlay, onDelete, nowPlayingId, extraAction, emptyText }) {
  if (loading) return <p className="hint-text">Memuat...</p>;
  if (items.length === 0) {
    return <div className="app-empty-card">{emptyText || "Belum ada video/musik di sini."}</div>;
  }
  return (
    <div className="user-list">
      {items.map((m) => (
        <div
          className={"user-row app-media-row" + (nowPlayingId === m.id ? " is-playing" : "")}
          key={m.id}
          onClick={() => onPlay(m)}
        >
          <div className="user-row__info">
            <div className="user-row__name">{m.title}</div>
            <div className="user-row__sub">
              {m.resourceType} · {m.format?.toUpperCase()} · {formatBytes(m.bytes)}
            </div>
          </div>
          <div className="user-row__actions">
            {extraAction && extraAction(m)}
            {onDelete && (
              <button
                className="btn btn--danger btn--sm"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(m);
                }}
              >
                Hapus
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function AudioOnlyView({ nowPlaying, barsRef }) {
  const bars = Array.from({ length: 24 });
  return (
    <div className="app-audio-visual">
      <div className="app-disc">
        <div className="app-disc__label">{nowPlaying ? nowPlaying.title : "—"}</div>
      </div>
      <div className="app-bars">
        {bars.map((_, i) => (
          <span key={i} ref={(el) => (barsRef.current[i] = el)} />
        ))}
      </div>
    </div>
  );
}

function ManageMediaView({
  items,
  loading,
  usedBytes,
  limitMB,
  usedPct,
  uploading,
  progress,
  uploadErr,
  fileInputRef,
  onFileChange,
  onPlay,
  onDelete,
  nowPlayingId,
  playlists,
  activePlaylist,
  activePlaylistId,
  setActivePlaylistId,
  newPlaylistName,
  setNewPlaylistName,
  onCreatePlaylist,
  onOpenRename,
  onDeletePlaylistClick,
  onAddToPlaylistClick,
  onRemoveFromPlaylist,
}) {
  const playlistItems = activePlaylist
    ? activePlaylist.trackIds.map((id) => items.find((m) => m.id === id)).filter(Boolean)
    : [];

  return (
    <div>
      <div className="app-quota">
        <div className="app-quota__bar">
          <div className="app-quota__fill" style={{ width: `${usedPct}%` }} />
        </div>
        <span className="hint-text">
          {formatBytes(usedBytes)} dari {limitMB}MB terpakai
        </span>
      </div>

      {/* Upload HANYA di sini (Manage Media), sesuai permintaan --
          Theater & Mini murni untuk menonton/mendengarkan. */}
      <div className="app-upload">
        <input ref={fileInputRef} type="file" accept={ACCEPTED_TYPES} style={{ display: "none" }} onChange={onFileChange} />
        <button className="btn btn--primary" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
          {uploading ? `Mengunggah... ${progress}%` : "+ Upload Video/Musik"}
        </button>
        {uploadErr && <p className="error-text" style={{ marginTop: 8 }}>{uploadErr}</p>}
      </div>

      <div className="settings-divider" />

      <h3 className="tab-subtitle">Playlist</h3>
      <div className="app-playlist-bar">
        <button
          type="button"
          className={"app-playlist-chip" + (activePlaylistId === null ? " is-active" : "")}
          onClick={() => setActivePlaylistId(null)}
        >
          Semua Media
        </button>
        {playlists.map((pl) => (
          <button
            key={pl.id}
            type="button"
            className={"app-playlist-chip" + (activePlaylistId === pl.id ? " is-active" : "")}
            onClick={() => setActivePlaylistId(pl.id)}
          >
            {pl.name} ({pl.trackIds?.length || 0})
          </button>
        ))}
      </div>
      <div className="app-playlist-new">
        <input
          placeholder="Nama playlist baru..."
          value={newPlaylistName}
          onChange={(e) => setNewPlaylistName(e.target.value)}
        />
        <button className="btn btn--primary btn--sm" onClick={onCreatePlaylist}>
          Buat
        </button>
      </div>

      {activePlaylist && (
        <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
          <button className="btn btn--ghost btn--sm" onClick={() => onOpenRename(activePlaylist)}>
            Ubah Nama
          </button>
          <button className="btn btn--danger btn--sm" onClick={() => onDeletePlaylistClick(activePlaylist)}>
            Hapus Playlist
          </button>
        </div>
      )}

      <div className="settings-divider" />

      <h3 className="tab-subtitle">
        {activePlaylist ? `Isi playlist "${activePlaylist.name}"` : "Semua Media Anda"}
      </h3>
      {activePlaylist ? (
        <MediaList
          items={playlistItems}
          loading={false}
          onPlay={onPlay}
          nowPlayingId={nowPlayingId}
          emptyText='Playlist ini masih kosong. Tambahkan dari "Semua Media".'
          extraAction={(m) => (
            <button
              className="btn btn--ghost btn--sm"
              onClick={(e) => {
                e.stopPropagation();
                onRemoveFromPlaylist(activePlaylist.id, m.id);
              }}
            >
              Keluarkan
            </button>
          )}
        />
      ) : (
        <MediaList
          items={items}
          loading={loading}
          onPlay={onPlay}
          onDelete={onDelete}
          nowPlayingId={nowPlayingId}
          extraAction={(m) => (
            <button
              className="btn btn--ghost btn--sm"
              onClick={(e) => {
                e.stopPropagation();
                onAddToPlaylistClick(m);
              }}
            >
              + Playlist
            </button>
          )}
        />
      )}
    </div>
  );
}

function ExploreView({
  isAdmin,
  exploreOn,
  loadingExplore,
  items,
  onPlay,
  onDelete,
  uploading,
  progress,
  err,
  fileInputRef,
  onFileChange,
  nowPlayingId,
  usedBytes,
  limitMB,
  usedPct,
  limitInput,
  setLimitInput,
  onSaveLimit,
}) {
  if (!loadingExplore && !exploreOn && !isAdmin) {
    return <div className="app-empty-card">Explore sedang dinonaktifkan oleh admin.</div>;
  }
  return (
    <div>
      {isAdmin && (
        <>
          {!exploreOn && (
            <p className="hint-text" style={{ marginBottom: 10 }}>
              Explore sedang DIMATIKAN untuk pengguna biasa (Anda tetap bisa mengelolanya di sini
              — ubah lagi di Admin → Umum).
            </p>
          )}

          <div className="app-quota">
            <div className="app-quota__bar">
              <div className="app-quota__fill" style={{ width: `${usedPct}%` }} />
            </div>
            <span className="hint-text">
              {formatBytes(usedBytes)} dari {limitMB}MB terpakai (batas total Explore)
            </span>
          </div>
          <div className="quota-form" style={{ marginBottom: 16 }}>
            <div className="quota-form__row" style={{ marginBottom: 0 }}>
              <label className="hint-text" style={{ margin: 0 }}>
                Batas total Explore:
              </label>
              <input type="number" min="1" value={limitInput} onChange={(e) => setLimitInput(e.target.value)} />
              <span className="hint-text">MB</span>
              <button className="btn btn--ghost btn--sm" onClick={onSaveLimit}>
                Simpan
              </button>
            </div>
          </div>

          <div className="app-upload">
            <input ref={fileInputRef} type="file" accept={ACCEPTED_TYPES} style={{ display: "none" }} onChange={onFileChange} />
            <button className="btn btn--primary" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
              {uploading ? `Mengunggah... ${progress}%` : "+ Tambah ke Explore"}
            </button>
            {err && <p className="error-text" style={{ marginTop: 8 }}>{err}</p>}
          </div>
        </>
      )}
      <MediaList
        items={items}
        loading={loadingExplore}
        onPlay={onPlay}
        onDelete={isAdmin ? onDelete : null}
        nowPlayingId={nowPlayingId}
        emptyText="Belum ada media di Explore."
      />
    </div>
  );
}
