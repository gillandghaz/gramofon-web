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
  getExploreCategories,
  setExploreCategories,
} from "@/lib/settings";
import {
  listMyPlaylists,
  createPlaylist,
  renamePlaylist,
  deletePlaylist,
  addTrackToPlaylist,
  removeTrackFromPlaylist,
  reorderPlaylistTracks,
} from "@/lib/playlists";
import "./gramofon-player.css";

const ACCEPTED_TYPES = "video/*,audio/*";
const LIBRARY_ID = "library";
const VIEW_MODES = [
  { key: "theater", label: "Theater", icon: "tv" },
  { key: "mini", label: "Mini", icon: "pip" },
  { key: "audio", label: "Audio Only", icon: "disc" },
  { key: "manage", label: "Manage Media", icon: "folder" },
  { key: "explore", label: "Explore", icon: "compass" },
];
const SLEEP_PRESETS = [15, 30, 60];
const SPEED_OPTIONS = [0.5, 0.75, 1, 1.25, 1.5, 2];

function formatTime(s) {
  if (!isFinite(s) || s < 0) return "0:00";
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${String(sec).padStart(2, "0")}`;
}

// Ambil frame pertama video Cloudinary sebagai thumbnail JPG, langsung
// dari URL yang sudah ada (tanpa perlu request/endpoint tambahan).
function videoThumbUrl(m) {
  if (!m || m.resourceType !== "video" || !m.url) return null;
  try {
    return m.url.replace("/upload/", "/upload/so_0/").replace(/\.[a-zA-Z0-9]+(\?.*)?$/, ".jpg");
  } catch {
    return null;
  }
}

function isCoarsePointer() {
  return typeof window !== "undefined" && window.matchMedia && window.matchMedia("(pointer:coarse)").matches;
}

export default function AppPage() {
  return (
    <RequireAuth>
      <AppInner />
    </RequireAuth>
  );
}

function AppInner() {
  const { user, profile, isAdmin } = useAuth();
  const searchParams = useSearchParams();
  const initialView = VIEW_MODES.some((v) => v.key === searchParams.get("view"))
    ? searchParams.get("view")
    : "theater";
  const [viewMode, setViewMode] = useState(initialView);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const settingsAppliedRef = useRef(false);

  // ---- Perpustakaan pribadi ----
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [defaultLimit, setDefaultLimit] = useState(200);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [uploadErr, setUploadErr] = useState("");
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [bulkDeleteIds, setBulkDeleteIds] = useState(null);
  const [bulkDeleteBusy, setBulkDeleteBusy] = useState(false);
  const fileInputRef = useRef(null);

  // ---- Panel playlist (dipakai di Theater/Mini/Audio Only) ----
  const [viewPlaylistId, setViewPlaylistId] = useState(LIBRARY_ID);

  // ---- Mesin pemutaran ----
  const [nowPlaying, setNowPlaying] = useState(null);
  const [queue, setQueue] = useState([]);
  const [queueIndex, setQueueIndex] = useState(-1);
  const [queueLabel, setQueueLabel] = useState("Library");
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [shuffle, setShuffle] = useState(false);
  const [repeatMode, setRepeatMode] = useState("off"); // off | queue | track (samakan dengan Settings)
  const [volumePercent, setVolumePercent] = useState(80);
  const [muted, setMuted] = useState(false);
  const [sleepOpen, setSleepOpen] = useState(false);
  const [sleepEndAt, setSleepEndAt] = useState(null);
  const [sleepLabel, setSleepLabel] = useState("");
  const [sleepCustomNum, setSleepCustomNum] = useState("30");
  const [sleepCustomUnit, setSleepCustomUnit] = useState("menit");
  const [videoLoop, setVideoLoop] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const playerRef = useRef(null);
  const gainRef = useRef(null);
  const audioCtxRef = useRef(null);

  const miniWrapRef = useRef(null);
  const dragState = useRef(null);
  const theaterAnchorRef = useRef(null);
  const [videoRect, setVideoRect] = useState(null);

  // ---- Overlay kontrol di dalam frame (khusus layar sentuh) ----
  const [ovVisible, setOvVisible] = useState(false);
  const ovTimerRef = useRef(null);
  const videoScreenRef = useRef(null);
  const audioStageRef = useRef(null);

  // ---- Context menu klik-kanan pada video ----
  const [ctxMenu, setCtxMenu] = useState(null); // {x,y} | null

  // ---- Playlist (Manage Media) ----
  const [playlists, setPlaylists] = useState([]);
  const [newPlaylistName, setNewPlaylistName] = useState("");
  const [renamingPlaylist, setRenamingPlaylist] = useState(null);
  const [renameInput, setRenameInput] = useState("");
  const [deletePlaylistTarget, setDeletePlaylistTarget] = useState(null);
  const [addToPlaylistFor, setAddToPlaylistFor] = useState(null);
  const [panelNewOpen, setPanelNewOpen] = useState(false);
  const [panelNewName, setPanelNewName] = useState("");

  // ---- Manage Media: toolbar ----
  const [manageSearch, setManageSearch] = useState("");
  const [manageType, setManageType] = useState("all");
  const [managePlaylist, setManagePlaylist] = useState("all");
  const [manageSort, setManageSort] = useState("newest");
  const [manageSel, setManageSel] = useState(new Set());

  // ---- Explore ----
  const [exploreItems, setExploreItems] = useState([]);
  const [loadingExplore, setLoadingExplore] = useState(true);
  const [exploreOn, setExploreOn] = useState(true);
  const [exploreLimitMB, setExploreLimitMBState] = useState(5000);
  const [exploreLimitInput, setExploreLimitInput] = useState("5000");
  const [confirmingExploreLimit, setConfirmingExploreLimit] = useState(false);
  const [exploreUploading, setExploreUploading] = useState(false);
  const [exploreProgress, setExploreProgress] = useState(0);
  const [exploreErr, setExploreErr] = useState("");
  const [exploreSearch, setExploreSearch] = useState("");
  const [deleteExploreTarget, setDeleteExploreTarget] = useState(null);
  const [exploreCategories, setExploreCategoriesState] = useState([]);
  const [exploreActiveCategory, setExploreActiveCategory] = useState("all");
  const [exploreUploadCategory, setExploreUploadCategory] = useState("");
  const [newCategoryName, setNewCategoryName] = useState("");
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
    getExploreCategories().then(setExploreCategoriesState);
    listExploreMedia().then(setExploreItems);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- Terapkan pengaturan dari Settings (sekali saja saat profil termuat) ----
  useEffect(() => {
    if (settingsAppliedRef.current || !profile) return;
    settingsAppliedRef.current = true;
    const s = profile.settings || {};
    if (typeof s.defaultShuffle === "boolean") setShuffle(s.defaultShuffle);
    if (s.defaultRepeat === "off" || s.defaultRepeat === "queue" || s.defaultRepeat === "track") {
      setRepeatMode(s.defaultRepeat);
    }
    if (typeof s.defaultVolume === "number") applyVolume(s.defaultVolume);
    if (!searchParams.get("view") && s.startupView) {
      const mapped = s.startupView === "titles" ? "manage" : s.startupView;
      if (VIEW_MODES.some((v) => v.key === mapped)) setViewMode(mapped);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile]);

  async function refresh() {
    setLoading(true);
    try {
      setItems(await listMyMedia(user.uid));
    } finally {
      setLoading(false);
    }
  }
  async function refreshPlaylists() {
    setPlaylists(await listMyPlaylists(user.uid));
  }

  const usedBytes = items.reduce((s, m) => s + (m.bytes || 0), 0);
  const limitMB = profile?.storageLimitMB ?? defaultLimit;
  const limitBytes = limitMB * 1024 * 1024;
  const videoBytes = items.filter((m) => m.resourceType === "video").reduce((s, m) => s + (m.bytes || 0), 0);
  const audioBytes = items.filter((m) => m.resourceType === "audio").reduce((s, m) => s + (m.bytes || 0), 0);
  const videoPct = limitBytes ? Math.min(100, (videoBytes / limitBytes) * 100) : 0;
  const audioPct = limitBytes ? Math.min(100, (audioBytes / limitBytes) * 100) : 0;
  const usedPct = Math.min(100, (usedBytes / limitBytes) * 100);

  const exploreUsedBytes = exploreItems.reduce((s, m) => s + (m.bytes || 0), 0);
  const exploreUsedPct = Math.min(100, (exploreUsedBytes / (exploreLimitMB * 1024 * 1024)) * 100);
  const skipSeconds = profile?.settings?.skipSeconds || 5;

  // ---- Upload (media pribadi) ----
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

  async function handleConfirmBulkDelete() {
    setBulkDeleteBusy(true);
    try {
      for (const id of bulkDeleteIds) {
        await deleteMedia(id);
        if (nowPlaying?.id === id) {
          setNowPlaying(null);
          playerRef.current?.pause();
        }
      }
      setBulkDeleteIds(null);
      setManageSel(new Set());
      await refresh();
    } catch {
      setUploadErr("Gagal menghapus sebagian media.");
      setBulkDeleteIds(null);
    } finally {
      setBulkDeleteBusy(false);
    }
  }

  // ======================================================================
  // MESIN PEMUTARAN
  // ======================================================================
  function playItem(item, list, label) {
    const idx = list.findIndex((m) => m.id === item.id);
    setQueue(list);
    setQueueIndex(idx);
    setQueueLabel(label);
    setNowPlaying(item);
    setPlaying(true);
    const el = playerRef.current;
    if (el) {
      el.src = item.url;
      el.playbackRate = playbackRate;
      el.loop = videoLoop;
      el.play()
        .then(() => ensureAudioGraph())
        .catch((e) => console.warn("Gagal memutar:", e));
    }
  }

  function playAtIndex(idx) {
    if (idx < 0 || idx >= queue.length) return;
    const item = queue[idx];
    setQueueIndex(idx);
    setNowPlaying(item);
    setPlaying(true);
    const el = playerRef.current;
    if (el) {
      el.src = item.url;
      el.playbackRate = playbackRate;
      el.loop = videoLoop;
      el.play()
        .then(() => ensureAudioGraph())
        .catch((e) => console.warn("Gagal memutar:", e));
    }
  }

  function next() {
    if (queue.length === 0) return;
    if (shuffle && queue.length > 1) {
      let idx;
      do {
        idx = Math.floor(Math.random() * queue.length);
      } while (idx === queueIndex);
      playAtIndex(idx);
      return;
    }
    let idx = queueIndex + 1;
    if (idx >= queue.length) {
      if (repeatMode === "queue") idx = 0;
      else return;
    }
    playAtIndex(idx);
  }

  function prev() {
    if (queue.length === 0) return;
    if (shuffle && queue.length > 1) {
      let idx;
      do {
        idx = Math.floor(Math.random() * queue.length);
      } while (idx === queueIndex);
      playAtIndex(idx);
      return;
    }
    let idx = queueIndex - 1;
    if (idx < 0) {
      if (repeatMode === "queue") idx = queue.length - 1;
      else idx = 0;
    }
    playAtIndex(idx);
  }

  function handleEnded() {
    setPlaying(false);
    if (repeatMode === "track" && playerRef.current) {
      playerRef.current.currentTime = 0;
      playerRef.current.play().catch(() => {});
      return;
    }
    if (repeatMode === "queue" || queueIndex < queue.length - 1) next();
  }

  function togglePlay() {
    if (!playerRef.current || !nowPlaying) return;
    if (playerRef.current.paused) {
      playerRef.current.play().then(() => ensureAudioGraph()).catch(() => {});
    } else {
      playerRef.current.pause();
    }
  }
  function backSkip() {
    if (!playerRef.current) return;
    playerRef.current.currentTime = Math.max(0, playerRef.current.currentTime - skipSeconds);
  }
  function fwdSkip() {
    if (!playerRef.current) return;
    const d = playerRef.current.duration;
    playerRef.current.currentTime = isFinite(d)
      ? Math.min(d, playerRef.current.currentTime + skipSeconds)
      : playerRef.current.currentTime + skipSeconds;
  }
  function cycleRepeat() {
    setRepeatMode((m) => (m === "off" ? "queue" : m === "queue" ? "track" : "off"));
  }

  function selectView(key) {
    setViewMode(key);
    setMobileMenuOpen(false);
  }

  function goTheaterHome() {
    selectView("theater");
  }

  // ---- Mini player: bisa digeser ----
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
    miniWrapRef.current.style.right = "auto";
    miniWrapRef.current.style.bottom = "auto";
    miniWrapRef.current.style.transform = "none";
  }
  function handleDragEnd() {
    dragState.current = null;
    document.removeEventListener("pointermove", handleDragMove);
    document.removeEventListener("pointerup", handleDragEnd);
  }

  // ---- Ukur ulang slot video Theater setiap kali relevan berubah ----
  useEffect(() => {
    if (viewMode !== "theater" || !nowPlaying || nowPlaying.resourceType !== "video") {
      setVideoRect(null);
      return;
    }
    function measure() {
      const el = theaterAnchorRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      setVideoRect({ top: r.top, left: r.left, width: r.width, height: r.height });
    }
    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null;
    if (ro && theaterAnchorRef.current) ro.observe(theaterAnchorRef.current);
    const iv = setInterval(measure, 400);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
      if (ro) ro.disconnect();
      clearInterval(iv);
    };
  }, [viewMode, nowPlaying, mobileMenuOpen]);

  // ---- Web Audio: hanya dipakai untuk boost volume >100% ----
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
      const gain = ctx.createGain();
      source.connect(gain);
      gain.connect(ctx.destination);
      gain.gain.value = volumePercent > 100 ? volumePercent / 100 : 1;
      audioCtxRef.current = ctx;
      gainRef.current = gain;
      if (ctx.state === "suspended") ctx.resume();
    } catch (e) {
      console.warn("Web Audio tidak tersedia:", e);
    }
  }
  function applyVolume(percent) {
    const clamped = Math.min(120, Math.max(0, percent));
    setVolumePercent(clamped);
    setMuted(false);
    if (playerRef.current) {
      playerRef.current.muted = false;
      playerRef.current.volume = Math.min(1, clamped / 100);
    }
    if (gainRef.current) gainRef.current.gain.value = clamped > 100 ? clamped / 100 : 1;
  }
  function toggleMute() {
    const next = !muted;
    setMuted(next);
    if (playerRef.current) playerRef.current.muted = next;
  }

  // ---- Overlay kontrol dalam frame (mobile) ----
  function bumpOverlay() {
    setOvVisible(true);
    clearTimeout(ovTimerRef.current);
    ovTimerRef.current = setTimeout(() => setOvVisible(false), 3500);
  }
  function hideOverlayNow() {
    clearTimeout(ovTimerRef.current);
    setOvVisible(false);
  }
  function handleFrameClick() {
    if (isCoarsePointer()) {
      setOvVisible((v) => {
        const nv = !v;
        if (nv) {
          clearTimeout(ovTimerRef.current);
          ovTimerRef.current = setTimeout(() => setOvVisible(false), 3500);
        } else {
          clearTimeout(ovTimerRef.current);
        }
        return nv;
      });
    } else {
      togglePlay();
    }
  }
  useEffect(() => {
    function onDocPointer(e) {
      if (!ovVisible) return;
      const activeRef = viewMode === "audio" ? audioStageRef : videoScreenRef;
      if (activeRef.current && !activeRef.current.contains(e.target)) hideOverlayNow();
    }
    document.addEventListener("pointerdown", onDocPointer);
    return () => document.removeEventListener("pointerdown", onDocPointer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ovVisible, viewMode]);

  // ---- Context menu klik-kanan video ----
  function openCtxMenu(e) {
    e.preventDefault();
    if (!nowPlaying) return;
    setCtxMenu({ x: e.clientX, y: e.clientY });
  }
  useEffect(() => {
    if (!ctxMenu) return;
    function close() {
      setCtxMenu(null);
    }
    document.addEventListener("click", close);
    document.addEventListener("scroll", close, true);
    return () => {
      document.removeEventListener("click", close);
      document.removeEventListener("scroll", close, true);
    };
  }, [ctxMenu]);
  function toggleLoop() {
    const next = !videoLoop;
    setVideoLoop(next);
    if (playerRef.current) playerRef.current.loop = next;
  }
  function setSpeed(rate) {
    setPlaybackRate(rate);
    if (playerRef.current) playerRef.current.playbackRate = rate;
  }
  function toggleFullscreen(frameEl) {
    const target = frameEl || videoScreenRef.current;
    if (!target) return;
    if (!document.fullscreenElement) {
      if (target.requestFullscreen) target.requestFullscreen().catch(() => {});
      else if (playerRef.current?.webkitEnterFullscreen) playerRef.current.webkitEnterFullscreen();
    } else {
      document.exitFullscreen?.();
    }
  }
  function togglePiP() {
    if (!playerRef.current) return;
    if (document.pictureInPictureElement) {
      document.exitPictureInPicture?.().catch(() => {});
    } else if (playerRef.current.requestPictureInPicture) {
      playerRef.current.requestPictureInPicture().catch(() => {});
    }
  }

  // ---- Sleep timer ----
  function startSleep(minutes) {
    if (!minutes) {
      setSleepEndAt(null);
      setSleepLabel("");
      setSleepOpen(false);
      return;
    }
    setSleepEndAt(Date.now() + minutes * 60000);
    setSleepOpen(false);
  }
  useEffect(() => {
    if (!sleepEndAt) return;
    const iv = setInterval(() => {
      const remaining = sleepEndAt - Date.now();
      if (remaining <= 0) {
        playerRef.current?.pause();
        setSleepEndAt(null);
        setSleepLabel("");
        clearInterval(iv);
        return;
      }
      const mins = Math.floor(remaining / 60000);
      const secs = Math.floor((remaining % 60000) / 1000);
      setSleepLabel(`${mins}:${String(secs).padStart(2, "0")}`);
    }, 1000);
    return () => clearInterval(iv);
  }, [sleepEndAt]);

  // ---- Playlist ----
  async function handleCreatePlaylist() {
    if (!newPlaylistName.trim()) return;
    await createPlaylist(user.uid, newPlaylistName);
    setNewPlaylistName("");
    await refreshPlaylists();
  }
  async function handleCreatePlaylistFromPanel() {
    if (!panelNewName.trim()) return;
    const id = await createPlaylist(user.uid, panelNewName);
    setPanelNewName("");
    setPanelNewOpen(false);
    await refreshPlaylists();
    setViewPlaylistId(id);
  }
  async function handleConfirmRenamePlaylist() {
    if (!renameInput.trim()) return;
    await renamePlaylist(renamingPlaylist.id, renameInput);
    setRenamingPlaylist(null);
    await refreshPlaylists();
  }
  async function handleConfirmDeletePlaylist() {
    await deletePlaylist(deletePlaylistTarget.id);
    if (viewPlaylistId === deletePlaylistTarget.id) setViewPlaylistId(LIBRARY_ID);
    if (managePlaylist === deletePlaylistTarget.id) setManagePlaylist("all");
    setDeletePlaylistTarget(null);
    await refreshPlaylists();
  }
  async function handleAddToPlaylist(playlistId) {
    await addTrackToPlaylist(playlistId, addToPlaylistFor.id);
    setAddToPlaylistFor(null);
    await refreshPlaylists();
  }
  async function handleRemoveFromPlaylist(playlistId, mediaId) {
    await removeTrackFromPlaylist(playlistId, mediaId);
    await refreshPlaylists();
  }
  async function handleReorderPlaylist(playlistId, orderedIds) {
    setPlaylists((prev) => prev.map((p) => (p.id === playlistId ? { ...p, trackIds: orderedIds } : p)));
    try {
      await reorderPlaylistTracks(playlistId, orderedIds);
    } catch {
      await refreshPlaylists();
    }
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
      await uploadExploreFile(file, file.name.replace(/\.[^/.]+$/, ""), setExploreProgress, exploreUploadCategory);
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
  async function handleConfirmSaveExploreLimit() {
    const mb = parseInt(exploreLimitInput, 10);
    if (!mb || mb <= 0) return;
    await setExploreLimitMB(mb);
    setExploreLimitMBState(mb);
    setConfirmingExploreLimit(false);
  }
  async function handleAddCategory() {
    const name = newCategoryName.trim();
    if (!name || exploreCategories.includes(name)) return;
    const next = [...exploreCategories, name];
    setExploreCategoriesState(next);
    setNewCategoryName("");
    await setExploreCategories(next);
  }
  async function handleRemoveCategory(name) {
    const next = exploreCategories.filter((c) => c !== name);
    setExploreCategoriesState(next);
    if (exploreActiveCategory === name) setExploreActiveCategory("all");
    await setExploreCategories(next);
  }

  // ---- Panel: daftar media yang sedang DILIHAT (Library atau playlist) ----
  const viewPlaylist = playlists.find((p) => p.id === viewPlaylistId);
  const panelItems = viewPlaylistId === LIBRARY_ID
    ? items
    : (viewPlaylist ? viewPlaylist.trackIds.map((id) => items.find((m) => m.id === id)).filter(Boolean) : []);
  const panelLabel = viewPlaylistId === LIBRARY_ID ? "Library" : viewPlaylist?.name || "Playlist";

  return (
    <div className={"gramofon-player" + (playing ? " gp-is-playing" : "")}>
      <header className="gp-topbar">
        <button className="gp-ibtn gp-menu-toggle" onClick={() => setMobileMenuOpen((v) => !v)} aria-label="Menu" data-tip-up="Menu">
          <IconMenu />
        </button>
        <button type="button" className="gp-brand" onClick={goTheaterHome} data-tip-up="Buka Theater">
          <Logo size={26} />
          <span className="gp-brand-name">Gramofon</span>
        </button>
        <nav className="gp-menu">
          {VIEW_MODES.map((v) => (
            <button
              key={v.key}
              type="button"
              className={"gp-menu-item" + (viewMode === v.key ? " is-active" : "")}
              onClick={() => selectView(v.key)}
            >
              <ViewIcon name={v.icon} />
              <span>{v.label}</span>
            </button>
          ))}
        </nav>
        <div className="gp-top-actions">
          <NotificationBell />
          <ProfileMenu />
        </div>
        {mobileMenuOpen && (
          <nav className="gp-menu-mobile">
            {VIEW_MODES.map((v) => (
              <button
                key={v.key}
                type="button"
                className={"gp-menu-item" + (viewMode === v.key ? " is-active" : "")}
                onClick={() => selectView(v.key)}
              >
                <ViewIcon name={v.icon} />
                <span>{v.label}</span>
              </button>
            ))}
          </nav>
        )}
      </header>

      {/* Elemen <video> SATU-SATUNYA di seluruh halaman. Wrapper ini selalu
          "position:fixed" di luar alur grid, lalu ditumpangkan tepat di
          atas anchor kosong di dalam stage Theater (lewat videoRect) atau
          dijadikan kotak mengambang di mode Mini -- supaya video yang
          sedang diputar TIDAK PERNAH remount/berhenti saat ganti menu. */}
      <div
        ref={viewMode === "mini" ? miniWrapRef : null}
        className={viewMode === "mini" ? "gp-mini-player" : ""}
        style={
          viewMode === "mini"
            ? undefined
            : videoRect
            ? { position: "fixed", top: videoRect.top, left: videoRect.left, width: videoRect.width, height: videoRect.height, zIndex: 5 }
            : { position: "fixed", width: 1, height: 1, overflow: "hidden", opacity: 0, pointerEvents: "none", top: 0, left: 0 }
        }
      >
        {viewMode === "mini" && (
          <div className="gp-mini-head" onPointerDown={handleDragStart}>
            <IconGrip style={{ width: 14, height: 14, color: "var(--gp-dim)" }} />
            <span className="gp-mini-title">{nowPlaying ? nowPlaying.title : "Belum ada media"}</span>
            <button className="gp-ibtn" style={{ width: 26, height: 26 }} onClick={() => setViewMode("theater")} data-tip-up="Perbesar">
              <IconExpand style={{ width: 13, height: 13 }} />
            </button>
          </div>
        )}
        <VideoScreen
          playerRef={playerRef}
          screenRef={videoScreenRef}
          onFrameClick={handleFrameClick}
          onContextMenu={openCtxMenu}
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
          onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
          onEnded={handleEnded}
          fill={viewMode !== "theater" || !!videoRect}
          overlayVisible={ovVisible}
          overlayProps={{
            title: nowPlaying?.title || "",
            playing,
            currentTime,
            duration,
            onSeek: (e) => { if (playerRef.current) playerRef.current.currentTime = Number(e.target.value); },
            onTogglePlay: togglePlay,
            onPrev: prev,
            onNext: next,
            onBack: backSkip,
            onFwd: fwdSkip,
            shuffle,
            onShuffle: () => setShuffle((v) => !v),
            repeatMode,
            onRepeat: cycleRepeat,
            muted,
            volumePercent,
            onToggleMute: toggleMute,
            onVolume: (e) => applyVolume(Number(e.target.value)),
            onFullscreen: () => toggleFullscreen(videoScreenRef.current),
            allowFullscreen: true,
          }}
        />
        {viewMode === "mini" && (
          <div className="gp-mini-controls">
            <button className="gp-ibtn" onClick={togglePlay} disabled={!nowPlaying} data-tip-up="Putar/Jeda">
              {playing ? <PauseIcon /> : <PlayIcon />}
            </button>
          </div>
        )}
      </div>

      {ctxMenu && (
        <VideoContextMenu
          x={ctxMenu.x}
          y={ctxMenu.y}
          loop={videoLoop}
          onToggleLoop={toggleLoop}
          rate={playbackRate}
          onSetSpeed={setSpeed}
          onPiP={togglePiP}
          onFullscreen={() => toggleFullscreen(videoScreenRef.current)}
        />
      )}

      <main className="gp-view">
        {viewMode === "theater" && (
          <div className="gp-stage-layout">
            <div className="gp-stage">
              {!nowPlaying ? (
                <div className="gp-screen" style={{ display: "flex" }}>
                  <div className="gp-empty" style={{ display: "flex" }}>
                    <IconFilm style={{ width: 34, height: 34 }} />
                    <b>Belum ada yang diputar</b>
                    <span>Pilih media di panel kanan untuk mulai menonton.</span>
                  </div>
                </div>
              ) : nowPlaying.resourceType === "video" ? (
                <div ref={theaterAnchorRef} className="gp-screen" style={{ visibility: "hidden" }} />
              ) : (
                <div className="gp-screen" style={{ display: "flex" }}>
                  <div className="gp-empty" style={{ display: "flex" }}>
                    <IconMusic style={{ width: 34, height: 34 }} />
                    <b>Media audio</b>
                    <span>Buka menu "Audio Only" untuk visual pemutar.</span>
                  </div>
                </div>
              )}
            </div>
            <PlaylistPanel
              playlists={playlists}
              viewPlaylistId={viewPlaylistId}
              setViewPlaylistId={setViewPlaylistId}
              panelItems={panelItems}
              panelLabel={panelLabel}
              onPlay={(m) => playItem(m, panelItems, panelLabel)}
              nowPlayingId={nowPlaying?.id}
              panelNewOpen={panelNewOpen}
              setPanelNewOpen={setPanelNewOpen}
              panelNewName={panelNewName}
              setPanelNewName={setPanelNewName}
              onCreatePlaylist={handleCreatePlaylistFromPanel}
              canReorder={viewPlaylistId !== LIBRARY_ID}
              onReorder={(orderedIds) => handleReorderPlaylist(viewPlaylistId, orderedIds)}
            />
          </div>
        )}

        {viewMode === "mini" && (
          <div className="gp-stage-layout">
            <div className="gp-stage">
              <p className="gp-muted" style={{ marginBottom: 12 }}>
                Video mengambang di layar — geser lewat bagian atasnya (ikon titik-titik).
              </p>
            </div>
            <PlaylistPanel
              playlists={playlists}
              viewPlaylistId={viewPlaylistId}
              setViewPlaylistId={setViewPlaylistId}
              panelItems={panelItems}
              panelLabel={panelLabel}
              onPlay={(m) => playItem(m, panelItems, panelLabel)}
              nowPlayingId={nowPlaying?.id}
              panelNewOpen={panelNewOpen}
              setPanelNewOpen={setPanelNewOpen}
              panelNewName={panelNewName}
              setPanelNewName={setPanelNewName}
              onCreatePlaylist={handleCreatePlaylistFromPanel}
              canReorder={viewPlaylistId !== LIBRARY_ID}
              onReorder={(orderedIds) => handleReorderPlaylist(viewPlaylistId, orderedIds)}
            />
          </div>
        )}

        {viewMode === "audio" && (
          <div className="gp-stage-layout">
            <div className="gp-audio-stage" ref={audioStageRef} style={{ position: "relative" }} onClick={handleFrameClick}>
              <div className="gp-disc-wrap">
                <div className="gp-disc">
                  <div className="gp-disc-label" />
                  <div className="gp-disc-hole" />
                </div>
              </div>
              <div className="gp-notes-fx">
                {[0, 1, 2, 3, 4].map((i) => (
                  <span key={i} className="gp-note" style={{ "--i": i }}>
                    <IconMusic style={{ width: "100%", height: "100%" }} />
                  </span>
                ))}
              </div>
              <PlaybackOverlay
                visible={ovVisible}
                title={nowPlaying?.title || ""}
                playing={playing}
                currentTime={currentTime}
                duration={duration}
                onSeek={(e) => { if (playerRef.current) playerRef.current.currentTime = Number(e.target.value); }}
                onTogglePlay={togglePlay}
                onPrev={prev}
                onNext={next}
                onBack={backSkip}
                onFwd={fwdSkip}
                shuffle={shuffle}
                onShuffle={() => setShuffle((v) => !v)}
                repeatMode={repeatMode}
                onRepeat={cycleRepeat}
                muted={muted}
                volumePercent={volumePercent}
                onToggleMute={toggleMute}
                onVolume={(e) => applyVolume(Number(e.target.value))}
                allowFullscreen={false}
              />
            </div>
            <PlaylistPanel
              playlists={playlists}
              viewPlaylistId={viewPlaylistId}
              setViewPlaylistId={setViewPlaylistId}
              panelItems={panelItems}
              panelLabel={panelLabel}
              onPlay={(m) => playItem(m, panelItems, panelLabel)}
              nowPlayingId={nowPlaying?.id}
              panelNewOpen={panelNewOpen}
              setPanelNewOpen={setPanelNewOpen}
              panelNewName={panelNewName}
              setPanelNewName={setPanelNewName}
              onCreatePlaylist={handleCreatePlaylistFromPanel}
              canReorder={viewPlaylistId !== LIBRARY_ID}
              onReorder={(orderedIds) => handleReorderPlaylist(viewPlaylistId, orderedIds)}
            />
          </div>
        )}

        {viewMode === "manage" && (
          <ManageMediaView
            items={items}
            loading={loading}
            usedBytes={usedBytes}
            limitMB={limitMB}
            videoBytes={videoBytes}
            audioBytes={audioBytes}
            videoPct={videoPct}
            audioPct={audioPct}
            uploading={uploading}
            progress={progress}
            uploadErr={uploadErr}
            fileInputRef={fileInputRef}
            onFileChange={handleFileChange}
            onPlay={(m, list, label) => playItem(m, list, label)}
            onDelete={setDeleteTarget}
            onBulkDelete={(ids) => setBulkDeleteIds(ids)}
            nowPlayingId={nowPlaying?.id}
            playlists={playlists}
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
            onReorderPlaylist={handleReorderPlaylist}
            search={manageSearch}
            setSearch={setManageSearch}
            typeFilter={manageType}
            setTypeFilter={setManageType}
            playlistFilter={managePlaylist}
            setPlaylistFilter={setManagePlaylist}
            sortBy={manageSort}
            setSortBy={setManageSort}
            sel={manageSel}
            setSel={setManageSel}
          />
        )}

        {viewMode === "explore" && (
          <ExploreView
            isAdmin={isAdmin}
            exploreOn={exploreOn}
            loadingExplore={loadingExplore}
            items={exploreItems}
            search={exploreSearch}
            setSearch={setExploreSearch}
            onPlay={(m) => playItem(m, exploreItems, "Explore")}
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
            onSaveLimitClick={() => setConfirmingExploreLimit(true)}
            categories={exploreCategories}
            activeCategory={exploreActiveCategory}
            setActiveCategory={setExploreActiveCategory}
            uploadCategory={exploreUploadCategory}
            setUploadCategory={setExploreUploadCategory}
            newCategoryName={newCategoryName}
            setNewCategoryName={setNewCategoryName}
            onAddCategory={handleAddCategory}
            onRemoveCategory={handleRemoveCategory}
          />
        )}
      </main>

      <footer className="gp-bottombar">
        <div className="gp-np">
          <div className={"gp-np-thumb" + (videoThumbUrl(nowPlaying) ? " has-img" : "")} style={videoThumbUrl(nowPlaying) ? { backgroundImage: `url(${videoThumbUrl(nowPlaying)})` } : undefined}>
            <span className="gp-np-ic">{nowPlaying ? nowPlaying.resourceType === "video" ? <IconFilm /> : <IconMusic /> : <IconFilm />}</span>
          </div>
          <div className="gp-np-text">
            <b className="gp-np-title gp-ellip gp-tip-title" data-tip={nowPlaying ? nowPlaying.title : undefined}>
              {nowPlaying ? nowPlaying.title : "Belum ada yang diputar"}
            </b>
            <span className="gp-np-sub">
              Di playlist <em>{queueLabel}</em>
            </span>
          </div>
        </div>

        <div className="gp-transport">
          <div className="gp-controls">
            <button
              type="button"
              className={"gp-ibtn" + (shuffle ? " on" : "")}
              onClick={() => setShuffle((v) => !v)}
              data-tip-up="Acak Urutan"
            >
              <ShuffleIcon />
            </button>
            <button type="button" className="gp-ibtn" onClick={prev} disabled={!queue.length} data-tip-up="Sebelumnya">
              <PrevIcon />
            </button>
            <button type="button" className="gp-ibtn" onClick={backSkip} disabled={!nowPlaying} data-tip-up={`Mundur ${skipSeconds} detik`}>
              <Back10Icon />
            </button>
            <button
              type="button"
              className="gp-ibtn gp-btn-play"
              onClick={togglePlay}
              disabled={!nowPlaying}
              data-tip-up={playing ? "Jeda" : "Putar"}
            >
              {playing ? <PauseIcon /> : <PlayIcon />}
            </button>
            <button type="button" className="gp-ibtn" onClick={fwdSkip} disabled={!nowPlaying} data-tip-up={`Maju ${skipSeconds} detik`}>
              <Fwd10Icon />
            </button>
            <button type="button" className="gp-ibtn" onClick={next} disabled={!queue.length} data-tip-up="Berikutnya">
              <NextIcon />
            </button>
            <button
              type="button"
              className={"gp-ibtn" + (repeatMode !== "off" ? " on" : "")}
              onClick={cycleRepeat}
              data-tip-up={repeatMode === "off" ? "Ulangi: Mati" : repeatMode === "queue" ? "Ulangi: Antrean" : "Ulangi: Satu Lagu"}
            >
              <RepeatIcon />
              {repeatMode === "track" && (
                <span style={{ position: "absolute", bottom: -2, right: -2, fontSize: 8, fontWeight: 700, background: "var(--gp-accent)", color: "var(--gp-accent-ink)", borderRadius: "50%", width: 12, height: 12, display: "grid", placeItems: "center" }}>
                  1
                </span>
              )}
            </button>
          </div>
          <div className="gp-seek">
            <span className="gp-time">{formatTime(currentTime)}</span>
            <input
              type="range"
              min="0"
              max={duration || 0}
              value={currentTime}
              onChange={(e) => {
                if (playerRef.current) playerRef.current.currentTime = Number(e.target.value);
              }}
              disabled={!nowPlaying}
              aria-label="Posisi pemutaran"
            />
            <span className="gp-time">{formatTime(duration)}</span>
          </div>
        </div>

        <div className="gp-extras">
          <div className="gp-dd-wrap">
            <button
              type="button"
              className={"gp-ibtn gp-sleep-btn" + (sleepEndAt ? " on" : "")}
              onClick={() => setSleepOpen((v) => !v)}
              data-tip-up="Timer Tidur"
            >
              <TimerIcon />
              {sleepEndAt && <span>{sleepLabel}</span>}
            </button>
            {sleepOpen && (
              <div className="gp-dropdown" onMouseLeave={() => setSleepOpen(false)}>
                <b>Timer tidur</b>
                <div className="gp-sleep-quick">
                  {SLEEP_PRESETS.map((m) => (
                    <button key={m} className="gp-chip sm" onClick={() => startSleep(m)}>
                      {m >= 60 ? `${m / 60} jam` : `${m} menit`}
                    </button>
                  ))}
                </div>
                <div className="gp-sleep-custom">
                  <input
                    type="number"
                    min="1"
                    value={sleepCustomNum}
                    onChange={(e) => setSleepCustomNum(e.target.value)}
                  />
                  <div className="segmented">
                    <button
                      type="button"
                      className={"segmented__btn" + (sleepCustomUnit === "menit" ? " is-active" : "")}
                      onClick={() => setSleepCustomUnit("menit")}
                    >
                      Menit
                    </button>
                    <button
                      type="button"
                      className={"segmented__btn" + (sleepCustomUnit === "jam" ? " is-active" : "")}
                      onClick={() => setSleepCustomUnit("jam")}
                    >
                      Jam
                    </button>
                  </div>
                </div>
                <button
                  className="gp-btn sm primary"
                  style={{ width: "100%", justifyContent: "center", marginTop: 10 }}
                  onClick={() => {
                    const n = Math.floor(+sleepCustomNum);
                    if (n > 0) startSleep(sleepCustomUnit === "jam" ? n * 60 : n);
                  }}
                >
                  Terapkan
                </button>
                {sleepEndAt && (
                  <>
                    <div className="gp-dd-sep" />
                    <button className="gp-link" onClick={() => startSleep(0)}>
                      Matikan timer
                    </button>
                  </>
                )}
              </div>
            )}
          </div>

          <div className="gp-vol-group">
            <button type="button" className="gp-ibtn" onClick={toggleMute} data-tip-up="Bisukan">
              {muted || volumePercent === 0 ? <MuteIcon /> : <VolumeIcon />}
            </button>
            <input
              type="range"
              className="gp-vol-slider"
              min="0"
              max="120"
              value={muted ? 0 : volumePercent}
              onChange={(e) => applyVolume(Number(e.target.value))}
              aria-label="Volume"
            />
            <span className="gp-vol-num">{muted ? 0 : volumePercent}%</span>
          </div>
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

      <ConfirmDialog
        open={!!bulkDeleteIds}
        title={`Hapus ${bulkDeleteIds?.length || 0} media terpilih?`}
        message="Semua file terpilih akan dihapus permanen dari penyimpanan dan tidak bisa dikembalikan."
        confirmLabel="Ya, Hapus Semua"
        danger
        busy={bulkDeleteBusy}
        onCancel={() => setBulkDeleteIds(null)}
        onConfirm={handleConfirmBulkDelete}
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
              <p className="hint-text">Belum ada playlist — buat dulu di menu Manage Media.</p>
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

      <ConfirmDialog
        open={confirmingExploreLimit}
        title="Simpan batas total Explore?"
        message={`Batas total penyimpanan Explore akan diubah menjadi ${exploreLimitInput}MB.`}
        confirmLabel="Ya, Simpan"
        onCancel={() => setConfirmingExploreLimit(false)}
        onConfirm={handleConfirmSaveExploreLimit}
      />
    </div>
  );
}

function VideoScreen({ playerRef, screenRef, onFrameClick, onContextMenu, onPlay, onPause, onTimeUpdate, onLoadedMetadata, onEnded, fill, overlayVisible, overlayProps }) {
  return (
    <div
      className="gp-screen"
      ref={screenRef}
      style={fill ? { width: "100%", height: "100%", margin: 0 } : undefined}
      onClick={onFrameClick}
    >
      <video
        ref={playerRef}
        playsInline
        crossOrigin="anonymous"
        onPlay={onPlay}
        onPause={onPause}
        onTimeUpdate={onTimeUpdate}
        onLoadedMetadata={onLoadedMetadata}
        onEnded={onEnded}
        onContextMenu={onContextMenu}
      />
      <PlaybackOverlay visible={overlayVisible} {...overlayProps} />
    </div>
  );
}

function PlaybackOverlay({
  visible,
  title,
  playing,
  currentTime,
  duration,
  onSeek,
  onTogglePlay,
  onPrev,
  onNext,
  onBack,
  onFwd,
  shuffle,
  onShuffle,
  repeatMode,
  onRepeat,
  muted,
  volumePercent,
  onToggleMute,
  onVolume,
  onFullscreen,
  allowFullscreen,
}) {
  return (
    <div className={"gp-video-overlay" + (visible ? " show" : "")} onClick={(e) => e.stopPropagation()}>
      <div className="gp-ov-top">
        {allowFullscreen && (
          <button onClick={onFullscreen} aria-label="Layar penuh">
            <IconExpand style={{ width: 16, height: 16 }} />
          </button>
        )}
      </div>
      <div className="gp-ov-mid">
        <button onClick={onPrev} aria-label="Sebelumnya">
          <PrevIcon />
        </button>
        <button onClick={onBack} aria-label="Mundur">
          <Back10Icon />
        </button>
        <button className="gp-ov-play" onClick={onTogglePlay} aria-label="Putar/Jeda">
          {playing ? <PauseIcon style={{ width: 22, height: 22 }} /> : <PlayIcon style={{ width: 22, height: 22 }} />}
        </button>
        <button onClick={onFwd} aria-label="Maju">
          <Fwd10Icon />
        </button>
        <button onClick={onNext} aria-label="Berikutnya">
          <NextIcon />
        </button>
      </div>
      <div className="gp-ov-bottom">
        {title && <div className="gp-ov-title gp-ellip">{title}</div>}
        <div className="gp-ov-seek">
          <span className="gp-time">{formatTime(currentTime)}</span>
          <input type="range" min="0" max={duration || 0} value={currentTime} onChange={onSeek} aria-label="Posisi pemutaran" />
          <span className="gp-time">{formatTime(duration)}</span>
        </div>
        <div className="gp-ov-row2">
          <div className="gp-ov-side">
            <button className={shuffle ? "on" : ""} onClick={onShuffle} aria-label="Acak">
              <ShuffleIcon />
            </button>
            <button className={repeatMode !== "off" ? "on" : ""} onClick={onRepeat} aria-label="Ulangi">
              <RepeatIcon />
            </button>
          </div>
          <div className="gp-ov-side">
            <button onClick={onToggleMute} aria-label="Bisukan">
              {muted || volumePercent === 0 ? <MuteIcon /> : <VolumeIcon />}
            </button>
            <input type="range" className="gp-ov-vol" min="0" max="120" value={muted ? 0 : volumePercent} onChange={onVolume} aria-label="Volume" />
          </div>
        </div>
      </div>
    </div>
  );
}

function VideoContextMenu({ x, y, loop, onToggleLoop, rate, onSetSpeed, onPiP, onFullscreen }) {
  return (
    <div className="gp-ctxmenu" style={{ left: x, top: y }} onClick={(e) => e.stopPropagation()} onContextMenu={(e) => e.preventDefault()}>
      <button type="button" className={loop ? "on" : ""} onClick={onToggleLoop}>
        <IconLoop style={{ width: 15, height: 15 }} />
        Ulangi Video (Loop)
      </button>
      <div className="gp-ctx-sep" />
      <div className="gp-ctx-label">Kecepatan Putar</div>
      <div className="gp-ctx-sub">
        {SPEED_OPTIONS.map((r) => (
          <button type="button" key={r} className={rate === r ? "on" : ""} onClick={() => onSetSpeed(r)}>
            {r}x
          </button>
        ))}
      </div>
      <div className="gp-ctx-sep" />
      <button type="button" onClick={onPiP}>
        <IconPip style={{ width: 15, height: 15 }} />
        Picture-in-Picture
      </button>
      <button type="button" onClick={onFullscreen}>
        <IconExpand style={{ width: 15, height: 15 }} />
        Layar Penuh
      </button>
    </div>
  );
}

function PlaylistPanel({
  playlists,
  viewPlaylistId,
  setViewPlaylistId,
  panelItems,
  panelLabel,
  onPlay,
  nowPlayingId,
  panelNewOpen,
  setPanelNewOpen,
  panelNewName,
  setPanelNewName,
  onCreatePlaylist,
  canReorder,
  onReorder,
}) {
  const [dragIdx, setDragIdx] = useState(null);
  const [overIdx, setOverIdx] = useState(null);

  function handleDrop(idx) {
    if (dragIdx === null || dragIdx === idx) {
      setDragIdx(null);
      setOverIdx(null);
      return;
    }
    const ids = panelItems.map((m) => m.id);
    const [moved] = ids.splice(dragIdx, 1);
    ids.splice(idx, 0, moved);
    onReorder(ids);
    setDragIdx(null);
    setOverIdx(null);
  }

  return (
    <aside className="gp-panel">
      <div className="gp-panel-head">
        <div className="gp-select-wrap">
          <select value={viewPlaylistId} onChange={(e) => setViewPlaylistId(e.target.value)}>
            <option value={LIBRARY_ID}>Library (semua media)</option>
            {playlists.map((pl) => (
              <option key={pl.id} value={pl.id}>
                {pl.name}
              </option>
            ))}
          </select>
        </div>
        <button type="button" className="gp-panel-addbtn" onClick={() => setPanelNewOpen((v) => !v)} data-tip-up="Playlist Baru">
          <IconPlus style={{ width: 16, height: 16 }} />
        </button>
      </div>
      {panelNewOpen && (
        <div className="gp-panel-newrow">
          <input
            autoFocus
            placeholder="Nama playlist baru..."
            value={panelNewName}
            onChange={(e) => setPanelNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") onCreatePlaylist();
            }}
          />
          <button className="gp-btn sm primary" onClick={onCreatePlaylist}>
            Buat
          </button>
        </div>
      )}
      <div className="gp-panel-sub">
        <span>{panelLabel}</span>
        <span>{panelItems.length} media</span>
      </div>
      <ul className="gp-plist">
        {panelItems.length === 0 ? (
          <li className="gp-empty-list">Belum ada media di sini.</li>
        ) : (
          panelItems.map((m, idx) => {
            const thumb = videoThumbUrl(m);
            return (
              <li
                key={m.id}
                className={
                  "gp-pl-item" +
                  (nowPlayingId === m.id ? " is-current" : "") +
                  (dragIdx === idx ? " is-dragging" : "") +
                  (overIdx === idx ? " is-dragover" : "")
                }
                draggable={canReorder}
                onDragStart={() => setDragIdx(idx)}
                onDragOver={(e) => {
                  if (canReorder) {
                    e.preventDefault();
                    setOverIdx(idx);
                  }
                }}
                onDrop={() => canReorder && handleDrop(idx)}
                onDragEnd={() => {
                  setDragIdx(null);
                  setOverIdx(null);
                }}
              >
                {canReorder && (
                  <span className="gp-drag-handle" data-tip-up="Geser untuk urutkan">
                    <IconGrip style={{ width: 14, height: 14 }} />
                  </span>
                )}
                <button type="button" className="gp-pl-main" onClick={() => onPlay(m)}>
                  <div className={"gp-thumb" + (thumb ? " has-img" : "")} style={thumb ? { backgroundImage: `url(${thumb})` } : undefined}>
                    <span className="gp-thumb-ic">
                      {m.resourceType === "video" ? <IconFilm style={{ width: 16, height: 16 }} /> : <IconMusic style={{ width: 16, height: 16 }} />}
                    </span>
                    <span className="gp-eq">
                      <i />
                      <i />
                      <i />
                    </span>
                  </div>
                  <div className="gp-pl-text">
                    <b className="gp-tip-title" data-tip={m.title}>
                      {m.title}
                    </b>
                    <small>
                      {m.resourceType} {formatBytes(m.bytes)}
                      {m.durationSeconds ? ` · ${formatTime(m.durationSeconds)}` : ""}
                    </small>
                  </div>
                </button>
              </li>
            );
          })
        )}
      </ul>
    </aside>
  );
}

function ManageMediaView({
  items,
  loading,
  usedBytes,
  limitMB,
  videoBytes,
  audioBytes,
  videoPct,
  audioPct,
  uploading,
  progress,
  uploadErr,
  fileInputRef,
  onFileChange,
  onPlay,
  onDelete,
  onBulkDelete,
  nowPlayingId,
  playlists,
  newPlaylistName,
  setNewPlaylistName,
  onCreatePlaylist,
  onOpenRename,
  onDeletePlaylistClick,
  onAddToPlaylistClick,
  onRemoveFromPlaylist,
  onReorderPlaylist,
  search,
  setSearch,
  typeFilter,
  setTypeFilter,
  playlistFilter,
  setPlaylistFilter,
  sortBy,
  setSortBy,
  sel,
  setSel,
}) {
  const [selectMode, setSelectMode] = useState(false);
  const [dragIdx, setDragIdx] = useState(null);
  const [overIdx, setOverIdx] = useState(null);

  const activePlaylist = playlistFilter === "all" ? null : playlists.find((p) => p.id === playlistFilter);
  const canDrag = !!activePlaylist && !search.trim() && typeFilter === "all";

  let rows = playlistFilter === "all"
    ? items
    : activePlaylist
    ? activePlaylist.trackIds.map((id) => items.find((m) => m.id === id)).filter(Boolean)
    : [];

  if (typeFilter !== "all") rows = rows.filter((m) => m.resourceType === typeFilter);
  if (search.trim()) {
    const q = search.trim().toLowerCase();
    rows = rows.filter((m) => (m.title || "").toLowerCase().includes(q));
  }
  if (!canDrag) {
    rows = [...rows].sort((a, b) => {
      if (sortBy === "title") return (a.title || "").localeCompare(b.title || "");
      if (sortBy === "sizeDesc") return (b.bytes || 0) - (a.bytes || 0);
      if (sortBy === "sizeAsc") return (a.bytes || 0) - (b.bytes || 0);
      const at = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
      const bt = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
      return bt - at;
    });
  }

  function toggleRow(id) {
    setSel((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }
  function toggleAll() {
    setSel((prev) => (prev.size === rows.length ? new Set() : new Set(rows.map((m) => m.id))));
  }
  function bulkDelete() {
    const ids = [...sel];
    if (activePlaylist) {
      (async () => {
        for (const id of ids) await onRemoveFromPlaylist(activePlaylist.id, id);
        setSel(new Set());
      })();
    } else {
      onBulkDelete(ids);
    }
  }
  function handleRowDrop(idx) {
    if (dragIdx === null || dragIdx === idx || !activePlaylist) {
      setDragIdx(null);
      setOverIdx(null);
      return;
    }
    const ids = rows.map((m) => m.id);
    const [moved] = ids.splice(dragIdx, 1);
    ids.splice(idx, 0, moved);
    onReorderPlaylist(activePlaylist.id, ids);
    setDragIdx(null);
    setOverIdx(null);
  }

  return (
    <div className="gp-scroll-page">
      <div className="gp-page-head">
        <div>
          <h2>Manage Media</h2>
          <p>Kelola koleksi video &amp; musik pribadi Anda, dan atur playlist.</p>
        </div>
        <div>
          <input ref={fileInputRef} type="file" accept={ACCEPTED_TYPES} style={{ display: "none" }} onChange={onFileChange} />
          <button className="gp-btn primary" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
            <IconPlus style={{ width: 16, height: 16 }} />
            {uploading ? `Mengunggah... ${progress}%` : "Upload Video/Musik"}
          </button>
        </div>
      </div>
      {uploadErr && <p className="error-text">{uploadErr}</p>}

      <div className="gp-manage-grid">
        <div className="gp-card">
          <div className="gp-card-title">
            <h3>Penyimpanan</h3>
          </div>
          <div className="gp-storage-num">
            <b>{formatBytes(usedBytes)}</b>
            <span>dari {limitMB}MB</span>
          </div>
          <div className="gp-stack">
            <i className="gp-seg-v" style={{ width: `${videoPct}%` }} />
            <i className="gp-seg-a" style={{ width: `${audioPct}%` }} />
          </div>
          <ul className="gp-legend">
            <li><span className="gp-dot v" /> Video <b>{formatBytes(videoBytes)}</b></li>
            <li><span className="gp-dot a" /> Audio <b>{formatBytes(audioBytes)}</b></li>
            <li><span className="gp-dot f" /> Sisa <b>{formatBytes(Math.max(0, limitMB * 1024 * 1024 - usedBytes))}</b></li>
          </ul>
        </div>

        <div className="gp-card">
          <div className="gp-card-title">
            <h3>Playlist</h3>
          </div>
          <ul className="gp-pl-rows">
            <li
              className={"gp-pl-row" + (playlistFilter === "all" ? " is-active" : "")}
              onClick={() => setPlaylistFilter("all")}
            >
              <div className="gp-info">
                <b>Library (Semua media)</b>
                <small>{items.length} media</small>
              </div>
            </li>
            {playlists.map((pl) => (
              <li
                key={pl.id}
                className={"gp-pl-row" + (playlistFilter === pl.id ? " is-active" : "")}
                onClick={() => setPlaylistFilter(pl.id)}
              >
                <div className="gp-info">
                  <b>{pl.name}</b>
                  <small>{pl.trackIds?.length || 0} media</small>
                </div>
                <button
                  className="gp-ibtn"
                  style={{ width: 28, height: 28 }}
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpenRename(pl);
                  }}
                  data-tip-up="Ubah nama"
                >
                  <IconPencil style={{ width: 14, height: 14 }} />
                </button>
                <button
                  className="gp-ibtn"
                  style={{ width: 28, height: 28 }}
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeletePlaylistClick(pl);
                  }}
                  data-tip-up="Hapus playlist"
                >
                  <IconTrash style={{ width: 14, height: 14 }} />
                </button>
              </li>
            ))}
          </ul>
          <div className="gp-new-playlist">
            <input
              placeholder="Nama playlist baru..."
              value={newPlaylistName}
              onChange={(e) => setNewPlaylistName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") onCreatePlaylist();
              }}
            />
            <button className="gp-btn sm primary" onClick={onCreatePlaylist}>
              Buat
            </button>
          </div>
        </div>
      </div>

      <div className="gp-toolbar">
        <div className="gp-field grow">
          <IconSearch style={{ width: 15, height: 15 }} />
          <input placeholder="Cari judul..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <select className="gp-select-plain" value={playlistFilter} onChange={(e) => { setPlaylistFilter(e.target.value); setSel(new Set()); }}>
          <option value="all">Semua Media</option>
          {playlists.map((pl) => (
            <option key={pl.id} value={pl.id}>{pl.name}</option>
          ))}
        </select>
        <select className="gp-select-plain" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
          <option value="all">Semua tipe</option>
          <option value="video">Video</option>
          <option value="audio">Audio</option>
        </select>
        {!canDrag && (
          <select className="gp-select-plain" value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
            <option value="newest">Terbaru</option>
            <option value="title">Judul (A-Z)</option>
            <option value="sizeDesc">Ukuran terbesar</option>
            <option value="sizeAsc">Ukuran terkecil</option>
          </select>
        )}
        <button
          type="button"
          className={"gp-btn sm" + (selectMode ? " primary" : "")}
          onClick={() => {
            setSelectMode((v) => !v);
            setSel(new Set());
          }}
        >
          {selectMode ? "Batalkan Pilih" : "Pilih"}
        </button>
        {selectMode && (
          <button type="button" className="gp-btn sm" onClick={toggleAll}>
            {sel.size === rows.length && rows.length > 0 ? "Batalkan Semua" : "Pilih Semua"}
          </button>
        )}
      </div>

      {selectMode && sel.size > 0 && (
        <div className="gp-bulkbar">
          <span>{sel.size} dipilih</span>
          <button className="gp-link" style={{ color: "var(--gp-danger)", marginLeft: "auto" }} onClick={bulkDelete}>
            {activePlaylist ? "Keluarkan dari playlist" : "Hapus terpilih"}
          </button>
        </div>
      )}

      <div className="gp-table-wrap">
        {loading ? (
          <div className="gp-table-empty">Memuat...</div>
        ) : rows.length === 0 ? (
          <div className="gp-table-empty">
            {activePlaylist ? "Playlist ini masih kosong." : "Belum ada video/musik di sini."}
          </div>
        ) : (
          <table className="gp-table">
            <thead>
              <tr>
                {canDrag && <th className="gp-drag-col"></th>}
                {selectMode && (
                  <th style={{ width: 32 }}>
                    <input type="checkbox" checked={sel.size === rows.length} onChange={toggleAll} />
                  </th>
                )}
                <th>Judul</th>
                <th>Tipe</th>
                <th>Ukuran</th>
                <th className="gp-th-acts">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((m, idx) => {
                const thumb = videoThumbUrl(m);
                return (
                <tr
                  key={m.id}
                  className={(nowPlayingId === m.id ? "is-current " : "") + (dragIdx === idx ? "is-dragging " : "") + (overIdx === idx ? "is-dragover " : "")}
                  draggable={canDrag}
                  onDragStart={() => setDragIdx(idx)}
                  onDragOver={(e) => { if (canDrag) { e.preventDefault(); setOverIdx(idx); } }}
                  onDrop={() => canDrag && handleRowDrop(idx)}
                  onDragEnd={() => { setDragIdx(null); setOverIdx(null); }}
                >
                  {canDrag && (
                    <td className="gp-drag-col" data-tip-up="Geser untuk urutkan">
                      <IconGrip style={{ width: 14, height: 14, color: "var(--gp-dim)" }} />
                    </td>
                  )}
                  {selectMode && (
                    <td>
                      <input type="checkbox" checked={sel.has(m.id)} onChange={() => toggleRow(m.id)} />
                    </td>
                  )}
                  <td>
                    <div className="gp-title-cell">
                      <div className={"gp-thumb" + (thumb ? " has-img" : "")} style={{ width: 32, height: 32, ...(thumb ? { backgroundImage: `url(${thumb})` } : {}) }}>
                        {m.resourceType === "video" ? <IconFilm style={{ width: 14, height: 14 }} /> : <IconMusic style={{ width: 14, height: 14 }} />}
                      </div>
                      <span className="gp-t-name gp-ellip gp-tip-title" data-tip={m.title}>{m.title}</span>
                    </div>
                  </td>
                  <td>
                    <span className={"gp-tag " + m.resourceType}>{m.resourceType === "video" ? "Video" : "Audio"}</span>
                  </td>
                  <td className="gp-muted">{formatBytes(m.bytes)}</td>
                  <td className="gp-acts">
                    <span className="gp-acts-inner">
                      <button className="gp-ibtn" style={{ width: 28, height: 28 }} data-tip-up="Putar" onClick={() => onPlay(m, rows, activePlaylist ? activePlaylist.name : "Manage Media")}>
                        <PlayIcon style={{ width: 13, height: 13 }} />
                      </button>
                      {!activePlaylist && (
                        <button className="gp-ibtn" style={{ width: 28, height: 28 }} data-tip-up="Tambah ke playlist" onClick={() => onAddToPlaylistClick(m)}>
                          <IconPlus style={{ width: 14, height: 14 }} />
                        </button>
                      )}
                      {activePlaylist ? (
                        <button className="gp-ibtn" style={{ width: 28, height: 28 }} data-tip-up="Keluarkan dari playlist" onClick={() => onRemoveFromPlaylist(activePlaylist.id, m.id)}>
                          <IconX style={{ width: 14, height: 14 }} />
                        </button>
                      ) : (
                        <button className="gp-ibtn" style={{ width: 28, height: 28, color: "var(--gp-danger)" }} data-tip-up="Hapus" onClick={() => onDelete(m)}>
                          <IconTrash style={{ width: 14, height: 14 }} />
                        </button>
                      )}
                    </span>
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function ExploreView({
  isAdmin,
  exploreOn,
  loadingExplore,
  items,
  search,
  setSearch,
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
  onSaveLimitClick,
  categories,
  activeCategory,
  setActiveCategory,
  uploadCategory,
  setUploadCategory,
  newCategoryName,
  setNewCategoryName,
  onAddCategory,
  onRemoveCategory,
}) {
  if (!loadingExplore && !exploreOn && !isAdmin) {
    return (
      <div className="gp-scroll-page">
        <div className="gp-table-empty">Explore sedang dinonaktifkan oleh admin.</div>
      </div>
    );
  }
  const q = search.trim().toLowerCase();
  let filtered = q ? items.filter((m) => (m.title || "").toLowerCase().includes(q)) : items;
  if (activeCategory !== "all") filtered = filtered.filter((m) => (m.category || null) === activeCategory);

  return (
    <div className="gp-scroll-page">
      <div className="gp-page-head">
        <div>
          <h2>Explore</h2>
          <p>Media publik yang dikurasi admin untuk semua pengguna.</p>
        </div>
        <div className="gp-field grow" style={{ maxWidth: 260 }}>
          <IconSearch style={{ width: 15, height: 15 }} />
          <input placeholder="Cari judul..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      </div>

      {isAdmin && (
        <div className="gp-manage-grid" style={{ gridTemplateColumns: "1fr" }}>
          <div className="gp-card">
            <div className="gp-card-title">
              <h3>Kelola Explore (admin)</h3>
            </div>
            {!exploreOn && <p className="gp-muted" style={{ marginBottom: 10 }}>Sedang dimatikan untuk pengguna biasa.</p>}
            <div className="gp-storage-num">
              <b>{formatBytes(usedBytes)}</b>
              <span>dari {limitMB}MB (batas total Explore)</span>
            </div>
            <div className="gp-stack">
              <i className="gp-seg-v" style={{ width: `${usedPct}%` }} />
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 14 }}>
              <input type="number" min="1" value={limitInput} onChange={(e) => setLimitInput(e.target.value)} />
              <span className="gp-muted">MB</span>
              <button className="gp-btn sm" onClick={onSaveLimitClick}>Simpan batas</button>
            </div>

            <div className="gp-card-title" style={{ marginBottom: 6 }}>
              <h3 style={{ fontSize: 13 }}>Kategori</h3>
            </div>
            <div className="gp-cat-manage">
              {categories.length === 0 && <span className="gp-muted" style={{ fontSize: 12.5 }}>Belum ada kategori.</span>}
              {categories.map((c) => (
                <span className="gp-cat-tag" key={c}>
                  {c}
                  <button onClick={() => onRemoveCategory(c)} data-tip-up="Hapus kategori">
                    <IconX style={{ width: 11, height: 11 }} />
                  </button>
                </span>
              ))}
            </div>
            <div className="gp-new-playlist" style={{ marginTop: 8, marginBottom: 14 }}>
              <input placeholder="Nama kategori baru..." value={newCategoryName} onChange={(e) => setNewCategoryName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") onAddCategory(); }} />
              <button className="gp-btn sm" onClick={onAddCategory}>Tambah</button>
            </div>

            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 10 }}>
              <select className="gp-select-plain" value={uploadCategory} onChange={(e) => setUploadCategory(e.target.value)}>
                <option value="">Tanpa kategori</option>
                {categories.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
              <input ref={fileInputRef} type="file" accept={ACCEPTED_TYPES} style={{ display: "none" }} onChange={onFileChange} />
              <button className="gp-btn primary" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
                <IconPlus style={{ width: 16, height: 16 }} />
                {uploading ? `Mengunggah... ${progress}%` : "Tambah ke Explore"}
              </button>
            </div>
            {err && <p className="error-text">{err}</p>}
          </div>
        </div>
      )}

      {categories.length > 0 && (
        <div className="gp-cat-chips">
          <button type="button" className={"gp-chip sm" + (activeCategory === "all" ? " on" : "")} onClick={() => setActiveCategory("all")}>
            Semua
          </button>
          {categories.map((c) => (
            <button key={c} type="button" className={"gp-chip sm" + (activeCategory === c ? " on" : "")} onClick={() => setActiveCategory(c)}>
              {c}
            </button>
          ))}
        </div>
      )}

      {loadingExplore ? (
        <p className="gp-muted">Memuat...</p>
      ) : filtered.length === 0 ? (
        <div className="gp-table-empty">Belum ada media di Explore.</div>
      ) : (
        <div className="gp-card-grid">
          {filtered.map((m) => {
            const thumb = videoThumbUrl(m);
            return (
            <div key={m.id} className={"gp-xcard" + (nowPlayingId === m.id ? " is-current" : "")}>
              <div className="gp-xthumb" style={thumb ? { backgroundImage: `url(${thumb})` } : undefined} onClick={() => onPlay(m)}>
                <span className="gp-type-badge">
                  {m.resourceType === "video" ? <IconFilm /> : <IconMusic />}
                </span>
                <span className="gp-xplay">
                  <PlayIcon style={{ width: 16, height: 16 }} />
                </span>
                {isAdmin && (
                  <button
                    className="gp-ibtn"
                    style={{ position: "absolute", right: 6, top: 6, width: 26, height: 26, background: "rgba(4,3,8,.72)", color: "#fff" }}
                    onClick={(e) => {
                      e.stopPropagation();
                      onDelete(m);
                    }}
                    data-tip-up="Hapus dari Explore"
                  >
                    <IconTrash style={{ width: 13, height: 13 }} />
                  </button>
                )}
              </div>
              <div className="gp-xbody">
                <b className="gp-tip-title" data-tip={m.title}>{m.title}</b>
                <small>
                  {m.resourceType === "video" ? "Video" : "Audio"} · {formatBytes(m.bytes)}
                  {m.category ? ` · ${m.category}` : ""}
                </small>
              </div>
            </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ============================================================
   IKON — set konsisten, dipakai di seluruh halaman.
   ============================================================ */
function ViewIcon({ name }) {
  switch (name) {
    case "tv": return <IconTv />;
    case "pip": return <IconPip />;
    case "disc": return <IconDisc />;
    case "folder": return <IconFolder />;
    case "compass": return <IconCompass />;
    default: return null;
  }
}
function ShuffleIcon() {
  return (
    <svg className="gp-ic" width="15" height="15" viewBox="0 0 16 16" fill="none">
      <path d="M1.5 3.5h2.8L11 12.5h3.5M1.5 12.5h2.8l1.7-2.2M9.7 4.9l1.3-1.4h3.5M11.8 2 14.5 3.5 11.8 5M11.8 11l2.7 1.5-2.7 1.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function RepeatIcon() {
  return (
    <svg className="gp-ic" width="15" height="15" viewBox="0 0 16 16" fill="none">
      <path d="M4 3h6a3 3 0 0 1 3 3v1M12 13H6a3 3 0 0 1-3-3V9" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      <path d="M5.8 1.4 4 3l1.8 1.6M10.2 14.6 12 13l-1.8-1.6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function PrevIcon() {
  return (
    <svg className="gp-ic" width="15" height="15" viewBox="0 0 16 16" fill="currentColor">
      <path d="M4 3v10h1.6V3H4zm2.4 5 7.6 5V3l-7.6 5z" />
    </svg>
  );
}
function NextIcon() {
  return (
    <svg className="gp-ic" width="15" height="15" viewBox="0 0 16 16" fill="currentColor">
      <path d="M12 3v10h-1.6V3H12zM9.6 8l-7.6 5V3l7.6 5z" />
    </svg>
  );
}
function PlayIcon(props) {
  return (
    <svg className="gp-ic" width="16" height="16" viewBox="0 0 16 16" fill="currentColor" {...props}>
      <path d="M4 2.8v10.4L13.5 8 4 2.8z" />
    </svg>
  );
}
function PauseIcon(props) {
  return (
    <svg className="gp-ic" width="16" height="16" viewBox="0 0 16 16" fill="currentColor" {...props}>
      <path d="M3.6 2.5h3v11h-3v-11zM9.4 2.5h3v11h-3v-11z" />
    </svg>
  );
}
function Back10Icon() {
  return (
    <svg className="gp-ic" width="17" height="17" viewBox="0 0 24 24" fill="currentColor">
      <polygon points="12,6 12,18 5,12" />
      <polygon points="19,6 19,18 12,12" />
    </svg>
  );
}
function Fwd10Icon() {
  return (
    <svg className="gp-ic" width="17" height="17" viewBox="0 0 24 24" fill="currentColor">
      <polygon points="12,6 12,18 19,12" />
      <polygon points="5,6 5,18 12,12" />
    </svg>
  );
}
function TimerIcon() {
  return (
    <svg className="gp-ic" width="15" height="15" viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="8.5" r="5.5" stroke="currentColor" strokeWidth="1.3" />
      <path d="M8 5.5V8.5L10 10" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      <path d="M6 1.5h4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}
function VolumeIcon() {
  return (
    <svg className="gp-ic" width="15" height="15" viewBox="0 0 16 16" fill="currentColor">
      <path d="M2 6v4h2.6L8 12.5v-9L4.6 6H2z" />
      <path d="M10.2 5.2a3.4 3.4 0 0 1 0 5.6" stroke="currentColor" strokeWidth="1.1" fill="none" strokeLinecap="round" />
    </svg>
  );
}
function MuteIcon() {
  return (
    <svg className="gp-ic" width="15" height="15" viewBox="0 0 16 16" fill="currentColor">
      <path d="M2 6v4h2.6L8 12.5v-9L4.6 6H2z" />
      <path d="M11 6.2 14 9.2M14 6.2 11 9.2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}
function IconMenu(props) {
  return (
    <svg className="gp-ic" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" {...props}>
      <line x1="4" x2="20" y1="6" y2="6" /><line x1="4" x2="20" y1="12" y2="12" /><line x1="4" x2="20" y1="18" y2="18" />
    </svg>
  );
}
function IconTv() {
  return (
    <svg className="gp-ic" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect width="20" height="15" x="2" y="7" rx="2" /><polyline points="17 2 12 7 7 2" />
    </svg>
  );
}
function IconPip() {
  return (
    <svg className="gp-ic" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 9V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v10c0 1.1.9 2 2 2h4" /><rect width="10" height="7" x="12" y="13" rx="2" />
    </svg>
  );
}
function IconDisc() {
  return (
    <svg className="gp-ic" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="2.5" />
    </svg>
  );
}
function IconFolder() {
  return (
    <svg className="gp-ic" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round">
      <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" />
    </svg>
  );
}
function IconCompass() {
  return (
    <svg className="gp-ic" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" /><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" />
    </svg>
  );
}
function IconFilm(props) {
  return (
    <svg className="gp-ic" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" {...props}>
      <rect width="18" height="18" x="3" y="3" rx="2" /><path d="M7 3v18" /><path d="M3 7.5h4" /><path d="M3 12h18" /><path d="M3 16.5h4" /><path d="M17 3v18" /><path d="M17 7.5h4" /><path d="M17 16.5h4" />
    </svg>
  );
}
function IconMusic(props) {
  return (
    <svg className="gp-ic" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" />
    </svg>
  );
}
function IconSearch(props) {
  return (
    <svg className="gp-ic" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" {...props}>
      <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
    </svg>
  );
}
function IconPlus(props) {
  return (
    <svg className="gp-ic" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" {...props}>
      <path d="M5 12h14" /><path d="M12 5v14" />
    </svg>
  );
}
function IconTrash(props) {
  return (
    <svg className="gp-ic" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M3 6h18" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" /><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  );
}
function IconPencil(props) {
  return (
    <svg className="gp-ic" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" {...props}>
      <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
    </svg>
  );
}
function IconX(props) {
  return (
    <svg className="gp-ic" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" {...props}>
      <path d="M18 6 6 18" /><path d="m6 6 12 12" />
    </svg>
  );
}
function IconGrip(props) {
  return (
    <svg className="gp-ic" width="16" height="16" viewBox="0 0 24 24" fill="currentColor" {...props}>
      <circle cx="9" cy="6" r="1.5" /><circle cx="15" cy="6" r="1.5" /><circle cx="9" cy="12" r="1.5" /><circle cx="15" cy="12" r="1.5" /><circle cx="9" cy="18" r="1.5" /><circle cx="15" cy="18" r="1.5" />
    </svg>
  );
}
function IconExpand(props) {
  return (
    <svg className="gp-ic" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M8 3H5a2 2 0 0 0-2 2v3" /><path d="M21 8V5a2 2 0 0 0-2-2h-3" /><path d="M3 16v3a2 2 0 0 0 2 2h3" /><path d="M16 21h3a2 2 0 0 0 2-2v-3" />
    </svg>
  );
}
function IconLoop(props) {
  return (
    <svg className="gp-ic" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M17 2.1 21 6l-4 3.9" /><path d="M3 11.5V9a4 4 0 0 1 4-4h14" /><path d="M7 21.9 3 18l4-3.9" /><path d="M21 12.5V15a4 4 0 0 1-4 4H3" />
    </svg>
  );
}
