# LaporAman — versi statis (tanpa database)

Website laporan anonim lokal untuk mencegah tawuran, perundungan, miras, dan narkoba — **tanpa server dan tanpa database**.

Semua data disimpan di **localStorage** browser perangkat yang membuka halaman.

## Cara menjalankan

Buka `index.html` langsung di browser, atau jalankan server statis sederhana:

```powershell
cd "C:\Users\Hype GLK\Documents\laporaman-live"
npx serve .
```

Halaman yang tersedia:

| Halaman | Fungsi |
| --- | --- |
| `index.html` | Website pelapor: form laporan, cek tiket, FAQ |
| `admin.html` | Panel peninjau: daftar, detail, ubah status/prioritas, hapus |

## Struktur

```
laporaman/
├── index.html    # halaman pelapor
├── styles.css    # desain halaman pelapor
├── app.js        # simpan laporan + cek status (localStorage)
├── admin.html    # panel peninjau
├── admin.css     # desain panel
├── admin.js      # logika panel (localStorage)
└── README.md
```

## Cara kerja penyimpanan

1. Pelapor mengisi form → foto disusutkan lewat canvas (EXIF/GPS ikut hilang) → laporan disimpan ke `localStorage` dengan kunci `laporaman_reports_v1`.
2. Tiket acak `LA-YYYYMMDD-XXXXXX` dibuat dengan `crypto.getRandomValues`.
3. Cek status mencari laporan berdasarkan tiket di localStorage.
4. Panel `admin.html` membaca dan mengubah laporan yang sama (localStorage origin yang sama).
5. Jika kuota storage penuh, foto otomatis dibuang agar laporan tetap tersimpan.

## Menyalakan GitHub Pages

1. Buka repository di GitHub → **Settings → Pages**.
2. Source: **Deploy from a branch**, Branch: **main**, folder: **/ (root)** → **Save**.
3. Tunggu 1–2 menit, website bisa diakses di:
   `https://rfahrizal334-byte.github.io/laporaman/`
4. Panel admin: `https://rfahrizal334-byte.github.io/laporaman/admin.html`

> Catatan: nama folder repo memengaruhi URL. Jika repo bernama `laporan`, URL-nya `.../laporan/`.

## Batasan penting (jujur)

- **Data tidak terlihat lintas perangkat.** Laporan yang dikirim di HP tidak muncul di laptop lain. Cocok untuk demo/presentasi tugas sekolah, bukan untuk layanan sungguhan.
- **localStorage bisa hilang** kalau data browser dibersihkan atau mode penyamaran ditutup.
- **Bukan pengganti jalur resmi.** Untuk bahaya langsung tetap hubungi `110`/`119`, guru BK, atau aparat setempat.
- **Untuk penggunaan nyata** dibutuhkan backend + database (contoh stack: Node.js + Express + PostgreSQL) agar laporan terpusat dan bisa ditinjau dari mana saja.

## Privasi yang diterapkan

- Tidak ada field nama, email, atau nomor ponsel.
- Tidak ada analytics, cookie pelacak, atau request ke pihak ketiga.
- Foto di-encode ulang sehingga metadata EXIF/GPS hilang.
- Data hanya hidup di browser pengunjung.

## Ide pengembangan selanjutnya

- Tambahkan mode penyimpanan alternatif (mis. export/import JSON untuk berpindah perangkat)
- PWA (service worker) agar bisa dipasang seperti aplikasi
- Versi backend dengan Express + PostgreSQL untuk penggunaan lintas perangkat
