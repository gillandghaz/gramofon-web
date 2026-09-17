"use client";

import { useEffect, useRef, useState } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth-context";
import { markNotificationRead } from "@/lib/notifications";

function formatDate(ts) {
  if (!ts?.toDate) return "";
  return ts.toDate().toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function NotificationBell() {
  const { user, profile } = useAuth();
  const [notifs, setNotifs] = useState([]);
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState(null); // notif yang sedang dibuka penuh
  const wrapRef = useRef(null);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, "notifications"), (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      list.sort((a, b) => {
        const at = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
        const bt = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
        return bt - at;
      });
      setNotifs(list);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    function onDocClick(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("click", onDocClick);
    return () => document.removeEventListener("click", onDocClick);
  }, []);

  const readMap = profile?.readNotifications || {};
  const unreadCount = notifs.filter((n) => !readMap[n.id]).length;

  async function handleOpenNotif(notif) {
    setDetail(notif);
    setOpen(false);
    if (!readMap[notif.id]) {
      await markNotificationRead(user.uid, notif.id).catch(() => {});
    }
  }

  return (
    <div className="notif-wrap" ref={wrapRef}>
      <button
        type="button"
        className="iconbtn-bell"
        onClick={() => setOpen((v) => !v)}
        aria-label="Notifikasi"
        title="Notifikasi"
      >
        <BellIcon />
        {unreadCount > 0 && (
          <span className="notif-badge">{unreadCount > 9 ? "9+" : unreadCount}</span>
        )}
      </button>

      {open && (
        <div className="notif-panel">
          <div className="notif-panel__head">
            Notifikasi{" "}
            {unreadCount > 0 && (
              <span className="hint-inline">({unreadCount} belum dibaca)</span>
            )}
          </div>
          {notifs.length === 0 ? (
            <p className="hint-text" style={{ padding: "14px 16px" }}>
              Belum ada notifikasi.
            </p>
          ) : (
            <div className="notif-panel__list">
              {notifs.map((n) => (
                <button
                  key={n.id}
                  type="button"
                  className={"notif-item" + (!readMap[n.id] ? " is-unread" : "")}
                  onClick={() => handleOpenNotif(n)}
                >
                  <div className="notif-item__top">
                    <span className="notif-item__sender">Gramofon</span>
                    <span className="notif-item__date">{formatDate(n.createdAt)}</span>
                  </div>
                  <div className="notif-item__title">{n.title}</div>
                  <div className="notif-item__msg">{n.message}</div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Detail penuh — popup di tengah layar, isi pesan bisa discroll
          kalau panjang (dropdown di atas hanya cuplikan 2 baris). */}
      {detail && (
        <div className="notif-detail-backdrop" onClick={() => setDetail(null)}>
          <div className="notif-detail-card" onClick={(e) => e.stopPropagation()}>
            <div className="notif-detail-card__head">
              <div className="notif-detail-card__sender">Gramofon</div>
              <div className="notif-detail-card__title">{detail.title}</div>
              <div className="notif-detail-card__date">{formatDate(detail.createdAt)}</div>
            </div>
            <div className="notif-detail-card__body">{detail.message}</div>
            <div className="notif-detail-card__foot">
              <button className="btn btn--ghost btn--sm" onClick={() => setDetail(null)}>
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function BellIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
      <path
        d="M10 2.5c-2.5 0-4.3 2-4.3 4.5v2.6c0 .6-.2 1.2-.6 1.7l-1 1.3c-.5.6-.1 1.6.7 1.6h10.4c.8 0 1.2-1 .7-1.6l-1-1.3c-.4-.5-.6-1.1-.6-1.7V7c0-2.5-1.8-4.5-4.3-4.5z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
      <path
        d="M8.2 16.5a1.9 1.9 0 0 0 3.6 0"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}
