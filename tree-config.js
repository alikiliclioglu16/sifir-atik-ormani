/* =============================================================================
   SIFIR ATIK ORMANI — AĞAÇ KONFİGÜRASYONU (tree-config.js)
   Sürüm 1.0 · V1.5 İmza Hayvanı katmanı

   AMAÇ
   Üretim standardı §15 gereği hiçbir ağaca özel değer motorun içine gömülmez.
   Her ağaç (A01–A30) bu dosyada tanımlanır; motor (bee-layer.js) sadece bu
   konfigürasyonu okur. A02 eklemek için aşağıya yeni bir blok yazmak yeterlidir.

   TARGET KOORDİNAT SİSTEMİ (görev tanımı §6)
     genişlik = 1.00   yükseklik = 1.50   merkez = (0,0)
     x: -0.50 → +0.50        y: -0.75 → +0.75
   Bu, MindAR image target düzlemiyle birebir aynıdır.
   |x| > 0.50 veya |y| > 0.75 değerleri target'ın DIŞIDIR ve bilinçlidir
   (arıların dışarıdan gelmesi / dışarı polen taşıması).
   ============================================================================= */

(function (global) {
  'use strict';

  /* ---------------------------------------------------------------------------
     A01 ÇİÇEK NOKTALARI — F01..F15

     ÖNEMLİ NOT: Görev tanımı rotalarda F01–F15'e atıf yapıyor ancak bu
     noktaların koordinatlarını vermiyordu. Bu değerler UYDURULMADI:
     A01_master.png (1024x1536) üzerinde Hough daire tespiti ile şişe kapağı
     merkezleri bulundu, doygunluk filtresiyle dal/yaprak üzerindeki yanlış
     pozitifler elendi ve kalan 15 gerçek çiçek yukarıdan aşağıya sıralandı.
     Görsel doğrulaması yapıldı.

     Numaralandırma sırası: yukarıdan aşağıya, sonra soldan sağa.
     Farklı bir eşleme isterseniz yalnızca bu tabloyu değiştirmeniz yeterli;
     rotalar F kodlarıyla çalıştığı için motor tarafında değişiklik gerekmez.
     --------------------------------------------------------------------------- */
  var A01_FLOWERS = {
    F01: { x: -0.1816, y: +0.4785 },   // mor
    F02: { x: +0.0332, y: +0.4454 },   // turuncu
    F03: { x: +0.2188, y: +0.3536 },   // sarı
    F04: { x: -0.2969, y: +0.3008 },   // kırmızı-pembe
    F05: { x: +0.0273, y: +0.2129 },   // mavi
    F06: { x: +0.3164, y: +0.2011 },   // pembe
    F07: { x: -0.4043, y: +0.1191 },   // turuncu-lacivert
    F08: { x: -0.1738, y: +0.0957 },   // pembe-beyaz
    F09: { x: +0.1582, y: +0.0703 },   // kırmızı
    F10: { x: +0.4043, y: -0.0273 },   // pembe (sağ)
    F11: { x: -0.3242, y: -0.0449 },   // beyaz
    F12: { x: -0.0430, y: -0.0704 },   // yeşil (merkez)
    F13: { x: +0.2129, y: -0.1171 },   // sarı-mavi
    F14: { x: -0.3672, y: -0.2754 },   // turuncu (sol alt)
    F15: { x: +0.2832, y: -0.2890 }    // kırmızı-yeşil (sağ alt)
  };

  var TREE_CONFIG = {

    /* =========================== A01 — KAPAK ÇİÇEK AĞACI =================== */
    A01: {
      id: 'A01',
      title: 'Kapak Çiçek Ağacı',
      theme: 'Tozlaşma ve Canlanma',

      /* --- V1: mevcut çalışan ağaç katmanı (DEĞİŞTİRİLMEDİ) --- */
      target: {
        mindFile: 'assets/targets.mind',
        targetIndex: 0,
        width: 1.0,
        height: 1.5
      },
      treeVideo: {
        src: 'assets/A01_kling_12s_web.mp4',
        loop: true
      },

      /* --- V1.5: imza hayvanı katmanı --- */
      animal: {
        type: 'bee',
        count: 6,

        /* Sprite atlası: 3 davranış klibi × 20 kare, hücre 192px, 10 sütun × 6 satır.
           Kling MP4'lerinden offline alpha çıkarılarak üretildi (bkz. rapor).      */
        atlas: {
          src: 'assets/A01_bee_atlas.png',
          cols: 10,
          rows: 6,
          cell: 192,
          /* Sprite kaynakta SAĞA bakar. Sola giderken motor yatay aynalar. */
          facesRight: true,
          clips: {
            fly:     { start: 0,  count: 20, fps: 22 },
            hover:   { start: 20, count: 20, fps: 18 },
            scatter: { start: 40, count: 20, fps: 20 }
          }
        },

        /* Target genişliğine (1.0) oranla sprite karesinin kenar uzunluğu.
           Arı karenin ~%68'ini kaplar → görünen arı ≈ 0.15 target genişliği. */
        baseScale: 0.225,

        /* Arı düzleminin target düzleminden öne çıkma aralığı (perspektif derinliği) */
        zNear: 0.020,
        zFar: 0.115,

        flowers: A01_FLOWERS,

        /* -------------------- ROTALAR (görev tanımı §7) --------------------
           Entry noktaları target sınırının dışındadır: arılar ekran dışından girer.
           B5/B6 drop noktalarının y = -0.79 olması bilinçli tasarım kararıdır.   */
        /* Gecikmeler üretim standardı §10'daki 15 sn'lik sahne akışına göre
           ayarlandı: 0–2 sn ağaç tek başına, 2–5 sn arıların gelişi,
           5–8 sn polen toplama, 8–11 sn polen yayılımı. */
        routes: [
          { id: 'B1', label: 'Sol Üst',
            entry: { x: -0.64, y: +0.56 },
            flowers: ['F01', 'F03'],
            drop:  { x: -0.57, y: -0.33 },
            delay: 1.60, speed: 0.62, scale: 1.00, hover: 1.7 },

          { id: 'B2', label: 'Sağ Üst',
            entry: { x: +0.64, y: +0.55 },
            flowers: ['F04', 'F02'],
            drop:  { x: +0.57, y: -0.33 },
            delay: 2.05, speed: 0.70, scale: 0.92, hover: 1.5 },

          { id: 'B3', label: 'Merkez/Sol',
            entry: { x: -0.57, y: +0.20 },
            flowers: ['F05', 'F11'],
            drop:  { x: -0.39, y: -0.57 },
            delay: 2.50, speed: 0.58, scale: 1.08, hover: 1.9 },

          { id: 'B4', label: 'Sağ Orta',
            entry: { x: +0.61, y: +0.20 },
            flowers: ['F06', 'F09', 'F13'],
            drop:  { x: +0.39, y: -0.57 },
            delay: 2.95, speed: 0.66, scale: 0.96, hover: 1.4 },

          { id: 'B5', label: 'Sol Alt',
            entry: { x: -0.58, y: -0.05 },
            flowers: ['F07', 'F10', 'F14'],
            drop:  { x: -0.20, y: -0.79 },
            delay: 3.40, speed: 0.74, scale: 1.04, hover: 1.3 },

          { id: 'B6', label: 'Sağ Alt',
            entry: { x: +0.58, y: -0.06 },
            flowers: ['F12', 'F15'],
            drop:  { x: +0.20, y: -0.79 },
            delay: 3.85, speed: 0.64, scale: 0.90, hover: 1.6 }
        ],

        /* Hover mikro hareketi (görev tanımı §9): çiçekten uzaklaşmayan küçük elips */
        hoverMotion: { rx: 0.034, ry: 0.021, rollDeg: 7.0, hz: 0.85 }
      },

      /* --- Çevresel tepki / polen --- */
      pollen: {
        enabled: true,
        max: 200,
        color: 0xffd867,
        size: 0.020,
        hoverRate: 3,      // hover sırasında parçacık/sn
        scatterRate: 16,   // scatter sırasında parçacık/sn
        dropBurst: 22,     // drop anındaki patlama
        life: [0.7, 1.6],
        gravity: -0.055
      },

      /* --- V2 kancaları (bu sürümde SADECE event üretilir, görsel yok) --- */
      reactionTrigger: {
        event: 'a01:pollenDrop',
        /* V2'de sprout/grass/flower/Growth Halo bu noktalarda doğacak */
        growthRadius: 0.18,
        enabled: true
      },
      dioramaPreset: {
        /* V2 için ayrılmış alan. Henüz uygulanmadı. */
        style: 'papercraft-spring',
        widthFactor: 1.6,      // standart §7: 1.4–1.8 target genişliği
        implemented: false
      },
      audio: {
        /* V2 için ayrılmış alan. Henüz uygulanmadı (standart §13). */
        ambient: null,
        wing: null,
        growth: null,
        implemented: false
      }
    }

    /* =========================== A02–A30 ===================================
       Yeni ağaçlar buraya aynı şablonla eklenecek. Motor değişmeyecek.
       ====================================================================== */
  };

  global.TREE_CONFIG = TREE_CONFIG;
  global.TREE_CONFIG_VERSION = '1.0';

})(window);
