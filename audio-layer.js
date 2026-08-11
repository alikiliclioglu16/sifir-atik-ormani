/* =============================================================================
   SIFIR ATIK ORMANI — SES KATMANI MOTORU (audio-layer.js)
   Sürüm 1.0 · Katman 6

   MİMARİ KARARLAR
   ---------------
   1) WEB AUDIO API, <audio> ETİKETİ DEĞİL.
      Nedenleri:
      - MP3'te encoder padding vardır; <audio loop> ile her döngüde duyulur bir
        boşluk/tık oluşur. AudioBufferSourceNode + loopStart/loopEnd örnek
        hassasiyetinde kesintisiz döngü verir.
      - GainNode ile hassas fade-in/fade-out yapılabilir.
      - Tek AudioContext kullanıcı dokunuşu içinde bir kez unlock edilir;
        sonraki tüm sesler iOS autoplay kısıtına takılmaz.
      - Growth görseli ile sesi aynı callback'te örnek hassasiyetinde başlar.

   2) TARAYICI DECODER'I ENCODER GECİKMESİNİ TUTARSIZ KIRPAR.
      Verilen MP3'lerde 'Info' başlığı var ama LAME tag yok. Bu yüzden decode
      sonrası baştaki sessizlik ÇALIŞMA ANINDA ölçülüp kırpılır ve döngü
      sınırları config'teki nominal süreye göre kurulur.

   3) SES ASLA GÖRSELİ BOZMAZ.
      AudioContext yoksa, dosyalar inmezse veya Safari izin vermezse motor
      sessizce devre dışı kalır; V1 + V1.5 + V2 görsel deneyimi etkilenmez.
      Yükleme arka planda yapılır, AR başlatmayı bloklamaz.

   Bu motor ağaca özel değildir: tüm yollar/volume/fade config'ten gelir.
   A02–A30 aynı motoru farklı ses dosyalarıyla kullanır.
   ============================================================================= */

(function (global) {
  'use strict';

  var MAX_TRIM = 0.060;   // encoder gecikmesi en fazla ~24 ms; 60 ms güvenli tavan

  function create(audioCfg, opts) {
    opts = opts || {};
    var log = opts.log || function () {};

    if (!audioCfg || !audioCfg.implemented) {
      log('Ses katmanı: config yok veya implemented=false');
      return null;
    }

    var AC = global.AudioContext || global.webkitAudioContext;
    if (!AC) {
      log('Ses katmanı: bu tarayıcıda Web Audio yok — sessiz devam');
      return null;
    }

    var ctx = null, master = null;
    var unlocked = false, muted = false, loaded = false;
    var tracks = {};   // key -> { cfg, buffer, trim, src, gain, playing }

    var KEYS = ['ambient', 'bee', 'growth'];
    for (var i = 0; i < KEYS.length; i++) {
      var k = KEYS[i];
      if (audioCfg[k] && audioCfg[k].asset) {
        tracks[k] = { cfg: audioCfg[k], buffer: null, trim: 0, src: null, gain: null, playing: false };
      }
    }

    try {
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = (audioCfg.masterVolume != null) ? audioCfg.masterVolume : 1;
      master.connect(ctx.destination);
    } catch (e) {
      log('AudioContext oluşturulamadı: ' + e.message);
      return null;
    }

    /* --------------------------------------------------- baştaki sessizliği bul */
    function detectTrim(buf) {
      try {
        var ch = buf.getChannelData(0);
        var win = Math.min(ch.length, Math.floor(buf.sampleRate * MAX_TRIM));
        var peak = 0, i;
        for (i = 0; i < Math.min(ch.length, buf.sampleRate); i++) {
          var v = ch[i] < 0 ? -ch[i] : ch[i];
          if (v > peak) peak = v;
        }
        var thr = Math.max(peak * 0.002, 1e-4);
        for (i = 0; i < win; i++) {
          var a = ch[i] < 0 ? -ch[i] : ch[i];
          if (a > thr) return i / buf.sampleRate;
        }
        return 0;
      } catch (e) { return 0; }
    }

    function decode(arrayBuffer) {
      return new Promise(function (res, rej) {
        // Safari'nin eski callback imzası da desteklenir
        var p = ctx.decodeAudioData(arrayBuffer, res, rej);
        if (p && p.then) p.then(res, rej);
      });
    }

    function loadOne(key) {
      var t = tracks[key];
      return fetch(t.cfg.asset, { cache: 'force-cache' })
        .then(function (r) {
          if (!r.ok) throw new Error(t.cfg.asset + ' HTTP ' + r.status);
          return r.arrayBuffer();
        })
        .then(decode)
        .then(function (buf) {
          t.buffer = buf;
          t.trim = detectTrim(buf);
          log('Ses yüklendi: ' + key + ' · ' + buf.duration.toFixed(2) + ' sn' +
              (t.trim > 0.0005 ? ' (baş kırpma ' + (t.trim * 1000).toFixed(0) + ' ms)' : ''));
        })
        .catch(function (e) {
          t.buffer = null;
          log('Ses YÜKLENEMEDİ (' + key + '): ' + (e && e.message ? e.message : e));
        });
    }

    /* ------------------------------------------------------------- çalma/durdurma */
    function startTrack(key) {
      var t = tracks[key];
      if (!t || !t.buffer || t.playing || !unlocked) return false;
      try {
        var now = ctx.currentTime;
        var vol = muted ? 0 : (t.cfg.volume != null ? t.cfg.volume : 1);
        var fin = t.cfg.fadeIn || 0.02;

        var g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, now);
        g.gain.linearRampToValueAtTime(vol, now + fin);
        g.connect(master);

        var s = ctx.createBufferSource();
        s.buffer = t.buffer;
        if (t.cfg.loop) {
          s.loop = true;
          s.loopStart = t.trim;
          // Nominal süre config'ten gelir → decoder padding'i döngüye sızmaz
          var len = t.cfg.duration || (t.buffer.duration - t.trim);
          s.loopEnd = Math.min(t.buffer.duration, t.trim + len);
        }
        s.connect(g);
        s.start(0, t.trim);

        t.src = s; t.gain = g; t.playing = true;
        if (!t.cfg.loop) {
          s.onended = function () { t.playing = false; t.src = null; t.gain = null; };
        }
        return true;
      } catch (e) {
        log('Ses başlatılamadı (' + key + '): ' + e.message);
        return false;
      }
    }

    function stopTrack(key, fade) {
      var t = tracks[key];
      if (!t || !t.playing) return;
      try {
        var now = ctx.currentTime;
        var f = (fade != null) ? fade : (t.cfg.fadeOut || 0);
        if (t.gain) {
          t.gain.gain.cancelScheduledValues(now);
          t.gain.gain.setValueAtTime(t.gain.gain.value, now);
          t.gain.gain.linearRampToValueAtTime(0.0001, now + Math.max(f, 0.01));
        }
        if (t.src) { t.src.onended = null; t.src.stop(now + Math.max(f, 0.01) + 0.02); }
      } catch (e) {}
      t.playing = false; t.src = null; t.gain = null;
    }

    function applyMute() {
      for (var i = 0; i < KEYS.length; i++) {
        var t = tracks[KEYS[i]];
        if (!t || !t.playing || !t.gain) continue;
        try {
          var now = ctx.currentTime;
          var vol = muted ? 0.0001 : (t.cfg.volume != null ? t.cfg.volume : 1);
          t.gain.gain.cancelScheduledValues(now);
          t.gain.gain.setValueAtTime(t.gain.gain.value, now);
          t.gain.gain.linearRampToValueAtTime(vol, now + 0.12);
        } catch (e) {}
      }
    }

    var api = {
      /* Arka planda indirir; AR başlatmayı BLOKLAMAZ (görev tanımı §8). */
      load: function () {
        var jobs = [];
        for (var i = 0; i < KEYS.length; i++) {
          if (tracks[KEYS[i]]) jobs.push(loadOne(KEYS[i]));
        }
        return Promise.all(jobs).then(function () {
          loaded = true;
          var ok = KEYS.filter(function (k) { return tracks[k] && tracks[k].buffer; });
          log('Ses katmanı hazır: ' + ok.length + '/' + jobs.length + ' dosya');
        });
      },

      /* KULLANICI DOKUNUŞU İÇİNDE, SENKRON çağrılmalıdır.
         iOS Safari AudioContext'i ancak gesture içinde resume eder. */
      unlock: function () {
        try {
          if (ctx.state === 'suspended') ctx.resume();
          // Sessiz tek örneklik buffer: iOS'ta context'i tam olarak açar
          var b = ctx.createBuffer(1, 1, ctx.sampleRate);
          var s = ctx.createBufferSource();
          s.buffer = b; s.connect(master); s.start(0);
          unlocked = true;
          log('Ses kilidi açıldı (dokunuş içinde) · durum: ' + ctx.state);
          return true;
        } catch (e) {
          log('Ses kilidi açılamadı: ' + e.message);
          return false;
        }
      },

      /* targetFound: her şey sıfırdan */
      reset: function () {
        for (var i = 0; i < KEYS.length; i++) stopTrack(KEYS[i], 0.02);
      },

      startAmbient: function () { return startTrack('ambient'); },

      /* Arıların sahneye girdiği anda bee-layer tarafından tetiklenir */
      startBee: function () { return startTrack('bee'); },

      /* İlk geçerli pollenDrop ile bir kez. Zaten çalıyorsa/çaldıysa yok sayılır. */
      playGrowth: function () {
        var t = tracks.growth;
        if (!t) return false;
        if (t.playing) { log('growth sesi zaten çalıyor — yok sayıldı'); return false; }
        return startTrack('growth');
      },

      /* targetLost: kısa fade ile durdur, playhead sıfırlansın */
      stopAll: function () {
        stopTrack('ambient');
        stopTrack('bee');
        stopTrack('growth', 0.15);
      },

      setMuted: function (m) { muted = !!m; applyMute(); return muted; },
      isMuted: function () { return muted; },

      suspend: function () { try { if (ctx.state === 'running') ctx.suspend(); } catch (e) {} },
      resumeCtx: function () { try { if (unlocked && ctx.state === 'suspended') ctx.resume(); } catch (e) {} },

      isReady: function () {
        return loaded && KEYS.some(function (k) { return tracks[k] && tracks[k].buffer; });
      },
      isUnlocked: function () { return unlocked; },
      state: function () { return ctx ? ctx.state : 'yok'; },

      dispose: function () {
        api.stopAll();
        try { ctx.close(); } catch (e) {}
      }
    };

    return api;
  }

  global.A01AudioLayer = { create: create, version: '1.0' };

})(window);
