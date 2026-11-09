# POS Retail

Aplikasi kasir dan stok toko retail. Express.js, Postgres (Supabase) atau MySQL/MariaDB, frontend HTML/JS biasa tanpa build step.

Fitur: multi toko, penjualan INAPROC (faktur ke instansi + dokumen pendukung), backup & restore, template dokumen per toko, kasir keyboard-first, stok, penerimaan, pembelian, opname (tanpa approval), hutang/piutang, dashboard, laporan Excel, PDF surat jalan / invoice / permohonan pembayaran, cetak struk (browser dan ESC/POS), scanner barcode, barcode EAN-13 otomatis, identitas toko (nama, alamat, logo) yang dipakai di seluruh aplikasi dan dokumen.

## Mulai

```bash
npm install
cp .env.example .env     # isi DATABASE_URL dan JWT_SECRET
npm run db:init          # buat tabel + akun owner awal (juga migrasi; alias: npm run db:migrate)
npm run db:refresh       # HAPUS semua tabel aplikasi lalu buat ulang (lihat bagian Refresh database)
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

Di form barang, di bawah tiap input harga jual (POS, E-Katalog, SP, Langsung, grosir) tampil **panduan laba** terhadap harga dasar: hijau "Laba Rp X (Y%)" bila untung, merah "Minus Rp X" bila rugi.

## Penjualan Faktur (di luar POS)

Tiga jenis, hanya memengaruhi harga:

- **INAPROC**: harga awal = Harga E-Katalog barang; boleh diubah per baris (nama dan satuan juga).
- **SP**: harga = Harga SP barang, tidak bisa diedit.
- **Langsung**: harga = Harga Langsung barang, tidak bisa diedit.

**Pajak**: hanya **PPN** yang ada di nota: *Tanpa*, *Ditambahkan ke harga*, atau *Sudah termasuk harga*, tarif bisa diubah (bawaan 11%). Dihitung dari harga sebelum pajak (DPP); bila "sudah termasuk", DPP = jumlah / (1 + tarif). **Semua hasil dibulatkan ke atas** ke rupiah penuh (mis. PPN 1.937,39 menjadi 1.938). Contoh: subtotal 29.065.000 + PPN 569.030 = total 29.634.030. Tidak ada batas Rp 2.000.000 dan tidak ada diskon. Satu kolom **No. Kontrak / SP**.

**PPH tidak ada di nota** (tidak ada input, tidak tercetak di invoice, surat jalan, SPP, maupun layar detail). PPH hanya dihitung otomatis untuk **laporan**, dan hanya untuk penjualan **INAPROC (e-katalog)**: di awal form INAPROC ada pilihan **Metode pembayaran instansi: UP / LS**. Tarif: **UP 0,5%**, **LS 1,5%**, dikalikan DPP (nilai sebelum PPN, semua baris), dibulatkan ke atas. SP dan Langsung: PPH = 0. Tarif ada di `src/services/pph.js` (konstanta `RATES`). Catatan: PMK 34/PMK.010/2017 (diubah PMK 110/2018 dan PMK 41/2022) menyebut PPh 22 pembelian oleh bendahara pemerintah 1,5% dari harga pembelian di luar PPN tanpa membedakan UP dan LS; tarif UP 0,5% terbukti di invoice INAPROC (metode UP); tarif LS 1,5% belum ada contoh dokumennya. Dasar PPH adalah DPP seluruh nota (cocok dengan invoice INAPROC: 0,5% x 29.065.000 = 145.325 untuk UP; tarif 0,5% tertulis di invoice INAPROC); bila ada barang bebas PPN, hasilnya berbeda dari rumus "total / 1,11 x tarif" pada contoh Excel bendahara.

**Barang tidak kena pajak dalam satu nota**: tiap baris di form faktur punya kotak centang **PPN** (nonaktif bila mode PPN Tanpa). Baris yang tidak dicentang tidak dikenai PPN. Di master barang ada **Bebas PPN** (dipakai bersama semua toko) sebagai nilai awal centang itu; tetap bisa diubah per nota. Di PDF, barang bebas PPN diberi tanda `*` dengan catatan "* Barang bebas PPN".

**Aturan khusus toko (hardcode)** di `src/services/store-rules.js`, per kode toko (Ardana `AJS`, Rizky Nabila `RN`). Dua aturan saat ini: **(1) jenis faktur**: RN hanya **Penjualan Langsung**; **(2) kolom nomor di laporan Rincian Transaksi**: RN hanya "No. Invoice", AJS hanya "No. SP" (toko lain keduanya). Untuk menghilangkan salah satu, hapus properti itu (`fakturTypes` atau `reportRefs`) di baris tokonya, atau hapus seluruh baris toko, lalu restart. Keterangan sebelumnya soal RN: Toko Rizky Nabila (kode `RN`) hanya menampilkan **Penjualan Langsung**; tombol INAPROC dan SP disembunyikan dan server menolak jenis lain. Aturannya ada di `src/services/store-rules.js`, baris `RN: { fakturTypes: ['LANGSUNG'] }`. **Untuk menghilangkan pembatasan**, hapus baris `RN:` itu (atau isi `['INAPROC','SP','LANGSUNG']`), lalu restart server. Toko lain bisa ditambah dengan baris serupa memakai kode tokonya.

Di daftar Penjualan Faktur tiap baris punya tombol **Detail**, **Dokumen** (modal unggah), **Ubah**, dan **Hapus** (owner):

- **Ubah**: jenis, pelanggan, tanggal, nomor, kontrak/SP, pajak, dan barang. Stok disesuaikan sebesar selisih (tercatat "Ubah jual" di kartu stok). Pembayaran yang sudah masuk tetap; total baru tidak boleh di bawah jumlah yang sudah dibayar. Baris lama tetap memakai harga dasar dan (untuk SP/Langsung) harga yang tercatat saat itu; baris baru memakai harga sekarang. Bila jenis diganti, semua harga mengikuti jenis baru. Transaksi yang sudah dibatalkan tidak bisa diubah.
- **Hapus**: permanen. Stok dikembalikan (bila belum dibatalkan), pembayaran dan dokumen pendukung ikut terhapus. Nomor dokumennya bisa dipakai lagi bila itu yang terbesar (lihat Format nomor dokumen).

### Upgrade dari v1.7 ke 1.8.x: perbaiki faktur lama

Faktur yang dibuat di v1.7 menyimpan PPH di dalam total. Untuk menyamakan dengan aturan baru (total = subtotal + PPN, PPH hanya laporan): `npm run fix:tax` (hanya menampilkan perubahan), lalu `npm run fix:tax -- --yes` untuk menyimpan. Tambahkan `--pay=UP` (atau `LS`) untuk sekaligus mengisi UP/LS pada faktur INAPROC lama; tanpa itu PPH laporannya 0 sampai diubah lewat Ubah. Pembayaran yang sudah masuk tidak diubah; faktur yang total barunya di bawah pembayaran dilewati dan dilaporkan. Aman diulang.

## Laporan: PPN, PPH, HPP, laba

Menu Laporan: **Rincian Transaksi Penjualan** ada paling atas dan jadi pilihan awal; rentang tanggal awal = **1 Januari tahun ini sampai hari ini**; urutan **terbaru di atas** (rincian, harian, pembelian, penerimaan, opname). Laba ditampilkan dua kolom: **Laba Sebelum PPH** (Total − PPN − HPP, sama dengan Subtotal − HPP) dan **Laba Setelah PPH** (dikurangi PPH). Kolom Kasir tidak ada di laporan rincian.

Rincian Transaksi Penjualan memuat **No. Invoice** dan/atau **No. Pesanan / SP** (sesuai aturan toko) (No. SP selalu paling depan) serta kolom **UP / LS** (hanya toko yang menjual INAPROC, jadi tidak di Rizky Nabila). Kolom Metode (Tunai/Kredit) dihilangkan. Daftar Penjualan dan Penjualan Faktur juga menampilkan No. SP di kolom pertama. PPH di laporan hanya terisi untuk INAPROC. Rincian Transaksi Penjualan, Penjualan Harian, dan Penjualan per Barang memuat **PPN**, **PPH**, **HPP**, dan **Laba**. Laba = total - PPN - PPH - HPP. HPP memakai **harga dasar saat transaksi** (disimpan di `sale_items.cost`), jadi laba transaksi lama tidak berubah ketika harga dasar barang diubah kemudian. PPN/PPH kosong dihitung 0. Transaksi batal tampil dengan angka 0.

### Stok, piutang, dan cetak

- Stok berkurang (kartu stok tercatat), transaksi masuk laporan penjualan, dashboard, dan **piutang** (yang belum dibayar). Cicilan dan pembatalan memakai menu Penjualan yang sama.
- Dari detail transaksi bisa cetak **Invoice, Surat Jalan, dan SPP** (hanya PPN di ringkasan; PPH tidak dicetak). Alamat tujuan SPP (*Kepada Yth.*) diambil dari master **Pelanggan** (kolom "Alamat tujuan SPP"); kalau kosong otomatis "Kepala [nama pelanggan] + alamat".

### Dokumen pendukung

Tombol **Dokumen** ada di baris daftar Penjualan Faktur (modal terpisah, tanpa membuka detail): unggah banyak berkas sekaligus, masing-masing dengan **judul** dan **jenis**. Jenis diambil dari menu **Master Dokumen** (awal: Surat Pesanan, Kontrak/SPK, BAST, Surat Jalan bertanda tangan, Invoice/Kwitansi, Faktur Pajak, Bukti Transfer; bisa ditambah/diubah/dinonaktifkan) atau **Lainnya**. Berkas PDF, gambar, Word, Excel, PowerPoint, atau teks, maksimal 4 MB per berkas (batas request Vercel), 50 berkas per transaksi. Berkas disimpan di database sehingga ikut backup/restore.

### Format nomor dokumen

Sama untuk semua toko: `{n} / {rom} / {code} / {yyyy}`, contoh `03 / X / AJS / 2026` (urut per toko, mulai 1 lagi tiap tahun). **Nomor berikutnya = nomor terbesar yang masih ada di toko itu pada tahun tersebut + 1**, dihitung dari data yang ada: bila faktur terakhir (04) dihapus, faktur baru kembali mendapat 04; bila yang dihapus di tengah, nomor tetap melanjutkan yang terbesar. Nomor bisa juga diisi manual (nomor manual yang lebih besar ikut menjadi acuan). **Untuk mengubah format**, edit konstanta `FORMAT` di `src/services/doc-number.js` (token: `{n}` `{n3}` `{rom}` `{mm}` `{code}` `{yyyy}` `{yy}`).

## Refresh database

`npm run db:refresh` = migrasi ulang dari nol (seperti `migrate:refresh`): menghapus **semua tabel aplikasi** (bukan seluruh database), membuat ulang, dan membuat akun owner awal. **Semua data hilang**, jadi backup dulu. Meminta konfirmasi (ketik `REFRESH`); untuk skrip pakai `--yes`.

```bash
npm run db:refresh                                  # tabel kosong + akun owner
npm run db:refresh -- --seed                        # + data contoh
npm run db:refresh -- --ecatalog --ardana --rizky   # + master barang e-katalog, toko Ardana, toko Rizky Nabila
npm run db:refresh -- --yes --ecatalog              # tanpa konfirmasi
```

Opsi seeder: `--seed`, `--ecatalog`, `--ardana`, `--rizky` (urutan jalan sama dengan daftar ini). Untuk sekadar menjalankan migrasi tanpa menghapus data, pakai `npm run db:migrate` (atau `db:init`).

## Template dokumen

Pengaturan > **Template dokumen** hanya memilih template untuk toko tersebut (invoice, surat jalan, SPP):

| Template | Keterangan |
|---|---|
| **Bawaan** | Invoice layout *Nota Penjualan*, surat jalan, dan permohonan pembayaran standar. Memakai logo dari Pengaturan toko. |
| **Ardana** | Khusus CV Ardana Jaya Sejahtera: logo, ornamen, footer penuh, ucapan terima kasih. Tampilan tetap. |
| **Rizky Nabila (hijau stabilo)** | Khusus Toko Rizky Nabila: kop logo RN, tabel berheader hijau stabilo (#90FA26) dengan baris kosong, kotak catatan merah, Tanda Terima / Hormat Kami. Invoice mengikuti form Excel toko; Surat Jalan dan SPP didesain dengan palet yang sama. |

Nomor di Permohonan Pembayaran (SPP): template **Ardana** menampilkan **No. SP / kontrak** (bila kosong, nomor transaksi); template **Rizky** menampilkan nomor transaksi. Untuk mengubahnya, edit baris `row('Nomor', ...)` di fungsi permohonan pembayaran pada `src/templates/ardana.js` (atau `rizky.js`).

Pindah toko lewat dropdown di atas tetap di halaman yang sama (halaman ubah/baru kembali ke daftarnya).

Catatan PDF: kata "(termasuk)" tidak dicetak, dan PPH tidak pernah tampil di dokumen (hanya laporan). Surat Jalan Rizky hanya memuat Penerima dan Hormat Kami.

Template berbentuk tetap (tanpa pilihan warna/logo), tetapi nama toko, alamat, telepon, rekening, dan penandatangan tetap diambil dari Pengaturan toko.

**Letak file:** semua di `src/templates/`.
- `index.js` daftar template (+ cara menambah),
- `default.js` template bawaan,
- `ardana.js` template Ardana, dengan gambar di `src/templates/ardana/` (logo, header, footer, ikon telepon). Warna dan teks ucapan ada di konstanta paling atas file ini.

**Menambah template baru** (mis. untuk toko lain): salin `src/templates/ardana.js` menjadi `src/templates/tokoabc.js`, ubah layout/warna/gambarnya (gambar di folder `src/templates/tokoabc/`), tambahkan satu baris `tokoabc: require('./tokoabc'),` di `src/templates/index.js`, lalu pilih di Pengaturan > Template dokumen toko tersebut. Setiap template mengekspor `{ label, margin, draw(doc, kind, s, d) }`; `kind` = `invoice` | `delivery` | `payment-request`, `s` = pengaturan toko, `d` = data dokumen.

**Toko Rizky Nabila:** `npm run seed:rizky` membuat toko kode `RN` (nomor dokumen `n / bulan / RN / tahun`), alamat, dan template Rizky. Telepon, rekening, dan nama penandatangan diisi sendiri di Pengaturan.

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

183 pemeriksaan end-to-end: auth dan role, penjualan (pajak, grosir, kredit, void, 8 penjualan paralel), pembelian, penerimaan, opname, barcode, laporan, Excel, PDF, multi toko (isolasi data), penjualan faktur (INAPROC/SP/Langsung, PPN dan PPH bebas, ubah dan hapus, piutang, void, dokumen pendukung), laporan PPN/PPH/laba, pelanggan/pemasok bersama, template dokumen, backup dan restore.

## Struktur

```
src/db/        adapter Postgres / MySQL dan skema (sql/schema.sql)
src/routes/    API (auth, barang, penjualan, pembelian, opname, laporan, dokumen)
src/services/  stok, pengaturan, PDF (pdf.js), nomor dokumen (doc-number.js), barcode
src/templates/ template PDF: default.js, ardana.js (+ gambar), index.js = daftar template
public/        index (login), pos.html (kasir), admin.html (panel owner)
scripts/       init-db, seed, seed-ardana
```
