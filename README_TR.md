# A01 — Kapak Çiçek Ağacı | WebAR (Sürüm 4.0.0)

Dünyanın Sıfır Atık Ormanı sergisi için A01 pilot WebAR deneyimi.
Uygulama indirmeden, iPhone Safari ve Android Chrome üzerinde çalışır.

---

## Depoda bulunması gereken yapı

```
/  (repo kökü)
├── index.html
├── app.js
├── style.css
├── preview.html
├── vercel.json
├── README_TR.md
└── assets/
    ├── targets.mind              (önceden derlenmiş MindAR hedefi)
    ├── A01_kling_12s_web.mp4     (AR videosu)
    ├── A01_poster.jpg            (açılış ekranı görseli)
    └── A01_master.png            (baskı/arşiv master'ı — sayfa tarafından yüklenmez)
```

---

## Teknik özet

| Konu | Karar |
|---|---|
| Görüntü tanıma | MindAR 1.2.5 image tracking |
| Sahne | A-Frame 1.5.0 (MindAR'ın resmî olarak pinlediği sürüm) |
| Hedef derleme | **Runtime compiler YOK.** Yalnızca hazır `assets/targets.mind` okunur |
| Hedef dosya | msgpack v2 · 1024×1536 · 11 ölçek · doğrulandı |
| Video düzlemi | genişlik 1 · yükseklik 1.5 (= 1536/1024, tam 2:3) |
| Video dokusu | Doğrudan `THREE.VideoTexture` (A-Frame material sistemi baypas edilir) |
| Video | H.264 Main L3.1 · 784×1176 · 24 fps · 12.04 sn · 5.4 MB · faststart |
| Hizalama | Master ↔ video ECC korelasyon 0.996, ölçek 1.000, kayma 0 px → düzeltme gerekmez |
| CDN | jsDelivr birincil, unpkg yedek (otomatik geçiş) |

---

## iOS Safari için alınan özel önlemler

1. **Video kilidi kullanıcı dokunuşunun içinde açılır.** `AR'yi Başlat` butonuna basıldığı anda, hiçbir `await` beklenmeden `play() → pause() → currentTime = 0` yapılır. Düşük Güç Modunda bile video oynar.
2. **Video elementi `display:none` DEĞİLDİR.** 1 piksel ekran dışı tutulur; aksi hâlde iOS, WebGL dokusuna kare beslemesini kesebilir.
3. **Hedef dosyası açılışta doğrulanır ve önbelleğe ısıtılır.** MindAR'ın `addImageTargets()` fonksiyonu hataları sessizce yuttuğu için doğrulama önden yapılır.
4. **Watchdog + Türkçe hata paneli.** 35 saniye içinde AR hazır olmazsa siyah ekran yerine anlaşılır bir mesaj ve "Tekrar Dene" butonu çıkar.
5. **Uygulama içi tarayıcı algılama.** Instagram/Facebook/WhatsApp içinden açıldığında "Safari'de Aç" yönlendirmesi gösterilir.
6. **Ekran döndürme** sonrası MindAR projeksiyonu yeniden hesaplanır.
7. **`apple-mobile-web-app-capable` kaldırıldı** — Ana Ekrana Ekle ile açıldığında iOS kamerayı engelliyordu.

---

## Telefon testi

1. A01 görselini ikinci bir ekranda tam ekran açın veya A4/A3 basın.
2. iPhone'da Safari ile `https://sifir-atik-ormani.vercel.app/` adresini açın.
3. `AR'yi Başlat` → kamera iznine **İzin Ver**.
4. Telefonu, görselin **tamamı** kadraja girecek şekilde 40–100 cm mesafeden tutun.
5. Hedef tanınınca video görselin üzerine oturur ve oynar. Kamerayı çevirin → durur. Geri dönün → baştan başlar.

Sorun olursa adresin sonuna `?debug=1` ekleyip açın; ekranın altında teknik günlük görünür.

---

## Sorun giderme

| Belirti | Sebep / çözüm |
|---|---|
| "AR hedef dosyası bulunamadı" | `assets/targets.mind` depoya yüklenmemiş |
| "AR motoru yüklenemedi" | İnternet bağlantısı CDN'e ulaşamıyor; Wi-Fi deneyin |
| "Kameraya erişilemedi" | Ayarlar > Safari > Kamera → "Sor"/"İzin Ver" |
| Hedef tanınmıyor | Işığı artırın, parlamayı azaltın, görselin tamamını kadraja alın |
| Video oynamıyor, düzlem boş | `?debug=1` ile açıp günlüğü paylaşın |

---

## Sonraki adım (A01 onaylandıktan sonra)

- Filigransız Kling export ile `assets/A01_kling_12s_web.mp4` değiştirilir.
- Nihai fiziksel eser fotoğrafı ile `targets.mind` yeniden derlenir.
- Aynı mimari A02–A30 için çoklu hedefli `.mind` paketine ölçeklenir.
