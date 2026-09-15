# Gramofon Web — Fase 2 (Landing, Login, Register)

Ini adalah skeleton awal aplikasi Next.js untuk Gramofon versi online.
Fitur yang sudah jalan di fase ini: landing page, login (Email+Password &
Google), register (dengan validasi password, username unik, dan cek status
buka/tutup pendaftaran). Dashboard, ganti password, menu Admin, dan
manajemen media akan menyusul di fase berikutnya.

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
