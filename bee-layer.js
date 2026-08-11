/* =============================================================================
   SIFIR ATIK ORMANI — İMZA HAYVANI MOTORU (bee-layer.js)
   Sürüm 1.0 · V1.5

   MİMARİ KARARLAR
   ---------------
   1) VİDEO YOK, SPRITE ATLAS VAR.
      Kling MP4'lerinde alpha kanalı yoktur (yuv420p) ve arka plan siyahtır.
      Arının GÖZLERİ ve ŞERİTLERİ de siyah/koyu kahve olduğu için black-key,
      luma-key veya "screen" blend arının yüzünü yok eder. Bu yüzden alpha
      OFFLINE üretildi ve tek bir PNG sprite atlasına pişirildi.
      Kazanç: sahnede EK VİDEO DECODER ÇALIŞMAZ. Ağaç Kling videosu tek başına
      decoder kullanmaya devam eder — mevcut çalışan V1 deneyimi için sıfır
      regresyon riski. (Üretim standardı §12 öncelik sırası.)

   2) TEK DOKU, ALTI INSTANCE.
      Atlas dokusu bir kez yüklenir; her arı `texture.clone()` alır. three.js
      r152+ aynı `Source`'u paylaşan doku klonlarını TEK GPU yüklemesiyle
      kullanır (WebGLTextures `_sources` önbelleği). Yani 6 arı = 1 doku belleği.

   3) PREMULTIPLIED ALPHA.
      Kaynak kareler siyah zemine composite edilmiştir; bu matematiksel olarak
      premultiply demektir. Doku düz (straight) yüklenir ve materyalde
      `premultipliedAlpha = true` kullanılır → kenarlarda siyah saçaklanma olmaz.

   Bu dosya three.js'i kendisi import etmez; app.js hazır THREE'yi enjekte eder.
   ============================================================================= */

(function (global) {
  'use strict';

  var TWO_PI = Math.PI * 2;

  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function easeInOutSine(t) { return -(Math.cos(Math.PI * t) - 1) / 2; }
  function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }

  /* --------------------------------------------------------------- ROTA/PATH */

  // İki nokta arası yay: teleport ve düz çizgi olmasın diye kontrol noktası
  // orta noktadan dik yönde kaydırılır.
  function makeLeg(from, to, arcSign, zFrom, zTo) {
    var dx = to.x - from.x, dy = to.y - from.y;
    var len = Math.sqrt(dx * dx + dy * dy) || 1e-5;
    var arc = Math.min(0.22, len * 0.30) * arcSign;
    return {
      ax: from.x, ay: from.y,
      bx: to.x, by: to.y,
      cx: (from.x + to.x) / 2 - (dy / len) * arc,
      cy: (from.y + to.y) / 2 + (dx / len) * arc,
      z0: zFrom, z1: zTo,
      len: len
    };
  }

  function legPoint(leg, t, out) {
    var u = 1 - t;
    out.x = u * u * leg.ax + 2 * u * t * leg.cx + t * t * leg.bx;
    out.y = u * u * leg.ay + 2 * u * t * leg.cy + t * t * leg.by;
    out.z = lerp(leg.z0, leg.z1, t);
    return out;
  }

  /* ------------------------------------------------------------ POLEN SİSTEMİ */

  function createPollen(THREE, cfg, parent) {
    var N = cfg.max || 160;
    var pos = new Float32Array(N * 3);
    var col = new Float32Array(N * 3);
    for (var i = 0; i < N; i++) { pos[i * 3 + 2] = -50; }

    var geo = new THREE.BufferGeometry();
    var pAttr = new THREE.BufferAttribute(pos, 3); pAttr.setUsage(THREE.DynamicDrawUsage);
    var cAttr = new THREE.BufferAttribute(col, 3); cAttr.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', pAttr);
    geo.setAttribute('color', cAttr);

    // yuvarlak parçacık dokusu (runtime canvas — ek asset gerektirmez)
    var cv = document.createElement('canvas'); cv.width = cv.height = 48;
    var g2 = cv.getContext('2d');
    var rad = g2.createRadialGradient(24, 24, 0, 24, 24, 24);
    rad.addColorStop(0.00, 'rgba(255,255,255,1)');
    rad.addColorStop(0.35, 'rgba(255,238,170,0.85)');
    rad.addColorStop(1.00, 'rgba(255,214,103,0)');
    g2.fillStyle = rad; g2.fillRect(0, 0, 48, 48);
    var tex = new THREE.Texture(cv); tex.needsUpdate = true;

    var mat = new THREE.PointsMaterial({
      map: tex, size: cfg.size || 0.02, sizeAttenuation: true,
      transparent: true, depthWrite: false, vertexColors: true,
      blending: THREE.AdditiveBlending
    });
    var points = new THREE.Points(geo, mat);
    points.frustumCulled = false;
    points.renderOrder = 12;
    parent.add(points);

    var base = new THREE.Color(cfg.color || 0xffd867);
    var pool = [];
    for (var k = 0; k < N; k++) pool.push({ x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 0, max: 1, alive: false });

    return {
      object3D: points,
      emit: function (x, y, z, spread, up) {
        for (var i = 0; i < pool.length; i++) {
          var p = pool[i];
          if (p.alive) continue;
          p.x = x + (Math.random() - 0.5) * 0.03;
          p.y = y + (Math.random() - 0.5) * 0.03;
          p.z = z;
          p.vx = (Math.random() - 0.5) * spread;
          p.vy = (Math.random() - 0.5) * spread + (up || 0);
          p.vz = (Math.random() - 0.5) * spread * 0.4;
          p.life = 0;
          p.max = lerp(cfg.life[0], cfg.life[1], Math.random());
          p.alive = true;
          return;
        }
      },
      update: function (dt) {
        var gy = cfg.gravity || -0.05;
        for (var i = 0; i < pool.length; i++) {
          var p = pool[i], o = i * 3;
          if (!p.alive) { col[o] = col[o + 1] = col[o + 2] = 0; pos[o + 2] = -50; continue; }
          p.life += dt;
          if (p.life >= p.max) {
            p.alive = false;
            col[o] = col[o + 1] = col[o + 2] = 0; pos[o + 2] = -50;
            continue;
          }
          p.vy += gy * dt;
          p.vx *= (1 - 1.1 * dt); p.vz *= (1 - 1.1 * dt);
          p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
          var k = 1 - (p.life / p.max);
          var f = k * k;
          pos[o] = p.x; pos[o + 1] = p.y; pos[o + 2] = p.z;
          col[o] = base.r * f; col[o + 1] = base.g * f; col[o + 2] = base.b * f;
        }
        pAttr.needsUpdate = true; cAttr.needsUpdate = true;
      },
      reset: function () {
        for (var i = 0; i < pool.length; i++) {
          pool[i].alive = false;
          col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = 0;
          pos[i * 3 + 2] = -50;
        }
        pAttr.needsUpdate = true; cAttr.needsUpdate = true;
      },
      dispose: function () { geo.dispose(); mat.dispose(); tex.dispose(); }
    };
  }

  /* ------------------------------------------------------------------ MOTOR */

  function create(THREE, treeCfg, parentObject3D, opts) {
    opts = opts || {};
    var log = opts.log || function () {};
    var A = treeCfg.animal;
    var atlas = A.atlas;
    var group = new THREE.Group();
    group.visible = false;
    parentObject3D.add(group);

    var pollen = treeCfg.pollen && treeCfg.pollen.enabled
      ? createPollen(THREE, treeCfg.pollen, group) : null;

    var baseTexture = null;
    var bees = [];
    var active = false;
    var elapsed = 0;
    var enterFired = false;   // ses katmanı için: ilk arı sahneye girdi mi
    var _v = new THREE.Vector3();
    var _v2 = new THREE.Vector3();

    /* ---------- rota derleme: waypoint zinciri + faz planı ---------- */
    function buildPlan(route) {
      var pts = [route.entry];
      var kinds = ['entry'];
      for (var i = 0; i < route.flowers.length; i++) {
        var f = A.flowers[route.flowers[i]];
        if (!f) { log('UYARI: bilinmeyen çiçek kodu ' + route.flowers[i]); continue; }
        pts.push(f); kinds.push('flower');
      }
      pts.push(route.drop); kinds.push('drop');

      var legs = [];
      var zHi = A.zFar, zLo = A.zNear;
      for (var j = 0; j < pts.length - 1; j++) {
        var zf = (kinds[j] === 'flower') ? zLo : zHi;
        var zt = (kinds[j + 1] === 'flower') ? zLo : (kinds[j + 1] === 'drop' ? (zLo + zHi) / 2 : zHi);
        legs.push({
          leg: makeLeg(pts[j], pts[j + 1], (j % 2 === 0 ? 1 : -1), zf, zt),
          toKind: kinds[j + 1],
          flowerCode: kinds[j + 1] === 'flower' ? route.flowers[j] : null
        });
      }
      return { pts: pts, kinds: kinds, legs: legs };
    }

    /* ---------- arı oluşturma ---------- */
    function buildBees() {
      var geo = new THREE.PlaneGeometry(1, 1);
      for (var i = 0; i < Math.min(A.count, A.routes.length); i++) {
        var route = A.routes[i];
        var tex = baseTexture.clone();
        tex.needsUpdate = true;                       // klon için matris/uniform tazele
        tex.repeat.set(1 / atlas.cols, 1 / atlas.rows);

        var mat = new THREE.MeshBasicMaterial({
          map: tex,
          transparent: true,
          premultipliedAlpha: true,   // kareler siyah zemine composite = premultiplied
          depthWrite: false,
          side: THREE.FrontSide,
          toneMapped: false
        });

        var mesh = new THREE.Mesh(geo, mat);
        mesh.renderOrder = 10 + i;
        mesh.frustumCulled = false;
        group.add(mesh);

        bees.push({
          id: route.id,
          route: route,
          plan: buildPlan(route),
          mesh: mesh, mat: mat, tex: tex,
          size: A.baseScale * (route.scale || 1),
          state: 'wait', t: 0, legIdx: 0, legT: 0,
          timer: route.delay || 0,
          pos: new THREE.Vector3(route.entry.x, route.entry.y, A.zFar),
          prev: new THREE.Vector3(route.entry.x, route.entry.y, A.zFar),
          dirX: 1, roll: 0,
          clip: 'fly', frameT: 0, frame: 0,
          emitAcc: 0, dropped: false,
          phase: Math.random() * TWO_PI
        });
      }
      log('Arı katmanı: ' + bees.length + ' instance, 1 paylaşılan doku');
    }

    /* ---------- atlas karesi ---------- */
    function setFrame(b) {
      var c = atlas.clips[b.clip];
      var n = c.count;
      var cycle = (n - 1) * 2;                       // ping-pong: dikişsiz loop
      var k = Math.floor(b.frameT * c.fps) % cycle;
      var f = (k < n) ? k : (cycle - k);
      var idx = c.start + clamp(f, 0, n - 1);
      var col = idx % atlas.cols;
      var row = Math.floor(idx / atlas.cols);
      b.tex.offset.set(col / atlas.cols, 1 - (row + 1) / atlas.rows);
    }

    function setClip(b, name) {
      if (b.clip === name) return;
      b.clip = name;
      b.frameT = 0;
    }

    /* ---------- durum makinesi ---------- */
    function updateBee(b, dt) {
      b.prev.copy(b.pos);
      b.frameT += dt;

      switch (b.state) {

        case 'wait':                                  // giriş gecikmesi
          b.timer -= dt;
          b.mesh.visible = false;
          if (b.timer <= 0) {
            b.state = 'fly'; b.mesh.visible = true;
            // İlk arı sahneye girdiğinde bir kez haber ver (ses katmanı senkronu).
            // Bee timeline'ına HİÇBİR etkisi yoktur, sadece bildirimdir.
            if (!enterFired) {
              enterFired = true;
              log('ilk arı sahneye girdi (t=' + elapsed.toFixed(2) + ' sn)');
              if (typeof opts.onBeesEnter === 'function') { try { opts.onBeesEnter(); } catch (e) {} }
            }
          }
          return;

        case 'fly': {                                 // FLY / APPROACH FLOWER
          var L = b.plan.legs[b.legIdx];
          if (!L) { b.state = 'loop'; return; }
          setClip(b, L.toKind === 'drop' ? 'scatter' : 'fly');

          var dur = Math.max(0.9, L.leg.len / (b.route.speed || 0.65));
          b.legT += dt / dur;
          var t = clamp(b.legT, 0, 1);
          // çiçeğe yaklaşırken yavaşla (APPROACH), diğer hâllerde yumuşak in/out
          var e = (L.toKind === 'flower') ? easeOutCubic(t) : easeInOutSine(t);
          legPoint(L.leg, e, _v);
          b.pos.copy(_v);

          if (L.toKind === 'drop' && pollen) {         // SCATTER: polen saç
            b.emitAcc += dt * treeCfg.pollen.scatterRate;
            while (b.emitAcc >= 1) {
              b.emitAcc -= 1;
              pollen.emit(b.pos.x, b.pos.y, b.pos.z, 0.16, -0.02);
            }
          }

          if (t >= 1) {
            b.legT = 0;
            if (L.toKind === 'flower') { b.state = 'hover'; b.timer = b.route.hover || 1.5; }
            else if (L.toKind === 'drop') { b.state = 'drop'; b.timer = 0.35; }
            else { b.legIdx++; }
          }
          return;
        }

        case 'hover': {                               // HOVER + polen toplama
          setClip(b, 'hover');
          b.timer -= dt;
          var L2 = b.plan.legs[b.legIdx];
          var fx = L2.leg.bx, fy = L2.leg.by;
          var hm = A.hoverMotion;
          var a = elapsed * TWO_PI * hm.hz + b.phase;
          b.pos.set(
            fx + Math.cos(a) * hm.rx,
            fy + Math.sin(a * 1.6) * hm.ry,
            A.zNear + Math.sin(a * 0.7) * 0.008
          );
          b.roll = Math.sin(a) * (hm.rollDeg * Math.PI / 180);

          if (pollen) {
            b.emitAcc += dt * treeCfg.pollen.hoverRate;
            while (b.emitAcc >= 1) {
              b.emitAcc -= 1;
              pollen.emit(fx, fy, A.zNear, 0.05, 0.02);
            }
          }
          if (b.timer <= 0) { b.legIdx++; b.legT = 0; b.state = 'fly'; }
          return;
        }

        case 'drop': {                                // POLLEN DROP EVENT
          setClip(b, 'scatter');
          b.timer -= dt;
          var d = b.route.drop;
          b.pos.set(d.x, d.y + Math.sin(elapsed * 3 + b.phase) * 0.012, (A.zNear + A.zFar) / 2);
          if (!b.dropped) {
            b.dropped = true;
            fireDrop(b);
            if (pollen) {
              for (var q = 0; q < treeCfg.pollen.dropBurst; q++) {
                pollen.emit(d.x, d.y, A.zNear, 0.30, 0.06);
              }
            }
          }
          if (b.timer <= 0) { b.state = 'loop'; b.timer = 0; }
          return;
        }

        case 'loop': {                                // IDLE / EKOSİSTEM LOOP
          setClip(b, 'fly');
          var d2 = b.route.drop;
          var w = elapsed * 0.55 + b.phase;
          b.pos.set(
            d2.x + Math.cos(w) * 0.075,
            d2.y + 0.055 + Math.sin(w * 1.3) * 0.045,
            lerp(A.zNear, A.zFar, 0.45 + 0.35 * Math.sin(w * 0.8))
          );
          return;
        }
      }
    }

    /* ---------- V2 kancası: pollenDrop event ---------- */
    function fireDrop(b) {
      var detail = {
        tree: treeCfg.id,
        bee: b.id,
        point: { x: b.route.drop.x, y: b.route.drop.y },
        growthRadius: (treeCfg.reactionTrigger && treeCfg.reactionTrigger.growthRadius) || 0.18,
        t: elapsed
      };
      log('pollenDrop(' + b.id + ') @ ' + detail.point.x.toFixed(2) + ',' + detail.point.y.toFixed(2));
      if (typeof opts.onPollenDrop === 'function') { try { opts.onPollenDrop(detail); } catch (e) {} }
      try { global.dispatchEvent(new CustomEvent('a01:pollenDrop', { detail: detail })); } catch (e) {}
      if (opts.el && opts.el.emit) { try { opts.el.emit('pollenDrop', detail, false); } catch (e) {} }
    }

    /* ---------- her karede uygula ---------- */
    function applyTransform(b) {
      b.mesh.position.copy(b.pos);
      var dx = b.pos.x - b.prev.x;
      var dy = b.pos.y - b.prev.y;
      if (Math.abs(dx) > 1e-5) b.dirX = dx > 0 ? 1 : -1;
      var mirror = atlas.facesRight ? b.dirX : -b.dirX;
      b.mesh.scale.set(b.size * mirror, b.size, 1);
      // hafif burun eğimi: dikey hıza göre, aynalamada işaret ters çevrilir
      var tilt = clamp(dy * 6.0, -0.30, 0.30) * (mirror > 0 ? 1 : -1);
      b.mesh.rotation.z = lerp(b.mesh.rotation.z, tilt + b.roll, 0.18);
      setFrame(b);
    }

    /* ------------------------------------------------------------- PUBLIC API */
    var api = {
      object3D: group,

      load: function (onReady, onError) {
        new THREE.TextureLoader().load(
          atlas.src,
          function (t) {
            if ('colorSpace' in t && THREE.SRGBColorSpace) t.colorSpace = THREE.SRGBColorSpace;
            else if ('encoding' in t && THREE.sRGBEncoding) t.encoding = THREE.sRGBEncoding;
            t.premultiplyAlpha = false;      // RGB zaten premultiplied; tekrar çarpma
            t.generateMipmaps = true;
            t.minFilter = THREE.LinearMipmapLinearFilter;
            t.magFilter = THREE.LinearFilter;
            t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
            t.anisotropy = 1;
            baseTexture = t;
            buildBees();
            log('Arı atlası yüklendi: ' + atlas.cols + 'x' + atlas.rows + ' hücre');
            if (onReady) onReady();
          },
          undefined,
          function (e) { log('Arı atlası YÜKLENEMEDİ: ' + atlas.src); if (onError) onError(e); }
        );
      },

      /* targetFound: her şey 0'dan, kalıntı bırakmadan */
      restart: function () {
        elapsed = 0;
        enterFired = false;
        for (var i = 0; i < bees.length; i++) {
          var b = bees[i];
          b.state = 'wait';
          b.timer = b.route.delay || 0;
          b.legIdx = 0; b.legT = 0; b.frameT = 0; b.frame = 0;
          b.emitAcc = 0; b.dropped = false; b.roll = 0; b.dirX = 1;
          b.clip = 'fly';
          b.pos.set(b.route.entry.x, b.route.entry.y, A.zFar);
          b.prev.copy(b.pos);
          b.mesh.visible = false;
          b.mesh.rotation.z = 0;
          setFrame(b);
        }
        if (pollen) pollen.reset();
        group.visible = true;
        active = true;
        log('Arı katmanı sıfırdan başlatıldı (' + bees.length + ' arı)');
      },

      /* targetLost: her şey dursun ve gizlensin, timer birikmesin */
      stop: function () {
        active = false;
        group.visible = false;
        if (pollen) pollen.reset();
      },

      update: function (dt) {
        if (!active || !bees.length) return;
        if (!(dt > 0)) return;
        if (dt > 0.05) dt = 0.05;              // sekme dönüşünde sıçrama olmasın
        elapsed += dt;
        for (var i = 0; i < bees.length; i++) {
          updateBee(bees[i], dt);
          applyTransform(bees[i]);
        }
        if (pollen) pollen.update(dt);
      },

      isReady: function () { return bees.length > 0; },

      dispose: function () {
        for (var i = 0; i < bees.length; i++) {
          bees[i].mesh.geometry.dispose();
          bees[i].mat.dispose();
          bees[i].tex.dispose();
        }
        if (pollen) pollen.dispose();
        if (baseTexture) baseTexture.dispose();
        bees = [];
      }
    };

    return api;
  }

  global.A01BeeLayer = { create: create, version: '1.0' };

})(window);
