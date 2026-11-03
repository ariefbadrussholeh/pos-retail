# POS Retail

Aplikasi kasir dan stok toko retail. Express.js, Postgres (Supabase) atau MySQL/MariaDB, frontend HTML/JS biasa tanpa build step.

Fitur: multi toko, penjualan custom (faktur ke instansi), backup & restore, template dokumen per toko, kasir keyboard-first, stok, penerimaan, pembelian, opname (tanpa approval), hutang/piutang, dashboard, laporan Excel, PDF surat jalan / invoice / permohonan pembayaran, cetak struk (browser dan ESC/POS), scanner barcode, barcode EAN-13 otomatis, identitas toko (nama, alamat, logo) yang dipakai di seluruh aplikasi dan dokumen.

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

- **Owner**: semua menu admin dan **semua toko** (berpindah lewat dropdown Toko aktif).
- **Kasir**: terikat ke **satu toko**, hanya layar kasir (`/pos.html`), melihat transaksinya sendiri, mencetak dokumen transaksinya sendiri.

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

## Multi toko (v1.3)

Satu aplikasi dan satu database untuk banyak toko. Semua data dipisah per toko: barang, kategori, pemasok, pelanggan, stok, harga, transaksi, pembelian, opname, laporan, dashboard, pengaturan, penomoran dokumen, dan template. Antar toko tidak saling terlihat.

- **Owner** memilih toko lewat dropdown *Toko aktif* di sidebar (di layar kasir juga ada). Setiap tab browser mengingat tokonya sendiri.
- **Kasir** dikunci ke satu toko (diatur di menu Pengguna).
- Menu **Toko**: tambah toko, ubah nama/kode, nonaktifkan. Saat menambah toko ada opsi *Salin pengaturan dari* toko lain (identitas, pajak, template, gambar). Toko tidak dihapus, hanya dinonaktifkan.
- SKU dan barcode boleh sama di toko berbeda; nomor dokumen (INV, PO, GR, OP) dihitung per toko.

### Upgrade dari v1.2

Data lama otomatis menjadi **toko pertama** (nama diambil dari pengaturan lama), kasir lama ditempatkan di toko itu, dan penomoran dilanjutkan. Migrasi berjalan sendiri saat aplikasi pertama kali menerima request, atau manual dengan `npm run db:init`. Aman diulang. Sebaiknya unduh backup dulu (v1.2: dump database).

## Penjualan Custom (di luar POS)

Menu **Penjualan Custom** (owner) untuk faktur ke perusahaan/instansi, tampilan admin biasa:

- Pelanggan (perusahaan), **no. kontrak**, **tanggal kontrak**, **no. surat pesanan (SP)**, tanggal dokumen, jatuh tempo, alamat tujuan SPP.
- **Pajak per transaksi**: tanpa pajak / belum termasuk (ditambahkan) / sudah termasuk, dengan tarif sendiri (bawaan 11%, diatur di Pengaturan).
- **Harga, nama barang, dan satuan** per baris diatur sendiri dan tidak mengubah master barang.
- Stok tetap berkurang (kartu stok tercatat), masuk laporan penjualan, dashboard, dan **piutang** (yang belum dibayar). Pembayaran/cicilan dan pembatalan memakai menu Penjualan yang sama.
- Nomor otomatis sesuai format toko, contoh `02 / X / AJS / 2026` (`{n} / {rom} / {code} / {yyyy}`), bisa diisi manual.
- Dari detail transaksi bisa cetak **Invoice, Surat Jalan, dan SPP**.

## Template dokumen

Pengaturan > **Template dokumen** memilih tampilan invoice, surat jalan, dan SPP per toko:

| Template | Keterangan |
|---|---|
| **Bawaan** | Invoice mengikuti layout *Nota Penjualan* (judul tengah, tabel header warna aksen, Tanda Terima / Hormat Kami, kotak catatan). Surat jalan dan permohonan pembayaran bawaan tetap ada. |
| **Ardana** | Logo toko, ornamen kanan atas, strip bawah, nomor telepon, ucapan terima kasih. Surat jalan, invoice, dan SPP bergaya CV Ardana Jaya Sejahtera. |

Isi dokumen (kontrak, no. SP, jatuh tempo, rekening, pajak, terbilang, penandatangan) sama di semua template.

**Toko CV Ardana Jaya Sejahtera** sudah disiapkan: jalankan `npm run seed:ardana` (membuat toko kode `AJS` dengan identitas, rekening, penandatangan, dan gambar ornamen dari `assets/ardana/`). Pilih toko itu di dropdown, lalu tambahkan barang dan pelanggan.

**Memakai template Ardana di toko lain:**
1. Buka toko tersebut (dropdown Toko aktif), lalu Pengaturan > Identitas: isi nama, alamat, telepon, logo, rekening, nama dan jabatan penandatangan.
2. Pengaturan > Template dokumen: pilih **Ardana**, atur warna aksen/kedua, lalu unggah gambar *ornamen kanan atas*, *strip bawah*, dan *ikon telepon* (PNG transparan; tanpa gambar, template tetap jalan tanpa ornamen).
3. Simpan. Cara cepat: saat membuat toko baru, pilih *Salin pengaturan dari* toko Ardana, lalu ganti identitas dan gambarnya.

Kalau ingin ornamen Ardana hanya untuk Ardana, cukup jangan menyalinnya ke toko lain; toko lain tetap memakai template Bawaan.

## Backup dan restore

Menu **Backup & Restore** (owner): unduh satu file `.json.gz` berisi seluruh data semua toko (termasuk pengguna, pengaturan, logo, gambar template). Restore **mengganti seluruh isi database** dengan file backup, wajib mengetik `RESTORE`, dan secara bawaan mengunduh backup pengaman dulu. File bisa dipindah antar Postgres dan MySQL. Di Vercel batas unggah sekitar 4,5 MB; untuk database besar jalankan restore dari server lokal.

## Tampilan gelap dan bar progres

- Tombol **Gelap/Terang** ada di layar masuk, panel admin (kiri bawah), dan layar kasir (atas). Pintasan `Alt+T`. Default mengikuti pengaturan sistem; pilihan disimpan di browser.
- Bar tipis di atas halaman tampil saat pindah menu, memuat data, dan pindah antar halaman.

## Font PDF dan Vercel

Font PDF ditanam di folder `fonts/` (Liberation Sans: Regular, Bold, Italic) dan dipakai menggantikan Helvetica bawaan pdfkit, yang gagal dimuat di Vercel (`standard-fonts/Helvetica.cjs` tidak ikut ter-bundle). Di Vercel pastikan folder ikut ter-deploy, contoh `vercel.json`:

```json
{ "functions": { "api/index.js": { "includeFiles": "fonts/**" } } }
```

Ganti `api/index.js` dengan entrypoint function Anda.

## Pengujian

```bash
DATABASE_URL=... node test/run.js     # database kosong; jalan di Postgres dan MySQL
```

126 pemeriksaan end-to-end: auth dan role, penjualan (pajak, grosir, kredit, void, 8 penjualan paralel), pembelian, penerimaan, opname, barcode, laporan, Excel, PDF, multi toko (isolasi data), penjualan custom (3 mode pajak, piutang, void), template dokumen, backup dan restore.

## Struktur

```
src/db/        adapter Postgres / MySQL dan skema (sql/schema.sql)
src/routes/    API (auth, barang, penjualan, pembelian, opname, laporan, dokumen)
src/services/  stok, pengaturan, PDF, barcode
public/        index (login), pos.html (kasir), admin.html (panel owner)
scripts/       init-db, seed, seed-ardana
assets/ardana  gambar template Ardana (dipakai seed-ardana)
```
