/* =============================================================================
   SIFIR ATIK ORMANI — ESER ÇÖZÜMLEYİCİ (tree-router.js)
   Multi-Tree Engine V1

   TEK SORUMLULUK
   URL'yi okur, eser kodunu doğrular, TREE_CONFIG'ten ilgili yapılandırmayı
   çözer ve hangi durumda olduğumuzu söyler. URL ayrıştırma kodun başka hiçbir
   yerinde tekrarlanmaz; app.js yalnızca burada üretilen sonucu tüketir.

   DÖNEN DURUMLAR
     'landing' — ?t= yok. Sergi karşılama ekranı. AR BAŞLATILMAZ.
     'invalid' — ?t= var ama geçersiz (A99, test, boş...). AR BAŞLATILMAZ.
     'pending' — kod geçerli ama eser henüz üretilmedi. AR BAŞLATILMAZ.
     'active'  — kod geçerli ve eser yayında. AR başlatılır.

   Hiçbir durumda A01'e sessizce geri düşülmez.
   ============================================================================= */

(function (global) {
  'use strict';

  var ID_PATTERN = /^A(0[1-9]|[12][0-9]|30)$/;   // A01..A30, başka hiçbir şey

  function normalize(raw) {
    if (raw == null) return null;
    var s = String(raw).trim().toUpperCase();
    if (!s) return null;
    // "a1", "A1", "1" gibi kısa yazımları A01 biçimine getir
    var m = /^A?(\d{1,2})$/.exec(s);
    if (m) s = 'A' + String(parseInt(m[1], 10)).padStart(2, '0');
    return ID_PATTERN.test(s) ? s : null;
  }

  function readParam(name, search) {
    var q = (search != null) ? search : (global.location ? global.location.search : '');
    try {
      if (global.URLSearchParams) return new global.URLSearchParams(q).get(name);
    } catch (e) {}
    var re = new RegExp('[?&]' + name + '=([^&#]*)');
    var r = re.exec(q || '');
    return r ? decodeURIComponent(r[1].replace(/\+/g, ' ')) : null;
  }

  /**
   * @param {object}  cfgRoot  window.TREE_CONFIG ({meta, shared, trees})
   * @param {string=} search   test için opsiyonel query string
   * @returns {{state,treeId,raw,tree,shared,meta,debug,reason}}
   */
  function resolve(cfgRoot, search) {
    var raw = readParam('t', search);
    var debug = readParam('debug', search) === '1';
    var trees = (cfgRoot && cfgRoot.trees) || {};
    var shared = (cfgRoot && cfgRoot.shared) || {};
    var meta = (cfgRoot && cfgRoot.meta) || {};

    var base = { raw: raw, debug: debug, shared: shared, meta: meta, tree: null, treeId: null };

    if (raw == null || String(raw).trim() === '') {
      return Object.assign(base, { state: 'landing', reason: 'eser kodu verilmedi' });
    }

    var id = normalize(raw);
    if (!id) {
      return Object.assign(base, { state: 'invalid', reason: 'geçersiz eser kodu: ' + raw });
    }

    var tree = trees[id];
    if (!tree) {
      return Object.assign(base, { state: 'invalid', treeId: id, reason: id + ' yapılandırmada yok' });
    }

    if (tree.status !== 'locked' && tree.status !== 'active') {
      return Object.assign(base, { state: 'pending', treeId: id, tree: tree, reason: 'durum: ' + tree.status });
    }

    // Yayında bir eser için zorunlu alanlar gerçekten dolu mu?
    var missing = [];
    if (!tree.target || !tree.target.mindFile) missing.push('target.mindFile');
    if (!tree.treeVideo || !tree.treeVideo.src) missing.push('treeVideo.src');
    if (missing.length) {
      return Object.assign(base, {
        state: 'pending', treeId: id, tree: tree,
        reason: 'eksik zorunlu alan: ' + missing.join(', ')
      });
    }

    return Object.assign(base, { state: 'active', treeId: id, tree: tree, reason: 'yayında' });
  }

  global.A01TreeRouter = {
    version: '1.0',
    resolve: resolve,
    normalize: normalize,
    isValidId: function (s) { return normalize(s) !== null; }
  };

})(window);
