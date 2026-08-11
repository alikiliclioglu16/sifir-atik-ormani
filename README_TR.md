# A01 — Kapak Çiçek Ağacı | WebAR (Sürüm 5.0.0)

Dünyanın Sıfır Atık Ormanı sergisi.
**V1** ağaç canlanması (MindAR + Kling video) + **V1.5** imza hayvanı katmanı (6 arı, polen).
Uygulama indirmeden iPhone Safari ve Android Chrome'da çalışır.

---

## Depo yapısı

```
/  (repo kökü)
├── index.html            V1 + V1.5 arayüzü
├── app.js                AR bootstrap, MindAR, video, katman senkronu
├── tree-config.js        AĞAÇ VERİSİ — A01 rotaları, çiçekleri, drop noktaları
├── bee-layer.js          İMZA HAYVANI MOTORU — sprite, state machine, polen
├── style.css
├── preview.html          AR'sız hizalama önizlemesi
├── vercel.json
├── README_TR.md
└── assets/
    ├── targets.mind            önceden derlenmiş MindAR hedefi (V1)
    ├── A01_kling_12s_web.mp4   ağaç animasyonu (V1)
    ├── A01_bee_atlas.png       arı sprite atlası (V1.5) — 3 klip × 20 kare
    ├── A01_poster.jpg          açılış ekranı görseli
    └── A01_master.png          baskı/arşiv master'ı (sayfa yüklemez)
```

### Placeholder / değiştirilebilir dosyalar

| Dosya | Ne zaman değişir |
|---|---|
| `assets/A01_kling_12s_web.mp4` | Filigransız final Kling export geldiğinde |
| `assets/targets.mind` | Nihai fiziksel eser fotoğrafı derlendiğinde |
| `assets/A01_bee_atlas.png` | Yeni arı klipleri geldiğinde (aynı 10×6 / 192px düzen) |
| `tree-config.js` → `A01_FLOWERS` | Farklı çiçek eşlemesi istenirse |
| `tree-config.js` → `routes` | Rota, gecikme, hız, ölçek ayarı istenirse |

---

## Katman mimarisi (standart §11)

```
MindAR Image Target
└── a01Target entity  (mindar-image-target, a01-experience)
    ├── Katman 2 — Kling ağaç videosu     THREE.VideoTexture düzlemi, z=0
    ├── Katman 3 — İmza hayvanı           6 sprite billboard, z=0.020–0.115
    └── Katman 4 — Polen particle         THREE.Points, additive
        └── Katman 5 — V2 diorama         event kancası hazır, görsel YOK
            └── Katman 6 — Ses            config alanı hazır, uygulanmadı
```

Tüm arı koordinatları **target'a bağlıdır** (genişlik 1.0, yükseklik 1.5, merkez 0,0).

---

## Arı transparanlığı — seçilen yöntem

Kling MP4'lerinde **alpha kanalı yoktur** (`yuv420p`) ve arka plan siyahtır.
Arının **gözleri ve şeritleri de siyah/koyu kahve** olduğu için black-key, luma-key
veya `mix-blend-mode: screen` arının yüzünü yok eder.

Seçilen yöntem: **offline alpha çıkarımı + tek PNG sprite atlası.**

- Silüet, parlaklık eşiği + delik doldurma (fill-holes) ile bulunur → içerideki
  siyah şeritler ve gözler tam opak kalır.
- Geodezik büyütme ile ince bacak/anten uzantıları yakalanır.
- Kling'in eklediği sarı glow halesi tamamen atılır (parlak eser üzerinde
  kahverengi leke yapıyordu).
- Kanatlar düşük doygunluk + yüksek parlaklıkla ayrılıp %78 opaklıkta bırakılır.
- RGB premultiplied kabul edilir (siyah zemine composite = premultiply);
  materyalde `premultipliedAlpha: true` → kenarda siyah saçaklanma olmaz.

**Kazanç:** sahnede ek video decoder çalışmaz. Ağaç Kling videosu decoder'ı tek
başına kullanmaya devam eder → mevcut çalışan V1 deneyimi için sıfır regresyon riski.

---

## Telefon testi

1. A01 görselini ikinci ekranda tam ekran açın veya A4/A3 basın.
2. iPhone Safari ile `https://sifir-atik-ormani.vercel.app/` adresini açın, **yenileyin**.
3. `AR'yi Başlat` → kamera iznine **İzin Ver**.
4. Görselin tamamını 40–100 cm mesafeden kadraja alın.
5. Sahne akışı: 0–2 sn ağaç canlanır · 2–4 sn arılar dışarıdan girer ·
   5–8 sn çiçeklerde hover · 8–11 sn polen saçarak dışa açılır.

Sorun olursa adresin sonuna `?debug=1` ekleyin; alt kısımda teknik günlük çıkar.

---

## Sorun giderme

| Belirti | Sebep / çözüm |
|---|---|
| Ağaç çalışıyor, arı yok | `assets/A01_bee_atlas.png` yüklenmemiş. Ağaç deneyimi bilinçli olarak bozulmaz. |
| "AR hedef dosyası bulunamadı" | `assets/targets.mind` depoda yok |
| "AR motoru yüklenemedi" | CDN'e ulaşılamıyor; Wi-Fi deneyin |
| "Kameraya erişilemedi" | Ayarlar > Safari > Kamera → "Sor"/"İzin Ver" |
| Hedef tanınmıyor | Işığı artırın, parlamayı azaltın, tam kadraj |

---

## Henüz yapılmayanlar (V2)

- 3D papercraft diorama (çimen, filiz, çiçek, Growth Halo)
- Ambient ses + kanat sesi + büyüme efekti
- A02–A30 konfigürasyonları

`pollenDrop` eventleri **şimdiden yayınlanıyor**; V2 katmanı bunları dinleyerek
6 drop noktasında büyümeyi başlatacak.
