# Gramofon Web

Aplikasi Next.js untuk Gramofon versi online. Fitur yang sudah berjalan:
landing page, login (Email+Password & Google, dengan show/hide password),
register (validasi password, username unik, cek buka/tutup pendaftaran),
dan Dashboard (Account — termasuk foto profil, Setting, Admin, Kontak).
Manajemen media (Fase 5) menyusul.

## 1. Selesaikan Firebase dulu (kalau belum)

Ikuti panduan "Fase 1" yang sudah diberikan sebelumnya: buat Firebase
project, aktifkan Authentication (Email/Password + Google), buat Firestore
Database (mode production), lalu ambil `firebaseConfig` dari
Project Settings > Your apps.

## 2. Install dependency

```
npm install
```

## 3. Isi kredensial Firebase

Salin `.env.local.example` menjadi `.env.local`, lalu isi setiap baris
dengan nilai dari `firebaseConfig` Anda. Contoh:

```
NEXT_PUBLIC_FIREBASE_API_KEY=AIzaSyABCDEF...
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=gramofon-web.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=gramofon-web
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=gramofon-web.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=123456789
NEXT_PUBLIC_FIREBASE_APP_ID=1:123456789:web:abcdef
```

## 4. Pasang Firestore Security Rules

Buka Firebase Console → Firestore Database → tab **Rules**. Hapus isi
default, ganti dengan **seluruh isi file `firestore.rules`** di project
ini, lalu klik **Publish**. (Ini yang menegakkan keamanan sesungguhnya —
tanpa langkah ini, database Anda memakai rules default yang salah satu
arahnya bisa menolak semua akses atau justru terbuka untuk semua orang,
tergantung mode yang Anda pilih saat membuat database.)

## 5. Jalankan lokal untuk tes

```
npm run dev
```

Buka http://localhost:3000 — coba daftar akun baru, coba login, coba
"Masuk dengan Google". Kalau ada error di console browser soal
`auth/unauthorized-domain`, itu karena `localhost` belum otomatis
di-whitelist Google — cek Firebase Console → Authentication → Settings →
Authorized domains, pastikan `localhost` ada di daftar (biasanya sudah
otomatis ada).

## 6. Jadikan akun pertama Anda admin (manual, sekali saja)

1. Daftar akun Anda sendiri lewat aplikasi (mis. `admin@gmail.com`).
2. Buka Firebase Console → Firestore Database → koleksi `users` → cari
   dokumen dengan UID Anda (cocokkan lewat field `email`).
3. Klik **Add field** → nama field `role`, tipe `string`, nilai `admin` →
   **timpa** nilai `role` yang sudah ada (jangan buat field baru kalau
   `role` sudah muncul sebagai `user`) → Save.
4. Field ini akan dipakai untuk menampilkan menu Admin di dashboard pada
   Fase 4, dan sudah dilindungi oleh `firestore.rules` supaya user lain
   tidak bisa mengubah field ini sendiri.

## 7. Push ke GitHub (project ini belum pernah di-git sama sekali)

Dari dalam folder project ini:

```
git init
git add .
git commit -m "Fase 2: landing page, login, register"
git branch -M main
git remote add origin https://github.com/USERNAME/gramofon-web.git
git push -u origin main
```

Buat dulu repo kosong bernama `gramofon-web` di GitHub (github.com/new,
JANGAN centang "Add README") sebelum menjalankan `git remote add` di atas.

## 8. Deploy ke Vercel

Ikuti langkah "Fase 1 bagian C" yang sudah diberikan sebelumnya: Import
repo `gramofon-web` di Vercel, isi **Environment Variables** dengan
nilai yang sama seperti di `.env.local` Anda (enam baris
`NEXT_PUBLIC_FIREBASE_...`), lalu Deploy.

⚠️ Setelah deploy, tambahkan juga domain Vercel Anda (misalnya
`gramofon-web.vercel.app`) ke **Firebase Console → Authentication →
Settings → Authorized domains** — kalau tidak, tombol "Masuk dengan
Google" akan gagal di production meskipun jalan normal di localhost.

## 9. Fitur admin "Hapus Akun" — Service Account (opsional tapi disarankan)

Fitur Admin → "Hapus Akun" pada dashboard butuh Firebase Admin SDK
(server-side) supaya bisa benar-benar menghapus akun Firebase
Authentication milik user lain (bukan cuma profilnya). Kalau langkah ini
dilewati, fitur lain tetap jalan normal, hanya tombol "Hapus Akun" di
Admin yang akan gagal dengan pesan error.

1. Firebase Console → ikon gerigi ⚙️ → **Project settings** → tab
   **Service accounts**.
2. Klik **Generate new private key** → unduh file `.json`. **Simpan
   baik-baik, JANGAN pernah di-commit/upload ke GitHub.**
3. Dari file itu, ambil 3 nilai dan masukkan ke `.env.local` (lokal) DAN
   ke Environment Variables di Vercel (production):
   ```
   FIREBASE_ADMIN_PROJECT_ID=<project_id>
   FIREBASE_ADMIN_CLIENT_EMAIL=<client_email>
   FIREBASE_ADMIN_PRIVATE_KEY=<private_key, apa adanya termasuk \n>
   ```
   Tiga variabel ini **TIDAK** pakai prefix `NEXT_PUBLIC_` — sengaja,
   supaya nilainya tidak pernah terkirim ke browser.
4. Redeploy di Vercel setelah menambahkan env var (Vercel tidak otomatis
   membaca env var baru untuk deployment yang sudah berjalan).

**Catatan soal foto profil:** foto profil disimpan langsung sebagai
base64 di dokumen Firestore user (bukan Firebase Storage) — jadi tidak
butuh setup tambahan apa pun, dan tetap di paket gratis (Spark). Ini
sengaja dipilih karena sejak Februari 2026 Firebase Storage mewajibkan
paket berbayar (Blaze) untuk semua project, termasuk yang baru.

## 10. Setup Cloudinary (untuk upload video/musik pengguna)

Video/musik sungguhan (bisa ratusan MB) tidak mungkin disimpan di
Firestore (limit 1MB/dokumen) — makanya dipakai Cloudinary, yang punya
tier gratis TANPA kartu kredit.

**Langkah pendaftaran:**
1. Buka https://cloudinary.com/users/register/free → daftar pakai email
   (tidak diminta kartu sama sekali).
2. Setelah masuk, Anda otomatis punya satu "Product Environment" default.
   Buka **Dashboard** (halaman utama setelah login).
3. Di bagian **"Product Environment Credentials"**, catat 3 nilai ini:
   - **Cloud name**
   - **API Key**
   - **API Secret** (klik ikon mata 👁 untuk menampilkannya — perlakukan
     ini seperti password, JANGAN dibagikan ke siapa pun)

**Masukkan ke Environment Variables** (lokal `.env.local` DAN Vercel):
```
CLOUDINARY_CLOUD_NAME=<cloud name Anda>
CLOUDINARY_API_KEY=<api key Anda>
CLOUDINARY_API_SECRET=<api secret Anda>
```
Ketiganya **server-only** (tanpa prefix `NEXT_PUBLIC_`) — API Secret
tidak pernah boleh sampai ke browser. Redeploy di Vercel setelah
menambahkan env var baru.

**Kenapa ini aman (prosedur "signed upload"):** aplikasi TIDAK memakai
"Upload Preset unsigned" (cara yang lebih gampang tapi rawan
disalahgunakan orang luar untuk upload sembarangan ke akun Anda). Sebagai
gantinya:
1. Browser minta "izin upload" ke server Anda sendiri (`/api/media/sign-upload`) — server mengecek dulu sisa kuota penyimpanan user itu, baru memberi tanda tangan yang **hanya berlaku sekali, untuk folder milik user itu saja**, ditandatangani pakai API Secret yang tidak pernah keluar dari server.
2. Browser upload langsung ke Cloudinary pakai tanda tangan itu.
3. Setelah selesai, browser lapor balik ke server Anda
   (`/api/media/confirm-upload`) — server **mengecek ulang** ukuran
   asli file (bukan percaya klaim browser) terhadap sisa kuota; kalau
   ternyata kelebihan, file yang baru saja ter-upload langsung dihapus
   lagi dari Cloudinary saat itu juga, dan tidak pernah tercatat.
4. Admin menghapus media (di Admin → Media) juga lewat server
   (`/api/admin/delete-media`), yang memverifikasi ulang status admin
   sebelum menghapus asset Cloudinary + datanya di Firestore.

Tidak ada langkah di Cloudinary Dashboard yang perlu diutak-atik lagi
setelah ini (tidak perlu bikin Upload Preset) — cukup 3 env var di atas.

## 11. Batas realistis paket gratis Cloudinary

Cloudinary Free plan memberi **25 kredit/bulan**, dibagi bersama antara
penyimpanan + bandwidth (streaming) + transformasi (1 kredit ≈ 1GB).
Ini BUKAN "25GB penyimpanan yang selalu tersedia" — kalau video sering
diputar orang, itu juga memakai kredit yang sama. Untuk skala aplikasi
publik-terbatas ini kemungkinan besar cukup, tapi pantau pemakaian di
Cloudinary Dashboard secara berkala.
