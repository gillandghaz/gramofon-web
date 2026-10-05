# Panduan Kontribusi

Terima kasih sudah ingin berkontribusi pada Gramofon.

## Alur kerja

1. Fork repositori dan buat cabang dari `main` (mis. `fitur/nama-singkat`).
2. Pasang dependensi: `npm install`, salin `.env.local.example` → `.env.local`.
3. Lakukan perubahan kecil dan terfokus; satu PR untuk satu tujuan.
4. Jalankan `npm run lint` dan `npm run build`.
5. Uji manual di **desktop dan HP** (Android/iPhone) untuk perubahan antarmuka atau pemutar.
6. Buka Pull Request dengan deskripsi: apa yang berubah, mengapa, dan cara mengujinya.

## Ketentuan

- **Jangan menyertakan rahasia** (kunci API, service account, `.env*`) atau data pengguna.
- Perubahan pada `firestore.rules` harus dijelaskan dan disebutkan di PR
  (rules dipublikasikan manual).
- Semua operasi sensitif harus divalidasi di **server**, bukan hanya di UI.
- Berkas media disimpan di Cloudinary; Firestore hanya untuk teks/metadata.
- Jaga agar `npm audit` tetap tanpa kerentanan.
- Tulis komentar yang menjelaskan *mengapa*, bukan sekadar *apa*.

## Melaporkan bug

Sertakan langkah reproduksi, hasil yang diharapkan vs. yang terjadi, serta
perangkat/OS/browser. Untuk masalah keamanan, ikuti [SECURITY.md](./SECURITY.md).
