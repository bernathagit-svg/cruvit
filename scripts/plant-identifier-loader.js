/**
 * Loads modules/plant-identifier/plant-identifier.js reliably for local dev and Netlify.
 * Uses fetch + script injection with clear errors when the file is missing.
 */
(function (global) {
  'use strict';

  var VERSION = '20250658';
  var loadPromise = null;

  function scriptUrls() {
    var q = '?v=' + VERSION;
    var rel = 'modules/plant-identifier/plant-identifier.js' + q;
    var base = global.document.baseURI || global.location.href;
    return [
      new URL(rel, base).href,
      new URL('./' + rel, base).href
    ];
  }

  function injectFromCode(code) {
    if (typeof global.PlantIdentifier !== 'undefined') {
      return Promise.resolve(true);
    }
    return new Promise(function (resolve, reject) {
      var blob = new Blob([code], { type: 'application/javascript' });
      var blobUrl = URL.createObjectURL(blob);
      var s = global.document.createElement('script');
      s.dataset.cruvitPi = '1';
      s.src = blobUrl;
      s.onload = function () {
        URL.revokeObjectURL(blobUrl);
        if (typeof global.PlantIdentifier === 'undefined') {
          reject(new Error('Plant identifier script ran but PlantIdentifier is still undefined'));
          return;
        }
        resolve(true);
      };
      s.onerror = function () {
        URL.revokeObjectURL(blobUrl);
        reject(new Error('Failed to execute plant identifier script'));
      };
      global.document.head.appendChild(s);
    });
  }

  function loadPlantIdentifierScript() {
    if (typeof global.PlantIdentifier !== 'undefined') {
      return Promise.resolve(true);
    }
    if (loadPromise) return loadPromise;

    loadPromise = (async function () {
      var errors = [];
      var urls = scriptUrls();
      for (var i = 0; i < urls.length; i++) {
        var url = urls[i];
        try {
          var res = await fetch(url, { cache: 'no-store' });
          if (!res.ok) throw new Error('HTTP ' + res.status);
          var code = await res.text();
          if (!/PlantIdentifier/.test(code)) throw new Error('unexpected file contents');
          await injectFromCode(code);
          return true;
        } catch (err) {
          errors.push(url + ' (' + (err && err.message ? err.message : err) + ')');
        }
      }
      throw new Error(
        'Plant identifier not found. Start the server from the cruvit folder (where index.html lives). Tried: ' +
          errors.join(' | ')
      );
    })();

    return loadPromise;
  }

  global.loadPlantIdentifierScript = loadPlantIdentifierScript;
  global.ensurePlantIdentifierLoaded = loadPlantIdentifierScript;
})(typeof window !== 'undefined' ? window : globalThis);
