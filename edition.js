/* Édition d'un îlot par un administrateur terrain : un crayon ✏️ sur chaque îlot.
   - Uniquement dans l'appli de tournée : c'est là que le code est saisi et que le
     rôle « admin » est vérifié par le serveur (la page météo est publique).
   - Le serveur revérifie le code à chaque enregistrement : masquer le crayon n'est
     qu'un confort, pas la sécurité.
   - Écrit via l'action « modifier » du serveur terrain : nom, conteneurs par flux,
     position (garder, GPS du téléphone ou coordonnées saisies).
   Inclusion (appli de tournée) : <script src="edition.js" data-cartes="#round li:not(.vgs)" defer></script> */
(function () {
  "use strict";
  var moi = document.currentScript; if (!moi || window.__pavEdition) return; window.__pavEdition = true;
  var BASE = new URL(".", moi.src).href;
  var SEL = moi.dataset.cartes || "#round li:not(.vgs)";
  var CONF = {}, POINTS = {}, ENVOI = false;

  function lire(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function ecrire(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function code() { return String(lire("pav-code") || "").trim().toUpperCase(); }
  function estAdmin() {
    /* « Mode agent » choisi dans l'appli (bouton en haut) : pas de crayon, même pour un admin. */
if (lire("pav-mode") === "agent") return false;
try { var a = JSON.parse(lire("pav-admin") || "null"); return !!(a && a.admin && a.code === code() && code()); } catch (e) { return false; }
  }
  function esc(t) { return String(t == null ? "" : t).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  var FLUX = { verre: "Verre", ordures_menageres: "Ordures ménagères", emballages: "Emballages", papier: "Papier", carton: "Carton", textile: "Textile", biodechets: "Biodéchets" };
  var USUELS = ["ordures_menageres", "emballages", "verre", "papier", "carton", "textile", "biodechets"];
  function nomFlux(f) { return FLUX[f] || String(f).replace(/_/g, " "); }
  function resume(u) { var k = Object.keys(u); return k.length ? k.map(function (f) { return u[f] + " " + nomFlux(f).toLowerCase(); }).join(" · ") : "aucun conteneur"; }

  function urlTerrain() {
    var d = CONF.depot || {};
    return d.terrain || (d.endpoint ? String(d.endpoint).replace(/pav-photo(\/?)$/, "pav-terrain$1") : null);
  }
  function appeler(action, champs) {
    var url = urlTerrain();
    if (!url) return Promise.reject(new Error("Aucun serveur configuré pour cette commune."));
    var fd = new FormData();
    fd.append("code", code()); fd.append("commune", (CONF.commune && CONF.commune.nom) || ""); fd.append("action", action);
    Object.keys(champs || {}).forEach(function (k) { fd.append(k, champs[k]); });
    return fetch(url, { method: "POST", body: fd }).then(function (r) {
      return r.json().catch(function () { return null; }).then(function (j) {
        if (r.status === 401 || r.status === 403) throw new Error("Code refusé : il faut un code administrateur actif de la commune.");
        if (!r.ok || !j || !j.ok) throw new Error((j && j.motif) || ("Le serveur a répondu " + r.status + " : réessaie plus tard."));
        return j;
      });
    });
  }

  function chargerPoints() {
    var url = new URL((CONF.adresses && CONF.adresses.referentiel) || "meteo/donnees.json", BASE).href;
    return fetch(url + (url.indexOf("?") < 0 ? "?" : "&") + "t=" + Date.now(), { cache: "no-store" }).then(function (r) { return r.json(); }).then(function (d) {
      POINTS = {};
      ((d && d.referentiel) || []).forEach(function (r) {
        var c = String(r.site || "").toUpperCase(); if (!c) return;
        var s = POINTS[c] || (POINTS[c] = { code: c, nom: String(r.nom || c), lat: Number(r.lat), lon: Number(r.lon), u: {} });
        if (r.flux) s.u[r.flux] = (s.u[r.flux] || 0) + Math.max(0, Math.round(Number(r.nbUnites) || 0));
      });
    });
  }

  /* ── Styles ─────────────────────────────────────────────────────────────── */
  var css = document.createElement("style");
  css.textContent =
    ".pav-crayon{position:absolute;top:8px;right:8px;z-index:3;width:38px;height:38px;border-radius:50%;border:1px solid #D8DCD7;background:#fff;"
    + "font-size:18px;line-height:1;cursor:pointer;box-shadow:0 2px 6px rgba(0,0,0,.12);display:flex;align-items:center;justify-content:center}"
    + ".pav-crayon.in{position:static;flex:none;width:34px;height:34px;font-size:16px;margin-left:6px;box-shadow:none}"
    + ".pav-crayon:hover,.pav-crayon:focus{background:#FFF4DF;border-color:#E08A00}"
    + ".pav-ed-porte{position:relative}"
    + ".pav-ed-li{display:flex!important;align-items:center;gap:6px}.pav-ed-li>button[data-code]{flex:1;min-width:0}"
    + ".pav-ed-li>.pav-crayon.in{width:48px!important;min-width:48px;height:48px;padding:0!important;font-size:20px;border-radius:12px;margin:0!important;justify-content:center!important;background:#fff}"
    + ".pav-crayon::after,.pav-crayon::before{display:none!important;content:none!important}"
    + ".pav-ed-fond{position:fixed;inset:0;z-index:90;background:rgba(0,0,0,.4);display:flex;align-items:flex-end;justify-content:center;padding:10px;overflow:auto}"
    + "@media(min-width:600px){.pav-ed-fond{align-items:center}}"
    + ".pav-ed{background:#fff;color:#1A1F1C;width:100%;max-width:420px;border-radius:14px;padding:16px;box-shadow:0 10px 40px rgba(0,0,0,.3);font:15px/1.4 system-ui,sans-serif;max-height:94vh;overflow:auto}"
    + ".pav-ed h3{margin:0 0 2px;font-size:1.1rem}.pav-ed .sous{margin:0 0 10px;color:#5d6a66;font-size:.85rem}"
    + ".pav-ed label.t,.pav-ed .t{display:block;font-weight:600;font-size:.86rem;margin:12px 0 5px}"
    + ".pav-ed input[type=text],.pav-ed input:not([type]),.pav-ed input[inputmode]{width:100%;box-sizing:border-box;border:1px solid #D8DCD7;border-radius:9px;padding:9px 10px;font:inherit;font-size:16px}"
    + ".pav-ed .n{display:flex;align-items:center;gap:8px;padding:4px 0;border-bottom:1px solid #EEF0ED}.pav-ed .n span{flex:1}"
    + ".pav-ed .n button{width:36px;height:36px;border-radius:9px;border:1px solid #D8DCD7;background:#F6F7F5;font-size:20px;cursor:pointer}"
    + ".pav-ed .n b{min-width:22px;text-align:center;font-size:1.05rem}.pav-ed .n.zero span,.pav-ed .n.zero b{color:#9aa39b}"
    + ".pav-ed .r{display:flex;gap:8px;align-items:flex-start;margin:6px 0;font-size:.95rem}.pav-ed .r input{margin-top:3px}"
    + ".pav-ed .c{display:flex;gap:8px;margin-top:6px}.pav-ed .aide{color:#5d6a66;font-size:.8rem;margin:6px 0 0}"
    + ".pav-ed .act{display:flex;gap:8px;margin-top:14px}.pav-ed .act button{flex:1;border-radius:10px;padding:11px;font:600 15px system-ui,sans-serif;cursor:pointer}"
    + ".pav-ed .ok{background:#1F3A2E;color:#fff;border:0}.pav-ed .ok:disabled{opacity:.6}.pav-ed .non{background:#fff;border:1px solid #D8DCD7;color:#1A1F1C}"
    + ".pav-ed .msg{min-height:1.2em;font-size:.86rem;margin-top:8px}.pav-ed .msg.err{color:#B3261E}.pav-ed .msg.bon{color:#2E7D4F}"
    + ".pav-ed-badge{position:fixed;left:10px;bottom:10px;z-index:44;background:#1F3A2E;color:#fff;border-radius:999px;padding:6px 12px;font:600 12px system-ui,sans-serif;opacity:.9}";
  document.head.appendChild(css);

  /* ── Crayons sur les cartes ─────────────────────────────────────────────── */
  function codeDeCarte(el) {
    var b = el.querySelector("[data-code]");
    var c = el.dataset.code || (b && b.dataset.code) || (el.querySelector(".site-code") || {}).textContent || "";
    var m = String(c).toUpperCase().match(/[A-Z0-9]+-\d+/); return m ? m[0] : "";
  }
  function poserCrayons() {
    if (!estAdmin()) return;
    document.querySelectorAll(SEL).forEach(function (el) {
      if (el.querySelector(".pav-crayon")) return;
      var c = codeDeCarte(el); if (!c) return;
      if (getComputedStyle(el).position === "static") el.classList.add("pav-ed-porte");
      var b = document.createElement("button");
      b.type = "button"; b.className = "pav-crayon"; b.textContent = "✏️";
      b.title = "Modifier l'îlot " + c; b.setAttribute("aria-label", "Modifier l'îlot " + c);
      b.addEventListener("click", function (e) { e.preventDefault(); e.stopPropagation(); ouvrir(c); });
      var haut = el.querySelector(".site-top");
      if (haut) { b.classList.add("in"); haut.appendChild(b); }
      else if (el.tagName === "LI") { b.classList.add("in"); el.classList.add("pav-ed-li"); el.appendChild(b); }
      else el.appendChild(b);
    });
  }
  function badge() {
    if (!estAdmin() || document.querySelector(".pav-ed-badge")) return;
    var b = document.createElement("div"); b.className = "pav-ed-badge"; b.textContent = "✏️ Mode administrateur";
    document.body.appendChild(b);
  }

  /* ── Fenêtre d'édition ──────────────────────────────────────────────────── */
  function fenetre(html) {
    var f = document.createElement("div"); f.className = "pav-ed-fond";
    f.innerHTML = '<div class="pav-ed" role="dialog" aria-modal="true">' + html + "</div>";
    document.body.appendChild(f);
    f.addEventListener("click", function (e) { if (e.target === f && !ENVOI) f.remove(); });
    document.addEventListener("keydown", function esc(e) { if (e.key === "Escape" && document.body.contains(f) && !ENVOI) { f.remove(); document.removeEventListener("keydown", esc); } });
    return f;
  }

  function ouvrir(c) {
    var f = fenetre('<h3>Modifier l\'îlot</h3><p class="sous">' + esc(c) + ' · chargement…</p>');
    chargerPoints().catch(function () {}).then(function () {
      var p = POINTS[c];
      if (!p) { f.querySelector(".pav-ed").innerHTML = '<h3>Îlot ' + esc(c) + '</h3><p class="sous">Introuvable dans le référentiel publié.</p><div class="act"><button type="button" class="non">Fermer</button></div>'; f.querySelector(".non").onclick = function () { f.remove(); }; return; }
      formulaire(f, p);
    });
  }

  function formulaire(f, p) {
    var st = { nom: p.nom, u: Object.assign({}, p.u), pos: "carte", lat: "", lon: "" };
    var flux = Object.keys(p.u); USUELS.forEach(function (k) { if (flux.indexOf(k) < 0) flux.push(k); });
    var box = f.querySelector(".pav-ed");
    function dessiner() {
      box.innerHTML = '<h3>Modifier l\'îlot</h3><p class="sous">' + esc(p.code) + ' · actuellement : ' + esc(resume(p.u)) + '</p>'
        + '<label class="t" for="ed-nom">Nom</label><input id="ed-nom" type="text" maxlength="60" value="' + esc(st.nom) + '">'
        + '<span class="t">Conteneurs présents</span>'
        + flux.map(function (k) { var n = st.u[k] || 0; return '<div class="n' + (n ? "" : " zero") + '"><span>' + esc(nomFlux(k)) + '</span>'
          + '<button type="button" data-k="' + esc(k) + '" data-d="-1" aria-label="moins">−</button><b>' + n + '</b>'
          + '<button type="button" data-k="' + esc(k) + '" data-d="1" aria-label="plus">+</button></div>'; }).join("")
        + '<span class="t">Position</span>'
        + '<label class="r"><input type="radio" name="ed-pos" value="carte"' + (st.pos === "carte" ? " checked" : "") + '> Garder la position enregistrée</label>'
        + '<label class="r"><input type="radio" name="ed-pos" value="gps"' + (st.pos === "gps" ? " checked" : "") + '> Ma position actuelle (je suis devant l\'îlot)</label>'
        + '<label class="r"><input type="radio" name="ed-pos" value="saisie"' + (st.pos === "saisie" ? " checked" : "") + '> Saisir des coordonnées</label>'
        + (st.pos === "saisie" ? '<div class="c"><input id="ed-lat" inputmode="decimal" placeholder="Latitude" value="' + esc(st.lat) + '"><input id="ed-lon" inputmode="decimal" placeholder="Longitude" value="' + esc(st.lon) + '"></div>'
          + '<p class="aide">Astuce : sur Google Maps, clic droit sur l\'îlot, puis clic sur les coordonnées pour les copier ; colle-les dans « Latitude ».</p>' : "")
        + (Number.isFinite(p.lat) && p.lat ? '<p class="aide"><a href="https://www.openstreetmap.org/?mlat=' + p.lat + '&amp;mlon=' + p.lon + '#map=19/' + p.lat + '/' + p.lon + '" target="_blank" rel="noopener">Voir la position enregistrée sur la carte</a></p>' : "")
        + '<div class="msg" aria-live="polite"></div>'
        + '<div class="act"><button type="button" class="non">Annuler</button><button type="button" class="ok">Enregistrer</button></div>';
      box.querySelector(".non").onclick = function () { if (!ENVOI) f.remove(); };
      box.querySelector(".ok").onclick = enregistrer;
      box.querySelector("#ed-nom").oninput = function (e) { st.nom = e.target.value; };
      var la = box.querySelector("#ed-lat"), lo = box.querySelector("#ed-lon");
      if (la) la.oninput = function () {
        var m = la.value.match(/^\s*(-?\d+(?:\.\d+)?)\s*[,;]?\s+(-?\d+(?:\.\d+)?)\s*$/) || la.value.match(/^\s*(-?\d+\.\d+)\s*,\s*(-?\d+\.\d+)\s*$/);
        if (m) { st.lat = m[1]; st.lon = m[2]; la.value = m[1]; lo.value = m[2]; } else st.lat = la.value;
      };
      if (lo) lo.oninput = function () { st.lon = lo.value; };
      box.querySelectorAll("input[name=ed-pos]").forEach(function (r) { r.onchange = function () { st.pos = r.value; dessiner(); }; });
      box.querySelectorAll(".n button").forEach(function (b) { b.onclick = function () {
        var k = b.dataset.k; st.u[k] = Math.max(0, Math.min(20, (st.u[k] || 0) + Number(b.dataset.d))); dessiner();
      }; });
    }
    function dire(t, cl) { var m = box.querySelector(".msg"); if (m) { m.textContent = t || ""; m.className = "msg" + (cl ? " " + cl : ""); } }
    function gps() {
      return new Promise(function (ok, ko) {
        if (!navigator.geolocation) return ko(new Error("Cet appareil ne donne pas sa position."));
        navigator.geolocation.getCurrentPosition(function (q) { ok(q.coords); },
          function () { ko(new Error("Position refusée ou introuvable : autorise la localisation, ou saisis les coordonnées.")); },
          { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 });
      });
    }
    function enregistrer() {
      if (ENVOI) return;
      var nom = st.nom.trim(), unites = {};
      Object.keys(st.u).forEach(function (k) { if (st.u[k] > 0) unites[k] = st.u[k]; });
      if (!nom) return dire("Donne un nom à l'îlot.", "err");
      if (!Object.keys(unites).length) return dire("Indique au moins un conteneur.", "err");
      var champs = { site_code: p.code, nom: nom, unites: JSON.stringify(unites) };
      var etape = Promise.resolve();
      if (st.pos === "carte") champs.position = "carte";
      else if (st.pos === "saisie") {
        var lat = Number(String(st.lat).replace(",", ".")), lon = Number(String(st.lon).replace(",", "."));
        if (!isFinite(lat) || !isFinite(lon) || !lat || !lon || Math.abs(lat) > 90 || Math.abs(lon) > 180) return dire("Coordonnées incomplètes : latitude et longitude en degrés décimaux (ex. 45.24439 et 4.84386).", "err");
        champs.lat = lat; champs.lon = lon;
      } else {
        dire("Recherche de ta position…");
        etape = gps().then(function (q) {
          if (q.accuracy > 50) throw new Error("Position trop imprécise (±" + Math.round(q.accuracy) + " m) : attends un meilleur signal.");
          champs.lat = q.latitude; champs.lon = q.longitude; champs.precision_m = Math.round(q.accuracy);
        });
      }
      var ok = box.querySelector(".ok");
      ENVOI = true; ok.disabled = true;
      etape.then(function () {
        var ch = [];
        if (nom !== p.nom) ch.push("nom → " + nom);
        if (resume(unites) !== resume(p.u)) ch.push("conteneurs → " + resume(unites));
        if (champs.position !== "carte") ch.push("nouvelle position");
        if (!ch.length) throw new Error("Rien n'a changé.");
        dire("Enregistrement…");
        return appeler("modifier", champs).then(function (j) {
          p.nom = j.nom || nom; p.u = unites;
          if (champs.lat) { p.lat = Number(champs.lat); p.lon = Number(champs.lon); }
          box.innerHTML = '<h3>Îlot ' + esc(p.code) + ' enregistré</h3><p class="sous">' + esc(ch.join(" · ")) + '</p>'
            + '<p>Le classeur est à jour. La météo et l\'appli de tournée l\'afficheront après la prochaine publication.</p>'
            + '<div class="act"><button type="button" class="ok">Fermer</button></div>';
          box.querySelector(".ok").onclick = function () { f.remove(); };
        });
      }).catch(function (er) { dire(er.message || "Enregistrement impossible.", "err"); ok.disabled = false; })
        .then(function () { ENVOI = false; });
    }
    dessiner();
  }

  fetch(BASE + "config.json", { cache: "no-cache" }).then(function (r) { return r.json(); }).catch(function () { return {}; }).then(function (c) {
    CONF = c || {};
    poserCrayons(); badge();
    var cible = document.querySelector("#round") || document.body;
    new MutationObserver(function () { poserCrayons(); }).observe(cible, { childList: true, subtree: true });
/* Bascule agent / admin depuis l'appli : on retire ou on repose crayons et badge. */
window.addEventListener("pav-mode", function () {
if (estAdmin()) { poserCrayons(); badge(); return; }
document.querySelectorAll(".pav-crayon, .pav-ed-badge").forEach(function (x) { x.remove(); });
document.querySelectorAll(".pav-ed-li").forEach(function (x) { x.classList.remove("pav-ed-li"); });
});
  });
})();
