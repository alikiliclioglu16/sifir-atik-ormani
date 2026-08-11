/* =============================================================================
   SIFIR ATIK ORMANI — FOTOĞRAF YAKALAMA MOTORU (capture-layer.js)
   Sürüm 1.0

   MİMARİ KARARLAR
   ---------------
   1) `tock` İÇİNDE YAKALAMA.
      A-Frame renderer'ı `preserveDrawingBuffer: false` ile oluşturur ve bu
      ayar renderer bileşeni üzerinden değiştirilemez. Dolayısıyla WebGL
      canvas'ı rastgele bir anda okumak boş kare verir.
      A-Frame'in `tock` kancası render'dan HEMEN SONRA, aynı animasyon karesi
      içinde senkron çalışır; drawing buffer o anda hâlâ okunabilir durumdadır.
      Yakalama bu yüzden `tock` içinde yapılır.

   2) KAMERA GÖRÜNTÜSÜ EKRANDAKİ KADRAJLA BİREBİR.
      MindAR kamera <video> öğesini kapsayıcıya mutlak konumla ve "cover"
      kırpmasıyla yerleştirir (style.left/top/width/height). Bu değerler
      okunup aynı oranla çıktı tuvaline uygulanır; böylece fotoğraf, kullanıcının
      ekranda gördüğü kadrajın aynısı olur.

   3) LOGO FİLİGRANI.
      Sayfada zaten görünen <img> öğesi yeniden kullanılır → ek ağ isteği yok.

   4) PAYLAŞ, YOKSA İNDİR.
      navigator.share(files) destekleniyorsa sistem paylaşım sayfası açılır
      (iOS 15+). Desteklenmiyorsa dosya indirilir.
   ============================================================================= */

(function (global) {
  'use strict';

  function create(cfg, opts) {
    opts = opts || {};
    var log = opts.log || function () {};
    cfg = cfg || {};

    var pending = false;
    var busy = false;
    var lastError = null;

    function findCameraVideo(container) {
      // MindAR kamera video'sunu kapsayıcıya ekler (bizim <video> öğemiz değil)
      if (!container) return null;
      var vids = container.getElementsByTagName('video');
      for (var i = 0; i < vids.length; i++) {
        if (vids[i].srcObject) return vids[i];
      }
      return null;
    }

    function drawWatermark(ctx, W, H) {
      var img = opts.getLogo && opts.getLogo();
      if (!img || !img.complete || !img.naturalWidth) return;
      var margin = Math.round(W * (cfg.logoMargin != null ? cfg.logoMargin : 0.035));
      var lw = Math.round(W * (cfg.logoWidth != null ? cfg.logoWidth : 0.17));
      var lh = Math.round(lw * img.naturalHeight / img.naturalWidth);
      ctx.save();
      ctx.globalAlpha = (cfg.logoOpacity != null ? cfg.logoOpacity : 0.55);
      ctx.drawImage(img, W - lw - margin, margin, lw, lh);
      ctx.restore();
    }

    function compose() {
      var glCanvas = opts.getGLCanvas && opts.getGLCanvas();
      var container = opts.getContainer && opts.getContainer();
      if (!glCanvas) throw new Error('AR canvas bulunamadı');

      var W = glCanvas.width, H = glCanvas.height;
      var maxW = cfg.maxWidth || 1440;
      var scale = W > maxW ? maxW / W : 1;
      var OW = Math.round(W * scale), OH = Math.round(H * scale);

      var out = document.createElement('canvas');
      out.width = OW; out.height = OH;
      var ctx = out.getContext('2d');

      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, OW, OH);

      // 1) Kamera görüntüsü — ekrandaki kadrajın birebir aynısı
      var cam = findCameraVideo(container);
      if (cam && cam.videoWidth) {
        var cw = container.clientWidth || OW;
        var ch = container.clientHeight || OH;
        var k = OW / cw;                      // CSS px -> çıktı px
        var vx = parseFloat(cam.style.left) || 0;
        var vy = parseFloat(cam.style.top) || 0;
        var vw = parseFloat(cam.style.width) || cw;
        var vh = parseFloat(cam.style.height) || ch;
        ctx.drawImage(cam, vx * k, vy * (OH / ch), vw * k, vh * (OH / ch));
      }

      // 2) AR katmanları (ağaç videosu + arılar + polen + bahçe)
      ctx.drawImage(glCanvas, 0, 0, OW, OH);

      // 3) Logo filigranı — sağ üst, soluk
      drawWatermark(ctx, OW, OH);

      return out;
    }

    function deliver(canvas) {
      var name = (cfg.fileName || 'sifir-atik-ormani-A01') + '-' +
                 new Date().toISOString().slice(0, 19).replace(/[:T]/g, '') + '.jpg';
      canvas.toBlob(function (blob) {
        if (!blob) { fail('Görsel oluşturulamadı'); return; }
        var file = null;
        try { file = new File([blob], name, { type: 'image/jpeg' }); } catch (e) {}

        if (file && navigator.canShare && navigator.canShare({ files: [file] }) && navigator.share) {
          navigator.share({ files: [file], title: cfg.shareTitle || 'Sıfır Atık Ormanı' })
            .then(function () { done('Paylaşıldı'); })
            .catch(function (e) {
              // Kullanıcı iptal ettiyse hata gösterme
              if (e && e.name === 'AbortError') { done(null); return; }
              downloadBlob(blob, name);
            });
        } else {
          downloadBlob(blob, name);
        }
      }, 'image/jpeg', cfg.quality || 0.92);
    }

    function downloadBlob(blob, name) {
      try {
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url; a.download = name;
        document.body.appendChild(a); a.click();
        setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 4000);
        done('Fotoğraf kaydedildi');
      } catch (e) { fail('Kaydedilemedi'); }
    }

    function done(msg) {
      busy = false;
      if (typeof opts.onResult === 'function') opts.onResult(true, msg);
    }
    function fail(msg) {
      busy = false; lastError = msg;
      log('Yakalama hatası: ' + msg);
      if (typeof opts.onResult === 'function') opts.onResult(false, msg);
    }

    return {
      /* Kullanıcı 📷'ye bastığında çağrılır; asıl iş bir sonraki tock'ta yapılır */
      request: function () {
        if (busy) return false;
        busy = true; pending = true;
        if (typeof opts.onStart === 'function') opts.onStart();
        return true;
      },

      /* a01-experience bileşeninin tock'undan çağrılır (render'dan HEMEN SONRA) */
      onTock: function () {
        if (!pending) return;
        pending = false;
        try {
          deliver(compose());
        } catch (e) {
          fail(e && e.message ? e.message : 'bilinmeyen hata');
        }
      },

      isBusy: function () { return busy; },
      lastError: function () { return lastError; }
    };
  }

  global.A01CaptureLayer = { create: create, version: '1.0' };

})(window);
