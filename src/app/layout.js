import "./globals.css";
import { AuthProvider } from "@/lib/auth-context";

export const metadata = {
  title: "Gramofon",
  description: "Pemutar video & musik online Anda.",
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
