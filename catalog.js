// catalog.js — carga dinámica desde Cloudinary
// El array CATALOG se llena vía fetch; usa catalogReady.then() antes de usarlo
var CATALOG = [];
var catalogReady = fetch(
  'https://res.cloudinary.com/dtelhncnm/raw/upload/catalog.json?t=' + Date.now()
)
  .then(function(r) { return r.ok ? r.json() : []; })
  .then(function(data) {
    CATALOG = Array.isArray(data) ? data : [];
    return CATALOG;
  })
  .catch(function() { CATALOG = []; return []; });
