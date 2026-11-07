# POS Retail

Aplikasi kasir dan stok toko retail. Express.js, Postgres (Supabase) atau MySQL/MariaDB, frontend HTML/JS biasa tanpa build step.

Fitur: multi toko, penjualan INAPROC (faktur ke instansi + dokumen pendukung), backup & restore, template dokumen per toko, kasir keyboard-first, stok, penerimaan, pembelian, opname (tanpa approval), hutang/piutang, dashboard, laporan Excel, PDF surat jalan / invoice / permohonan pembayaran, cetak struk (browser dan ESC/POS), scanner barcode, barcode EAN-13 otomatis, identitas toko (nama, alamat, logo) yang dipakai di seluruh aplikasi dan dokumen.

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

## Multi toko

Satu aplikasi dan satu database untuk banyak toko.

- **Terpisah per toko:** stok, harga dasar, harga jual POS, transaksi, pembelian, opname, laporan, dashboard, pengaturan (termasuk pengaturan harga), dan penomoran dokumen.
- **Milik bersama semua toko:** master barang (SKU, barcode, nama, kategori, satuan), kategori, pelanggan, pemasok, dan jenis dokumen. Barang baru otomatis muncul di semua toko (stok 0). SKU dan barcode unik secara global.
- **Owner** memilih toko lewat dropdown *Toko* di topbar (di layar kasir juga ada). Setiap tab browser mengingat tokonya sendiri.
- **Kasir** dikunci ke satu toko (diatur di menu Pengguna).
- Menu **Toko**: tambah toko, ubah nama/kode, nonaktifkan. Saat menambah toko ada opsi *Salin pengaturan dari* toko lain (identitas, pajak, template). Toko tidak dihapus, hanya dinonaktifkan.
- Nomor dokumen (INV, PO, GR, OP) dihitung per toko.

### Upgrade dari versi lama

Migrasi otomatis dan aman diulang; berjalan sendiri saat aplikasi pertama menerima request, atau manual dengan `npm run db:init`. Sebaiknya backup database dulu.

- Dari v1.2: data lama menjadi **toko pertama**, kasir lama ditempatkan di toko itu, penomoran dilanjutkan.
- Dari v1.3: pelanggan dan pemasok kini dipakai bersama. Bila dulu ada pelanggan/pemasok yang sama di dua toko, akan tampil dobel; gabungkan atau nonaktifkan salah satunya. Opsi warna/gambar/format nomor dokumen di Pengaturan dihapus (lihat di bawah); nilai lamanya diabaikan. Tabel Master Dokumen dan dokumen pendukung dibuat otomatis.

- Dari v1.5: harga e-katalog, SP, dan langsung tiap barang diisi sekali dari acuan harga lama (agar harga yang berlaku tidak berubah), lalu menjadi isian manual; pengaturan akomodasi/laba/PPH/PPN dihapus. Kolom PPH ditambahkan ke penjualan.
- Dari v1.4: master barang dan kategori menjadi bersama. Barang ber-SKU sama di beberapa toko digabung jadi satu item (stok dan harga tiap toko tetap), kategori bernama sama digabung, setiap toko diisi semua barang. Penjualan CUSTOM menjadi INAPROC; No. SP digabung ke No. Kontrak/SP. Diskon dihapus dari semua penjualan.

## Harga barang (manual)

Sejak v1.6 tidak ada perhitungan harga otomatis (akomodasi, laba, PPH, PPN di Pengaturan dihapus). Setiap barang menyimpan harga yang diisi manual, **per toko**:

- **Harga dasar**: harga kulakan / modal; dasar perhitungan laba.
- **Harga jual POS**: hanya untuk tampil di layar kasir.
- **Harga E-Katalog**, **Harga SP**, **Harga Langsung**: dipakai di Penjualan Faktur (tidak pernah memakai harga jual POS).

Tombol **Excel Harga** di menu Barang mengekspor daftar harga dasar, e-katalog, SP, dan langsung apa adanya. Impor CSV menerima kolom `harga_ekatalog`, `harga_sp`, `harga_langsung`.

Seeder master barang dari Excel: `npm run seed:ecatalog` (89 barang bernama; 11 baris tanpa nama dilewati; satuan awal pcs, stok 0; aman diulang). Harga dihitung sekali oleh seeder lalu disimpan sebagai angka biasa: harga offline = (dasar + akomodasi) + laba per barang menjadi Harga Jual POS, Harga SP, dan Harga Langsung; Harga E-Katalog = harga offline + PPH 1,5% + PPN 11%. Setelah itu semuanya bisa diubah manual.

## Penjualan Faktur (di luar POS)

Tiga jenis, hanya memengaruhi harga:

- **INAPROC**: harga awal = Harga E-Katalog barang; boleh diubah per baris (nama dan satuan juga).
- **SP**: harga = Harga SP barang, tidak bisa diedit.
- **Langsung**: harga = Harga Langsung barang, tidak bisa diedit.

**Pajak bebas untuk semua jenis**: PPN dan PPH masing-masing dipilih *Tanpa*, *Ditambahkan ke harga*, atau *Sudah termasuk harga*, dengan tarif yang bisa diubah (bawaan 11% dan 1,5%). Keduanya dihitung dari harga sebelum pajak (DPP); bila ada yang "sudah termasuk", DPP = subtotal / (1 + jumlah tarif yang termasuk). Tidak ada batas Rp 2.000.000 dan tidak ada diskon. Satu kolom **No. Kontrak / SP**.

Di daftar Penjualan Faktur tiap baris punya tombol **Detail**, **Dokumen** (modal unggah), **Ubah**, dan **Hapus** (owner):

- **Ubah**: jenis, pelanggan, tanggal, nomor, kontrak/SP, pajak, dan barang. Stok disesuaikan sebesar selisih (tercatat "Ubah jual" di kartu stok). Pembayaran yang sudah masuk tetap; total baru tidak boleh di bawah jumlah yang sudah dibayar. Baris lama tetap memakai harga dasar dan (untuk SP/Langsung) harga yang tercatat saat itu; baris baru memakai harga sekarang. Bila jenis diganti, semua harga mengikuti jenis baru. Transaksi yang sudah dibatalkan tidak bisa diubah.
- **Hapus**: permanen. Stok dikembalikan (bila belum dibatalkan), pembayaran dan dokumen pendukung ikut terhapus. Nomor dokumen tidak dipakai ulang.

## Laporan: PPN, PPH, HPP, laba

Rincian Transaksi Penjualan, Penjualan Harian, dan Penjualan per Barang memuat **PPN**, **PPH**, **HPP**, dan **Laba**. Laba = total - PPN - PPH - HPP. HPP memakai **harga dasar saat transaksi** (disimpan di `sale_items.cost`), jadi laba transaksi lama tidak berubah ketika harga dasar barang diubah kemudian. PPN/PPH kosong dihitung 0. Transaksi batal tampil dengan angka 0.

### Stok, piutang, dan cetak

- Stok berkurang (kartu stok tercatat), transaksi masuk laporan penjualan, dashboard, dan **piutang** (yang belum dibayar). Cicilan dan pembatalan memakai menu Penjualan yang sama.
- Dari detail transaksi bisa cetak **Invoice, Surat Jalan, dan SPP** (PPN dan PPH tampil di ringkasan bila ada). Alamat tujuan SPP (*Kepada Yth.*) diambil dari master **Pelanggan** (kolom "Alamat tujuan SPP"); kalau kosong otomatis "Kepala [nama pelanggan] + alamat".

### Dokumen pendukung

Tombol **Dokumen** ada di baris daftar Penjualan Faktur (modal terpisah, tanpa membuka detail): unggah banyak berkas sekaligus, masing-masing dengan **judul** dan **jenis**. Jenis diambil dari menu **Master Dokumen** (awal: Surat Pesanan, Kontrak/SPK, BAST, Surat Jalan bertanda tangan, Invoice/Kwitansi, Faktur Pajak, Bukti Transfer; bisa ditambah/diubah/dinonaktifkan) atau **Lainnya**. Berkas PDF, gambar, Word, Excel, PowerPoint, atau teks, maksimal 4 MB per berkas (batas request Vercel), 50 berkas per transaksi. Berkas disimpan di database sehingga ikut backup/restore.

### Format nomor dokumen

Sama untuk semua toko: `{n} / {rom} / {code} / {yyyy}`, contoh `03 / X / AJS / 2026` (urut per toko, mulai 1 lagi tiap tahun). Nomor bisa juga diisi manual. **Untuk mengubah format**, edit konstanta `FORMAT` di `src/services/doc-number.js` (token: `{n}` `{n3}` `{rom}` `{mm}` `{code}` `{yyyy}` `{yy}`).

## Template dokumen

Pengaturan > **Template dokumen** hanya memilih template untuk toko tersebut (invoice, surat jalan, SPP):

| Template | Keterangan |
|---|---|
| **Bawaan** | Invoice layout *Nota Penjualan*, surat jalan, dan permohonan pembayaran standar. Memakai logo dari Pengaturan toko. |
| **Ardana** | Khusus CV Ardana Jaya Sejahtera: logo, ornamen, footer penuh, ucapan terima kasih. Tampilan tetap. |

Template berbentuk tetap (tanpa pilihan warna/logo), tetapi nama toko, alamat, telepon, rekening, dan penandatangan tetap diambil dari Pengaturan toko.

**Letak file:** semua di `src/templates/`.
- `index.js` daftar template (+ cara menambah),
- `default.js` template bawaan,
- `ardana.js` template Ardana, dengan gambar di `src/templates/ardana/` (logo, header, footer, ikon telepon). Warna dan teks ucapan ada di konstanta paling atas file ini.

**Menambah template baru** (mis. untuk toko lain): salin `src/templates/ardana.js` menjadi `src/templates/tokoabc.js`, ubah layout/warna/gambarnya (gambar di folder `src/templates/tokoabc/`), tambahkan satu baris `tokoabc: require('./tokoabc'),` di `src/templates/index.js`, lalu pilih di Pengaturan > Template dokumen toko tersebut. Setiap template mengekspor `{ label, margin, draw(doc, kind, s, d) }`; `kind` = `invoice` | `delivery` | `payment-request`, `s` = pengaturan toko, `d` = data dokumen.

**Toko CV Ardana Jaya Sejahtera:** jalankan `npm run seed:ardana` (membuat toko kode `AJS`, identitas, rekening, penandatangan, dan template Ardana). Pilih toko itu di dropdown, lalu tambahkan barang. Untuk toko lain tidak perlu apa-apa: tetap memakai template Bawaan, atau pilih Ardana di Pengaturan bila ingin tampilan yang sama.

## Backup dan restore

Menu **Backup & Restore** (owner): unduh satu file `.json.gz` berisi seluruh data semua toko (termasuk pengguna, pengaturan, logo, dan dokumen pendukung INAPROC; ukuran file bisa besar bila banyak dokumen). Restore **mengganti seluruh isi database** dengan file backup, wajib mengetik `RESTORE`, dan secara bawaan mengunduh backup pengaman dulu. File bisa dipindah antar Postgres dan MySQL. Di Vercel batas unggah sekitar 4,5 MB; untuk database besar jalankan restore dari server lokal.

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

174 pemeriksaan end-to-end: auth dan role, penjualan (pajak, grosir, kredit, void, 8 penjualan paralel), pembelian, penerimaan, opname, barcode, laporan, Excel, PDF, multi toko (isolasi data), penjualan faktur (INAPROC/SP/Langsung, PPN dan PPH bebas, ubah dan hapus, piutang, void, dokumen pendukung), laporan PPN/PPH/laba, pelanggan/pemasok bersama, template dokumen, backup dan restore.

## Struktur

```
src/db/        adapter Postgres / MySQL dan skema (sql/schema.sql)
src/routes/    API (auth, barang, penjualan, pembelian, opname, laporan, dokumen)
src/services/  stok, pengaturan, PDF (pdf.js), nomor dokumen (doc-number.js), barcode
src/templates/ template PDF: default.js, ardana.js (+ gambar), index.js = daftar template
public/        index (login), pos.html (kasir), admin.html (panel owner)
scripts/       init-db, seed, seed-ardana
```
