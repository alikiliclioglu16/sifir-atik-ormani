# Sıfır Atık Ormanı — Multi-Tree Engine V1

Tek depo · tek deploy · tek motor · 30 yapılandırma · eser başına bir QR/rota.

A01 "Kapak Çiçek Ağacı" **LOCKED** referans uygulamadır; bu sürümde davranışı,
koordinatları, zamanlamaları ve ses tasarımı hiç değiştirilmemiştir.
A02–A30 fiziksel eserler henüz üretilmediği için yalnızca **bekleyen yuva**
olarak tanımlıdır; uydurma içerik yoktur.

---

## 1. URL yönlendirme

| Adres | Davranış |
|---|---|
| `/` | Sergi karşılama ekranı. MindAR başlatılmaz, hiçbir esere ait asset inmez. |
| `/?t=A01` | A01 deneyimi (yayında) |
| `/?t=A02` … `/?t=A30` | "Henüz hazır değil". Asset inmez, kamera açılmaz. |
| `/?t=A99`, `/?t=test` | "Eser bulunamadı". Asset inmez, kamera açılmaz. |
| `/?t=A01&debug=1` | A01 + teknik günlük paneli |

Küçük harf ve kısa yazımlar normalize edilir: `a01`, `A1`, `1` → **A01**.
Aralık dışı değerler reddedilir; **A01'e sessizce geri düşülmez.**

Çözümleme tek yerde yapılır: **`tree-router.js`**. `app.js` yalnızca sonucu
tüketir; kodun hiçbir yerinde `"A01"` diye sabit kontrol yoktur.

```
A01TreeRouter.resolve(TREE_CONFIG)
  -> { state, treeId, tree, shared, meta, debug, reason }
     state: 'landing' | 'invalid' | 'pending' | 'active'
```

---

## 2. Depo yapısı

```
/  (repo kökü)
├── index.html            karşılama + bekleyen + geçersiz + AR ekranları
├── app.js                AR bootstrap, rota tüketimi, katman senkronu
├── tree-router.js        ?t= çözümleyici                        (YENİ)
├── tree-config.js        meta + shared + 30 eser yapılandırması
├── bee-layer.js          imza hayvanı motoru
├── growth-layer.js       Growth Halo motoru
├── audio-layer.js        ses motoru
├── capture-layer.js      fotoğraf yakalama motoru
├── style.css
├── preview.html          AR'sız hizalama önizlemesi (geliştirme aracı)
├── vercel.json
├── README_TR.md
├── qr/                   30 QR (SVG + PNG) + qr-manifest.csv    (YENİ)
└── assets/
    ├── shared/logo.webp|png     TÜM eserlerin ortak logosu      (YENİ konum)
    ├── targets.mind             A01 hedefi (tarihsel konum, taşınmadı)
    ├── A01_kling_12s_web.mp4    A01 ağaç animasyonu
    ├── A01_bee_atlas.webp|png   A01 imza hayvanı (arı)
    ├── A01_growth_atlas.webp|png
    ├── A01_poster.jpg · A01_master.png
    ├── A01_ambient_loop.mp3 · A01_bee_wings_loop.mp3 · A01_growth_reveal.mp3
    └── A02/ … A30/              gelecek eserler buraya
```

**A01 assetleri neden taşınmadı?** Çalışan bir deneyimde kozmetik yeniden
adlandırma regresyon riskidir ve motor yolları config'ten okuduğu için gereksizdir.
Yeni eserler `assets/Axx/` düzenini kullanır; motorda değişiklik gerekmez.

Tek taşınan dosya **logo**dur (`assets/A01_logo.*` → `assets/shared/logo.*`).
Bu bir AR asseti değil, tüm eserlerin ortak arayüz öğesidir; A01 adıyla kalması
30 eserlik sistemde yanıltıcı olurdu.

---

## 3. Yapılandırma şeması

```js
window.TREE_CONFIG = {
  meta:   { engine, configVersion, baseUrl, routePattern, totalTrees },
  shared: { logo, logoFallback },
  trees:  { A01: {...}, A02: {...}, ... A30: {...} }
}
```

### Yayındaki eser (A01 örneği)

| Alan | Zorunlu | Açıklama |
|---|---|---|
| `id`, `status` | ✔ | `'locked'` / `'active'` |
| `title`, `theme` | – | arayüzde gösterilir |
| `target.mindFile` | ✔ | derlenmiş MindAR hedefi |
| `target.width/height` | ✔ | 1.0 × 1.5 (2:3 dikey) |
| `treeVideo.src` | ✔ | Kling ağaç animasyonu |
| `treeVideo.poster` | – | açılış kartı görseli |
| `animal` | – | imza hayvanı: atlas, rotalar, çiçekler, gecikme, hız, ölçek, gölge |
| `pollen` | – | parçacık ayarları |
| `reactionTrigger` | – | çevresel tepki event'i |
| `dioramaPreset` | – | Growth Halo: atlas, transform, gölge, tetik |
| `audio` | – | ambient / hayvan / growth sesleri |
| `capture` | – | fotoğraf çıktısı ve filigran ayarları |

`animal`, `dioramaPreset`, `audio`, `capture` bloklarından herhangi biri `null`
bırakılabilir; motor o katmanı sessizce atlar, ağaç deneyimi çalışır.

### Bekleyen eser (A02–A30)

```js
{ id:'A02', status:'pending', title:null, theme:null,
  target:null, treeVideo:null, animal:null, pollen:null,
  reactionTrigger:null, dioramaPreset:null, audio:null, capture:null }
```

Router `status` yayında değilse **hiçbir asset yolunu okumaz**. Ayrıca
`status:'active'` olup `target.mindFile` veya `treeVideo.src` eksikse eser yine
bekleyen sayılır — yarım yapılandırma yüzünden kırık AR açılmaz.

---

## 4. Asset yükleme kuralları

`index.html` içinde **eser bazlı hiçbir preload yoktur.** Hangi eserin
yükleneceği `?t=` çözülene kadar bilinmez.

Sıra:
1. `tree-config.js` + `tree-router.js` yüklenir (birkaç KB)
2. Rota çözülür
3. Yalnızca `active` ise: video `src`/`poster` atanır → hedef `.mind`
   doğrulanır → A-Frame + MindAR CDN'den yüklenir → seçilen eserin atlasları
   ve sesleri istenir

Ölçüm sonucu §10'da.

---

## 5. Yeni gerçek eser ekleme (A02–A30)

1. **Eseri fotoğrafla** — dik açı, düz ışık, kadrajı eser doldursun.
2. **`.mind` derle** ve kalite puanını ölç.
   Takip noktası ≥60 iyi · 30–60 sınırda · <30 çalışmaz.
3. **Assetleri koy:** `assets/A07/targets.mind`, `tree.mp4`, `poster.jpg`,
   varsa `animal_atlas.webp`, `growth_atlas.webp`, sesler.
4. **`tree-config.js`** içine dosyanın altındaki şablonu yapıştırıp doldur,
   `status: 'active'` yap.
5. **Deploy et.**
6. **`/?t=A07`** adresini fiziksel eserle test et.

Motor kodunda hiçbir değişiklik gerekmez.

---

## 6. QR eşlemesi

`qr/` klasöründe 30 eser için SVG + PNG ve `qr-manifest.csv`:

```
treeId,url,qrSvg,qrPng
A01,https://sifir-atik-ormani.vercel.app/?t=A01,qr/A01.svg,qr/A01.png
```

Baskı için **SVG** kullanın. Hata düzeltme seviyesi M, 4 modül sessiz alan,
siyah/beyaz. 30 QR'ın tamamı geri okunarak doğru URL'yi taşıdığı doğrulandı.

`qr/` klasörü siteye deploy edilir ama site çalışma anında hiçbir QR
kütüphanesine bağımlı değildir — kodlar statik dosyadır.

---

## 7. Hata izolasyonu

| Durum | Sonuç |
|---|---|
| Hedef `.mind` inmiyor | Kontrollü Türkçe hata ekranı + "Tekrar Dene" |
| Hayvan atlası inmiyor | Katman atlanır, ağaç deneyimi çalışır |
| Growth atlası inmiyor | Katman atlanır, ağaç + hayvan çalışır |
| Ses inmiyor / izin yok | Görsel AR tam çalışır |
| WebP açılmıyor | PNG yedeğine otomatik geçilir |
| Bekleyen eser | Hiçbir yol istenmez, temiz bilgi ekranı |

Sonsuz yeniden deneme veya yakalanmamış promise hatası yoktur.

---

## 8. Hata ayıklama

`/?t=A01&debug=1` → ekranın altında teknik günlük: seçilen eser kodu, rota
durumu ve gerekçesi, hedef ve video yolu, kurulan katmanlar, asset hataları.
Normal sergi modunda görünmez.

---

## 9. Telefon testi

1. Eserin yanındaki QR'ı kamerayla okut (veya adresi elle aç).
2. `AR'yi Başlat` → kamera iznine **İzin Ver**.
3. Görselin tamamını 40–100 cm mesafeden kadraja al.
4. Akış: 0–2 sn ağaç canlanır · 2–4 sn hayvan girer · 5–8 sn etkileşim ·
   8.6 sn ilk polen düşer, bahçe büyümeye başlar · ~14 sn final bahçe.
5. Ses için telefonun **yandaki sessize alma anahtarını kapatın**.
6. Alt ortadaki **◉** ile fotoğraf çekilir; logo sağ üste soluk basılır.

---

## 10. Sürüm geçmişi

| Sürüm | İçerik |
|---|---|
| v4 | A01 WebAR — MindAR + Kling ağaç videosu |
| v5 | V1.5 imza hayvanı: 6 arı, polen, pollenDrop |
| v6 | V2 Growth Halo |
| v7 | Katman 6 ses |
| v8 | Fotoğraf yakalama, gölgeler, gerçek parallax, WebP/mono optimizasyon |
| **v9** | **Multi-Tree Engine V1 — 30 eser, rota, karşılama, QR** |

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
6. Ses: targetFound → ambient · 1.6 sn arı kanat sesi · 8.6 sn büyüme sesi.
   Sol üstteki 🔊 düğmesiyle sesi kapatabilirsiniz.
7. Alt ortadaki **◉** düğmesiyle fotoğraf çekilir; kurum logosu sağ üst köşeye
   soluk biçimde basılır ve paylaşım sayfası açılır.

Sorun olursa adresin sonuna `?debug=1` ekleyin; alt kısımda teknik günlük çıkar.

---

## Sorun giderme

| Belirti | Sebep / çözüm |
|---|---|
| Ağaç çalışıyor, arı yok | `assets/A01_bee_atlas.png` yüklenmemiş. Ağaç deneyimi bilinçli olarak bozulmaz. |
| Arılar var, bahçe yok | `assets/A01_growth_atlas.png` yüklenmemiş. V1+V1.5 bilinçli olarak bozulmaz. |
| Görüntü var, ses yok | Telefonun **yandaki sessize alma anahtarını** kapatın (iOS'ta Web Audio bu anahtara tabidir). Ses sesi kapalıyken de görsel deneyim tam çalışır. |
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

## Ses katmanı — teknik özet

- **Web Audio API** kullanılır, `<audio>` etiketi değil: MP3 encoder padding'i
  yüzünden `<audio loop>` her döngüde duyulur bir tık üretir.
- Decode sonrası baştaki sessizlik **çalışma anında ölçülüp kırpılır**
  (ölçülen: 23 ms) ve döngü sınırları config'teki nominal süreye göre kurulur.
- AudioContext, kullanıcı `AR'yi Başlat`'a bastığı anda **senkron** olarak
  `resume()` + sessiz buffer ile unlock edilir (iOS Safari kuralı).
- Sesler **arka planda** indirilir; AR başlatmayı bloklamaz.
- Ses tamamen başarısız olsa bile V1 + V1.5 + V2 görsel deneyimi etkilenmez.

## Derinlik ve fotoğraf (v8)

- **Arı gölgeleri:** her arının eser düzlemine düşen yumuşak gölgesi vardır;
  arı uzaklaştıkça gölge büyür, yumuşar ve kayar. Geometri/materyal altı arı
  arasında paylaşılır.
- **Gerçek parallax:** arıların z aralığı 0.020–0.200'e, Growth Halo düzlemi
  z=0.160'a alındı ve 20° geriye yatırıldı. Telefon hareket ettikçe katmanlar
  esere göre gerçek perspektifle kayar.
- **Fotoğraf:** kamera görüntüsü + AR katmanları + logo tek karede birleşir.
  WebGL canvas'ı A-Frame'in `tock` kancasında (render'dan hemen sonra) okunur,
  bu yüzden `preserveDrawingBuffer` gerekmez. Çıktı JPEG, paylaşım varsa
  sistem paylaşım sayfası, yoksa indirme.

## Optimizasyon (v8)

| | Önce | Sonra |
|---|---|---|
| Arı atlası | 1.26 MB PNG | 0.41 MB WebP |
| Growth atlası | 1.89 MB PNG | 0.56 MB WebP |
| Ambient + kanat sesi | 511 KB stereo | 348 KB mono 128k |
| **Toplam sayfa yükü** | **10.5 MB** | **8.1 MB** |

`A01_growth_reveal.mp3` bilinçli olarak dokunulmadan bırakıldı: transient
yoğun bir ses, mono 96k'da SNR 12.8 dB'ye düşüyordu, kazanç ise 47 KB.

## Henüz yapılmayanlar

- A02–A30 konfigürasyonları
