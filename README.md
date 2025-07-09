# Forex Backtesting Platform

Forex Backtesting Platform adalah aplikasi web yang memungkinkan Anda melakukan backtest strategi trading forex dengan bantuan analisis AI.

## Fitur
- Backend Node.js + Express menggunakan TypeScript
- Frontend React dengan TypeScript
- Autentikasi JWT sederhana
- Menjalankan simulasi backtest dan melihat laporan

## Prasyarat
- **Node.js** v18 atau lebih baru
- **npm** v9 atau lebih baru

Pastikan kedua komponen di atas telah terinstal dengan benar di sistem Anda.

## Instalasi
1. **Clone repository**
   ```bash
   git clone <repo_url>
   cd web-app-backtest
   ```
2. **Instal dependensi** untuk backend dan frontend
   ```bash
   cd backend && npm install
   cd ../frontend && npm install
   ```

## Konfigurasi Environment
Semua variabel environment disimpan di berkas `.env` pada root project. Contoh konfigurasi dapat dilihat pada `env.txt`.

Buat file `.env` baru dan salin isinya dari `env.txt`, lalu sesuaikan nilai-nilainya.

```bash
cp env.txt .env
# lalu edit .env sesuai kebutuhan
```

Variabel yang penting antara lain:
- `PORT`: port server backend (default `5000`)
- `NODE_ENV`: environment (`development`/`production`)
- `API_KEY_GEMINI_PRO` dan `API_KEY_GEMINI_FLASH`: API key untuk layanan Gemini
- `JWT_SECRET`: secret key untuk JWT
- `DATABASE_URL`: URL database jika nanti memakai MongoDB/PostgreSQL

## Menjalankan Aplikasi
### Mode Pengembangan
Untuk menjalankan backend dan frontend bersamaan:
```bash
npm run dev
```
Backend akan berjalan pada `http://localhost:5000` dan frontend pada `http://localhost:3000`.

### Build Produksi
```bash
npm run build
```
Perintah di atas akan membangun backend dan frontend. Setelah proses selesai, jalankan server:
```bash
npm start
```

## Struktur Proyek
```
backend/   # kode API Express
frontend/  # aplikasi React
env.txt    # contoh konfigurasi environment
```

## Pengaturan Database
Saat ini aplikasi menggunakan penyimpanan data sementara (in-memory). Untuk menggunakan database nyata, siapkan MongoDB atau PostgreSQL dan ubah `DATABASE_URL` pada `.env` sesuai koneksi database Anda. Implementasi koneksi database dapat ditambahkan pada modul model/service sesuai kebutuhan di masa mendatang.

## Testing
Proyek ini menggunakan TypeScript dan React Scripts. Jika dependensi telah terpasang, Anda dapat menjalankan:
```bash
npx tsc -p frontend/tsconfig.json --noEmit
CI=true npm test --prefix frontend -- --passWithNoTests
```

## Lisensi
Proyek ini menggunakan lisensi MIT.
