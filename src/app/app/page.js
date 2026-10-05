"use client";

import { mediaKind } from "@/lib/media-kind";
import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import RequireAuth from "@/components/RequireAuth";
import NotificationBell from "@/components/NotificationBell";
import ProfileMenu from "@/components/ProfileMenu";
import ConfirmDialog from "@/components/ConfirmDialog";
import Logo from "@/components/Logo";
import { listMyMedia, uploadMediaFile, deleteMedia, formatBytes } from "@/lib/media";
import {
  listExploreMedia,
  uploadExploreFile,
  deleteExploreMedia,
  uploadExploreThumbnail,
  renameExploreCategory,
  setExploreMediaHidden,
  setExploreCategoryMembers,
  setExploreOrder,
} from "@/lib/explore";
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
  addTracksToPlaylist,
  saveLibraryOrder,
  removeTrackFromPlaylist,
  removeTracksFromPlaylist,
  reorderPlaylistTracks,
  reorderPlaylists,
} from "@/lib/playlists";
import "./gramofon-player.css";

const ACCEPTED_TYPES = "video/*,audio/*";
const LIBRARY_ID = "library";
const ALL_CATEGORY_KEY = "\u200b__semua__"; // penanda "Semua" di Kelola Kategori (bukan nama kategori sungguhan)
const LIBRARY_VIEW_KEY = "__library_view__"; // penanda Library di popup playlist
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

// Thumbnail: gambar buatan admin (thumbUrl) kalau ada, kalau tidak
// ambil frame pertama video Cloudinary langsung dari URL yang sudah ada.
const CLOUDINARY_URL_RE = /^https:\/\/res\.cloudinary\.com\/[^\s"'()\\]+$/;
function mediaThumb(m) {
  if (!m) return null;
  try {
    // Semua gambar/frame berasal dari Cloudinary; URL lain diabaikan
    // (juga mencegah karakter aneh masuk ke CSS url(...)).
    if (m.thumbUrl && CLOUDINARY_URL_RE.test(m.thumbUrl)) {
      return m.thumbUrl.replace("/upload/", "/upload/c_fill,w_480,h_270,q_auto,f_auto/");
    }
    if (m.resourceType !== "video" || !m.url || !CLOUDINARY_URL_RE.test(m.url)) return null;
    return m.url.replace("/upload/", "/upload/so_0/").replace(/\.[a-zA-Z0-9]+(\?.*)?$/, ".jpg");
  } catch {
    return null;
  }
}

function repeatText(mode) {
  return mode === "track" ? "Repeat: Track" : mode === "queue" ? "Repeat: Queue" : "Repeat: Off";
}

const AUDIO_BARS = 40;
const PAGE_SIZE = 10;
const EXPLORE_PAGE_SIZE = 60;

// Playlist bisa berisi media pribadi (id biasa) ATAU media Explore
// (disimpan dengan awalan "explore:") -- resolver ini yang menentukan
// mau diambil dari daftar yang mana.
function resolveTrack(id, items, exploreItems) {
  if (typeof id === "string" && id.startsWith("explore:")) {
    return exploreItems.find((m) => m.id === id.slice(8));
  }
  return items.find((m) => m.id === id);
}
function trackRefFor(media) {
  return media.source === "explore" ? `explore:${media.id}` : media.id;
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
  const [rawItems, setItems] = useState([]);
  // Library mengikuti urutan buatan pengguna (profile.libraryOrder). Media yang
  // belum pernah diurutkan (unggahan baru) tampil paling depan, terbaru dulu.
  const libraryOrder = profile?.libraryOrder;
  const items = useMemo(() => {
    if (!Array.isArray(libraryOrder) || libraryOrder.length === 0) return rawItems;
    const pos = new Map(libraryOrder.map((id, i) => [id, i]));
    const fresh = rawItems.filter((m) => !pos.has(m.id));
    const ordered = rawItems.filter((m) => pos.has(m.id)).sort((a, b) => pos.get(a.id) - pos.get(b.id));
    return [...fresh, ...ordered];
  }, [rawItems, libraryOrder]);
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
  const [osd, setOsd] = useState(null);
  const osdTimerRef = useRef(null);
  const keyRef = useRef({});
  const analyserRef = useRef(null);
  const barsRef = useRef([]);
  const tapRef = useRef({ time: 0, side: null, timer: null });
  const [playbackRate, setPlaybackRate] = useState(1);
  const playerRef = useRef(null);
  const gainRef = useRef(null);
  const audioCtxRef = useRef(null);

  // Wrapper <video> SATU-SATUNYA: selalu terpasang (dipakai Theater & Mini).
  const videoWrapRef = useRef(null);
  const dragState = useRef(null);
  // Posisi hasil geser mini player ({left, top} px) -- disimpan di state
  // supaya tetap benar setelah pindah menu (tidak lagi bergantung pada
  // style yang ditempel manual ke elemen, yang dulu "bocor" dan membuat
  // mini player nyangkut di bawah topbar setelah balik ke menu Mini).
  const [miniPos, setMiniPos] = useState(null);
  const miniPosRef = useRef(null);
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
  const [createPlaylistModal, setCreatePlaylistModal] = useState(null); // { fromPanel }
  const [createPlaylistName, setCreatePlaylistName] = useState("");
  const [createPlaylistSel, setCreatePlaylistSel] = useState(new Set());
  const [createPlaylistSearch, setCreatePlaylistSearch] = useState("");
  const [createPlaylistBusy, setCreatePlaylistBusy] = useState(false);
  const [bulkAddPlaylistIds, setBulkAddPlaylistIds] = useState(null);
  const [deleteCategoryTarget, setDeleteCategoryTarget] = useState(null);
  const [assignCategoryFor, setAssignCategoryFor] = useState(null); // media Explore yang mau dikategorikan
  const [categoryMembersFor, setCategoryMembersFor] = useState(null); // nama kategori yang isinya diedit
  const [categoryModalBusy, setCategoryModalBusy] = useState(false);
  const [playlistMembersFor, setPlaylistMembersFor] = useState(null); // id playlist yang isinya diedit
  const [playlistMembersBusy, setPlaylistMembersBusy] = useState(false);
  const [playlistMembersErr, setPlaylistMembersErr] = useState("");
  const [categoryModalErr, setCategoryModalErr] = useState("");

  // ---- Manage Media: toolbar ----
  const [manageSearch, setManageSearch] = useState("");
  const [manageType, setManageType] = useState("all");
  const [managePlaylist, setManagePlaylist] = useState("all");
  const [manageSort, setManageSort] = useState("custom");
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
  const [renamingCategory, setRenamingCategory] = useState(null); // {old,input}
  const [thumbUploadingId, setThumbUploadingId] = useState(null);
  const [thumbErr, setThumbErr] = useState("");
  const exploreFileInputRef = useRef(null);
  const thumbFileInputRef = useRef(null);
  const thumbTargetId = useRef(null);

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
    const input = e.target;
    const file = input.files?.[0];
    if (!file) return;
    if (!mediaKind(file)) {
      input.value = "";
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
      // Direset SETELAH selesai: di Android, mengosongkan input sebelum file
      // dibaca bisa membuat file tidak terbaca saat diunggah.
      input.value = "";
    }
  }

  async function handleConfirmDelete() {
    setDeleteBusy(true);
    try {
      await deleteMedia(deleteTarget.id);
      if (nowPlaying?.id === deleteTarget.id) {
        setNowPlaying(null);
        pausePlayer();
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
          pausePlayer();
        }
      }
      setBulkDeleteIds(null);
      setManageSel(new Set());
      await refresh();
    } catch {
      setUploadErr("Gagal menghapus sebagian media.");
      setBulkDeleteIds(null);
      setManageSel(new Set());
      await refresh().catch(() => {});
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
      el.loop = repeatMode === "track";
      ensureAudioGraph(); // sinkron, di dalam ketukan pengguna, SEBELUM play()
      el.play().catch((e) => console.warn("Gagal memutar:", e));
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
      el.loop = repeatMode === "track";
      ensureAudioGraph(); // sinkron, di dalam ketukan pengguna, SEBELUM play()
      el.play().catch((e) => console.warn("Gagal memutar:", e));
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

  // Semua jeda yang DISENGAJA (tombol, layar kunci, timer tidur, dll) lewat sini.
  // Jeda yang bukan dari kita -- mis. browser HP menghentikan media saat
  // pindah aplikasi -- dikenali di onPause dan langsung dilanjutkan.
  const userPausedRef = useRef(false);
  function pausePlayer() {
    userPausedRef.current = true;
    playerRef.current?.pause();
  }
  function handleMediaPause() {
    setPlaying(false);
    const el = playerRef.current;
    if (!el || userPausedRef.current || el.ended || !nowPlaying) return;
    if (typeof document !== "undefined" && document.hidden) {
      // Dihentikan sistem saat halaman di latar belakang -> lanjutkan.
      audioCtxRef.current?.resume?.().catch(() => {});
      setTimeout(() => {
        if (document.hidden && !userPausedRef.current) el.play().catch(() => {});
      }, 0);
    }
  }

  function togglePlay() {
    if (!playerRef.current || !nowPlaying) return;
    if (playerRef.current.paused) {
      ensureAudioGraph(); // sinkron, di dalam ketukan pengguna, SEBELUM play()
      playerRef.current.play().catch(() => {});
    } else {
      pausePlayer();
    }
  }
  function hasNextTrack() {
    if (queue.length === 0) return false;
    if (shuffle && queue.length > 1) return true;
    return queueIndex + 1 < queue.length || repeatMode === "queue";
  }
  function backSkip() {
    // Mentok di awal video: tidak pindah ke video sebelumnya.
    if (!playerRef.current) return;
    playerRef.current.currentTime = Math.max(0, playerRef.current.currentTime - skipSeconds);
  }
  function fwdSkip() {
    const el = playerRef.current;
    if (!el) return;
    const d = el.duration;
    const target = el.currentTime + skipSeconds;
    if (isFinite(d) && target >= d - 0.05) {
      // Melewati ujung video: lanjut ke video berikutnya sesuai pengaturan (acak / berurutan).
      if (hasNextTrack()) next();
      else el.currentTime = d;
      return;
    }
    el.currentTime = target;
  }
  function showOsd(text) {
    setOsd(text);
    clearTimeout(osdTimerRef.current);
    osdTimerRef.current = setTimeout(() => setOsd(null), 900);
  }
  // Urutan siklus Repeat: Off -> Track -> Queue -> Off.
  function cycleRepeat() {
    setRepeatMode((m) => (m === "off" ? "track" : m === "track" ? "queue" : "off"));
  }

  function selectView(key) {
    setViewMode(key);
    setMobileMenuOpen(false);
  }

  function goTheaterHome() {
    selectView("theater");
  }

  // ---- Mini player: bisa digeser ----
  // Batas gerak: seluruh layar, tapi TIDAK boleh masuk ke area topbar
  // (kalau masuk, kepala mini player tertutup topbar dan tak bisa dipegang
  // lagi).
  function clampMiniPos(left, top) {
    const el = videoWrapRef.current;
    const w = el?.offsetWidth || 240;
    const h = el?.offsetHeight || 180;
    const topbar = document.querySelector(".gp-topbar");
    const minTop = topbar ? Math.ceil(topbar.getBoundingClientRect().bottom) : 0;
    const maxLeft = Math.max(0, window.innerWidth - w);
    const maxTop = Math.max(minTop, window.innerHeight - h);
    return {
      left: Math.round(Math.min(Math.max(0, left), maxLeft)),
      top: Math.round(Math.min(Math.max(minTop, top), maxTop)),
    };
  }
  function handleDragStart(e) {
    if (viewMode !== "mini" || !videoWrapRef.current) return;
    if (e.target.closest && e.target.closest("button")) return; // tombol "Perbesar" bukan pegangan geser
    const rect = videoWrapRef.current.getBoundingClientRect();
    dragState.current = { offsetX: e.clientX - rect.left, offsetY: e.clientY - rect.top, last: null };
    // Pointer capture: gerakan jari/kursor tetap diterima kepala mini
    // player walau pointer keluar dari kotaknya; tidak perlu listener
    // document yang bisa tertinggal (stale) di antara re-render.
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {}
  }
  function handleDragMove(e) {
    const st = dragState.current;
    const el = videoWrapRef.current;
    if (!st || !el) return;
    const pos = clampMiniPos(e.clientX - st.offsetX, e.clientY - st.offsetY);
    st.last = pos;
    el.style.left = `${pos.left}px`;
    el.style.top = `${pos.top}px`;
    el.style.right = "auto";
    el.style.bottom = "auto";
    el.style.transform = "none";
  }
  function handleDragEnd(e) {
    const st = dragState.current;
    dragState.current = null;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {}
    if (st?.last) {
      // Simpan ke state: dari sini React yang memegang posisinya.
      miniPosRef.current = st.last;
      setMiniPos(st.last);
    }
  }
  // Saat layar berubah (rotasi / resize / balik ke menu Mini), posisi
  // tersimpan dijepit lagi ke dalam layar supaya tidak pernah "hilang".
  useEffect(() => {
    if (viewMode !== "mini") return;
    function reclamp() {
      const p = miniPosRef.current;
      if (!p) return;
      const c = clampMiniPos(p.left, p.top);
      if (c.left !== p.left || c.top !== p.top) {
        miniPosRef.current = c;
        setMiniPos(c);
      }
    }
    reclamp();
    window.addEventListener("resize", reclamp);
    window.addEventListener("orientationchange", reclamp);
    return () => {
      window.removeEventListener("resize", reclamp);
      window.removeEventListener("orientationchange", reclamp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMode]);

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

  // ---- Web Audio: boost volume >100% + data untuk visualizer ----
  //
  // PENTING (penyebab "suara baru terdengar setelah pause" di HP):
  //  - Setelah createMediaElementSource(), SEMUA suara elemen lewat AudioContext.
  //    Kalau context dibuat di luar ketukan pengguna (mis. di dalam .then()
  //    setelah play()), browser HP membiarkannya "suspended" -> hening, dan
  //    baru hidup saat pengguna mengetuk lagi (pause/play).
  //  - Membuat source SAAT media sudah berjalan juga bisa membuat iOS memutar
  //    potongan buffer berulang-ulang ("suara rusak").
  // Karena itu graph dibuat SINKRON di dalam handler ketukan, SEBELUM play()
  // dipanggil (lihat playItem/playAtIndex/togglePlay). Graph yang sama dipakai
  // visualizer, jadi animasi nada mengikuti musik di Android DAN iPhone.
  function ensureAudioGraph() {
    if (audioCtxRef.current) {
      if (audioCtxRef.current.state !== "running") audioCtxRef.current.resume().catch(() => {});
      return;
    }
    if (!playerRef.current) return;
    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      const ctx = new AudioContextClass();
      // Jangan pernah mengaitkan elemen ke context yang tidak bisa berjalan
      // (itu membuat media hening permanen). Di dalam ketukan, resume() aman.
      ctx.resume().catch(() => {});
      const source = ctx.createMediaElementSource(playerRef.current);
      const gain = ctx.createGain();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024; // resolusi cukup halus untuk memisahkan pita bass s/d treble
      analyser.smoothingTimeConstant = 0.3; // pelunakan tambahan dilakukan sendiri di visualizer
      source.connect(analyser);
      analyser.connect(gain);
      gain.connect(ctx.destination);
      analyserRef.current = analyser;
      gain.gain.value = volumePercent > 100 ? volumePercent / 100 : 1;
      audioCtxRef.current = ctx;
      gainRef.current = gain;
      // iOS/Android dapat "menahan" context lagi (telepon masuk, aplikasi di
      // latar belakang, layar mati). Hidupkan lagi pada ketukan berikutnya.
      ctx.onstatechange = () => {
        if (ctx.state === "running") return;
        const wake = () => {
          ctx.resume().catch(() => {});
          document.removeEventListener("pointerdown", wake, true);
          document.removeEventListener("touchend", wake, true);
        };
        document.addEventListener("pointerdown", wake, true);
        document.addEventListener("touchend", wake, true);
      };
    } catch (e) {
      console.warn("Web Audio tidak tersedia:", e);
    }
  }
  // ---- Pemutaran di latar belakang + kontrol layar kunci (HP) ----
  // - audioSession "playback": suara tetap jalan saat pindah aplikasi / layar
  //   dikunci dan tidak ikut dibisukan tombol silent iPhone (Safari 16.4+).
  // - Media Session: judul + tombol play/pause/next/prev/seek di notifikasi
  //   Android dan layar kunci iPhone. Tanpa ini sistem tidak menganggap
  //   halaman sebagai pemutar media.
  // - Saat halaman kembali terlihat, Web Audio yang ditahan sistem (telepon,
  //   Siri, aplikasi lain) dihidupkan lagi.
  const mediaSessionRef = useRef({});
  mediaSessionRef.current = { next, prev, backSkip, fwdSkip, togglePlay };
  useEffect(() => {
    try {
      if (navigator.audioSession) navigator.audioSession.type = "playback";
    } catch {}
    const ms = typeof navigator !== "undefined" ? navigator.mediaSession : null;
    const set = (action, fn) => {
      try {
        ms?.setActionHandler(action, fn);
      } catch {}
    };
    if (ms) {
      set("play", () => {
        const el = playerRef.current;
        if (el && el.paused) mediaSessionRef.current.togglePlay();
      });
      set("pause", () => {
        const el = playerRef.current;
        if (el && !el.paused) pausePlayer();
      });
      set("previoustrack", () => mediaSessionRef.current.prev());
      set("nexttrack", () => mediaSessionRef.current.next());
      set("seekbackward", () => mediaSessionRef.current.backSkip());
      set("seekforward", () => mediaSessionRef.current.fwdSkip());
      set("seekto", (d) => {
        const el = playerRef.current;
        if (el && typeof d?.seekTime === "number") el.currentTime = d.seekTime;
      });
    }
    function onVisible() {
      if (document.visibilityState !== "visible") return;
      const el = playerRef.current;
      const ctx = audioCtxRef.current;
      if (el && !el.paused && ctx && ctx.state !== "running") ctx.resume().catch(() => {});
    }
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      ["play", "pause", "previoustrack", "nexttrack", "seekbackward", "seekforward", "seekto"].forEach((a) => set(a, null));
    };
  }, []);
  useEffect(() => {
    const ms = typeof navigator !== "undefined" ? navigator.mediaSession : null;
    if (!ms || typeof MediaMetadata === "undefined") return;
    try {
      if (!nowPlaying) {
        ms.metadata = null;
        return;
      }
      const art = mediaThumb(nowPlaying);
      ms.metadata = new MediaMetadata({
        title: nowPlaying.title || "Gramofon",
        artist: queueLabel || "Gramofon",
        album: "Gramofon",
        artwork: art ? [{ src: art, sizes: "480x270", type: "image/jpeg" }] : [],
      });
    } catch {}
  }, [nowPlaying, queueLabel]);
  useEffect(() => {
    try {
      if (navigator.mediaSession) navigator.mediaSession.playbackState = nowPlaying ? (playing ? "playing" : "paused") : "none";
    } catch {}
  }, [playing, nowPlaying]);
  useEffect(() => {
    const ms = typeof navigator !== "undefined" ? navigator.mediaSession : null;
    if (!ms || !ms.setPositionState || !nowPlaying || !duration || !Number.isFinite(duration)) return;
    try {
      ms.setPositionState({ duration, playbackRate: playbackRate || 1, position: Math.min(duration, Math.max(0, currentTime || 0)) });
    } catch {}
    // Cukup diperbarui saat durasi/status berubah, bukan tiap detik.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [duration, playing, nowPlaying, playbackRate]);

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
  function handleFrameClick(e) {
    if (!isCoarsePointer()) {
      togglePlay();
      return;
    }
    // Layar sentuh: ketuk 1x = tampil/sembunyi kontrol, ketuk 2x di kiri/kanan = Back/Forward.
    const rect = e.currentTarget.getBoundingClientRect();
    const side = e.clientX - rect.left < rect.width / 2 ? "left" : "right";
    const now = Date.now();
    const tap = tapRef.current;
    if (tap.timer && now - tap.time < 320 && tap.side === side) {
      clearTimeout(tap.timer);
      tap.timer = null;
      tap.time = 0;
      if (side === "left") {
        backSkip();
        showOsd(`Back ${skipSeconds}s`);
      } else {
        fwdSkip();
        showOsd(`Forward ${skipSeconds}s`);
      }
      bumpOverlay();
      return;
    }
    tap.time = now;
    tap.side = side;
    clearTimeout(tap.timer);
    tap.timer = setTimeout(() => {
      tap.timer = null;
      setOvVisible((v) => {
        if (!v) {
          clearTimeout(ovTimerRef.current);
          ovTimerRef.current = setTimeout(() => setOvVisible(false), 3500);
        } else {
          clearTimeout(ovTimerRef.current);
        }
        return !v;
      });
    }, 320);
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
    // Loop pada menu klik-kanan = mode Repeat "track" (selalu sinkron).
    setRepeatMode((m) => (m === "track" ? "off" : "track"));
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
        pausePlayer();
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

  // ---- Loop native mengikuti mode Repeat "track" ----
  useEffect(() => {
    if (playerRef.current) playerRef.current.loop = repeatMode === "track";
  }, [repeatMode]);

  // ---- Pintasan keyboard (selalu aktif di /app): Space, panah atas/bawah, panah kiri/kanan ----
  keyRef.current = { togglePlay, backSkip, fwdSkip, applyVolume, volumePercent, muted, nowPlaying, playing, skipSeconds };
  useEffect(() => {
    function isTyping(t) {
      if (!t) return false;
      if (t.isContentEditable || t.tagName === "TEXTAREA") return true;
      if (t.tagName === "INPUT") return !["range", "checkbox", "radio", "button", "submit"].includes(t.type);
      return false;
    }
    function onKeyDown(e) {
      if (e.ctrlKey || e.metaKey || e.altKey || isTyping(e.target)) return;
      const k = keyRef.current;
      if (e.key === " " || e.code === "Space") {
        e.preventDefault();
        // Tombol/menu yang terakhir diklik masih berfokus; menekan Space
        // memunculkan cincin fokus bawaan browser (tampak putih). Spasi di
        // sini sudah dipakai sebagai Play/Pause, jadi fokusnya dilepas.
        const ae = document.activeElement;
        if (ae && ae.tagName === "BUTTON") ae.blur();
        if (e.repeat) return;
        k.togglePlay();
        if (k.nowPlaying) showOsd(k.playing ? "Pause" : "Play");
      } else if (e.key === "ArrowUp" || e.key === "ArrowDown") {
        e.preventDefault();
        const cur = k.muted ? 0 : k.volumePercent;
        const nv = Math.min(120, Math.max(0, cur + (e.key === "ArrowUp" ? 5 : -5)));
        k.applyVolume(nv);
        showOsd(`Volume ${nv}%`);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        k.fwdSkip();
        showOsd(`Forward ${k.skipSeconds}s`);
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        k.backSkip();
        showOsd(`Back ${k.skipSeconds}s`);
      }
    }
    function onKeyUp(e) {
      // Cegah tombol yang sedang fokus ikut "diklik" oleh Space.
      if ((e.key === " " || e.code === "Space") && !isTyping(e.target)) e.preventDefault();
    }
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- Visualizer Audio Only (bar naik-turun mengikuti spektrum audio) ----
  // Desain agar terasa hidup & bervariasi, termasuk untuk lagu bernada tinggi:
  //  1) Bar dipetakan ke pita frekuensi berskala LOGARITMIK (60Hz-16kHz),
  //     seperti telinga manusia -- bukan linear, yang membuat bass menguasai
  //     hampir semua bar.
  //  2) Tiap pita dinormalisasi terhadap "puncak terbarunya" sendiri (peluruhan
  //     lambat), jadi nada tinggi yang energinya kecil tetap tampak bergerak
  //     sama jelasnya dengan bass, tanpa harus dikali besar-besaran (yang dulu
  //     membuat bar mentok penuh).
  //  3) Kurva dibuat "mengembang" (pangkat > 1) + dibobot level absolut, jadi
  //     bagian pelan benar-benar rendah dan hanya hentakan kuat yang tinggi.
  //  4) Tinggi bar DIBATASI maksimum 86% -- tidak pernah penuh.
  //  5) Naik cepat, turun pelan (attack/release) untuk gerak yang natural.
  useEffect(() => {
    if (viewMode !== "audio") return;
    const bars = barsRef.current;
    const N = bars.length;
    const MIN_H = 0.04;
    const MAX_H = 0.86;
    const FMIN = 60;
    const FMAX = 16000;
    const setAll = (v) => bars.forEach((b) => b && (b.style.transform = `scaleY(${v})`));
    if (!playing) {
      setAll(MIN_H);
      return;
    }
    let raf;
    let t = 0;
    let data = null;
    let edges = null; // batas pita dalam satuan "bin", dihitung sekali per analyser
    const peak = new Float32Array(N).fill(0.28);
    const avg = new Float32Array(N); // rata-rata lambat tiap pita (pembanding hentakan)
    const cur = new Float32Array(N).fill(MIN_H);

    function buildEdges(an) {
      const sr = audioCtxRef.current?.sampleRate || 44100;
      const binHz = sr / an.fftSize;
      const maxBin = an.frequencyBinCount - 1;
      const ratio = FMAX / FMIN;
      const e = new Float32Array(N + 1);
      for (let i = 0; i <= N; i++) e[i] = Math.min(maxBin, (FMIN * Math.pow(ratio, i / N)) / binHz);
      return e;
    }
    function bandLevel(lo, hi) {
      const last = data.length - 1;
      if (hi - lo < 1) {
        // Pita lebih sempit dari satu bin (bass): interpolasi di titik tengahnya.
        const c = (lo + hi) / 2;
        const i = Math.floor(c);
        const f = c - i;
        return (data[i] * (1 - f) + data[Math.min(i + 1, last)] * f) / 255;
      }
      let max = 0;
      let sum = 0;
      let cnt = 0;
      for (let k = Math.floor(lo); k <= Math.min(last, Math.ceil(hi)); k++) {
        const d = data[k];
        if (d > max) max = d;
        sum += d;
        cnt++;
      }
      return (0.55 * max + 0.45 * (sum / cnt)) / 255;
    }

    function draw() {
      raf = requestAnimationFrame(draw);
      t += 0.07;
      const an = analyserRef.current;
      if (an) {
        if (!data || data.length !== an.frequencyBinCount) {
          data = new Uint8Array(an.frequencyBinCount);
          edges = buildEdges(an);
        }
        an.getByteFrequencyData(data);
      }
      for (let i = 0; i < N; i++) {
        const el = bars[i];
        if (!el) continue;
        let target;
        if (an && edges) {
          const v = bandLevel(edges[i], edges[i + 1]); // 0..1 absolut
          peak[i] = Math.max(peak[i] * 0.985, v, 0.22); // puncak turun cepat -> bar tetap responsif
          const norm = Math.min(1, v / peak[i]); // 0..1 relatif terhadap pitanya
          // Hentakan: seberapa jauh level SEKARANG melampaui rata-rata lambatnya.
          // Ini yang membuat bar melompat tiap ketukan/nada baru, bukan menempel tinggi.
          const flux = Math.max(0, v - avg[i]);
          avg[i] += (v - avg[i]) * 0.08;
          const punch = Math.min(1, flux / (peak[i] * 0.45));
          const weight = 0.3 + 0.7 * Math.min(1, v * 1.8);
          const level = Math.pow(norm, 2.2) * weight;
          target = MIN_H + (MAX_H - MIN_H) * Math.min(1, 0.5 * level + 0.75 * punch * weight);
        } else {
          // Belum ada analyser (belum pernah diputar): animasi lembut sementara.
          target = 0.2 + 0.16 * Math.sin(t * 1.4 + i * 0.55) + 0.1 * Math.sin(t * 0.7 + i * 1.3);
        }
        const k = target > cur[i] ? 0.75 : 0.28; // naik sangat cepat, turun cukup cepat
        cur[i] += (target - cur[i]) * k;
        el.style.transform = `scaleY(${Math.min(MAX_H, Math.max(MIN_H, cur[i])).toFixed(3)})`;
      }
    }
    draw();
    return () => cancelAnimationFrame(raf);
  }, [viewMode, playing]);

  // ---- Playlist ----
  // "Buat" (di panel Theater/Mini/Audio MAUPUN Manage Media) tidak langsung
  // membuat playlist kosong -- dibuka dulu pop-up untuk memilih media awal.
  function openCreatePlaylistModal(fromPanel) {
    const name = fromPanel ? panelNewName : newPlaylistName;
    setCreatePlaylistModal({ fromPanel });
    setCreatePlaylistName(name);
    setCreatePlaylistSel(new Set());
    setCreatePlaylistSearch("");
  }
  async function handleConfirmCreatePlaylist() {
    if (!createPlaylistName.trim()) return;
    setCreatePlaylistBusy(true);
    try {
      const id = await createPlaylist(user.uid, createPlaylistName, [...createPlaylistSel]);
      await refreshPlaylists();
      if (createPlaylistModal?.fromPanel) {
        setPanelNewName("");
        setPanelNewOpen(false);
        setViewPlaylistId(id);
      } else {
        setNewPlaylistName("");
        setManagePlaylist(id);
      }
      setCreatePlaylistModal(null);
    } finally {
      setCreatePlaylistBusy(false);
    }
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
    await addTrackToPlaylist(playlistId, trackRefFor(addToPlaylistFor));
    setAddToPlaylistFor(null);
    await refreshPlaylists();
  }
  async function handleBulkAddToPlaylist(playlistId) {
    await addTracksToPlaylist(playlistId, bulkAddPlaylistIds);
    setBulkAddPlaylistIds(null);
    setManageSel(new Set());
    await refreshPlaylists();
  }
  // Isi + URUTAN playlist disimpan sekaligus (satu penulisan trackIds).
  // Library (LIBRARY_VIEW_KEY) hanya menyimpan urutannya di profil pengguna.
  async function handleSavePlaylistMembers(playlistId, finalIds) {
    setPlaylistMembersBusy(true);
    setPlaylistMembersErr("");
    try {
      if (playlistId === LIBRARY_VIEW_KEY) {
        await saveLibraryOrder(user.uid, finalIds);
      } else {
        // Item Explore di playlist (awalan "explore:") tidak tampil di popup ini;
        // jangan sampai ikut terhapus saat menyimpan.
        const current = playlists.find((p) => p.id === playlistId)?.trackIds || [];
        const keep = current.filter((id) => typeof id === "string" && id.startsWith("explore:") && !finalIds.includes(id));
        await reorderPlaylistTracks(playlistId, [...finalIds, ...keep]);
        await refreshPlaylists();
      }
      setPlaylistMembersFor(null);
    } catch (err) {
      setPlaylistMembersErr(err.message || "Gagal menyimpan perubahan playlist.");
    } finally {
      setPlaylistMembersBusy(false);
    }
  }
  async function handleReorderPlaylists(orderedIds) {
    setPlaylists((prev) => {
      const byId = new Map(prev.map((p) => [p.id, p]));
      return orderedIds.map((id) => byId.get(id)).filter(Boolean);
    });
    try {
      await reorderPlaylists(orderedIds);
    } catch {
      await refreshPlaylists();
    }
  }
  async function handleConfirmDeleteCategory() {
    await handleRemoveCategory(deleteCategoryTarget);
    setDeleteCategoryTarget(null);
  }
  async function handleRemoveFromPlaylist(playlistId, mediaId) {
    await removeTrackFromPlaylist(playlistId, mediaId);
    await refreshPlaylists();
  }
  async function handleRemoveManyFromPlaylist(playlistId, mediaIds) {
    await removeTracksFromPlaylist(playlistId, mediaIds);
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
    const input = e.target;
    const file = input.files?.[0];
    if (!file) return;
    if (!isAdmin) {
      input.value = "";
      return; // upload Explore khusus admin (server juga mengecek ulang)
    }
    if (!mediaKind(file)) {
      input.value = "";
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
      input.value = "";
    }
  }
  async function handleConfirmDeleteExplore() {
    const target = deleteExploreTarget;
    setDeleteExploreTarget(null);
    try {
      await deleteExploreMedia(target.id);
      if (nowPlaying?.id === target.id) {
        setNowPlaying(null);
        pausePlayer();
      }
    } catch (err) {
      setExploreErr(err.message || "Gagal menghapus media Explore.");
    }
    setExploreItems(await listExploreMedia());
  }

  // Admin: sembunyikan / tampilkan media untuk SEMUA pengguna.
  async function handleToggleExploreHidden(m) {
    const nextHidden = !m.hidden;
    setExploreItems((prev) => prev.map((x) => (x.id === m.id ? { ...x, hidden: nextHidden } : x))); // optimistis
    try {
      await setExploreMediaHidden(m.id, nextHidden);
    } catch (err) {
      setExploreErr(err.message || "Gagal mengubah visibilitas media.");
      setExploreItems(await listExploreMedia());
    }
  }

  // Admin: pindahkan satu media ke kategori yang sudah ada (atau lepas dari
  // kategorinya kalau categoryName === null).
  async function handleAssignCategory(media, categoryName) {
    setCategoryModalBusy(true);
    setCategoryModalErr("");
    try {
      if (categoryName) await setExploreCategoryMembers(categoryName, [media.id], []);
      else if (media.category) await setExploreCategoryMembers(media.category, [], [media.id]);
      setExploreItems(await listExploreMedia());
      setAssignCategoryFor(null);
    } catch (err) {
      setCategoryModalErr(err.message || "Gagal menyimpan kategori.");
    } finally {
      setCategoryModalBusy(false);
    }
  }

  // Admin: simpan perubahan isi sebuah kategori dari popup "Edit & Tampilkan Media".
  // Admin: simpan isi + URUTAN sebuah kategori (atau urutan "Semua").
  async function handleSaveCategoryMembers(categoryName, finalIds) {
    setCategoryModalBusy(true);
    setCategoryModalErr("");
    try {
      if (categoryName !== ALL_CATEGORY_KEY) {
        const initial = new Set(exploreItems.filter((m) => m.category === categoryName).map((m) => m.id));
        const finalSet = new Set(finalIds);
        const addIds = finalIds.filter((id) => !initial.has(id));
        const removeIds = [...initial].filter((id) => !finalSet.has(id));
        if (addIds.length || removeIds.length) await setExploreCategoryMembers(categoryName, addIds, removeIds);
      }
      if (finalIds.length > 0) await setExploreOrder(finalIds);
      setExploreItems(await listExploreMedia());
      setCategoryMembersFor(null);
    } catch (err) {
      setCategoryModalErr(err.message || "Gagal menyimpan perubahan kategori.");
    } finally {
      setCategoryModalBusy(false);
    }
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
  async function handleReorderCategories(newOrder) {
    setExploreCategoriesState(newOrder);
    await setExploreCategories(newOrder);
  }
  async function handleConfirmRenameCategory() {
    const { old: oldName, input } = renamingCategory;
    const cleanNew = input.trim();
    if (!cleanNew || cleanNew === oldName) {
      setRenamingCategory(null);
      return;
    }
    if (exploreCategories.includes(cleanNew)) {
      setRenamingCategory(null);
      return;
    }
    const next = exploreCategories.map((c) => (c === oldName ? cleanNew : c));
    setExploreCategoriesState(next);
    if (exploreActiveCategory === oldName) setExploreActiveCategory(cleanNew);
    setRenamingCategory(null);
    try {
      await setExploreCategories(next);
      const { affected } = await renameExploreCategory(oldName, cleanNew);
      if (affected > 0) setExploreItems(await listExploreMedia());
    } catch {
      await getExploreCategories().then(setExploreCategoriesState);
    }
  }
  function openThumbPicker(mediaId) {
    if (!isAdmin) return;
    thumbTargetId.current = mediaId;
    thumbFileInputRef.current?.click();
  }
  async function handleThumbFileChange(e) {
    const file = e.target.files?.[0];
    const mediaId = thumbTargetId.current;
    e.target.value = "";
    if (!file || !mediaId || !isAdmin) return; // thumbnail khusus admin (server juga mengecek ulang)
    if (!/^image\/(jpeg|png|webp|gif|avif)$/.test(file.type)) {
      setThumbErr("Thumbnail harus berupa gambar JPG, PNG, WEBP, GIF, atau AVIF.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setThumbErr("Ukuran thumbnail maksimal 5MB.");
      return;
    }
    setThumbErr("");
    setThumbUploadingId(mediaId);
    try {
      await uploadExploreThumbnail(mediaId, file);
      setExploreItems(await listExploreMedia());
    } catch (err) {
      setThumbErr(err.message || "Gagal mengunggah thumbnail.");
    } finally {
      setThumbUploadingId(null);
    }
  }

  // ---- Panel: daftar media yang sedang DILIHAT (Library atau playlist) ----
  const viewPlaylist = playlists.find((p) => p.id === viewPlaylistId);
  const panelItems = viewPlaylistId === LIBRARY_ID
    ? items
    : (viewPlaylist ? viewPlaylist.trackIds.map((id) => resolveTrack(id, items, exploreItems)).filter(Boolean) : []);
  const panelLabel = viewPlaylistId === LIBRARY_ID ? "Library" : viewPlaylist?.name || "Playlist";

  return (
    <div
      className={"gramofon-player" + (playing ? " gp-is-playing" : "")}
      onClick={(e) => {
        // Setelah klik mouse/sentuh, tombol tidak perlu tetap berfokus.
        // (detail > 0 = klik pointer; Enter/Space keyboard bernilai 0 dan
        // fokusnya dibiarkan agar navigasi Tab tidak putus.)
        if (e.detail > 0) {
          const btn = e.target.closest ? e.target.closest("button") : null;
          if (btn) btn.blur();
        }
      }}
    >
      <header className="gp-topbar">
        <button className="gp-ibtn gp-menu-toggle" onClick={() => setMobileMenuOpen((v) => !v)} aria-label="Menu" data-tip-below="Menu">
          <IconMenu />
        </button>
        <button type="button" className="gp-brand" onClick={goTheaterHome} data-tip-below="Theater">
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
        ref={videoWrapRef}
        className={viewMode === "mini" ? "gp-mini-player" : ""}
        style={
          viewMode === "mini"
            ? miniPos
              ? { left: miniPos.left, top: miniPos.top, right: "auto", bottom: "auto", transform: "none" }
              : undefined
            : videoRect
            ? { position: "fixed", top: videoRect.top, left: videoRect.left, width: videoRect.width, height: videoRect.height, zIndex: 5 }
            : { position: "fixed", width: 1, height: 1, overflow: "hidden", opacity: 0, pointerEvents: "none", top: 0, left: 0 }
        }
      >
        {viewMode === "mini" && (
          <div
            className="gp-mini-head"
            onPointerDown={handleDragStart}
            onPointerMove={handleDragMove}
            onPointerUp={handleDragEnd}
            onPointerCancel={handleDragEnd}
          >
            <IconGrip style={{ width: 14, height: 14, color: "var(--gp-dim)" }} />
            <span className="gp-mini-title">{nowPlaying ? nowPlaying.title : "Belum ada media"}</span>
            <button className="gp-ibtn" style={{ width: 26, height: 26 }} onClick={() => setViewMode("theater")} data-tip="Perbesar">
              <IconExpand style={{ width: 13, height: 13 }} />
            </button>
          </div>
        )}
        <VideoScreen
          playerRef={playerRef}
          screenRef={videoScreenRef}
          onFrameClick={handleFrameClick}
          onContextMenu={openCtxMenu}
          onPlay={() => {
            userPausedRef.current = false;
            setPlaying(true);
          }}
          onPause={handleMediaPause}
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
            skipSeconds,
            onInteract: bumpOverlay,
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
            <button className="gp-ibtn" onClick={togglePlay} disabled={!nowPlaying} data-tip="Putar/Jeda">
              {playing ? <PauseIcon /> : <PlayIcon />}
            </button>
          </div>
        )}
      </div>

      {ctxMenu && (
        <VideoContextMenu
          x={ctxMenu.x}
          y={ctxMenu.y}
          loop={repeatMode === "track"}
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
              onCreatePlaylist={() => openCreatePlaylistModal(true)}
              canReorder={viewPlaylistId !== LIBRARY_ID}
              onReorder={(orderedIds) => handleReorderPlaylist(viewPlaylistId, orderedIds)}
            />
          </div>
        )}

        {viewMode === "mini" && (
          <div className="gp-stage-layout gp-stage-layout--scroll">
            <div className="gp-stage">
              <p className="gp-mini-hint">Video mengambang di layar — geser lewat bagian atasnya (ikon titik-titik).</p>
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
              onCreatePlaylist={() => openCreatePlaylistModal(true)}
              canReorder={viewPlaylistId !== LIBRARY_ID}
              onReorder={(orderedIds) => handleReorderPlaylist(viewPlaylistId, orderedIds)}
            />
          </div>
        )}

        {viewMode === "audio" && (
          <div className="gp-stage-layout gp-stage-layout--scroll">
            <div className="gp-audio-stage" ref={audioStageRef} style={{ position: "relative" }} onClick={handleFrameClick}>
              <div className="gp-disc-wrap">
                <div className="gp-disc" style={{ animationPlayState: playing ? "running" : "paused" }}>
                  <div className="gp-disc-label" />
                  <div className="gp-disc-hole" />
                </div>
              </div>
              <div className="gp-eqbars">
                {Array.from({ length: AUDIO_BARS }).map((_, i) => (
                  <span key={i} ref={(el) => { barsRef.current[i] = el; }} />
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
                skipSeconds={skipSeconds}
                onInteract={bumpOverlay}
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
              onCreatePlaylist={() => openCreatePlaylistModal(true)}
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
            onCreatePlaylist={() => openCreatePlaylistModal(false)}
            onOpenRename={(pl) => {
              setRenamingPlaylist(pl);
              setRenameInput(pl.name);
            }}
            onDeletePlaylistClick={setDeletePlaylistTarget}
            onAddToPlaylistClick={setAddToPlaylistFor}
            onRemoveFromPlaylist={handleRemoveFromPlaylist}
            onRemoveManyFromPlaylist={handleRemoveManyFromPlaylist}
            onReorderPlaylist={handleReorderPlaylist}
            onReorderPlaylists={handleReorderPlaylists}
            onBulkAddToPlaylist={(ids) => setBulkAddPlaylistIds(ids)}
            onEditPlaylistMembers={(pl) => {
              setPlaylistMembersErr("");
              setPlaylistMembersFor(pl.id);
            }}
            exploreItems={exploreItems}
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
            onPlay={(m, list, label) => playItem(m, list, label)}
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
            onDeleteCategoryClick={setDeleteCategoryTarget}
            onReorderCategories={handleReorderCategories}
            onToggleHidden={handleToggleExploreHidden}
            onAssignCategoryClick={(m) => {
              setCategoryModalErr("");
              setAssignCategoryFor(m);
            }}
            onEditCategoryMembersClick={(name) => {
              setCategoryModalErr("");
              setCategoryMembersFor(name);
            }}
            renamingCategory={renamingCategory}
            setRenamingCategory={setRenamingCategory}
            onConfirmRenameCategory={handleConfirmRenameCategory}
            onThumbClick={openThumbPicker}
            thumbUploadingId={thumbUploadingId}
            thumbErr={thumbErr}
          />
        )}
      </main>

      <input ref={thumbFileInputRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handleThumbFileChange} />

      <footer className="gp-bottombar">
        <div className="gp-np">
          <div className={"gp-np-thumb" + (mediaThumb(nowPlaying) ? " has-img" : "")} style={mediaThumb(nowPlaying) ? { backgroundImage: `url(${mediaThumb(nowPlaying)})` } : undefined}>
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
              className={"gp-ibtn gp-hide-mobile" + (shuffle ? " on" : "")}
              onClick={() => setShuffle((v) => !v)}
              data-tip={shuffle ? "Random: On" : "Random: Off"}
            >
              <ShuffleIcon />
            </button>
            <button type="button" className="gp-ibtn" onClick={prev} disabled={!queue.length} data-tip="Previous Video">
              <PrevIcon />
            </button>
            <button type="button" className="gp-ibtn" onClick={backSkip} disabled={!nowPlaying} data-tip="Back">
              <Back10Icon />
              {nowPlaying && <span className="gp-numbadge">{skipSeconds}</span>}
            </button>
            <button
              type="button"
              className="gp-ibtn gp-btn-play"
              onClick={togglePlay}
              disabled={!nowPlaying}
              data-tip={playing ? "Pause" : "Play"}
            >
              {playing ? <PauseIcon /> : <PlayIcon />}
            </button>
            <button type="button" className="gp-ibtn" onClick={fwdSkip} disabled={!nowPlaying} data-tip="Forward">
              <Fwd10Icon />
              {nowPlaying && <span className="gp-numbadge">{skipSeconds}</span>}
            </button>
            <button type="button" className="gp-ibtn" onClick={next} disabled={!queue.length} data-tip="Next Video">
              <NextIcon />
            </button>
            <button
              type="button"
              className={"gp-ibtn gp-hide-mobile" + (repeatMode !== "off" ? " on" : "")}
              onClick={cycleRepeat}
              data-tip={repeatText(repeatMode)}
            >
              <RepeatIcon />
              {repeatMode === "track" && <span className="gp-numbadge on">1</span>}
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
              data-tip="Timer Tidur"
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
                <div className={"gp-sleep-actions" + (sleepEndAt ? " two" : "")}>
                  <button
                    className="gp-btn sm primary"
                    onClick={() => {
                      const n = Math.floor(+sleepCustomNum);
                      if (n > 0) startSleep(sleepCustomUnit === "jam" ? n * 60 : n);
                    }}
                  >
                    Terapkan
                  </button>
                  {sleepEndAt && (
                    <button className="gp-btn sm danger" onClick={() => startSleep(0)}>
                      Matikan Timer
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="gp-vol-group">
            <button type="button" className="gp-ibtn" onClick={toggleMute} data-tip={muted || volumePercent === 0 ? "Suarakan" : "Bisukan"}>
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
              <input value={renameInput} onChange={(e) => setRenameInput(e.target.value)} maxLength={100} autoFocus />
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

      <PlaylistPickerModal
        open={!!addToPlaylistFor}
        title="Tambahkan ke playlist"
        subtitle={addToPlaylistFor ? `\u201C${addToPlaylistFor.title}\u201D` : ""}
        playlists={playlists}
        emptyText="Belum ada playlist — buat dulu di menu Manage Media."
        onPick={handleAddToPlaylist}
        onClose={() => setAddToPlaylistFor(null)}
      />

      <PlaylistPickerModal
        open={!!bulkAddPlaylistIds}
        title="Tambahkan ke playlist"
        subtitle={bulkAddPlaylistIds ? `${bulkAddPlaylistIds.length} media terpilih` : ""}
        playlists={playlists}
        emptyText={'Belum ada playlist \u2014 buat dulu lewat tombol "Buat".'}
        onPick={handleBulkAddToPlaylist}
        onClose={() => setBulkAddPlaylistIds(null)}
      />

      <CreatePlaylistModal
        open={!!createPlaylistModal}
        name={createPlaylistName}
        setName={setCreatePlaylistName}
        items={items}
        sel={createPlaylistSel}
        setSel={setCreatePlaylistSel}
        search={createPlaylistSearch}
        setSearch={setCreatePlaylistSearch}
        busy={createPlaylistBusy}
        onCancel={() => setCreatePlaylistModal(null)}
        onConfirm={handleConfirmCreatePlaylist}
      />

      <AssignCategoryModal
        media={assignCategoryFor}
        categories={exploreCategories}
        busy={categoryModalBusy}
        err={categoryModalErr}
        onCancel={() => setAssignCategoryFor(null)}
        onPick={(name) => handleAssignCategory(assignCategoryFor, name)}
      />

      {(() => {
        const isLib = playlistMembersFor === LIBRARY_VIEW_KEY;
        const pl = isLib ? null : playlists.find((p) => p.id === playlistMembersFor) || null;
        const open = isLib || !!pl;
        return (
          <OrderedMembersModal
            open={open}
            resetKey={playlistMembersFor}
            title={isLib ? "Library (Semua media)" : `Media di playlist \u201c${pl?.name || ""}\u201d`}
            hint={isLib ? "Seret untuk mengurutkan semua media Anda" : "Centang media yang termasuk playlist ini, seret untuk mengurutkan"}
            items={items}
            initialIds={isLib ? items.map((m) => m.id) : pl?.trackIds || []}
            selectable={!isLib}
            reorderable
            busy={playlistMembersBusy}
            err={playlistMembersErr}
            onCancel={() => setPlaylistMembersFor(null)}
            onSave={(finalIds) => handleSavePlaylistMembers(playlistMembersFor, finalIds)}
          />
        );
      })()}

      {(() => {
        const isAll = categoryMembersFor === ALL_CATEGORY_KEY;
        const open = !!categoryMembersFor;
        return (
          <OrderedMembersModal
            open={open}
            resetKey={categoryMembersFor}
            title={isAll ? "Semua media Explore" : `Media di kategori \u201c${categoryMembersFor || ""}\u201d`}
            hint={isAll ? "Seret untuk mengurutkan semua media Explore" : "Centang media yang termasuk kategori ini, seret untuk mengurutkan"}
            items={exploreItems}
            initialIds={isAll ? exploreItems.map((m) => m.id) : exploreItems.filter((m) => m.category === categoryMembersFor).map((m) => m.id)}
            selectable={!isAll}
            reorderable
            busy={categoryModalBusy}
            err={categoryModalErr}
            extraTag={(m) => (
              <>
                {!isAll ? null : m.category && <span className="gp-mini-tag">{m.category}</span>}
                {isAll ? null : m.category && m.category !== categoryMembersFor && (
                  <span className="gp-mini-tag" title="Akan dipindahkan dari kategori ini">{m.category}</span>
                )}
                {m.hidden && <span className="gp-mini-tag is-hidden">Hidden</span>}
              </>
            )}
            onCancel={() => setCategoryMembersFor(null)}
            onSave={(finalIds) => handleSaveCategoryMembers(categoryMembersFor, finalIds)}
          />
        );
      })()}

      <ConfirmDialog
        open={!!deleteCategoryTarget}
        title={`Hapus kategori "${deleteCategoryTarget}"?`}
        message="Kategori ini akan dihapus dari daftar filter Explore. Media yang sudah memakai kategori ini TIDAK ikut terhapus."
        confirmLabel="Ya, Hapus"
        danger
        onCancel={() => setDeleteCategoryTarget(null)}
        onConfirm={handleConfirmDeleteCategory}
      />

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
  onBack,
  onFwd,
  skipSeconds,
  onInteract,
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
  const [pop, setPop] = useState(null); // "vol" | "set" | null
  useEffect(() => {
    if (!visible) setPop(null);
  }, [visible]);

  // Bungkus aksi: jangan tembus ke frame (yang akan menyembunyikan kontrol) + perpanjang waktu tampil.
  const act = (fn, closePop = true) => (e) => {
    e.stopPropagation();
    if (onInteract) onInteract();
    if (closePop) setPop(null);
    if (fn) fn(e);
  };
  const stop = (e) => {
    e.stopPropagation();
    if (onInteract) onInteract();
  };
  const repeatLabel = repeatText(repeatMode);

  return (
    <div className={"gp-video-overlay" + (visible ? " show" : "")}>
      <div className="gp-ov-top">{title && <div className="gp-ov-title gp-ellip">{title}</div>}</div>

      <div className="gp-ov-mid">
        <button onClick={act(onBack)} aria-label="Back">
          <Back10Icon />
          {skipSeconds ? <span className="gp-numbadge">{skipSeconds}</span> : null}
        </button>
        <button className="gp-ov-play" onClick={act(onTogglePlay)} aria-label="Play/Pause">
          {playing ? <PauseIcon style={{ width: 24, height: 24 }} /> : <PlayIcon style={{ width: 24, height: 24 }} />}
        </button>
        <button onClick={act(onFwd)} aria-label="Forward">
          <Fwd10Icon />
          {skipSeconds ? <span className="gp-numbadge">{skipSeconds}</span> : null}
        </button>
      </div>

      <div className="gp-ov-bottom" onClick={stop} onPointerDown={() => onInteract && onInteract()}>
        <span className="gp-time">{formatTime(currentTime)}</span>
        <input type="range" min="0" max={duration || 0} value={currentTime} onChange={onSeek} aria-label="Posisi pemutaran" />
        <span className="gp-time">{formatTime(duration)}</span>

        <div className="gp-ov-anchor">
          <button className="gp-ov-btn" onClick={act(() => setPop((p) => (p === "vol" ? null : "vol")), false)} aria-label="Volume">
            {muted || volumePercent === 0 ? <MuteIcon /> : <VolumeIcon />}
          </button>
          {pop === "vol" && (
            <div className="gp-ov-pop" onClick={stop}>
              <div className="gp-ov-vert">
                <input type="range" min="0" max="120" value={muted ? 0 : volumePercent} onChange={onVolume} aria-label="Volume" />
              </div>
              <div className="gp-ov-vol-num">{muted ? 0 : volumePercent}%</div>
              <button className="gp-ov-btn" style={{ margin: "4px auto 0" }} onClick={act(onToggleMute, false)} aria-label="Mute">
                {muted ? <MuteIcon /> : <VolumeIcon />}
              </button>
            </div>
          )}
        </div>

        <div className="gp-ov-anchor">
          <button className={"gp-ov-btn" + (shuffle || repeatMode !== "off" ? " on" : "")} onClick={act(() => setPop((p) => (p === "set" ? null : "set")), false)} aria-label="Pengaturan">
            <IconGear style={{ width: 17, height: 17 }} />
          </button>
          {pop === "set" && (
            <div className="gp-ov-pop" onClick={stop}>
              <div className="gp-ov-menu">
                <button className={shuffle ? "on" : ""} onClick={act(onShuffle, false)}>
                  <ShuffleIcon />
                  {shuffle ? "Random: On" : "Random: Off"}
                </button>
                <button className={repeatMode !== "off" ? "on" : ""} onClick={act(onRepeat, false)}>
                  <RepeatIcon />
                  {repeatLabel}
                </button>
              </div>
            </div>
          )}
        </div>

        {allowFullscreen && (
          <button className="gp-ov-btn" onClick={act(onFullscreen)} aria-label="Full screen">
            <IconExpand style={{ width: 16, height: 16 }} />
          </button>
        )}
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

function CreatePlaylistModal({ open, name, setName, items, sel, setSel, search, setSearch, busy, onCancel, onConfirm }) {
  if (!open) return null;
  const q = search.trim().toLowerCase();
  const filtered = q ? items.filter((m) => (m.title || "").toLowerCase().includes(q)) : items;
  function toggle(id) {
    setSel((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }
  return (
    <div className="confirm-backdrop" onClick={onCancel}>
      <div className="confirm-card confirm-card--wide" onClick={(e) => e.stopPropagation()}>
        <h3>Buat playlist baru</h3>
        <div className="field">
          <label>Nama playlist</label>
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={100} autoFocus />
        </div>
        <div className="field">
          <label>
            Pilih media awal <span className="hint-inline">(opsional — {sel.size} dipilih)</span>
          </label>
          <input placeholder="Cari judul di Library..." value={search} onChange={(e) => setSearch(e.target.value)} style={{ marginBottom: 8 }} />
        </div>
        <div className="user-picker-list">
          {filtered.length === 0 ? (
            <p className="hint-text" style={{ padding: 12 }}>
              {items.length === 0 ? "Belum ada media di Library." : "Tidak ada yang cocok."}
            </p>
          ) : (
            filtered.map((m) => (
              <label className="user-picker-row" key={m.id}>
                <input type="checkbox" checked={sel.has(m.id)} onChange={() => toggle(m.id)} />
                <span className="user-picker-row__name">{m.title}</span>
              </label>
            ))
          )}
        </div>
        <div className="confirm-actions">
          <button className="btn btn--ghost" onClick={onCancel} disabled={busy}>
            Batal
          </button>
          <button className="btn btn--primary" onClick={onConfirm} disabled={busy || !name.trim()}>
            {busy ? "Membuat..." : "Buat Playlist"}
          </button>
        </div>
      </div>
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
  const newHeadRef = useRef(null);
  const newRowRef = useRef(null);

  useEffect(() => {
    if (!panelNewOpen) return;
    function onDocClick(e) {
      const inHead = newHeadRef.current && newHeadRef.current.contains(e.target);
      const inRow = newRowRef.current && newRowRef.current.contains(e.target);
      if (!inHead && !inRow) setPanelNewOpen(false);
    }
    document.addEventListener("pointerdown", onDocClick);
    return () => document.removeEventListener("pointerdown", onDocClick);
  }, [panelNewOpen, setPanelNewOpen]);

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
      <div className="gp-panel-head" ref={newHeadRef}>
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
        <button type="button" className="gp-panel-addbtn" onClick={() => setPanelNewOpen((v) => !v)} data-tip="Playlist Baru">
          <IconPlus style={{ width: 16, height: 16 }} />
        </button>
      </div>
      {panelNewOpen && (
        <div className="gp-panel-newrow" ref={newRowRef}>
          <input
            autoFocus
            placeholder="Nama playlist baru..."
            maxLength={100}
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
            const thumb = mediaThumb(m);
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
                  <span className="gp-drag-handle" data-tip="Geser untuk urutkan">
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

// Popup pemilih playlist (satu media atau banyak media) -- gaya sama dengan
// popup lain: judul, keterangan, daftar berbingkai yang bisa discroll.
function PlaylistPickerModal({ open, title, subtitle, playlists, emptyText, onPick, onClose }) {
  const [busy, setBusy] = useState(false);
  if (!open) return null;
  async function pick(id) {
    setBusy(true);
    try {
      await onPick(id);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="confirm-backdrop" onClick={busy ? undefined : onClose}>
      <div className="confirm-card" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <h3>{title}</h3>
        {subtitle && <p className="gp-pick-sub">{subtitle}</p>}
        {playlists.length === 0 ? (
          <p className="hint-text">{emptyText}</p>
        ) : (
          <div className="gp-pick-list">
            {playlists.map((pl) => (
              <button key={pl.id} type="button" className="gp-pick-item" disabled={busy} onClick={() => pick(pl.id)}>
                <span className="gp-pick-name">{pl.name}</span>
                <span className="gp-pick-count">{pl.trackIds?.length || 0} media</span>
              </button>
            ))}
          </div>
        )}
        <div className="confirm-actions" style={{ marginTop: 14 }}>
          <button className="btn btn--ghost" onClick={onClose} disabled={busy}>
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
}

// Popup: pilih SATU kategori yang sudah ada untuk satu media Explore (admin).
function AssignCategoryModal({ media, categories, busy, err, onCancel, onPick }) {
  if (!media) return null;
  return (
    <div className="confirm-backdrop" onClick={busy ? undefined : onCancel}>
      <div className="confirm-card" onClick={(e) => e.stopPropagation()}>
        <h3>Tambah ke kategori</h3>
        <p className="hint-text" style={{ marginBottom: 10 }}>
          &ldquo;{media.title}&rdquo; hanya bisa berada di satu kategori.
        </p>
        {categories.length === 0 ? (
          <p className="hint-text">Belum ada kategori — buat dulu lewat panel Kelola Kategori.</p>
        ) : (
          <div className="gp-pick-list">
            {categories.map((c) => (
              <button
                key={c}
                type="button"
                className={"gp-pick-item" + (media.category === c ? " is-picked" : "")}
                disabled={busy || media.category === c}
                onClick={() => onPick(c)}
              >
                <span className="gp-pick-name">{c}</span>
                {media.category === c && <span className="gp-pick-count">saat ini</span>}
              </button>
            ))}
            {media.category && (
              <button type="button" className="gp-pick-item" disabled={busy} onClick={() => onPick(null)}>
                <span className="gp-pick-name">Lepas dari kategori</span>
                <span className="gp-pick-count">tanpa kategori</span>
              </button>
            )}
          </div>
        )}
        {err && <p className="error-text" style={{ marginTop: 8 }}>{err}</p>}
        <div className="confirm-actions" style={{ marginTop: 12 }}>
          <button className="btn btn--ghost" onClick={onCancel} disabled={busy}>
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
}

// Popup bersama untuk "Lihat & edit daftar media" (Playlist) dan
// "Edit & Tampilkan Media" (Kategori Explore): memilih media mana yang
// termasuk DAN mengurutkannya (seret ikon di kiri, atau tombol panah).
//   selectable : ada kotak centang untuk memilih anggota (Playlist/Kategori).
//                false = semua media otomatis anggota (Library / Semua).
//   reorderable: urutan bisa diubah.
//   readOnly   : hanya melihat daftar.
function OrderedMembersModal({
  open,
  resetKey,
  title,
  hint,
  items,
  initialIds,
  selectable = true,
  reorderable = true,
  readOnly = false,
  busy,
  err,
  extraTag,
  onCancel,
  onSave,
}) {
  const [ids, setIds] = useState([]);
  const [search, setSearch] = useState("");
  const [dragIdx, setDragIdx] = useState(null);
  const [overIdx, setOverIdx] = useState(null);

  // Setiap kali popup dibuka (untuk playlist/kategori tertentu) mulai dari isi sebenarnya.
  useEffect(() => {
    setIds([...initialIds]);
    setSearch("");
    setDragIdx(null);
    setOverIdx(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey, open]);

  if (!open) return null;

  const byId = new Map(items.map((m) => [m.id, m]));
  const q = search.trim().toLowerCase();
  const selectedIds = ids.filter((id) => byId.has(id));
  const selectedSet = new Set(selectedIds);
  const matches = (m) => !q || (m.title || "").toLowerCase().includes(q);
  const unselected = selectable
    ? items.filter((m) => !selectedSet.has(m.id) && matches(m)).sort((a, b) => (a.title || "").localeCompare(b.title || ""))
    : [];
  const canDrag = reorderable && !readOnly && !q && !busy;

  const initialKey = initialIds.filter((id) => byId.has(id)).join("|");
  const changed = selectedIds.join("|") !== initialKey;

  function toggle(id) {
    setIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }
  function move(from, to) {
    if (from === to || from < 0 || to < 0 || to >= selectedIds.length) return;
    const next = [...selectedIds];
    const [m] = next.splice(from, 1);
    next.splice(to, 0, m);
    setIds(next);
  }
  function handleDrop(idx) {
    if (dragIdx !== null) move(dragIdx, idx);
    setDragIdx(null);
    setOverIdx(null);
  }

  return (
    <div className="confirm-backdrop" onClick={busy ? undefined : onCancel}>
      <div className="confirm-card confirm-card--wide" onClick={(e) => e.stopPropagation()}>
        <h3>{title}</h3>
        <div className="field" style={{ marginBottom: 8 }}>
          <label>
            {hint} <span className="hint-inline">({selectedIds.length}{selectable ? " dipilih" : " media"})</span>
          </label>
          <input placeholder="Cari judul..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="user-picker-list user-picker-list--tall">
          {selectedIds.length === 0 && unselected.length === 0 ? (
            <p className="hint-text" style={{ padding: 12 }}>
              {items.length === 0 ? "Belum ada media." : "Tidak ada yang cocok."}
            </p>
          ) : null}
          {selectedIds.map((id, idx) => {
            const m = byId.get(id);
            if (!matches(m)) return null;
            return (
              <div
                key={id}
                className={"gp-omrow" + (dragIdx === idx ? " is-dragging" : "") + (overIdx === idx && dragIdx !== null && dragIdx !== idx ? " is-dragover" : "")}
                draggable={canDrag}
                onDragStart={canDrag ? () => setDragIdx(idx) : undefined}
                onDragOver={canDrag ? (e) => { e.preventDefault(); setOverIdx(idx); } : undefined}
                onDrop={canDrag ? () => handleDrop(idx) : undefined}
                onDragEnd={() => { setDragIdx(null); setOverIdx(null); }}
              >
                {reorderable && !readOnly && (
                  <span className={"gp-drag-handle" + (canDrag ? "" : " is-off")} data-tip={canDrag ? "Geser untuk urutkan" : "Hapus pencarian untuk mengurutkan"}>
                    <IconGrip style={{ width: 14, height: 14 }} />
                  </span>
                )}
                {selectable && !readOnly && (
                  <input type="checkbox" checked onChange={() => toggle(id)} disabled={busy} aria-label={`Keluarkan ${m.title}`} />
                )}
                <span className="gp-omname">{m.title}</span>
                {extraTag && extraTag(m)}
                {canDrag && (
                  <span className="gp-omarrows">
                    <button type="button" className="gp-omarrow" onClick={() => move(idx, idx - 1)} disabled={idx === 0} aria-label="Naik">▲</button>
                    <button type="button" className="gp-omarrow" onClick={() => move(idx, idx + 1)} disabled={idx === selectedIds.length - 1} aria-label="Turun">▼</button>
                  </span>
                )}
              </div>
            );
          })}
          {selectable && !readOnly && unselected.length > 0 && selectedIds.length > 0 && <div className="gp-omsep">Belum dipilih</div>}
          {selectable && !readOnly &&
            unselected.map((m) => (
              <label className="gp-omrow gp-omrow--off" key={m.id}>
                {reorderable && <span className="gp-drag-spacer" aria-hidden="true" />}
                <input type="checkbox" checked={false} onChange={() => toggle(m.id)} disabled={busy} />
                <span className="gp-omname">{m.title}</span>
                {extraTag && extraTag(m)}
              </label>
            ))}
        </div>
        {err && <p className="error-text" style={{ marginTop: 8 }}>{err}</p>}
        <div className="confirm-actions" style={{ marginTop: 12 }}>
          <button className="btn btn--ghost" onClick={onCancel} disabled={busy}>
            {readOnly ? "Tutup" : "Batal"}
          </button>
          {!readOnly && (
            <button className="btn btn--primary" onClick={() => onSave(selectedIds)} disabled={busy || !changed}>
              {busy ? "Menyimpan..." : "Simpan"}
            </button>
          )}
        </div>
      </div>
    </div>
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
  onRemoveManyFromPlaylist,
  onReorderPlaylist,
  onReorderPlaylists,
  onBulkAddToPlaylist,
  onEditPlaylistMembers,
  exploreItems,
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
  const [page, setPage] = useState(1);
  const [plDragIdx, setPlDragIdx] = useState(null);
  const [plOverIdx, setPlOverIdx] = useState(null);

  const activePlaylist = playlistFilter === "all" ? null : playlists.find((p) => p.id === playlistFilter);
  const canDrag = !!activePlaylist && !search.trim() && typeFilter === "all";

  let rows = playlistFilter === "all"
    ? items
    : activePlaylist
    ? activePlaylist.trackIds.map((id) => resolveTrack(id, items, exploreItems)).filter(Boolean)
    : [];

  if (typeFilter !== "all") rows = rows.filter((m) => m.resourceType === typeFilter);
  if (search.trim()) {
    const q = search.trim().toLowerCase();
    rows = rows.filter((m) => (m.title || "").toLowerCase().includes(q));
  }
  if (!canDrag) {
    rows = [...rows].sort((a, b) => {
      if (sortBy === "custom") return 0; // pertahankan urutan Library / playlist
      if (sortBy === "title") return (a.title || "").localeCompare(b.title || "");
      if (sortBy === "sizeDesc") return (b.bytes || 0) - (a.bytes || 0);
      if (sortBy === "sizeAsc") return (a.bytes || 0) - (b.bytes || 0);
      const at = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
      const bt = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
      return bt - at;
    });
  }
  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageRows = canDrag ? rows : rows.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  useEffect(() => {
    setPage(1);
  }, [search, typeFilter, playlistFilter, sortBy]);

  // Pilihan ("Pilih semua" mencakup SEMUA hasil, lintas halaman) dikosongkan
  // setiap kali daftar yang tampil berganti -- supaya aksi massal tidak
  // pernah mengenai item yang sudah tidak terlihat oleh pengguna.
  useEffect(() => {
    setSel(new Set());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, typeFilter, playlistFilter]);

  function toggleRow(id) {
    setSel((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }
  // "Pilih semua" = SEMUA media yang cocok dengan filter/pencarian saat ini
  // (lintas semua halaman), bukan hanya yang tampil di halaman aktif.
  const allSelected = rows.length > 0 && rows.every((m) => sel.has(m.id));
  function toggleAll() {
    setSel(allSelected ? new Set() : new Set(rows.map((m) => m.id)));
  }
  function bulkDelete() {
    const ids = [...sel];
    if (activePlaylist) {
      (async () => {
        await onRemoveManyFromPlaylist(activePlaylist.id, ids);
        setSel(new Set());
      })();
    } else {
      onBulkDelete(ids);
    }
  }
  function handlePlaylistDrop(idx) {
    if (plDragIdx === null || plDragIdx === idx) {
      setPlDragIdx(null);
      setPlOverIdx(null);
      return;
    }
    const ids = playlists.map((p) => p.id);
    const [moved] = ids.splice(plDragIdx, 1);
    ids.splice(idx, 0, moved);
    onReorderPlaylists(ids);
    setPlDragIdx(null);
    setPlOverIdx(null);
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
        <div className="gp-card gp-card--fill">
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

        <div className="gp-card gp-card--fill gp-card--bound">
          <div className="gp-card-title">
            <h3>Playlist</h3>
          </div>
          <ul className="gp-pl-rows">
            <li
              className={"gp-pl-row" + (playlistFilter === "all" ? " is-active" : "")}
              onClick={() => setPlaylistFilter("all")}
            >
              <span className="gp-drag-spacer" aria-hidden="true" />
              <div className="gp-info">
                <b>Library (Semua media)</b>
                <small>{items.length} media</small>
              </div>
              <button
                className="gp-ibtn"
                style={{ width: 28, height: 28 }}
                onClick={(e) => {
                  e.stopPropagation();
                  onEditPlaylistMembers({ id: LIBRARY_VIEW_KEY });
                }}
                data-tip="Lihat & edit daftar media"
              >
                <IconListEdit style={{ width: 14, height: 14 }} />
              </button>
            </li>
            {playlists.map((pl, idx) => (
              <li
                key={pl.id}
                className={
                  "gp-pl-row" +
                  (playlistFilter === pl.id ? " is-active" : "") +
                  (plDragIdx === idx ? " is-dragging" : "") +
                  (plOverIdx === idx ? " is-dragover" : "")
                }
                onClick={() => setPlaylistFilter(pl.id)}
                draggable
                onDragStart={() => setPlDragIdx(idx)}
                onDragOver={(e) => { e.preventDefault(); setPlOverIdx(idx); }}
                onDrop={() => handlePlaylistDrop(idx)}
                onDragEnd={() => { setPlDragIdx(null); setPlOverIdx(null); }}
              >
                <span className="gp-drag-handle" data-tip="Geser untuk urutkan" onClick={(e) => e.stopPropagation()}>
                  <IconGrip style={{ width: 14, height: 14 }} />
                </span>
                <div className="gp-info">
                  <b>{pl.name}</b>
                  <small>{pl.trackIds?.length || 0} media</small>
                </div>
                <button
                  className="gp-ibtn"
                  style={{ width: 28, height: 28 }}
                  onClick={(e) => {
                    e.stopPropagation();
                    onEditPlaylistMembers(pl);
                  }}
                  data-tip="Lihat & edit daftar media"
                >
                  <IconListEdit style={{ width: 14, height: 14 }} />
                </button>
                <button
                  className="gp-ibtn"
                  style={{ width: 28, height: 28 }}
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpenRename(pl);
                  }}
                  data-tip="Ubah nama"
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
                  data-tip="Hapus playlist"
                >
                  <IconTrash style={{ width: 14, height: 14 }} />
                </button>
              </li>
            ))}
          </ul>
          <div className="gp-new-playlist">
            <input
              placeholder="Nama playlist baru..."
              maxLength={100}
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
            <option value="custom">Urutan saya</option>
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
      </div>

      {selectMode && sel.size > 0 && (
        <div className="gp-bulkbar">
          <span>
            {sel.size} dipilih{sel.size < rows.length ? ` dari ${rows.length}` : ""}
          </span>
          <div style={{ marginLeft: "auto", display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
            {!activePlaylist && (
              <button className="gp-btn sm" onClick={() => onBulkAddToPlaylist([...sel])}>
                Tambahkan ke playlist
              </button>
            )}
            <button className="gp-btn sm danger" onClick={bulkDelete}>
              {activePlaylist ? "Keluarkan dari playlist" : "Hapus terpilih"}
            </button>
          </div>
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
                    <input
                      type="checkbox"
                      checked={allSelected}
                      ref={(el) => {
                        if (el) el.indeterminate = sel.size > 0 && !allSelected;
                      }}
                      onChange={toggleAll}
                      aria-label="Pilih semua media"
                    />
                  </th>
                )}
                <th>Judul</th>
                <th>Tipe</th>
                <th>Ukuran</th>
                <th className="gp-th-acts">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {pageRows.map((m) => {
                const thumb = mediaThumb(m);
                const idx = rows.findIndex((r) => r.id === m.id);
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
                    <td className="gp-drag-col" data-tip="Geser untuk urutkan">
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
                      <button className="gp-ibtn" style={{ width: 28, height: 28 }} data-tip="Putar" onClick={() => onPlay(m, rows, activePlaylist ? activePlaylist.name : "Manage Media")}>
                        <PlayIcon style={{ width: 13, height: 13 }} />
                      </button>
                      {!activePlaylist && (
                        <button className="gp-ibtn" style={{ width: 28, height: 28 }} data-tip="Tambah ke playlist" onClick={() => onAddToPlaylistClick(m)}>
                          <IconPlus style={{ width: 14, height: 14 }} />
                        </button>
                      )}
                      {activePlaylist ? (
                        <button className="gp-ibtn" style={{ width: 28, height: 28 }} data-tip="Keluarkan dari playlist" onClick={() => onRemoveFromPlaylist(activePlaylist.id, m.id)}>
                          <IconX style={{ width: 14, height: 14 }} />
                        </button>
                      ) : (
                        <button className="gp-ibtn" style={{ width: 28, height: 28, color: "var(--gp-danger)" }} data-tip="Hapus" onClick={() => onDelete(m)}>
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
      {!canDrag && totalPages > 1 && (
        <div className="pagination">
          <button className="pagination__btn" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}>‹</button>
          {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
            <button key={p} className={"pagination__btn" + (p === currentPage ? " is-active" : "")} onClick={() => setPage(p)}>
              {p}
            </button>
          ))}
          <button className="pagination__btn" disabled={currentPage === totalPages} onClick={() => setPage(currentPage + 1)}>›</button>
        </div>
      )}
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
  onDeleteCategoryClick,
  onReorderCategories,
  renamingCategory,
  setRenamingCategory,
  onConfirmRenameCategory,
  onThumbClick,
  thumbUploadingId,
  thumbErr,
  onToggleHidden,
  onAssignCategoryClick,
  onEditCategoryMembersClick,
}) {
  const [catDragIdx, setCatDragIdx] = useState(null);
  const [catOverIdx, setCatOverIdx] = useState(null);
  const [page, setPage] = useState(1);

  // Hook harus dipanggil sebelum return bersyarat apa pun.
  useEffect(() => {
    setPage(1);
  }, [search, activeCategory]);

  if (!loadingExplore && !exploreOn && !isAdmin) {
    return (
      <div className="gp-scroll-page">
        <div className="gp-table-empty">Explore sedang dinonaktifkan oleh admin.</div>
      </div>
    );
  }

  // Kategori diperlakukan seperti playlist: memutar salah satu item ikut
  // membawa daftar yang SEDANG TERLIHAT (sudah tersaring kategori/pencarian)
  // sebagai antrean, supaya Next/Prev/Acak/Ulangi tetap berjalan wajar.
  const q = search.trim().toLowerCase();
  let filtered = q ? items.filter((m) => (m.title || "").toLowerCase().includes(q)) : items;
  if (activeCategory !== "all") filtered = filtered.filter((m) => (m.category || null) === activeCategory);
  const queueLabel = activeCategory === "all" ? "Explore" : `Explore · ${activeCategory}`;

  const totalPages = Math.max(1, Math.ceil(filtered.length / EXPLORE_PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageItems = filtered.slice((currentPage - 1) * EXPLORE_PAGE_SIZE, currentPage * EXPLORE_PAGE_SIZE);

  function handleCatDrop(idx) {
    if (catDragIdx === null || catDragIdx === idx) {
      setCatDragIdx(null);
      setCatOverIdx(null);
      return;
    }
    const next = [...categories];
    const [moved] = next.splice(catDragIdx, 1);
    next.splice(idx, 0, moved);
    onReorderCategories(next);
    setCatDragIdx(null);
    setCatOverIdx(null);
  }

  return (
    <div className="gp-scroll-page">
      <div className="gp-page-head">
        <div>
          <h2>Explore</h2>
          <p>Media publik yang bisa diakses seluruh pengguna.</p>
        </div>
        <div className="gp-field grow" style={{ maxWidth: 260 }}>
          <IconSearch style={{ width: 15, height: 15 }} />
          <input placeholder="Cari judul..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      </div>

      {isAdmin && (
        <div className="gp-manage-grid">
          <div className="gp-card gp-card--fill">
            <div className="gp-card-title">
              <h3>Kelola Explore</h3>
            </div>
            {!exploreOn && <p className="gp-muted" style={{ marginBottom: 10 }}>Sedang dimatikan untuk pengguna biasa.</p>}
            <div className="gp-storage-num">
              <b>{formatBytes(usedBytes)}</b>
              <span>dari {limitMB}MB (batas total Explore)</span>
            </div>
            <div className="gp-stack">
              <i className="gp-seg-v" style={{ width: `${usedPct}%` }} />
            </div>

            <div className="gp-admin-rows">
              <div className="gp-admin-row">
                <div className="gp-field">
                  <input type="number" min="1" value={limitInput} onChange={(e) => setLimitInput(e.target.value)} />
                  <span className="gp-muted">MB</span>
                </div>
                <button className="gp-btn" onClick={onSaveLimitClick}>Simpan Batas</button>
              </div>
              <div className="gp-admin-row">
                <select className="gp-select-plain" value={uploadCategory} onChange={(e) => setUploadCategory(e.target.value)}>
                  <option value="">Tanpa kategori</option>
                  {categories.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
                <input ref={fileInputRef} type="file" accept={ACCEPTED_TYPES} style={{ display: "none" }} onChange={onFileChange} />
                <button className="gp-btn primary" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
                  {uploading ? `Mengunggah... ${progress}%` : "Upload ke Explore"}
                </button>
              </div>
            </div>
            {err && <p className="error-text" style={{ marginTop: 10 }}>{err}</p>}
          </div>

          <div className="gp-card gp-card--fill gp-card--bound">
            <div className="gp-card-title">
              <h3>Kelola Kategori</h3>
            </div>
            {(
              <ul className="gp-catlist">
                <li className="gp-catrow">
                  <span className="gp-drag-spacer" aria-hidden="true" />
                  <span className="gp-catname">Semua</span>
                  <button className="gp-ibtn" style={{ width: 26, height: 26 }} onClick={() => onEditCategoryMembersClick(ALL_CATEGORY_KEY)} data-tip="Edit & Tampilkan Media">
                    <IconListEdit style={{ width: 13, height: 13 }} />
                  </button>
                </li>
                {categories.map((c, idx) => (
                  <li
                    key={c}
                    className={"gp-catrow" + (catDragIdx === idx ? " is-dragging" : "") + (catOverIdx === idx ? " is-dragover" : "")}
                    draggable
                    onDragStart={() => setCatDragIdx(idx)}
                    onDragOver={(e) => { e.preventDefault(); setCatOverIdx(idx); }}
                    onDrop={() => handleCatDrop(idx)}
                    onDragEnd={() => { setCatDragIdx(null); setCatOverIdx(null); }}
                  >
                    <span className="gp-drag-handle" data-tip="Geser untuk urutkan">
                      <IconGrip style={{ width: 14, height: 14 }} />
                    </span>
                    {renamingCategory?.old === c ? (
                      <input
                        autoFocus
                        value={renamingCategory.input}
                        onChange={(e) => setRenamingCategory({ old: c, input: e.target.value })}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") onConfirmRenameCategory();
                          if (e.key === "Escape") setRenamingCategory(null);
                        }}
                        onBlur={onConfirmRenameCategory}
                      />
                    ) : (
                      <span className="gp-catname">{c}</span>
                    )}
                    <button className="gp-ibtn" style={{ width: 26, height: 26 }} onClick={() => onEditCategoryMembersClick(c)} data-tip="Edit & Tampilkan Media">
                      <IconListEdit style={{ width: 13, height: 13 }} />
                    </button>
                    <button className="gp-ibtn" style={{ width: 26, height: 26 }} onClick={() => setRenamingCategory({ old: c, input: c })} data-tip="Ubah nama">
                      <IconPencil style={{ width: 13, height: 13 }} />
                    </button>
                    <button className="gp-ibtn" style={{ width: 26, height: 26 }} onClick={() => onDeleteCategoryClick(c)} data-tip="Hapus kategori">
                      <IconTrash style={{ width: 13, height: 13 }} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <div className="gp-new-playlist gp-new-category">
              <input placeholder="Nama kategori baru..." maxLength={60} value={newCategoryName} onChange={(e) => setNewCategoryName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") onAddCategory(); }} />
              <button className="gp-btn sm primary" onClick={onAddCategory}>Tambah</button>
            </div>
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
      {thumbErr && <p className="error-text" style={{ marginTop: 10 }}>{thumbErr}</p>}

      {loadingExplore ? (
        <p className="gp-muted">Memuat...</p>
      ) : filtered.length === 0 ? (
        <div className="gp-table-empty">Belum ada media di Explore.</div>
      ) : (
        <>
        <div className="gp-card-grid">
          {pageItems.map((m) => {
            const thumb = mediaThumb(m);
            return (
            <div key={m.id} className={"gp-xcard" + (nowPlayingId === m.id ? " is-current" : "") + (m.hidden ? " is-hidden" : "")}>
              <div className="gp-xthumb" style={thumb ? { backgroundImage: `url(${thumb})` } : undefined} onClick={() => onPlay(m, filtered, queueLabel)}>
                <span className="gp-type-badge">
                  {m.resourceType === "video" ? <IconFilm /> : <IconMusic />}
                </span>
                <span className="gp-xplay">
                  <PlayIcon style={{ width: 16, height: 16 }} />
                </span>
                {isAdmin && (
                  <span className="gp-xadmin" onClick={(e) => e.stopPropagation()}>
                    <button
                      type="button"
                      className={"gp-vis-btn " + (m.hidden ? "is-hidden" : "is-visible")}
                      onClick={(e) => { e.stopPropagation(); onToggleHidden(m); }}
                      data-tip={m.hidden ? "Klik: tampilkan" : "Klik: sembunyikan"}
                      aria-pressed={!!m.hidden}
                    >
                      {m.hidden ? <IconEyeOff style={{ width: 13, height: 13 }} /> : <IconEye style={{ width: 13, height: 13 }} />}
                      <span>{m.hidden ? "Hidden" : "Visible"}</span>
                    </button>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); onAssignCategoryClick(m); }}
                      data-tip="Tambah ke kategori"
                    >
                      <IconPlus style={{ width: 13, height: 13 }} />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); onThumbClick(m.id); }}
                      data-tip="Upload thumbnail"
                      disabled={thumbUploadingId === m.id}
                    >
                      {thumbUploadingId === m.id ? <span style={{ fontSize: 9 }}>...</span> : <IconImage style={{ width: 13, height: 13 }} />}
                    </button>
                    <button type="button" onClick={(e) => { e.stopPropagation(); onDelete(m); }} data-tip="Hapus dari Explore">
                      <IconTrash style={{ width: 13, height: 13 }} />
                    </button>
                  </span>
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
        {totalPages > 1 && (
          <div className="pagination">
            <button className="pagination__btn" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}>‹</button>
            {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
              <button key={p} className={"pagination__btn" + (p === currentPage ? " is-active" : "")} onClick={() => setPage(p)}>
                {p}
              </button>
            ))}
            <button className="pagination__btn" disabled={currentPage === totalPages} onClick={() => setPage(currentPage + 1)}>›</button>
          </div>
        )}
        </>
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

function IconListEdit(props) {
  return (
    <svg className="gp-ic" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M3 6h11" /><path d="M3 12h7" /><path d="M3 18h5" />
      <path d="M17.5 14.5 21 18l-3.7 1.2 1.2-3.7Z" />
      <path d="m19.3 12.7 2 2" />
    </svg>
  );
}
function IconGear(props) {
  return (
    <svg className="gp-ic" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

function IconEye(props) {
  return (
    <svg className="gp-ic" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" />
    </svg>
  );
}
function IconEyeOff(props) {
  return (
    <svg className="gp-ic" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M9.9 5.2A9.9 9.9 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-3.2 4.1" />
      <path d="M6.5 6.6C3.7 8.4 2 12 2 12s3.6 7 10 7c1.7 0 3.2-.5 4.5-1.2" />
      <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" /><path d="m3 3 18 18" />
    </svg>
  );
}
function IconImage(props) {
  return (
    <svg className="gp-ic" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <rect width="18" height="18" x="3" y="3" rx="2" /><circle cx="9" cy="9" r="2" /><path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21" />
    </svg>
  );
}
