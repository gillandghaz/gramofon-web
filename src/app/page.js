import Link from "next/link";
import Logo from "@/components/Logo";
import AuthRedirect from "@/components/landing/AuthRedirect";
import Nav from "@/components/landing/Nav";
import PlayerMock from "@/components/landing/PlayerMock";
import "./landing.css";

const DESC = "Unggah video dan musik Anda, susun playlist, lalu putar dari browser di desktop, Android, dan iPhone.";
export const metadata = {
  title: "Gramofon — pemutar video dan musik pribadi",
  description: DESC,
  openGraph: { title: "Gramofon — pemutar video dan musik pribadi", description: DESC, type: "website", locale: "id_ID" },
};

// Hanya fitur yang benar-benar ada di /app.
const FEATURES = [
  ["Unggah sendiri", "Video dan audio dari perangkat Anda."],
  ["Playlist dan antrean", "Susun, seret untuk mengurutkan."],
  ["Acak dan ulang", "Ulang satu lagu atau seluruh antrean."],
  ["Tiga mode tampilan", "Theater, Mini, dan Audio Only."],
  ["Kontrol lengkap", "Kecepatan, layar penuh, Picture-in-Picture."],
  ["Timer tidur", "Berhenti otomatis: 15, 30, 60 menit, atau sesuai keinginan."],
  ["Explore", "Koleksi pilihan admin, per kategori."],
  ["Login mudah", "Google atau email, plus reset password."],
];

const EDGE = [
  ["File Anda, bukan katalog orang lain.", "Yang diputar hanya yang Anda unggah, ditambah koleksi Explore pilihan admin."],
  ["Video dan audio dalam satu antrean.", "Tidak perlu dua aplikasi. Ganti ke Audio Only kapan saja."],
  ["Kontrol yang bisa Anda atur.", "Volume sampai 120%, lompat maju/mundur sesuai detik pilihan, pintasan keyboard di desktop."],
  ["Cukup browser.", "Buka di desktop, Android, atau iPhone. Tanpa instal aplikasi."],
];

const FAQ = [
  ["Perlu instal aplikasi?", "Tidak. Gramofon berjalan di browser."],
  ["Berapa batas unggahan?", "Ditetapkan admin dan bisa berbeda per akun. Sisa ruang ditampilkan saat unggahan terlalu besar."],
  ["Pendaftaran tidak bisa dibuka?", "Admin dapat menutup pendaftaran sementara. Jika sudah punya akun, langsung masuk."],
];

function Cta({ className = "" }) {
  return (
    <div className={"lp-cta " + className}>
      <Link href="/register" className="btn btn--primary lp-lg">Buat akun</Link>
      <Link href="/login" className="btn btn--ghost lp-lg">Masuk</Link>
    </div>
  );
}

export default function LandingPage() {
  return (
    <div className="lp">
      <script
        // Berjalan sebelum bagian halaman lain dirender: pengguna yang sudah
        // login langsung diarahkan ke /app (lihat lib/auth-hint.js).
        dangerouslySetInnerHTML={{
          __html: 'try{if(localStorage.getItem("gf_auth")==="1")location.replace("/app")}catch(e){}',
        }}
      />
      <AuthRedirect cover />
      <Nav />
      <main>
        <section className="lp-hero">
          <div className="lp-wrap lp-hero__grid">
            <div>
              <h1>Putar koleksi video dan musik Anda sendiri.</h1>
              <p>Unggah, susun playlist, lalu putar dari browser. Satu akun untuk desktop, Android, dan iPhone.</p>
              <Cta />
            </div>
            <PlayerMock />
          </div>
        </section>

        <section id="fitur" className="lp-sec">
          <div className="lp-wrap">
            <h2>Fitur</h2>
            <ul className="lp-feat">
              {FEATURES.map(([t, d]) => (
                <li key={t}><h3>{t}</h3><p>{d}</p></li>
              ))}
            </ul>
          </div>
        </section>

        <section id="keunggulan" className="lp-sec lp-sec--alt">
          <div className="lp-wrap">
            <h2>Kenapa Gramofon</h2>
            <ul className="lp-edge">
              {EDGE.map(([t, d]) => (
                <li key={t}><h3>{t}</h3><p>{d}</p></li>
              ))}
            </ul>
          </div>
        </section>

        <div className="lp-tail">
        <section id="faq" className="lp-sec">
          <div className="lp-wrap lp-narrow">
            <h2>FAQ</h2>
            <div className="lp-faq">
              {FAQ.map(([q, a]) => (
                <details key={q}><summary>{q}</summary><p>{a}</p></details>
              ))}
            </div>
          </div>
        </section>

        <section className="lp-final">
          <div className="lp-wrap">
            <h2>Mulai putar koleksi Anda.</h2>
            <Cta className="lp-cta--c" />
          </div>
        </section>
        </div>
      </main>

      <footer className="lp-foot">
        <div className="lp-wrap lp-foot__in">
          <span className="lp-brand"><Logo size={20} /><span>Gramofon</span></span>
          <span>© {new Date().getFullYear()} Gramofon</span>
        </div>
      </footer>
    </div>
  );
}
