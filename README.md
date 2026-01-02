# LinkedIn Auto Connect

Extension untuk kirim permintaan koneksi LinkedIn secara otomatis.

**dibuat oleh smalm**

---

## Fitur

- Proses sampai 100 profil per sesi
- Rate limiting otomatis (max 100/jam)
- Circuit breaker kalau banyak gagal
- Resume sesi yang terputus
- Support berbagai format URL (dengan/tanpa https, dengan nomor, dll)

---

## Instalasi

1. Buka `chrome://extensions/` (Chrome) atau `edge://extensions/` (Edge)
2. Nyalakan **Developer mode**
3. Klik **Load unpacked**
4. Pilih folder extension ini
5. Selesai!

---

## Cara Pakai

1. Klik icon extension di toolbar
2. Paste URL profil LinkedIn (satu per baris)
3. Klik **Jalankan**
4. Tunggu sampai selesai

### Format URL yang Didukung

Semua format ini BISA:

```
https://www.linkedin.com/in/username
www.linkedin.com/in/username
linkedin.com/in/username
1) https://www.linkedin.com/in/username
• www.linkedin.com/in/username
https://www.linkedin.com/in/username?utm_source=share
```

---

## Timing

| Setting | Nilai |
|---------|-------|
| Delay antar profil | 1.5 - 3 detik |
| Delay sebelum klik | 0.8 - 1.5 detik |
| Timeout loading | 15 detik |
| Max per jam | 100 koneksi |

---

## Struktur File

```
├── manifest.json    - Konfigurasi extension
├── popup.html       - Tampilan popup
├── popup.js         - Logika popup
├── styles.css       - Styling
├── background.js    - Service worker
├── content.js       - Interaksi dengan LinkedIn
├── utils.js         - Utility classes
├── config.js        - Konfigurasi
└── icons/           - Icon extension
```

---

## Troubleshooting

**Error "Service worker registration failed"**
- Pastikan tidak ada syntax error di file JS
- Reload extension

**URL tidak dikenali**
- Pastikan format: linkedin.com/in/username
- Boleh dengan/tanpa https, www, atau nomor di depan

**Koneksi gagal**
- Cek apakah profil sudah pending/connected
- Pastikan login ke LinkedIn di browser

---

## Disclaimer

Gunakan dengan bijak. Jangan spam. Risiko akun adalah tanggung jawab pengguna.

---

dibuat oleh smalm | 2026
