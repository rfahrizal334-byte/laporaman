# LaporAman — versi siap deploy

Platform laporan anonim lokal dengan backend sungguhan:

- **Frontend:** HTML + CSS + JavaScript (tanpa framework)
- **Backend:** Node.js + Express
- **Database:** PostgreSQL (Supabase / Neon / Render Postgres)
- **Upload:** foto di-encode ulang dengan Sharp → metadata EXIF/GPS ikut terhapus
- **Admin:** panel peninjauan di `/admin` dengan Basic Auth

> Folder demo lama masih tersimpan di `..\laporaman`. Folder ini adalah versi produksi yang bisa di-deploy.

## 1. Menjalankan secara lokal

### Prasyarat
- Node.js 18 atau lebih baru
- PostgreSQL lokal, atau akun Supabase/Neon gratis

### Langkah
```powershell
cd "C:\Users\Hype GLK\Documents\laporaman-live"
npm install
```

Salin `.env.example` menjadi `.env`:

```powershell
Copy-Item .env.example .env
```

Isi `.env`, contoh untuk PostgreSQL lokal:

```env
PORT=3000
DATABASE_URL=postgres://postgres:password@localhost:5432/laporaman
PGSSL=false
ADMIN_USER=admin
ADMIN_PASSWORD=ganti-dengan-password-minimal-12-karakter
TICKET_SECRET=ganti-dengan-string-acak-minimal-16-karakter
```

Buat database `laporaman`, lalu jalankan `schema.sql` di SQL editor:

```powershell
psql -U postgres -d laporaman -f schema.sql
```

Jalankan server:

```powershell
npm start
```

Buka:
- Website: `http://localhost:3000`
- Panel admin: `http://localhost:3000/admin`
- Health check: `http://localhost:3000/api/health`

## 2. Deploy ke hosting

### Opsi A — Render + Render Postgres
1. Buat **Web Service** baru, hubungkan repository GitHub.
2. Runtime: **Node**, Build command: `npm install`, Start command: `npm start`.
3. Buat **PostgreSQL** di Render, salin *Internal Database URL* ke `DATABASE_URL`.
4. Tambahkan environment variable lain dari `.env.example`.
5. Jalankan `schema.sql` lewat SQL editor Render.
6. Pastikan `PGSSL=false` untuk internal database Render.

### Opsi B — Render + Supabase / Neon
1. Buat project Supabase atau Neon, ambil connection string.
2. Isi `DATABASE_URL` dengan string tersebut, set `PGSSL=true`.
3. Jalankan `schema.sql` di SQL editor provider.
4. Deploy Web Service seperti Opsi A.

### Opsi C — Railway
1. New Project → Deploy from GitHub repo.
2. Add PostgreSQL service, gunakan `DATABASE_URL` yang disediakan Railway.
3. Set env variables lainnya, jalankan `schema.sql`.

## 3. Alur data

1. Pelapor mengisi form → `POST /api/reports` (multipart).
2. Server membuat tiket `LA-YYYYMMDD-XXXXXX` dengan `crypto.randomBytes`.
3. Tiket **tidak disimpan apa adanya**, melainkan HMAC-SHA256 dengan `TICKET_SECRET`. Yang disimpan: `ticket_hash` dan 4 karakter terakhir sebagai petunjuk.
4. Foto di-encode ulang ke JPEG tanpa metadata, lalu disimpan sebagai `BYTEA`.
5. Event awal “Laporan diterima” dibuat otomatis.
6. Pelapor mengecek status via `GET /api/reports/:ticket/status`.
7. Peninjau membuka `/admin`, mengubah status/prioritas/catatan; perubahan status menambah entri riwayat yang terlihat pelapor.

## 4. API

| Method | Endpoint | Keterangan |
| --- | --- | --- |
| `GET` | `/api/health` | Cek koneksi database |
| `POST` | `/api/reports` | Kirim laporan (+ opsional foto `bukti`) |
| `GET` | `/api/reports/:ticket/status` | Cek status oleh pelapor |
| `GET` | `/admin` | Panel admin (Basic Auth) |
| `GET` | `/api/admin/summary` | Ringkasan jumlah laporan |
| `GET` | `/api/admin/reports` | Daftar laporan terbaru |
| `GET` | `/api/admin/reports/:id` | Detail laporan + riwayat |
| `PATCH` | `/api/admin/reports/:id` | Ubah status, prioritas, catatan |
| `GET` | `/api/admin/reports/:id/evidence` | Ambil foto bukti |

## 5. Contoh uji cepat

```powershell
# Cek kesehatan
curl http://localhost:3000/api/health

# Kirim laporan tanpa foto
curl -X POST http://localhost:3000/api/reports `
  -F "kategori=Potensi tawuran" `
  -F "lokasi=Depan gerbang sekolah" `
  -F "waktu=Hari ini" `
  -F "urgensi=Sedang" `
  -F "kronologi=Ada kumpulan remaja yang saling menantang usai pulang sekolah."

# Cek status (ganti kode tiket yang muncul)
curl http://localhost:3000/api/reports/LA-20261125-XXXXXX/status
```

## 6. Catatan keamanan & anonimitas

Sudah dilakukan:
- Tidak ada field nama, email, atau nomor ponsel.
- Tidak ada middleware logger yang mencatat IP/header.
- Tiket disimpan sebagai HMAC, bukan teks biasa.
- Metadata foto dihapus oleh Sharp saat encode ulang.
- Panel admin dilindungi Basic Auth dan kredensial dibandingkan dengan `timingSafeEqual`.
- Header keamanan dari Helmet aktif.
- Admin hanya melihat 4 karakter terakhir tiket, bukan kode lengkap.

Masih perlu diperhatikan sebelum dipakai sungguhan:
1. **HTTPS wajib** — Basic Auth dan data laporan tidak boleh lewat HTTP.
2. Gunakan `ADMIN_PASSWORD` dan `TICKET_SECRET` yang kuat, jangan pernah commit `.env`.
3. Hosting bisa menyimpan log akses di level platform. Pilih provider yang bisa menonaktifkan/menghapus log IP, atau tinjau kebijakan privasi mereka.
4. Batasi siapa yang punya akun admin; idealnya tambahkan audit log/admin terpisah untuk produksi skala besar.
5. Pastikan ada prosedur jelas dengan sekolah/aparat sebelum laporan diteruskan.
6. Tetap sediakan jalur darurat `110`/`119` untuk bahaya langsung.

## 7. Struktur folder

```
laporaman-live/
├── server.js          # API + static server
├── schema.sql         # Skema PostgreSQL
├── .env.example       # Template konfigurasi
├── package.json
├── README.md
└── public/
    ├── index.html     # Website pelapor
    ├── styles.css
    ├── app.js         # Kirim laporan + cek status
    ├── admin.html     # Panel peninjau
    ├── admin.css
    └── admin.js
```
