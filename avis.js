/* Encart « Votre avis » : un onglet bien visible sur le bord droit (+ bulle d'invitation), qui ouvre un petit
   formulaire (note de simplicité 1 à 5, idée, contact facultatif). Les avis vont
   dans l'onglet « Avis » du classeur commun via n8n. Rien n'est envoyé sans clic.
   Inclusion : <script src="avis.js" data-page="collecte" defer></script>
               <script src="../avis.js" data-page="meteo" defer></script> */
(function () {
  "use strict";
  var moi = document.currentScript; if (!moi || window.__pavAvis) return; window.__pavAvis = true;
  var PAGE = moi.dataset.page || "autre";
  /* Arrivée depuis le bouton « Votre avis » de l'encart posé sur le site de la mairie :
     le formulaire s'ouvre tout seul et l'avis est étiqueté « encart ». */
  var VIA_ENCART = /[?&]avis=/.test(location.search) || location.hash === "#avis";
  if (VIA_ENCART) PAGE = "encart";
  var BASE = new URL(".", moi.src).href;
  var URL_AVIS = "https://n8n.srv1040760.hstgr.cloud/webhook/pav-avis";
  var CLE = "pav-avis-envoye";
  /* data-commune force la commune (ex. « Console ») ; sinon on lit le config.json de la commune. */
  var commune = moi.dataset.commune || "";
  if (!commune) fetch(BASE + "config.json", { cache: "no-cache" }).then(function (r) { return r.json(); })
    .then(function (c) { commune = (c.commune && (c.commune.nom || c.commune)) || ""; }).catch(function () {});
  function lire(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function ecrire(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  var dejaEnvoye = Number(lire(CLE)) > Date.now() - 30 * 864e5;

  var css = document.createElement("style");
  css.textContent =
    ".pav-avis-tab{position:fixed;right:0;top:50%;z-index:45;transform:translateY(-50%);writing-mode:vertical-rl;"
    + "background:#E08A00;color:#fff;border:0;border-radius:16px 0 0 16px;padding:22px 13px;font:700 17px/1 system-ui,sans-serif;letter-spacing:.03em;"
    + "box-shadow:-4px 4px 18px rgba(0,0,0,.28);cursor:pointer;animation:pavAvisPulse 2.2s ease-in-out 3}"
    + ".pav-avis-tab .ic{writing-mode:horizontal-tb;font-size:24px;margin-bottom:8px;display:block}"
    + ".pav-avis-tab:hover,.pav-avis-tab:focus{background:#C77700;padding-right:17px}"
    + ".pav-avis-tab.discret{background:#1F3A2E;padding:16px 10px;font-size:14px;animation:none}"
    + ".pav-avis-tab.discret .ic{font-size:19px}"
    + ".pav-avis-tab{touch-action:none;-webkit-user-select:none;user-select:none;-webkit-touch-callout:none}"
    + ".pav-avis-tab.mini{padding:12px 7px;font-size:0;letter-spacing:0;border-radius:12px 0 0 12px;opacity:.85}.pav-avis-tab.mini .ic{font-size:20px;margin:0}"
    + ".pav-avis-tab.glisse{opacity:.7;transition:none;animation:none}"
    + ".pav-avis .reduire{display:block;margin:10px auto 0;background:none;border:0;color:#5d6a66;font:13px system-ui,sans-serif;text-decoration:underline;cursor:pointer}"
    + "@keyframes pavAvisPulse{0%,100%{box-shadow:-4px 4px 18px rgba(0,0,0,.28)}50%{box-shadow:-4px 4px 18px rgba(0,0,0,.28),0 0 0 10px rgba(224,138,0,.28)}}"
    + ".pav-avis-bulle{position:fixed;right:62px;top:50%;transform:translateY(-50%);z-index:45;background:#fff;color:#1A1F1C;border:2px solid #E08A00;border-radius:14px;"
    + "padding:12px 14px;max-width:220px;font:600 15px/1.35 system-ui,sans-serif;box-shadow:0 6px 22px rgba(0,0,0,.2);cursor:pointer;transition:opacity .4s}"
    + ".pav-avis-bulle:after{content:'';position:absolute;right:-9px;top:50%;margin-top:-8px;border:8px solid transparent;border-right:0;border-left-color:#E08A00}"
    + ".pav-avis-bulle small{display:block;font-weight:400;color:#5d6a66;font-size:13px;margin-top:3px}"
    + "@media(max-width:600px){.pav-avis-tab{padding:18px 11px;font-size:16px}.pav-avis-bulle{right:56px;max-width:180px;font-size:14px}}"
    + ".pav-avis-fond{position:fixed;inset:0;z-index:80;background:rgba(0,0,0,.35);display:flex;align-items:flex-end;justify-content:center;padding:12px}"
    + "@media(min-width:600px){.pav-avis-fond{align-items:center}}"
    + ".pav-avis{background:#fff;color:#1A1F1C;width:100%;max-width:360px;border-radius:14px;padding:16px 16px 14px;box-shadow:0 10px 40px rgba(0,0,0,.3);font:15px/1.4 system-ui,sans-serif;"
    + "margin-bottom:env(safe-area-inset-bottom,0px)}"
    + ".pav-avis h3{margin:0 0 4px;font-size:1.05rem}.pav-avis p{margin:0 0 10px;color:#5d6a66;font-size:.86rem}"
    + ".pav-avis label{display:block;font-weight:600;font-size:.86rem;margin:10px 0 4px}"
    + ".pav-avis .etoiles{display:flex;gap:4px}.pav-avis .etoiles button{border:0;background:none;font-size:28px;line-height:1;color:#cfd5cf;cursor:pointer;padding:2px}"
    + ".pav-avis .etoiles button.on{color:#E08A00}"
    + ".pav-avis .etoiles.coeurs button{font-size:32px}.pav-avis .etoiles.coeurs button.on{color:#D6334A}"
    + ".pav-avis textarea,.pav-avis input{width:100%;box-sizing:border-box;border:1px solid #D8DCD7;border-radius:9px;padding:9px 10px;font:inherit;font-size:16px}"
    + ".pav-avis textarea{min-height:84px;resize:vertical}"
    + ".pav-avis .piege{position:absolute;left:-9999px;width:1px;height:1px;opacity:0}"
    + ".pav-avis .act{display:flex;gap:8px;margin-top:12px}.pav-avis .act button{flex:1;border-radius:10px;padding:10px;font:600 15px system-ui,sans-serif;cursor:pointer}"
    + ".pav-avis .ok{background:#1F3A2E;color:#fff;border:0}.pav-avis .non{background:#fff;color:#1A1F1C;border:1px solid #D8DCD7}"
    + ".pav-avis .msg{font-size:.84rem;margin-top:8px;min-height:1.2em}";
  document.head.appendChild(css);

  var tab = document.createElement("button");
  tab.type = "button"; tab.className = "pav-avis-tab" + (dejaEnvoye ? " discret" : "");
  tab.innerHTML = '<span class="ic" aria-hidden="true">💡</span>' + (dejaEnvoye ? "Votre avis" : "Donnez votre avis");
  tab.setAttribute("aria-label", "Donner votre avis ou une idée");
  tab.title = "Glisser vers le haut ou le bas pour déplacer · vers la droite pour réduire";
  document.body.appendChild(tab);
  /* L'onglet se déplace (glisser vers le haut / le bas) et se réduit (glisser vers la droite ;
     vers la gauche pour l'agrandir). Position et taille sont mémorisées sur l'appareil. */
  var CLE_POS = "pav-avis-pos", CLE_MINI = "pav-avis-mini";
  function placer(fr) { fr = Math.min(.92, Math.max(.08, fr)); tab.style.top = (fr * 100) + "%"; return fr; }
  function reduire(oui) { tab.classList.toggle("mini", !!oui); ecrire(CLE_MINI, oui ? "1" : "0"); }
  if (Number(lire(CLE_POS)) > 0) placer(Number(lire(CLE_POS)));
  if (lire(CLE_MINI) === "1") tab.classList.add("mini");
  var gl = null, glisseA = 0;
  tab.addEventListener("pointerdown", function (e) { gl = { x: e.clientX, y: e.clientY, mode: "" }; try { tab.setPointerCapture(e.pointerId); } catch (er) {} });
  tab.addEventListener("pointermove", function (e) {
    if (!gl) return; var dx = e.clientX - gl.x, dy = e.clientY - gl.y;
    if (!gl.mode) { if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) gl.mode = "v"; else if (Math.abs(dx) > 25) gl.mode = "h"; }
    if (gl.mode === "v") { tab.classList.add("glisse"); gl.fr = placer(e.clientY / window.innerHeight); var bu = document.querySelector(".pav-avis-bulle"); if (bu) bu.remove(); }
  });
  function fin(e) {
    if (!gl) return; var dx = e.clientX - gl.x;
    if (gl.mode === "v") { ecrire(CLE_POS, String(gl.fr)); glisseA = Date.now(); }
    else if (gl.mode === "h") { reduire(dx > 0); glisseA = Date.now(); }
    tab.classList.remove("glisse"); gl = null;
  }
  tab.addEventListener("pointerup", fin);
  tab.addEventListener("pointercancel", function () { tab.classList.remove("glisse"); gl = null; });
  tab.addEventListener("click", function (e) { if (Date.now() - glisseA < 500) { e.stopImmediatePropagation(); e.preventDefault(); } }, true);

  /* Bulle d'invitation : au plus une fois par jour, jamais après un envoi récent. */
  var CLE_BULLE = "pav-avis-bulle";
  if (!VIA_ENCART && !dejaEnvoye && !(Number(lire(CLE_BULLE)) > Date.now() - 864e5)) {
    setTimeout(function () {
      if (document.querySelector(".pav-avis-fond")) return;
      var b = document.createElement("div"); b.className = "pav-avis-bulle"; b.setAttribute("role", "status");
      b.innerHTML = "Une idée pour améliorer ?<small>30 secondes, c'est anonyme.</small>";
      if (tab.style.top) b.style.top = tab.style.top; if (tab.classList.contains("mini")) b.style.right = "44px";
      document.body.appendChild(b); ecrire(CLE_BULLE, String(Date.now()));
      b.addEventListener("click", function () { b.remove(); ouvrir(); });
      tab.addEventListener("click", function () { b.remove(); });
      setTimeout(function () { b.style.opacity = "0"; setTimeout(function () { b.remove(); }, 450); }, 9000);
    }, 2500);
  }

  /* Critères notés selon la page (3 au plus, tous facultatifs). */
  var CRIT = {
    collecte: [["simplicite", "Simplicité d'utilisation"], ["fiabilite", "Fiabilité (photos bien envoyées, pas de bug)"], ["rapidite", "Rapidité (temps passé par point)"]],
    console: [["simplicite", "Simplicité d'utilisation"], ["fiabilite", "Fiabilité"]],
    defaut: [["clarte", "Clarté de la page"], ["utilite", "Utilité"], ["justesse", "Justesse (les notes correspondent à ce qu'on voit sur place)"]]
  };
  /* Premier critère : l'appréciation globale du système, notée avec des cœurs. */
  var CRITERES = [["global", "Votre note globale du système", 1]].concat(CRIT[PAGE] || CRIT.defaut);
  var notes = {};
  function ouvrir() {
    var fond = document.createElement("div"); fond.className = "pav-avis-fond";
    fond.innerHTML = '<form class="pav-avis" role="dialog" aria-modal="true" aria-labelledby="pav-avis-t">'
      + '<h3 id="pav-avis-t">Votre avis nous aide</h3>'
      + '<p>' + ({ collecte: "L'application de relevé est-elle simple à utiliser ?", encart: "L'encart sur le site de la commune est-il clair et utile ?", integrer: "Ces explications pour intégrer l'encart sont-elles simples à suivre ?", console: "La console est-elle simple à utiliser ?" }[PAGE] || "Cette page est-elle claire et utile ?") + '</p>'
      + CRITERES.map(function (c) {
        return '<label>' + c[1] + '</label><div class="etoiles' + (c[2] ? ' coeurs' : '') + '" role="radiogroup" data-c="' + c[0] + '" aria-label="' + c[1] + ' : note de 1 à 5">'
          + [1, 2, 3, 4, 5].map(function (i) { return '<button type="button" data-n="' + i + '" role="radio" aria-checked="false" aria-label="' + i + ' sur 5">' + (c[2] ? '♥' : '★') + '</button>'; }).join("") + '</div>';
      }).join("")
      + '<label for="pav-avis-idee">Une idée, une remarque ? <span style="font-weight:400;color:#5d6a66">(facultatif)</span></label>'
      + '<textarea id="pav-avis-idee" maxlength="1500" placeholder="Ce qui vous a gêné, ce qui manque, ce qui vous plaît…"></textarea>'
      + '<label for="pav-avis-contact">Pour une réponse <span style="font-weight:400;color:#5d6a66">(facultatif)</span></label>'
      + '<input id="pav-avis-contact" maxlength="120" placeholder="E-mail ou téléphone" autocomplete="email">'
      + '<input class="piege" name="site_web" tabindex="-1" autocomplete="off" aria-hidden="true">'
      + '<div class="msg" aria-live="polite"></div>'
      + '<div class="act"><button type="button" class="non">Fermer</button><button type="submit" class="ok">Envoyer</button></div>'
      + '<button type="button" class="reduire">' + (tab.classList.contains("mini") ? "Agrandir l\'onglet 💡" : "Réduire l\'onglet 💡 (on peut aussi le glisser)") + '</button></form>';
    document.body.appendChild(fond);
    var f = fond.querySelector("form"), m = fond.querySelector(".msg");
    function fermer() { fond.remove(); tab.focus(); }
    fond.querySelector(".reduire").addEventListener("click", function () { reduire(!tab.classList.contains("mini")); fermer(); });
    fond.addEventListener("click", function (e) { if (e.target === fond) fermer(); });
    fond.querySelector(".non").addEventListener("click", fermer);
    document.addEventListener("keydown", function esc(e) { if (e.key === "Escape" && document.body.contains(fond)) { fermer(); document.removeEventListener("keydown", esc); } });
    notes = {};
    fond.querySelectorAll(".etoiles button").forEach(function (b) {
      b.addEventListener("click", function () {
        var g = b.closest(".etoiles"), n = Number(b.dataset.n);
        notes[g.dataset.c] = n;
        g.querySelectorAll("button").forEach(function (x) { var on = Number(x.dataset.n) <= n; x.classList.toggle("on", on); x.setAttribute("aria-checked", String(Number(x.dataset.n) === n)); });
      });
    });
    f.addEventListener("submit", function (e) {
      e.preventDefault();
      var idee = fond.querySelector("#pav-avis-idee").value.trim();
      var note = notes[CRITERES[0][0]] || 0;
      if (!Object.keys(notes).length && !idee) { m.style.color = "#B3261E"; m.textContent = "Choisissez une note ou écrivez une idée."; return; }
      var ok = f.querySelector(".ok"); ok.disabled = true; m.style.color = "#5d6a66"; m.textContent = "Envoi…";
      fetch(URL_AVIS, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
        page: PAGE, commune: commune, note: note || "", notes: JSON.stringify(notes), idee: idee, contact: fond.querySelector("#pav-avis-contact").value.trim(),
        site_web: f.querySelector(".piege").value, appareil: (navigator.userAgent || "").slice(0, 120) }) })
        .then(function (r) { return r.json().catch(function () { return { ok: r.ok }; }); })
        .then(function (j) {
          if (!j.ok) throw new Error(j.motif || "Envoi impossible pour le moment.");
          ecrire(CLE, String(Date.now())); tab.classList.add("discret"); tab.innerHTML = '<span class="ic" aria-hidden="true">💡</span>Votre avis';
          f.innerHTML = '<h3>Merci !</h3><p>Votre avis a bien été transmis à l\'équipe du projet.</p><div class="act"><button type="button" class="ok">Fermer</button></div>';
          f.querySelector(".ok").addEventListener("click", fermer); notes = {};
        })
        .catch(function (er) { ok.disabled = false; m.style.color = "#B3261E"; m.textContent = er.message || "Envoi impossible pour le moment."; });
    });
    var premier = fond.querySelector(".etoiles button"); if (premier) premier.focus();
  }
  tab.addEventListener("click", ouvrir);

  /* Nouvelle version de l'application (version.json, écrit à chaque diffusion) :
     un bandeau propose de mettre à jour. Vérifié chaque minute et au retour sur l'appli. */
  if (PAGE !== "console" && !window.__pavMaj) {
    window.__pavMaj = true;
    var versionVue = null, bandeau = false;
    var lireVersion = function () {
      return fetch(BASE + "version.json?t=" + Date.now(), { cache: "no-store" }).then(function (r) { return r.ok ? r.json() : null; })
        .then(function (j) { return j && j.version ? String(j.version) : null; }).catch(function () { return null; });
    };
    var verifier = function () {
      if (bandeau || document.hidden) return;
      lireVersion().then(function (v) {
        if (!v) return;
        if (versionVue === null) { versionVue = v; return; }
        if (v === versionVue) return;
        bandeau = true;
        var b = document.createElement("div");
        b.setAttribute("role", "alert");
        b.style.cssText = "position:fixed;left:0;right:0;top:0;z-index:95;background:#C9752B;color:#fff;padding:14px 16px;font:700 17px system-ui,sans-serif;box-shadow:0 4px 14px rgba(0,0,0,.25);display:flex;gap:12px;align-items:center;justify-content:center;flex-wrap:wrap;text-align:center";
        b.innerHTML = '🆕 Nouvelle version de l\'application disponible.<button type="button" style="border:0;border-radius:10px;padding:10px 18px;font:800 16px system-ui,sans-serif;background:#fff;color:#1F3A2E;cursor:pointer">Mettre à jour maintenant</button>';
        b.querySelector("button").addEventListener("click", function () {
          var aller = function () { location.replace(location.pathname + "?maj=" + Date.now() + location.hash); };
          try {
            if (navigator.serviceWorker && navigator.serviceWorker.getRegistration) {
              navigator.serviceWorker.getRegistration().then(function (reg) { return reg && reg.update(); }).catch(function () {}).then(aller);
              setTimeout(aller, 2500);
              return;
            }
          } catch (e) {}
          aller();
        });
        document.body.appendChild(b);
      });
    };
    verifier();
    setInterval(verifier, 60 * 1000);
    document.addEventListener("visibilitychange", verifier);
    window.addEventListener("focus", verifier);
  }
  if (VIA_ENCART) setTimeout(ouvrir, 400);
})();
