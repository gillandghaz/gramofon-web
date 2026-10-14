# Panduan Kontribusi

Terima kasih sudah tertarik pada Gramofon.

Saat ini proyek ini **tidak menerima Pull Request**. Masukan sangat dihargai lewat **Issues**.

> **Catatan hak cipta:** proyek ini tidak memakai lisensi sumber terbuka (lihat [README](./README.md#-hak-cipta)). Jika Anda menuliskan saran atau contoh kode di sebuah *Issue*, Anda menyatakan bahwa Anda berhak membagikannya dan mengizinkan pemilik repositori memakainya dalam proyek ini tanpa batas waktu.

## Cara memberi masukan

- **Bug:** buka *Issue* dan jelaskan langkah reproduksi, hasil yang diharapkan vs. yang terjadi, serta perangkat/OS/browser. Lampirkan tangkapan layar bila membantu, **tanpa data pribadi**.
- **Saran fitur atau perbaikan:** buka *Issue* dan jelaskan masalah yang ingin diselesaikan serta usulan Anda.
- **Masalah keamanan:** jangan lewat *Issue*. Ikuti [SECURITY.md](./SECURITY.md).

## Yang jangan disertakan

Jangan menyertakan rahasia (kunci API, *service account*, isi `.env*`), token, data pengguna, atau tautan media pribadi dalam *Issue*, tangkapan layar, maupun log.

## Untuk pengelola

- Operasi sensitif (otorisasi, kuota, peran admin) divalidasi di **server**, bukan hanya di antarmuka.
- Berkas media disimpan di **Cloudinary**; Firestore hanya untuk teks/metadata.
- `firestore.rules` dipublikasikan manual setiap kali berubah.
- Jaga agar `npm audit` tetap tanpa kerentanan; jangan menghapus blok `overrides` di `package.json` tanpa pengujian di Vercel.
- Pesan commit memakai format [Conventional Commits](https://www.conventionalcommits.org/), mis. `feat: ...`, `fix: ...`, `docs: ...`, `chore: ...`.
