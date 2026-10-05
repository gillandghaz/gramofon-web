# Kebijakan Keamanan

## Melaporkan kerentanan

Jika Anda menemukan celah keamanan di Gramofon, **jangan membuka issue publik**.
Hubungi pemilik proyek secara privat (gunakan fitur *Report a vulnerability* /
*Security advisories* di GitHub bila aktif, atau kontak yang tercantum pada profil
pemilik repositori).

Mohon sertakan:

- deskripsi masalah dan dampaknya,
- langkah untuk mereproduksi,
- versi/commit yang diuji dan lingkungan (browser/perangkat),
- bukti konsep seminimal mungkin (tanpa mengakses data pengguna lain).

Kami berusaha menanggapi laporan secepatnya dan akan mengabari perkembangan
perbaikannya. Mohon beri waktu wajar untuk memperbaiki sebelum pengungkapan publik.

## Cakupan

Dalam cakupan: kode aplikasi, Route Handlers `/api/*`, dan `firestore.rules`.

Di luar cakupan: layanan pihak ketiga (Firebase, Cloudinary, Vercel), serangan
yang memerlukan akses fisik ke perangkat korban, serta rekayasa sosial.

## Praktik bagi pengelola

- Jangan pernah meng-commit `.env.local` atau berkas *service account*.
- Putar (rotate) kunci jika dicurigai bocor: private key Firebase dan API Secret Cloudinary.
- Publikasikan ulang `firestore.rules` setiap kali berubah.
- Jalankan `npm audit` secara berkala dan perbarui dependensi.
