# POS Retail

Aplikasi kasir dan stok toko retail. Express.js, Postgres (Supabase) atau MySQL/MariaDB, frontend HTML/JS biasa tanpa build step.

Fitur: kasir keyboard-first, stok, penerimaan, pembelian, opname (tanpa approval), hutang/piutang, dashboard, laporan Excel, PDF surat jalan / invoice / permohonan pembayaran, cetak struk (browser dan ESC/POS), scanner barcode, barcode EAN-13 otomatis, identitas toko (nama, alamat, logo) yang dipakai di seluruh aplikasi dan dokumen.

## Mulai

```bash
npm install
cp .env.example .env     # isi DATABASE_URL dan JWT_SECRET
npm run db:init          # buat tabel + akun owner awal
npm run db:seed          # (opsional) data contoh
npm start                # http://localhost:3000
```

Login awal: `owner` / `owner123` (dari `ADMIN_USER` / `ADMIN_PASSWORD`). **Segera ganti password** lewat tombol Password di panel admin.

### Pilih database lewat `DATABASE_URL`

| Database | Contoh |
|---|---|
| Supabase (Postgres) | `postgresql://postgres:PASSWORD@db.xxxx.supabase.co:5432/postgres` |
| Supabase pooler | `postgresql://postgres.xxxx:PASSWORD@aws-0-xx.pooler.supabase.com:6543/postgres` |
| MySQL / MariaDB | `mysql://user:password@127.0.0.1:3306/pos_retail` |

Driver dipilih otomatis dari awalan URL. Untuk MySQL buat database kosong dulu (`CREATE DATABASE pos_retail CHARACTER SET utf8mb4;`), lalu `npm run db:init`.

Catatan Supabase: `db:init` menyalakan Row Level Security pada semua tabel tanpa policy. Aplikasi memakai koneksi Postgres langsung (melewati RLS), jadi data tidak bisa dibaca lewat Data API/anon key. Jangan membuat policy publik.

## Peran

- **Owner**: semua menu admin (dashboard, barang, pembelian, penerimaan, opname, laporan, pengguna, pengaturan).
- **Kasir**: hanya layar kasir (`/pos.html`), melihat transaksinya sendiri, mencetak dokumen transaksinya sendiri.

Tidak ada alur approval. Penerimaan dan opname langsung berlaku saat disimpan. Pembatalan (void) transaksi hanya owner dan mengembalikan stok.

## Layar kasir: pintasan

| Tombol | Fungsi |
|---|---|
| Scan / ketik + Enter | Tambah barang (barcode persis langsung masuk) |
| `3*kode` | Qty 3. `3*` lalu scan = qty untuk barang berikutnya |
| Up / Down | Pilih baris keranjang (atau hasil pencarian) |
| `+` `-` / Del | Qty +1 / -1 / hapus baris (saat input kosong) |
| F2 / F3 / F4 | Cari / ubah qty / pelanggan |
| F5 / F6 | Tahan / panggil transaksi |
| F7 / F8 | Diskon baris / diskon total (nominal atau `10%`) |
| F9 | Riwayat hari ini: Enter cetak ulang, `I` invoice, `J` surat jalan, `K` permohonan |
| F10 | Buka laci kas (ESC/POS) |
| F12 / End / Enter kosong | Bayar. Di dialog: F1-F5 metode, F6-F9 uang cepat |
| Ctrl+K | Scan dengan kamera |
| Ctrl+P | Printer dan perangkat |
| Ctrl+Del | Kosongkan keranjang |

Pembayaran: Tunai, Debit, QRIS, Transfer, Kredit (uang muka, jatuh tempo, pelunasan dicatat dari admin).

## Scanner dan barcode

- **Scanner USB / Bluetooth** (mode keyboard): langsung bekerja di kasir, opname, pemilih barang, dan form barang. Di form barang, Enter dari scanner pindah kolom, tidak menyimpan form.
- **Kamera**: tombol Kamera / Ctrl+K (Chrome/Edge, perlu HTTPS atau localhost).
- **Opname**: scan barcode = hitungan barang itu +1.
- **Barcode otomatis**: barang baru tanpa barcode diberi EAN-13 berawalan `20` (khusus internal, unik, tervalidasi check digit). Bisa dimatikan di Pengaturan. Tombol "Buat otomatis" di form barang, dan "Barcode otomatis" di daftar barang untuk mengisi semua barang yang masih kosong.
- **Label**: Barang > Cetak label (rol label thermal atau lembar A4, beberapa ukuran).

## Cetak struk

Pengaturan per perangkat (Ctrl+P di kasir, disimpan di browser):

- **Dialog print browser**: kertas 58 / 80 mm, printer apa pun yang terpasang di OS. Untuk cetak tanpa dialog, jalankan Chrome dengan `--kiosk-printing`.
- **ESC/POS langsung**: Web Serial (termasuk Bluetooth serial) atau WebUSB. Mendukung logo, potong kertas, dan buka laci kas. Perlu Chrome/Edge lewat HTTPS atau localhost. Bila gagal, otomatis jatuh ke cetak browser.

## Dokumen PDF

Dari detail penjualan atau pembelian (admin), atau dari dialog selesai bayar dan F9 (kasir): **Invoice**, **Surat Jalan**, **Permohonan Pembayaran**. Semuanya memakai kop surat dari Pengaturan (logo, nama, alamat, telepon, NPWP, rekening bank, penandatangan) dan terbilang dalam rupiah. Permohonan pembayaran hanya bisa dibuat selama masih ada sisa tagihan. Tersedia untuk transaksi penjualan (ke pelanggan) dan pembelian (ke pemasok).

## Laporan Excel

Admin > Laporan & Excel: penjualan harian, rincian transaksi, penjualan per barang (dengan laba), per kasir, stok, stok menipis, pembelian, penerimaan, opname, piutang, hutang. Juga ekspor dari daftar Barang dan Penjualan.

## Produksi

- Ganti `JWT_SECRET` dengan string acak panjang, set `COOKIE_SECURE=true` bila di belakang HTTPS.
- Jalankan di belakang reverse proxy HTTPS (Nginx/Caddy). Perlu HTTPS agar ESC/POS dan scan kamera jalan dari perangkat lain.
- Cadangkan database secara berkala (Supabase: backup bawaan; MySQL: `mysqldump`).

## Pengujian

```bash
DATABASE_URL=... node test/run.js     # database kosong; jalan di Postgres dan MySQL
```

72 pemeriksaan end-to-end: auth dan role, penjualan (pajak, grosir, kredit, void, 8 penjualan paralel), pembelian, penerimaan, opname, barcode, laporan, Excel, PDF.

## Struktur

```
src/db/        adapter Postgres / MySQL dan skema (sql/schema.sql)
src/routes/    API (auth, barang, penjualan, pembelian, opname, laporan, dokumen)
src/services/  stok, pengaturan, PDF, barcode
public/        index (login), pos.html (kasir), admin.html (panel owner)
scripts/       init-db, seed
```
