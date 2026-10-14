# Kebijakan Keamanan

Keamanan pengguna dan datanya adalah prioritas. Terima kasih sudah membantu menjaga Gramofon tetap aman.

## Melaporkan kerentanan

**Jangan membuka *issue* publik** untuk masalah keamanan. Laporkan secara privat lewat salah satu cara berikut:

1. **Disarankan:** gunakan [*Report a vulnerability*](../../security/advisories/new) di tab **Security** repositori ini (GitHub *Private vulnerability reporting*).
2. Jika cara di atas tidak tersedia, hubungi pemilik repositori lewat kontak yang tercantum pada profil GitHub, dan **jangan** menuliskan rincian teknis di tempat publik.

Mohon sertakan:

- deskripsi masalah dan dampaknya,
- langkah untuk mereproduksi,
- versi/commit atau deployment yang diuji, dan lingkungan (browser/perangkat),
- bukti konsep seminimal mungkin.

### Yang kami harapkan dari pelapor

- Uji hanya dengan akun Anda sendiri. **Jangan mengakses, mengubah, atau menghapus data pengguna lain.**
- Jangan melakukan serangan yang mengganggu ketersediaan layanan (mis. banjir permintaan/DoS), spam, atau rekayasa sosial.
- Jangan menyebarkan temuan sebelum diperbaiki; beri waktu yang wajar.

### Yang bisa Anda harapkan dari kami

- Laporan ditanggapi dengan upaya terbaik, dan perkembangannya akan dikabarkan.
- Pelapor yang beritikad baik dan mengikuti panduan di atas tidak akan dipersulit.
- Atribusi/ucapan terima kasih bila Anda menghendakinya.

## Versi yang didukung

Hanya kode terbaru di cabang `main` dan deployment produksi yang bersumber darinya.

## Cakupan

**Dalam cakupan:** kode aplikasi, Route Handlers `/api/*`, dan `firestore.rules`.

**Di luar cakupan:** layanan pihak ketiga (Firebase, Cloudinary, Vercel, GitHub), serangan yang memerlukan akses fisik ke perangkat korban, rekayasa sosial, serta laporan otomatis tanpa dampak keamanan nyata (mis. temuan *scanner* tanpa bukti eksploitasi).

## Praktik bagi pengelola

- Jangan pernah meng-commit `.env.local` atau berkas *service account*.
- Putar (rotate) kunci jika dicurigai bocor: private key Firebase dan API Secret Cloudinary.
- Publikasikan ulang `firestore.rules` setiap kali berubah (tidak ter-deploy otomatis).
- Jalankan `npm audit` secara berkala dan tanggapi peringatan Dependabot.
- Uji pembaruan dependensi secara manual sebelum menggabungkannya, terutama paket yang diatur lewat blok `overrides` di `package.json`.
