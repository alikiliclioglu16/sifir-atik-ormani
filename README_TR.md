# A01 — Kapak Çiçek Ağacı | WebAR (Sürüm 6.0.0)

Dünyanın Sıfır Atık Ormanı sergisi.
**V1** ağaç canlanması + **V1.5** imza hayvanı (6 arı, polen) + **V2** Growth Halo (papercraft bahçe).
Uygulama indirmeden iPhone Safari ve Android Chrome'da çalışır.

---

## Depo yapısı

```
/  (repo kökü)
├── index.html            V1 + V1.5 arayüzü
├── app.js                AR bootstrap, MindAR, video, katman senkronu
├── tree-config.js        AĞAÇ VERİSİ — A01 rotaları, çiçekleri, drop noktaları
├── bee-layer.js          İMZA HAYVANI MOTORU — sprite, state machine, polen
├── growth-layer.js       GROWTH HALO MOTORU — tek atış atlas oynatıcı
├── style.css
├── preview.html          AR'sız hizalama önizlemesi
├── vercel.json
├── README_TR.md
└── assets/
    ├── targets.mind            önceden derlenmiş MindAR hedefi (V1)
    ├── A01_kling_12s_web.mp4   ağaç animasyonu (V1)
    ├── A01_bee_atlas.png       arı sprite atlası (V1.5) — 3 klip × 20 kare
    ├── A01_growth_atlas.png    growth sprite atlası (V2) — 45 kare @ 8 fps
    ├── A01_poster.jpg          açılış ekranı görseli
    └── A01_master.png          baskı/arşiv master'ı (sayfa yüklemez)
```

### Placeholder / değiştirilebilir dosyalar

| Dosya | Ne zaman değişir |
|---|---|
| `assets/A01_kling_12s_web.mp4` | ✅ Filigransız final export entegre edildi (11 Ağustos 2026) |
| `assets/targets.mind` | Nihai fiziksel eser fotoğrafı derlendiğinde |
| `assets/A01_bee_atlas.png` | Yeni arı klipleri geldiğinde (aynı 10×6 / 192px düzen) |
| `assets/A01_growth_atlas.png` | Yeni growth klibi geldiğinde (aynı 7×7 / 336×192 düzen) |
| `tree-config.js` → `dioramaPreset.transform` | Bahçenin konum/ölçüsü ayarlanacaksa |
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
   5–8 sn çiçeklerde hover · 8.6 sn ilk polen düşer ve **bahçe büyümeye başlar** ·
   ~14.2 sn final papercraft bahçe eserin alt kenarından taşarak tamamlanır.

Sorun olursa adresin sonuna `?debug=1` ekleyin; alt kısımda teknik günlük çıkar.

---

## Sorun giderme

| Belirti | Sebep / çözüm |
|---|---|
| Ağaç çalışıyor, arı yok | `assets/A01_bee_atlas.png` yüklenmemiş. Ağaç deneyimi bilinçli olarak bozulmaz. |
| Arılar var, bahçe yok | `assets/A01_growth_atlas.png` yüklenmemiş. V1+V1.5 bilinçli olarak bozulmaz. |
| "AR hedef dosyası bulunamadı" | `assets/targets.mind` depoda yok |
| "AR motoru yüklenemedi" | CDN'e ulaşılamıyor; Wi-Fi deneyin |
| "Kameraya erişilemedi" | Ayarlar > Safari > Kamera → "Sor"/"İzin Ver" |
| Hedef tanınmıyor | Işığı artırın, parlamayı azaltın, tam kadraj |

---

## Growth Halo — teknik özet

- Kaynak: `A01_growth_master.mp4` (960×960, 24 fps, 6.04 sn, siyah zemin, alpha yok)
- Kullanılan kareler: **0–132** (132'den sonra Kling bloom'u kaynağın RGB'sini yıkıyor)
- Üçer üçer alındı → **45 kare @ 8 fps ≈ 5.63 sn**
- Atlas: 7×7 hücre, hücre 336×192, toplam 2352×1344, PNG
- Dikey ön-kısaltma (0.70) atlasa pişirildi → hücre oranı 0.5714
- Yerleşim: genişlik 1.45 target birimi (standart §7: 1.4–1.8), merkez y = −0.62
- Tetik: **ilk geçerli `pollenDrop`** (B1, ~8.6 sn). Sonraki dropler yok sayılır.
- Son karede tutulur, loop yok.

## Henüz yapılmayanlar

- Ambient ses + kanat sesi + büyüme efekti (`audio` config alanı hazır)
- A02–A30 konfigürasyonları
