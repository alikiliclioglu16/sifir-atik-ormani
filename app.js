/* =============================================================================
   SIFIR ATIK ORMANI — A01 "Kapak Çiçek Ağacı" WebAR
   Sürüm: 6.0.0  (production) — V1 ağaç + V1.5 imza hayvanı (arı) + V2 Growth Halo

   Mimari kararlar:
   - Runtime MindAR Compiler KULLANILMAZ. Önceden derlenmiş assets/targets.mind okunur.
   - A-Frame 1.5.0 + MindAR 1.2.5 (MindAR'ın resmî olarak pinlediği kombinasyon).
   - Kütüphaneler yedek CDN'li dinamik yükleyici ile alınır (jsDelivr -> unpkg).
   - Video, kullanıcı dokunuşunun İÇİNDE senkron olarak "unlock" edilir
     (iOS Düşük Güç Modu autoplay kilidi için zorunlu).
   - Video dokusu A-Frame material sistemi yerine doğrudan THREE.VideoTexture ile
     kurulur; böylece three.js sürüm farkları (encoding/colorSpace) sorun çıkarmaz.
   - Her aşamada watchdog + Türkçe hata paneli vardır; sessiz sonsuz yükleme olmaz.
   - V1.5 arı katmanı MODÜLERDİR: tree-config.js (veri) + bee-layer.js (motor).
     Arı atlası yüklenemezse katman sessizce devre dışı kalır ve V1 ağaç
     deneyimi hiç etkilenmeden çalışmaya devam eder (regresyon koruması).
   - V2 Growth Halo katmanı da modülerdir: growth-layer.js. İlk geçerli
     pollenDrop event'iyle BİR KEZ başlar. Atlası yüklenemezse V1 + V1.5
     aynen çalışmaya devam eder.
   ============================================================================= */

(function () {
  'use strict';

  /* ---------------------------------------------------------------- AYARLAR */

  var CFG = {
    version: '6.0.0',
    treeId: 'A01',

    // Kütüphaneler — sırayla denenir, ilki başarısız olursa ikincisi yüklenir.
    aframeUrls: [
      'https://cdn.jsdelivr.net/npm/aframe@1.5.0/dist/aframe-v1.5.0.min.js',
      'https://unpkg.com/aframe@1.5.0/dist/aframe-v1.5.0.min.js'
    ],
    mindarUrls: [
      'https://cdn.jsdelivr.net/npm/mind-ar@1.2.5/dist/mindar-image-aframe.prod.js',
      'https://unpkg.com/mind-ar@1.2.5/dist/mindar-image-aframe.prod.js'
    ],

    targetSrc: 'assets/targets.mind',
    videoSrc: 'assets/A01_kling_12s_web.mp4',

    // A01 master: 1024 x 1536 piksel = 2:3 dikey.
    // MindAR konvansiyonu: düzlem genişliği 1, yüksekliği = yükseklik/genişlik.
    planeWidth: 1,
    planeHeight: 1536 / 1024, // = 1.5

    // Takip kararlılığı. missTolerance: hedef "kayboldu" denmeden önce
    // tolere edilen ardışık kare sayısı. Yüksek değer = titremede daha az kesinti.
    missTolerance: 10,
    warmupTolerance: 4,

    scriptTimeoutMs: 20000,   // tek bir CDN denemesi için
    arReadyTimeoutMs: 35000,  // start() sonrası kamera + motor hazır olma süresi
    slowHintMs: 9000
  };

  /* ------------------------------------------------------------------- DOM  */

  function $(id) { return document.getElementById(id); }

  var dom = {
    arRoot: $('arRoot'),
    video: $('a01Video'),
    launch: $('launch'),
    startButton: $('startButton'),
    launchStatus: $('launchStatus'),
    hud: $('hud'),
    hudStatus: $('hudStatus'),
    exitButton: $('exitButton'),
    errorPanel: $('errorPanel'),
    errorTitle: $('errorTitle'),
    errorText: $('errorText'),
    errorRetry: $('errorRetry'),
    errorDetailsToggle: $('errorDetailsToggle'),
    errorDetails: $('errorDetails'),
    debugPanel: $('debugPanel')
  };

  /* ------------------------------------------------------------------ DURUM */

  var state = {
    booted: false,
    libsReady: false,
    sceneReady: false,
    arStarted: false,
    arReady: false,
    failed: false,
    videoUnlocked: false,
    needsTapToPlay: false,
    targetVisible: false
  };

  var sceneEl = null;
  var arSystem = null;
  var beeLayer = null;      // V1.5 imza hayvanı katmanı (yoksa null)
  var beeReady = null;      // atlas yükleme Promise'i (bileşen init'inde kurulur)
  var growthLayer = null;   // V2 Growth Halo katmanı (yoksa null)
  var growthReady = null;   // growth atlası yükleme Promise'i
  var readyTimer = null;
  var slowTimer = null;

  /* ------------------------------------------------------------------- LOG  */

  var LOG = [];
  var DEBUG = /[?&]debug=1/.test(location.search);

  function log(msg) {
    var line = '[' + (performance.now() / 1000).toFixed(2) + 's] ' + msg;
    LOG.push(line);
    if (LOG.length > 120) LOG.shift();
    if (window.console && console.log) console.log('%c[A01]', 'color:#0f7250', msg);
    if (DEBUG && dom.debugPanel) {
      dom.debugPanel.classList.remove('hidden');
      dom.debugPanel.textContent = LOG.join('\n');
      dom.debugPanel.scrollTop = dom.debugPanel.scrollHeight;
    }
    if (dom.errorDetails) dom.errorDetails.textContent = envSummary() + '\n\n' + LOG.join('\n');
  }

  function envSummary() {
    var v = dom.video;
    return [
      'A01 WebAR v' + CFG.version,
      'URL: ' + location.href,
      'UA: ' + navigator.userAgent,
      'secureContext: ' + (window.isSecureContext ? 'evet' : 'HAYIR'),
      'getUserMedia: ' + (hasGetUserMedia() ? 'var' : 'YOK'),
      'ekran: ' + window.innerWidth + 'x' + window.innerHeight + ' dpr' + (window.devicePixelRatio || 1),
      'video.readyState: ' + (v ? v.readyState : '-'),
      'video.unlocked: ' + state.videoUnlocked,
      'AFRAME: ' + (window.AFRAME ? window.AFRAME.version : 'yüklenmedi'),
      'MINDAR: ' + (window.MINDAR && window.MINDAR.IMAGE ? 'yüklendi' : 'yüklenmedi'),
      'tree-config: ' + (window.TREE_CONFIG ? 'v' + window.TREE_CONFIG_VERSION : 'YOK'),
      'bee-layer: ' + (window.A01BeeLayer ? 'v' + window.A01BeeLayer.version : 'YOK'),
      'beeLayer aktif: ' + (beeLayer && beeLayer.isReady() ? 'evet' : 'hayır'),
      'growth-layer: ' + (window.A01GrowthLayer ? 'v' + window.A01GrowthLayer.version : 'YOK'),
      'growthLayer aktif: ' + (growthLayer && growthLayer.isReady() ? 'evet' : 'hayır')
    ].join('\n');
  }

  window.addEventListener('error', function (e) {
    log('JS HATASI: ' + (e && e.message ? e.message : e) + ' @ ' + (e && e.filename ? e.filename + ':' + e.lineno : '?'));
  });
  window.addEventListener('unhandledrejection', function (e) {
    var r = e && e.reason;
    log('YAKALANMAMIŞ PROMISE: ' + (r && r.message ? r.message : r));
    // MindAR, hedef dosyasını yükleyemezse hatayı sessizce yutar; buradan yakalıyoruz.
    if (state.arStarted && !state.arReady) {
      fail('AR motoru başlatılamadı',
        'Hedef dosyası veya AR motoru yüklenirken bir sorun oluştu. İnternet bağlantınızı kontrol edip tekrar deneyin.');
    }
  });

  /* --------------------------------------------------------------- YARDIMCI */

  function setLaunchStatus(text) { if (dom.launchStatus) dom.launchStatus.textContent = text; }
  function setHud(text) { if (dom.hudStatus) dom.hudStatus.textContent = text; }

  function hasGetUserMedia() {
    return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
  }

  function isSecure() {
    return window.isSecureContext ||
      location.protocol === 'https:' ||
      location.hostname === 'localhost' ||
      location.hostname === '127.0.0.1';
  }

  function isInAppBrowser() {
    var ua = navigator.userAgent || '';
    return /FBAN|FBAV|FB_IAB|Instagram|Line\/|MicroMessenger|Snapchat|LinkedInApp|Pinterest|Twitter|TikTok|WhatsApp/i.test(ua);
  }

  function isIOS() {
    var ua = navigator.userAgent || '';
    return /iPad|iPhone|iPod/.test(ua) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  }

  function clearTimers() {
    if (readyTimer) { clearTimeout(readyTimer); readyTimer = null; }
    if (slowTimer) { clearTimeout(slowTimer); slowTimer = null; }
  }

  function fail(title, text) {
    if (state.failed) return;
    state.failed = true;
    clearTimers();
    log('HATA PANELİ: ' + title + ' — ' + text);
    try { dom.video.pause(); } catch (e) {}
    dom.errorTitle.textContent = title;
    dom.errorText.textContent = text;
    dom.errorPanel.classList.remove('hidden');
  }

  /* ------------------------------------------------- KÜTÜPHANE YÜKLEYİCİSİ */

  function loadScriptWithFallback(urls, label) {
    return new Promise(function (resolve, reject) {
      var i = 0;

      function attempt() {
        if (i >= urls.length) {
          reject(new Error(label + ' hiçbir CDN üzerinden yüklenemedi'));
          return;
        }
        var url = urls[i++];
        var done = false;
        var s = document.createElement('script');
        s.src = url;
        s.async = false;

        var to = setTimeout(function () {
          if (done) return;
          done = true;
          log(label + ' zaman aşımı: ' + url);
          try { s.parentNode && s.parentNode.removeChild(s); } catch (e) {}
          attempt();
        }, CFG.scriptTimeoutMs);

        s.onload = function () {
          if (done) return;
          done = true; clearTimeout(to);
          log(label + ' yüklendi: ' + url);
          resolve(url);
        };
        s.onerror = function () {
          if (done) return;
          done = true; clearTimeout(to);
          log(label + ' başarısız: ' + url);
          try { s.parentNode && s.parentNode.removeChild(s); } catch (e) {}
          attempt();
        };

        document.head.appendChild(s);
      }

      attempt();
    });
  }

  /* ----------------------------------------------- HEDEF DOSYASI DOĞRULAMA */

  // targets.mind'ı açılışta indirir: hem erişilebilirliği doğrular hem de
  // tarayıcı cache'ini ısıtır. Böylece MindAR start() anında dosyayı
  // ağdan değil cache'ten alır ve "sessiz sonsuz yükleme" riski kalkar.
  function verifyTarget() {
    return fetch(CFG.targetSrc, { cache: 'force-cache' })
      .then(function (res) {
        if (!res.ok) throw new Error('targets.mind HTTP ' + res.status);
        return res.arrayBuffer();
      })
      .then(function (buf) {
        var bytes = new Uint8Array(buf);
        if (bytes.length < 2000) throw new Error('targets.mind çok küçük (' + bytes.length + " bayt) — dosya bozuk olabilir");
        // msgpack "fixmap" başlığı: 0x80–0x8f
        if (bytes[0] < 0x80 || bytes[0] > 0x8f) {
          throw new Error('targets.mind geçerli bir MindAR hedef dosyası değil (ilk bayt 0x' + bytes[0].toString(16) + ')');
        }
        log('targets.mind doğrulandı: ' + (bytes.length / 1024).toFixed(0) + ' KB');
        return true;
      });
  }

  /* ------------------------------------------------------- A-FRAME BİLEŞEN */

  function registerComponents() {
    var THREE = window.AFRAME.THREE;

    if (window.AFRAME.components['a01-experience']) return;

    window.AFRAME.registerComponent('a01-experience', {
      init: function () {
        var self = this;
        var video = dom.video;
        this.video = video;

        /* ---- Video dokusu (sürümden bağımsız renk uzayı ayarı) ---- */
        var tex = new THREE.VideoTexture(video);
        tex.minFilter = THREE.LinearFilter;
        tex.magFilter = THREE.LinearFilter;
        tex.generateMipmaps = false;
        if ('colorSpace' in tex && THREE.SRGBColorSpace) {
          tex.colorSpace = THREE.SRGBColorSpace;      // three r152+
        } else if ('encoding' in tex && THREE.sRGBEncoding) {
          tex.encoding = THREE.sRGBEncoding;          // eski three
        }
        this.tex = tex;

        var geo = new THREE.PlaneGeometry(CFG.planeWidth, CFG.planeHeight);
        var mat = new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide });
        if ('toneMapped' in mat) mat.toneMapped = false;

        var mesh = new THREE.Mesh(geo, mat);
        mesh.visible = false; // ilk kare hazır olana kadar gösterme (siyah dikdörtgen olmasın)
        this.mesh = mesh;
        this.el.setObject3D('mesh', mesh);

        log('Video düzlemi kuruldu: ' + CFG.planeWidth + ' x ' + CFG.planeHeight.toFixed(3));

        /* ---- V1.5: imza hayvanı (arı) katmanı ----
           Target entity'sinin object3D'sine çocuk olarak eklenir; böylece
           tüm koordinatlar target'a bağlıdır (görev tanımı §6). */
        var treeCfg = window.TREE_CONFIG && window.TREE_CONFIG[CFG.treeId];
        if (window.A01BeeLayer && treeCfg && treeCfg.animal) {
          try {
            beeLayer = window.A01BeeLayer.create(THREE, treeCfg, this.el.object3D, {
              el: this.el,
              log: log,
              onPollenDrop: function (d) {
                /* ---- V2 TETİKLEYİCİ ----
                   Growth animasyonu YALNIZCA ilk geçerli pollenDrop ile başlar.
                   B2–B6'dan gelen sonraki eventler burada da, growth-layer'ın
                   kendi `started` bayrağında da olmak üzere İKİ KEZ engellenir. */
                if (growthLayer && !growthLayer.isStarted()) {
                  growthLayer.start('pollenDrop:' + d.bee);
                } else {
                  log('pollenDrop ' + d.bee + ' — growth zaten başlamış, yok sayıldı');
                }
              }
            });
            // Atlas yüklemesi burada başlar; boot zinciri beeReady'yi bekler.
            // Böylece bileşenin ne zaman init olduğuna bağımlılık kalmaz.
            beeReady = new Promise(function (res) {
              var done = false;
              var to = setTimeout(function () {
                if (done) return; done = true;
                log('Arı atlası zaman aşımı — V1 ağaç deneyimi ile devam');
                beeLayer = null; res();
              }, 20000);
              beeLayer.load(
                function () { if (!done) { done = true; clearTimeout(to); res(); } },
                function () { if (!done) { done = true; clearTimeout(to); beeLayer = null; res(); } }
              );
            });
          } catch (e) {
            beeLayer = null;
            log('Arı katmanı kurulamadı, V1 devam ediyor: ' + e.message);
          }
        } else {
          log('Arı katmanı yok (tree-config veya bee-layer yüklenmedi) — V1 devam ediyor');
        }

        /* ---- V2: Growth Halo katmanı ----
           Aynı target object3D'sine bağlanır; tüm koordinatlar target'a bağlıdır. */
        if (window.A01GrowthLayer && treeCfg && treeCfg.dioramaPreset && treeCfg.dioramaPreset.implemented) {
          try {
            growthLayer = window.A01GrowthLayer.create(THREE, treeCfg, this.el.object3D, {
              log: log,
              onGrowthComplete: function () { log('V2 final garden görünümüne ulaşıldı'); }
            });
          } catch (e) {
            growthLayer = null;
            log('Growth katmanı kurulamadı, V1+V1.5 devam ediyor: ' + e.message);
          }
          if (growthLayer) {
            growthReady = new Promise(function (res) {
              var done = false;
              var to = setTimeout(function () {
                if (done) return; done = true;
                log('Growth atlası zaman aşımı — V1+V1.5 ile devam');
                growthLayer = null; res();
              }, 25000);
              growthLayer.load(
                function () { if (!done) { done = true; clearTimeout(to); res(); } },
                function () { if (!done) { done = true; clearTimeout(to); growthLayer = null; res(); } }
              );
            });
          }
        } else {
          log('Growth katmanı yok veya implemented=false — V1+V1.5 devam ediyor');
        }

        /* ---- HEDEF BULUNDU ---- */
        this.el.addEventListener('targetFound', function () {
          state.targetVisible = true;
          log('targetFound');
          setHud('Ağaç canlanıyor…');

          // V1.5 katmanı sıfırdan başlar; önceki state/timer kalıntısı kalmaz
          if (beeLayer && beeLayer.isReady()) beeLayer.restart();
          // V2 temiz başlangıç state'i: görünmez, 0. karede bekler
          if (growthLayer) growthLayer.reset();

          try { video.currentTime = 0; } catch (e) { log('currentTime=0 hatası: ' + e); }

          var p = video.play();
          if (p && p.catch) {
            p.catch(function (err) {
              log('play() reddedildi: ' + err);
              state.needsTapToPlay = true;
              setHud('Videoyu başlatmak için ekrana bir kez dokunun');
              var handler = function () {
                video.play().then(function () {
                  state.needsTapToPlay = false;
                  setHud('Ağaç canlanıyor…');
                }).catch(function () {});
              };
              document.addEventListener('touchend', handler, { once: true });
              document.addEventListener('click', handler, { once: true });
            });
          }
        });

        /* ---- HEDEF KAYBOLDU ---- */
        this.el.addEventListener('targetLost', function () {
          state.targetVisible = false;
          log('targetLost');
          try { video.pause(); } catch (e) {}
          self.mesh.visible = false;
          // V1.5 katmanı da durur ve gizlenir; timer/animasyon birikmez
          if (beeLayer) beeLayer.stop();
          if (growthLayer) growthLayer.stop();   // durdur + gizle + growthStarted=false
          if (!state.needsTapToPlay) setHud('A01 ağacını tekrar kadraja alın…');
        });
      },

      tick: function (time, timeDelta) {
        // Video henüz kare üretmediyse düzlemi gizli tut; hazır olunca göster.
        if (this.mesh) {
          var ready = this.video.readyState >= 2; // HAVE_CURRENT_DATA
          var shouldShow = ready && state.targetVisible;
          if (this.mesh.visible !== shouldShow) this.mesh.visible = shouldShow;
        }
        // V1.5 arı katmanı yalnızca target görünürken ilerler
        if (state.targetVisible) {
          var dtSec = (timeDelta || 16.7) / 1000;
          if (beeLayer) beeLayer.update(dtSec);
          if (growthLayer) growthLayer.update(dtSec);
        }
      },

      remove: function () {
        if (beeLayer) { beeLayer.dispose(); beeLayer = null; }
        if (growthLayer) { growthLayer.dispose(); growthLayer = null; }
        if (this.tex) this.tex.dispose();
        if (this.mesh) {
          this.mesh.geometry.dispose();
          this.mesh.material.dispose();
        }
      }
    });

    log('a01-experience bileşeni kaydedildi');
  }

  /* ------------------------------------------------------------ SAHNE KUR  */

  function buildScene() {
    return new Promise(function (resolve, reject) {
      var scene = document.createElement('a-scene');

      var mindarCfg = [
        'imageTargetSrc: ' + CFG.targetSrc,
        'autoStart: false',
        'uiLoading: no',
        'uiScanning: no',
        'uiError: no',
        'maxTrack: 1',
        'missTolerance: ' + CFG.missTolerance,
        'warmupTolerance: ' + CFG.warmupTolerance
      ].join('; ');

      scene.setAttribute('mindar-image', mindarCfg);
      scene.setAttribute('embedded', '');
      scene.setAttribute('vr-mode-ui', 'enabled: false');
      scene.setAttribute('device-orientation-permission-ui', 'enabled: false');
      scene.setAttribute('loading-screen', 'enabled: false');
      // NOT: A-Frame renderer şeması sınırlıdır (precision: high|medium|low,
      // antialias: true|false|auto). Geçersiz değer uyarı üretir. Mobilde
      // performans için antialias kapalı; kamera görüntüsünün görünmesi için
      // alpha açık tutulur.
      scene.setAttribute('renderer', 'colorManagement: true; alpha: true; antialias: false; precision: medium');

      // NOT: MindAR'ın _resize() fonksiyonu kapsayıcı içinde <a-camera> etiketini
      // ADIYLA arar. Bu yüzden <a-entity camera> DEĞİL, <a-camera> kullanılmalıdır.
      scene.innerHTML =
        '<a-camera position="0 0 0" look-controls="enabled: false" wasd-controls="enabled: false"></a-camera>' +
        '<a-entity id="a01Target" mindar-image-target="targetIndex: 0" a01-experience></a-entity>';

      scene.addEventListener('arReady', onArReady);
      scene.addEventListener('arError', onArError);

      scene.addEventListener('loaded', function () {
        sceneEl = scene;
        arSystem = scene.systems && scene.systems['mindar-image-system'];
        if (!arSystem) {
          reject(new Error('mindar-image-system kaydedilmedi'));
          return;
        }
        state.sceneReady = true;
        log('A-Frame sahnesi hazır (AFRAME ' + window.AFRAME.version + ')');
        resolve();
      });

      dom.arRoot.appendChild(scene);

      setTimeout(function () {
        if (!state.sceneReady) reject(new Error('A-Frame sahnesi 20 sn içinde hazır olmadı'));
      }, 20000);
    });
  }

  /* ---------------------------------------------------------- AR OLAYLARI  */

  function onArReady() {
    state.arReady = true;
    clearTimers();
    log('arReady — kamera ve takip motoru çalışıyor');
    setHud('A01 ağacını kadraja alın…');
  }

  function onArError(evt) {
    var code = (evt && evt.detail && evt.detail.error) || 'bilinmiyor';
    log('arError: ' + code);

    if (isIOS()) {
      fail('Kameraya erişilemedi',
        'iPhone’da: Ayarlar > Safari > Kamera bölümünden bu site için “Sor” veya “İzin Ver” seçili olmalı. ' +
        'Ayrıca adres çubuğundaki “aA” menüsünden “Web Sitesi Ayarları > Kamera > İzin Ver” seçeneğini kontrol edin.');
    } else {
      fail('Kameraya erişilemedi',
        'Tarayıcınız kamera iznini vermedi. Adres çubuğundaki kilit simgesine dokunup kamera iznini “İzin Ver” yapın ve sayfayı yenileyin.');
    }
  }

  /* -------------------------------------------- VİDEO KİLİDİNİ AÇMA (iOS)  */

  // ÇOK ÖNEMLİ: Bu fonksiyon kullanıcı dokunuşunun İÇİNDE, hiçbir await
  // beklemeden çağrılmalıdır. Aksi hâlde iOS "user gesture" hakkını düşürür ve
  // Düşük Güç Modunda video hiç oynamaz (hedefin üstünde siyah dikdörtgen kalır).
  function unlockVideo() {
    var v = dom.video;
    try {
      v.muted = true;
      v.setAttribute('muted', '');
      v.playsInline = true;
      var p = v.play();
      if (p && p.then) {
        p.then(function () {
          try { v.pause(); v.currentTime = 0; } catch (e) {}
          state.videoUnlocked = true;
          log('Video kilidi açıldı (dokunuş içinde)');
        }).catch(function (err) {
          log('Video kilidi açılamadı: ' + err);
          state.needsTapToPlay = true;
        });
      } else {
        try { v.pause(); v.currentTime = 0; } catch (e) {}
        state.videoUnlocked = true;
        log('Video kilidi açıldı (senkron)');
      }
    } catch (e) {
      log('unlockVideo istisnası: ' + e);
    }
  }

  /* ----------------------------------------------------------- AR BAŞLAT   */

  function startAR() {
    if (state.arStarted || !state.libsReady || !state.sceneReady) return;

    // 1) Video kilidini AÇ — her şeyden önce, senkron.
    unlockVideo();

    // 2) Ortam kontrolü
    if (!hasGetUserMedia()) {
      fail('Kamera bu tarayıcıda açılamıyor',
        isInAppBrowser()
          ? 'Bu sayfa bir uygulama içi tarayıcıda açılmış görünüyor. Sağ üstteki “…” menüsünden “Safari’de Aç” (veya “Tarayıcıda Aç”) seçeneğini kullanın.'
          : 'Tarayıcınız kamera erişimini desteklemiyor. Lütfen iPhone’da Safari, Android’de Chrome kullanın.');
      return;
    }

    state.arStarted = true;
    dom.startButton.disabled = true;

    // 3) Ekranı değiştir
    dom.launch.classList.add('hidden');
    dom.hud.classList.remove('hidden');
    dom.arRoot.classList.add('active');
    setHud('Kamera izni bekleniyor…');

    // 4) MindAR'ı başlat
    try {
      log('mindar-image-system.start() çağrılıyor');
      arSystem.start();
    } catch (e) {
      log('start() istisnası: ' + e);
      fail('AR başlatılamadı', 'AR motoru başlatılırken beklenmeyen bir hata oluştu. Sayfayı yenileyip tekrar deneyin.');
      return;
    }

    // 5) Watchdog — sessiz sonsuz yükleme olmasın
    slowTimer = setTimeout(function () {
      if (!state.arReady) setHud('AR motoru hazırlanıyor, ilk açılış biraz sürebilir…');
    }, CFG.slowHintMs);

    readyTimer = setTimeout(function () {
      if (!state.arReady) {
        fail('AR zamanında başlamadı',
          'Kamera veya AR motoru beklenen sürede hazır olmadı. Sayfayı yenileyip tekrar deneyin; sorun sürerse Wi-Fi bağlantısıyla tekrar deneyin.');
      }
    }, CFG.arReadyTimeoutMs);
  }

  /* ----------------------------------------------------- SEKME GÖRÜNÜRLÜĞÜ */

  document.addEventListener('visibilitychange', function () {
    if (!state.arReady || !arSystem) return;
    try {
      if (document.hidden) {
        dom.video.pause();
        arSystem.pause(true); // kamerayı açık tut, sadece işlemeyi durdur
        log('Sekme arka planda — işleme duraklatıldı');
      } else {
        arSystem.unpause();
        log('Sekme öne geldi — işleme sürdürüldü');
      }
    } catch (e) { log('visibilitychange hatası: ' + e); }
  });

  // iOS'ta ekran döndürüldüğünde MindAR'ın projeksiyonu yeniden hesaplaması için
  window.addEventListener('orientationchange', function () {
    setTimeout(function () { window.dispatchEvent(new Event('resize')); }, 350);
  });

  /* ------------------------------------------------------------- ARAYÜZ    */

  dom.startButton.addEventListener('click', startAR);

  dom.exitButton.addEventListener('click', function () {
    try { dom.video.pause(); } catch (e) {}
    location.reload();
  });

  dom.errorRetry.addEventListener('click', function () { location.reload(); });

  dom.errorDetailsToggle.addEventListener('click', function () {
    var hidden = dom.errorDetails.classList.toggle('hidden');
    dom.errorDetailsToggle.textContent = hidden ? 'Teknik detayları göster' : 'Teknik detayları gizle';
  });

  /* -------------------------------------------------------------- AÇILIŞ   */

  function boot() {
    if (state.booted) return;
    state.booted = true;

    log('Açılış — A01 WebAR v' + CFG.version);
    log(envSummary());

    if (!isSecure()) {
      fail('Güvenli bağlantı gerekiyor',
        'Kamera yalnızca HTTPS üzerinden açılabilir. Lütfen adresi https:// ile açın.');
      return;
    }

    if (isInAppBrowser()) {
      setLaunchStatus('Uygulama içi tarayıcı algılandı — Safari/Chrome önerilir');
      log('UYARI: uygulama içi tarayıcı');
    }

    setLaunchStatus('AR hedefi kontrol ediliyor…');

    verifyTarget()
      .then(function () {
        setLaunchStatus('AR motoru yükleniyor…');
        return loadScriptWithFallback(CFG.aframeUrls, 'A-Frame');
      })
      .then(function () {
        if (!window.AFRAME) throw new Error('A-Frame yüklendi ama global AFRAME yok');
        setLaunchStatus('Görüntü tanıma motoru yükleniyor…');
        return loadScriptWithFallback(CFG.mindarUrls, 'MindAR');
      })
      .then(function () {
        if (!window.AFRAME.systems['mindar-image-system'] && !window.AFRAME.components['mindar-image']) {
          throw new Error('MindAR yüklendi ama bileşenler kaydedilmedi');
        }
        state.libsReady = true;
        setLaunchStatus('AR sahnesi hazırlanıyor…');
        registerComponents();
        return buildScene();
      })
      .then(function () {
        // Arı atlası bileşen init'inde yüklenmeye başladı; burada tamamlanmasını
        // bekliyoruz. Başarısız olursa beeLayer null'lanır ve V1 aynen devam eder.
        if (!beeReady) return;
        setLaunchStatus('Arı katmanı yükleniyor…');
        return beeReady;
      })
      .then(function () {
        if (!growthReady) return;
        setLaunchStatus('Growth Halo yükleniyor…');
        return growthReady;
      })
      .then(function () {
        // Videoyu arka planda ön belleğe almaya çalış
        try { dom.video.load(); } catch (e) {}

        dom.startButton.disabled = false;
        dom.startButton.textContent = "AR'yi Başlat";
        setLaunchStatus('Hazır · Butona dokunun');
        log('BOOT TAMAM — başlatmaya hazır');
      })
      .catch(function (err) {
        log('BOOT HATASI: ' + (err && err.message ? err.message : err));

        if (/targets\.mind/.test(String(err && err.message))) {
          fail('AR hedef dosyası bulunamadı',
            'assets/targets.mind dosyası sunucuda yok veya bozuk. Lütfen dosyanın GitHub deposunda assets klasörü içinde yüklü olduğundan emin olun.');
        } else if (/CDN|A-Frame|MindAR/.test(String(err && err.message))) {
          fail('AR motoru yüklenemedi',
            'İnternet bağlantınız AR kütüphanelerine ulaşamadı. Wi-Fi veya mobil veri bağlantınızı kontrol edip sayfayı yenileyin.');
        } else {
          fail('AR hazırlanamadı',
            'Beklenmeyen bir sorun oluştu. Sayfayı yenileyip tekrar deneyin.');
        }
      });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

})();
