import "./globals.css";
import { AuthProvider } from "@/lib/auth-context";

export const metadata = {
  title: "Gramofon",
  description: "Pemutar video & musik online Anda.",
  // format-detection: mencegah Safari (terutama iPhone) otomatis mengubah
  // teks polos yang "terlihat seperti" email/nomor telepon menjadi tautan
  // bergaris bawah di mana pun di situs -- termasuk email di menu profil.
  other: {
    "format-detection": "telephone=no, date=no, address=no, email=no",
  },
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  // viewport-fit=cover + inset dipakai di CSS supaya konten tidak
  // ketutupan notch/status bar di iPhone; dan var(--vh)/dvh di CSS
  // supaya tidak ketutupan taskbar Android / address bar browser mobile.
  viewportFit: "cover",
};

export default function RootLayout({ children }) {
  return (
    <html lang="id">
      <body>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
