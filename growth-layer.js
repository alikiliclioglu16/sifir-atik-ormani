/* =============================================================================
   SIFIR ATIK ORMANI — GROWTH HALO MOTORU (growth-layer.js)
   Sürüm 1.0 · V2 · Katman 5

   MİMARİ KARARLAR
   ---------------
   1) İKİNCİ VİDEO DECODER YOK.
      A01_growth_master.mp4 siyah zeminlidir ve alpha kanalı içermez. Arı
      katmanında kanıtlanmış offline alpha çıkarımı + sprite atlas boru hattı
      bu asset için de kullanıldı. Sahnede yalnızca ağaç Kling videosu decoder
      kullanmaya devam eder (üretim standardı §12 öncelik sırası).

   2) TEK MESH, TEK DOKU, TEK DRAW CALL.
      Altı ayrı garden instance üretilmez. Tek master Growth Halo düzlemi vardır.

   3) TEK ATIŞ (one-shot), LOOP YOK.
      İlk geçerli pollenDrop event'i ile başlar, son kareye gelince orada durur.
      Sonraki pollenDrop event'leri `started` bayrağı nedeniyle yok sayılır.

   4) PREMULTIPLIED ALPHA.
      Kareler siyah zemine composite edilmiştir; materyalde
      `premultipliedAlpha = true` kullanılır → koyu karton kenarları ve koyu
      yeşil yapraklar çevresinde siyah saçaklanma olmaz.

   Bu dosya three.js'i kendisi import etmez; app.js hazır THREE'yi enjekte eder.
   ============================================================================= */

(function (global) {
  'use strict';

  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }

  function create(THREE, treeCfg, parentObject3D, opts) {
    opts = opts || {};
    var log = opts.log || function () {};
    var D = treeCfg.dioramaPreset;

    if (!D || !D.implemented || !D.atlas || !D.transform) {
      log('Growth katmanı: konfigürasyon yok veya implemented=false');
      return null;
    }

    var A = D.atlas;
    var T = D.transform;

    var group = new THREE.Group();
    group.visible = false;
    parentObject3D.add(group);

    var mesh = null, mat = null, tex = null;
    var shadow = null, shadowMat = null;
    var started = false, finished = false;
    var t = 0, ready = false;

    function setFrame(i) {
      var idx = clamp(i | 0, 0, A.count - 1);
      var col = idx % A.cols;
      var row = Math.floor(idx / A.cols);
      tex.offset.set(col / A.cols, 1 - (row + 1) / A.rows);
    }

    var api = {
      object3D: group,

      load: function (onReady, onError) {
        var loader = new THREE.TextureLoader();
        var tried = false;
        function fallbackOrFail(e) {
          if (!tried && D.assetFallback) {
            tried = true;
            log('Growth atlası (' + D.asset + ') açılamadı, PNG yedeğine geçiliyor');
            loader.load(D.assetFallback, onTex, undefined, function () {
              log('Growth atlası YÜKLENEMEDİ (yedek de başarısız)');
              if (onError) onError(e);
            });
          } else {
            log('Growth atlası YÜKLENEMEDİ: ' + D.asset);
            if (onError) onError(e);
          }
        }
        function onTex(texture) {
            tex = texture;
            if ('colorSpace' in tex && THREE.SRGBColorSpace) tex.colorSpace = THREE.SRGBColorSpace;
            else if ('encoding' in tex && THREE.sRGBEncoding) tex.encoding = THREE.sRGBEncoding;
            tex.premultiplyAlpha = false;     // RGB zaten premultiplied
            tex.generateMipmaps = true;
            tex.minFilter = THREE.LinearMipmapLinearFilter;
            tex.magFilter = THREE.LinearFilter;
            tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
            tex.repeat.set(1 / A.cols, 1 / A.rows);

            mat = new THREE.MeshBasicMaterial({
              map: tex,
              transparent: true,
              premultipliedAlpha: true,
              depthWrite: false,
              side: THREE.FrontSide,
              toneMapped: false,
              opacity: 1
            });

            mesh = new THREE.Mesh(new THREE.PlaneGeometry(T.width, T.height), mat);
            mesh.position.set(T.x || 0, T.y || 0, T.z || 0.03);
            // GERÇEK PARALLAX: düzlem target'ın ÖNÜNDE durur ve hafifçe geriye
            // yatar. Telefon hareket ettikçe bahçe esere göre kayar; derinlik
            // artık sahte (pişirilmiş ezme) değil, gerçek perspektiftir.
            if (T.rotationXDeg) mesh.rotation.x = T.rotationXDeg * Math.PI / 180;
            // Arıların (renderOrder 10+) altında, ağaç videosunun (0) üstünde
            mesh.renderOrder = (D.renderOrder != null) ? D.renderOrder : 8;
            mesh.frustumCulled = false;
            mesh.visible = false;
            group.add(mesh);

            // Bahçenin esere düşen yumuşak temas gölgesi (zemine oturtur)
            if (D.shadow && D.shadow.enabled) {
              var sc = document.createElement('canvas'); sc.width = sc.height = 64;
              var sg = sc.getContext('2d');
              var rg = sg.createRadialGradient(32, 32, 0, 32, 32, 32);
              rg.addColorStop(0.00, 'rgba(0,0,0,0.80)');
              rg.addColorStop(0.50, 'rgba(0,0,0,0.34)');
              rg.addColorStop(1.00, 'rgba(0,0,0,0)');
              sg.fillStyle = rg; sg.fillRect(0, 0, 64, 64);
              var st = new THREE.Texture(sc); st.needsUpdate = true;
              shadowMat = new THREE.MeshBasicMaterial({
                map: st, color: new THREE.Color(D.shadow.color != null ? D.shadow.color : 0x0b2418),
                transparent: true, opacity: 0, depthWrite: false, toneMapped: false
              });
              shadow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), shadowMat);
              shadow.scale.set(T.width * (D.shadow.scaleX || 0.92), T.height * (D.shadow.scaleY || 0.55), 1);
              shadow.position.set(T.x || 0, (T.y || 0) + (D.shadow.offsetY || 0.10), 0.006);
              shadow.renderOrder = 5;
              shadow.frustumCulled = false;
              shadow.visible = false;
              group.add(shadow);
            }

            setFrame(0);
            ready = true;
            log('Growth atlası yüklendi: ' + A.cols + 'x' + A.rows + ' hücre, ' +
                A.count + ' kare @ ' + A.fps + ' fps · düzlem ' +
                T.width + ' x ' + T.height.toFixed(3) + ' @ y=' + T.y +
                ' z=' + (T.z || 0) + ' eğim=' + (T.rotationXDeg || 0) + '°');
            if (onReady) onReady();
        }
        loader.load(D.asset, onTex, undefined, fallbackOrFail);
      },

      /* İlk geçerli pollenDrop bunu çağırır. Sonraki çağrılar yok sayılır. */
      start: function (reason) {
        if (!ready) { log('Growth start yok sayıldı: atlas hazır değil'); return false; }
        if (started) { log('Growth start yok sayıldı: zaten başlamıştı (' + (reason || '') + ')'); return false; }
        started = true; finished = false; t = 0;
        setFrame(0);
        mat.opacity = 0;
        mesh.visible = true;
        if (shadow) { shadowMat.opacity = 0; shadow.visible = true; }
        group.visible = true;
        log('Growth Halo BAŞLADI (' + (reason || 'first-pollen-drop') + ')');
        return true;
      },

      /* targetFound: temiz başlangıç state'i — görünmez, 0. karede bekler */
      reset: function () {
        started = false; finished = false; t = 0;
        if (ready) { setFrame(0); mat.opacity = 1; mesh.visible = false; if (shadow) shadow.visible = false; }
        group.visible = true;
      },

      /* targetLost: durdur, gizle, state sıfırla */
      stop: function () {
        started = false; finished = false; t = 0;
        if (ready) { setFrame(0); mat.opacity = 1; mesh.visible = false; if (shadow) shadow.visible = false; }
        group.visible = false;
      },

      update: function (dt) {
        if (!ready || !started || !(dt > 0)) return;
        if (dt > 0.05) dt = 0.05;
        t += dt;

        var fade = D.fadeIn || 0;
        mat.opacity = fade > 0 ? clamp(t / fade, 0, 1) : 1;

        if (shadow) {
          // Gölge bahçeyle birlikte, biraz gecikmeli koyulaşır
          var target = (D.shadow.opacity != null ? D.shadow.opacity : 0.26) * clamp((t - 0.4) / 1.6, 0, 1);
          shadowMat.opacity += (target - shadowMat.opacity) * clamp(dt * 3, 0, 1);
        }

        var i = Math.floor(t * A.fps);
        if (i >= A.count - 1) {
          i = A.count - 1;
          if (!finished) {
            finished = true;
            log('Growth Halo tamamlandı (' + (A.count / A.fps).toFixed(2) + ' sn) — son karede tutuluyor');
            if (typeof opts.onGrowthComplete === 'function') { try { opts.onGrowthComplete(); } catch (e) {} }
          }
        }
        setFrame(i);
      },

      isReady: function () { return ready; },
      isStarted: function () { return started; },
      isFinished: function () { return finished; },
      progress: function () { return ready && started ? clamp(t / (A.count / A.fps), 0, 1) : 0; },

      dispose: function () {
        if (mesh) { mesh.geometry.dispose(); }
        if (shadow) { shadow.geometry.dispose(); shadowMat.map.dispose(); shadowMat.dispose(); }
        if (mat) mat.dispose();
        if (tex) tex.dispose();
        ready = false;
      }
    };

    return api;
  }

  global.A01GrowthLayer = { create: create, version: '1.0' };

})(window);
