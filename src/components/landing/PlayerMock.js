import Logo from "@/components/Logo";

// Ilustrasi tampilan /app (dekoratif, bukan pemutar sungguhan).
// Hanya <Logo /> di samping tulisan "Gramofon" yang memakai logo asli;
// tombol play sengaja dibuat polos supaya tidak menyerupai logo.
const MENU = ["Theater", "Mini", "Audio Only", "Manage Media", "Explore"];
const QUEUE = ["Kelas basis data, sesi 4", "Podcast pagi 12", "Klip perjalanan", "Playlist fokus 1"];

const Play = ({ size = 14 }) => (
  <svg width={size} height={size} viewBox="0 0 14 14" aria-hidden="true">
    <path d="M3 1.5v11l9-5.5z" fill="currentColor" />
  </svg>
);

export default function PlayerMock() {
  return (
    <div className="lp-shot" role="img" aria-label="Tampilan Gramofon di desktop dan di ponsel">
      <div className="lp-win" aria-hidden="true">
        <div className="lp-win__top">
          <Logo size={18} />
          <b>Gramofon</b>
          {MENU.map((m, i) => (
            <span key={m} className={i === 0 ? "is-on" : ""}>{m}</span>
          ))}
        </div>
        <div className="lp-win__body">
          <div className="lp-win__screen">
            <span className="lp-overlay"><Play size={20} /></span>
          </div>
          <ul className="lp-win__q">
            {QUEUE.map((q, i) => (
              <li key={q} className={i === 0 ? "is-on" : ""}>{q}</li>
            ))}
          </ul>
        </div>
        <div className="lp-win__bar">
          <span className="lp-plain"><Play size={13} /></span>
          <span className="lp-track"><span /></span>
          <em>1.25×</em>
        </div>
      </div>

      <div className="lp-phone" aria-hidden="true">
        <div className="lp-phone__top">
          <Logo size={13} />
          <b>Gramofon</b>
        </div>
        <div className="lp-record"><span /></div>
        <p>Podcast pagi 12</p>
        <div className="lp-track"><span /></div>
        <div className="lp-phone__ctl"><Play size={13} /></div>
      </div>
    </div>
  );
}
