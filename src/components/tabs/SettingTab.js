"use client";

import { useAuth } from "@/lib/auth-context";
import { updateSetting } from "@/lib/account";

const SKIP_OPTIONS = [5, 10, 15, 30];
const VIEW_OPTIONS = [
  { value: "theater", label: "Theater" },
  { value: "mini", label: "Mini" },
  { value: "audio", label: "Audio" },
  { value: "titles", label: "Titles" },
];

export default function SettingTab() {
  const { user, profile } = useAuth();
  const settings = profile?.settings || {};
  const skipSeconds = settings.skipSeconds || 5;
  const startupView = settings.startupView || "theater";

  return (
    <div>
      <h2 className="tab-title">Setting</h2>

      <div className="setting-row">
        <div>
          <div className="setting-row__label">Skip interval</div>
          <p className="hint-text">Seberapa jauh tombol Back/Forward melompat.</p>
        </div>
        <div className="segmented">
          {SKIP_OPTIONS.map((s) => (
            <button
              key={s}
              type="button"
              className={"segmented__btn" + (skipSeconds === s ? " is-active" : "")}
              onClick={() => updateSetting(user.uid, "skipSeconds", s)}
            >
              {s}s
            </button>
          ))}
        </div>
      </div>

      <div className="setting-row">
        <div>
          <div className="setting-row__label">Tampilan awal (startup view)</div>
          <p className="hint-text">Mode tampilan pemutar saat pertama dibuka.</p>
        </div>
        <div className="segmented">
          {VIEW_OPTIONS.map((v) => (
            <button
              key={v.value}
              type="button"
              className={"segmented__btn" + (startupView === v.value ? " is-active" : "")}
              onClick={() => updateSetting(user.uid, "startupView", v.value)}
            >
              {v.label}
            </button>
          ))}
        </div>
      </div>

      <p className="hint-text" style={{ marginTop: 18 }}>
        Pengaturan pemutar lain (shuffle, repeat, dsb.) menyusul di halaman
        pemutar pada tahap berikutnya.
      </p>
    </div>
  );
}
