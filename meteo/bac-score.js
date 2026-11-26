/* Bac-Score — le calcul, et rien que le calcul.
 *
 * Ce module est la SEULE implémentation de la note. La page détaillée et la
 * vignette l'importent toutes les deux : si le barème change ici, il change
 * aux deux endroits le même jour. Aucune dépendance au DOM, aucun style —
 * de quoi le charger aussi ailleurs (autre commune, autre page) sans rien
 * emporter d'une commune en particulier avec lui.
 *
 * Les données brutes viennent de donnees.json, publié depuis le classeur.
 */

/* ── Le barème ─────────────────────────────────────────────────────────────
   Tout ce qu'une commune peut vouloir régler est ici, sous forme de données.
   Rien de ce qui suit n'est écrit en dur ailleurs : la page d'explication est
   elle-même fabriquée à partir de ces valeurs (voir decrireBareme), de sorte
   qu'un barème modifié ne puisse pas être démenti par le texte qui l'explique.

   Trois critères donnent des points de pénalité, le total donne une lettre.
   Chaque critère est une liste de paliers ordonnés ; le dernier est ouvert
   (seuil null = « et au-delà »).

   Un barème se change à chaud : appliquerBareme(objet) puis on recalcule.
   C'est ce qui permettra d'y adosser un écran de réglage qui montre l'effet
   sur les notes réelles avant d'enregistrer quoi que ce soit. */

export const BAREME_DEFAUT = {
  version: 1,
  lettres: [
    { l:"A", max:1,    lab:"Impeccable",  desc:"rien au sol, conteneurs disponibles" },
    { l:"B", max:3,    lab:"Bon",         desc:"incident isolé ou léger" },
    { l:"C", max:6,    lab:"Moyen",       desc:"dépôts qui reviennent ou saturation partielle" },
    { l:"D", max:9,    lab:"Dégradé",     desc:"dépôts réguliers ou conteneurs souvent pleins" },
    { l:"E", max:null, lab:"Point noir",  desc:"dépôts massifs ou récidive chaque semaine" },
  ],
  /* Déchets posés au sol, comptés en sacs par le classifieur. */
  proprete: {
    libelle: "Propreté au sol",
    paliers: [ {max:0,points:0}, {max:2,points:2}, {max:4,points:4}, {max:null,points:6} ],
    /* Un dépôt constaté sans sac dénombrable (cartons, encombrants) : on ne
       peut pas le classer à zéro, il prend le premier palier non nul. */
    depotSansSac: 2,
    /* Petits détritus épars seulement (mouchoir, papier, emballage isolé) :
       moins qu'un dépôt, mais pas rien. */
    detritus: 1,
  },
  /* Part des conteneurs pleins ou bloqués, de 0 à 1. */
  remplissage: {
    libelle: "Remplissage",
    inaccessible: 4,
    paliers: [ {max:0,points:0}, {max:1/3,points:1}, {max:2/3,points:2}, {max:null,points:4} ],
  },
  /* Nombre de passages avec dépôt au sol dans la fenêtre, le relevé compris.
     seulementSiDepot : la récidive ne s'ajoute que si le relevé du jour montre
     lui-même un dépôt (un îlot propre aujourd'hui est noté sur ce qu'on voit).
     confianceMin : une détection moins sûre que ce seuil ne compte pas comme
     passage avec dépôt (elle reste notée en propreté le jour même). */
  recidive: {
    libelle: "Récidive",
    fenetreJours: 30,
    paliers: [ {max:0,points:0}, {max:1,points:1}, {max:3,points:2}, {max:null,points:4} ],
    seulementSiDepot: true,
    confianceMin: 0.6,
  },
  /* Plusieurs photos du même dépôt prises coup sur coup sont UN passage :
     sinon le score récompenserait la parcimonie en photos. */
  passage: { minutes: 20 },
  /* Comment on remonte du flux à l'îlot, puis de l'îlot à la commune. */
  agregation: { ilot: "max", commune: "moyenne" },
};

/* Présentation : attachée à la lettre, pas réglable par la commune. */
const STYLE_LETTRE = {
  A:{var:"--sA",fill:.12}, B:{var:"--sB",fill:.32}, C:{var:"--sC",fill:.56},
  D:{var:"--sD",fill:.8},  E:{var:"--sE",fill:1},
};
const STYLE_SECOURS = [.12,.32,.56,.8,1];

const nombre = (v,d) => Number.isFinite(Number(v)) ? Number(v) : d;
const positif = (v,d) => { const n=nombre(v,NaN); return Number.isFinite(n)&&n>=0 ? n : d; };

/* Un escalier valide : seuils strictement croissants, dernier palier ouvert,
   points positifs. Tout ce qui ne l'est pas est écarté ; si rien ne survit on
   reprend la valeur par défaut, car une note sans barème n'a aucun sens. */
function paliersValides(brut, defaut, problemes, ou) {
  if (!Array.isArray(brut) || !brut.length) { if (brut !== undefined) problemes.push(ou+" : liste de paliers absente ou vide"); return defaut; }
  const out = [];
  let precedent = -Infinity;
  for (const p of brut) {
    const ouvert = p && (p.max === null || p.max === undefined || p.max === "");
    const seuil = ouvert ? null : nombre(p && p.max, NaN);
    const pts = positif(p && p.points, NaN);
    if (!Number.isFinite(pts)) { problemes.push(ou+" : un palier sans points chiffrés a été ignoré"); continue; }
    if (!ouvert && (!Number.isFinite(seuil) || seuil <= precedent)) { problemes.push(ou+" : seuil « "+(p&&p.max)+" » hors d'ordre, palier ignoré"); continue; }
    out.push({ max: ouvert ? null : seuil, points: pts });
    if (ouvert) break;                       // rien après le palier ouvert
    precedent = seuil;
  }
  if (!out.length) { problemes.push(ou+" : aucun palier exploitable, barème par défaut repris"); return defaut; }
  if (out[out.length-1].max !== null) {      // toujours finir par un palier ouvert
    problemes.push(ou+" : dernier palier fermé, il a été ouvert");
    out[out.length-1] = { max: null, points: out[out.length-1].points };
  }
  return out;
}

function lettresValides(brut, problemes) {
  if (!Array.isArray(brut) || brut.length < 2) { if (brut !== undefined) problemes.push("lettres : il en faut au moins deux, échelle par défaut reprise"); return BAREME_DEFAUT.lettres.map(x=>({...x})); }
  const out = []; let precedent = -Infinity;
  brut.forEach((x,i) => {
    const l = String(x && x.l || "").trim().slice(0,2);
    const dernier = i === brut.length - 1;
    const ouvert = dernier || x.max === null || x.max === undefined || x.max === "";
    const seuil = ouvert ? null : nombre(x.max, NaN);
    if (!l) { problemes.push("lettres : une entrée sans lettre a été ignorée"); return; }
    if (!ouvert && (!Number.isFinite(seuil) || seuil <= precedent)) { problemes.push("lettres : seuil de « "+l+" » hors d'ordre, entrée ignorée"); return; }
    out.push({ l, max: ouvert ? null : seuil, lab: String(x.lab || l), desc: String(x.desc || "") });
    if (!ouvert) precedent = seuil;
  });
  if (out.length < 2) { problemes.push("lettres : échelle inexploitable, échelle par défaut reprise"); return BAREME_DEFAUT.lettres.map(x=>({...x})); }
  out[out.length-1].max = null;              // la dernière lettre absorbe le reste
  return out;
}

/* Rend un barème utilisable à partir de n'importe quoi : la page publique ne
   doit jamais tomber en panne parce qu'un réglage est aberrant. */
export function normaliserBareme(brut) {
  const problemes = [];
  const b = (brut && typeof brut === "object") ? brut : {};
  const D = BAREME_DEFAUT;
  const choixAgreg = (v, permis, d) => permis.includes(v) ? v : d;
  const out = {
    version: nombre(b.version, 1),
    lettres: lettresValides(b.lettres, problemes),
    proprete: {
      libelle: String((b.proprete && b.proprete.libelle) || D.proprete.libelle),
      paliers: paliersValides(b.proprete && b.proprete.paliers, D.proprete.paliers, problemes, "propreté"),
      depotSansSac: positif(b.proprete && b.proprete.depotSansSac, D.proprete.depotSansSac),
      detritus: positif(b.proprete && b.proprete.detritus, D.proprete.detritus),
    },
    remplissage: {
      libelle: String((b.remplissage && b.remplissage.libelle) || D.remplissage.libelle),
      inaccessible: positif(b.remplissage && b.remplissage.inaccessible, D.remplissage.inaccessible),
      paliers: paliersValides(b.remplissage && b.remplissage.paliers, D.remplissage.paliers, problemes, "remplissage"),
    },
    recidive: {
      libelle: String((b.recidive && b.recidive.libelle) || D.recidive.libelle),
      fenetreJours: Math.max(1, Math.round(positif(b.recidive && b.recidive.fenetreJours, D.recidive.fenetreJours))),
      paliers: paliersValides(b.recidive && b.recidive.paliers, D.recidive.paliers, problemes, "récidive"),
      seulementSiDepot: !(b.recidive && (b.recidive.seulementSiDepot === false || b.recidive.seulementSiDepot === "non")),
      confianceMin: Math.min(1, positif(b.recidive && b.recidive.confianceMin, D.recidive.confianceMin)),
    },
    passage: { minutes: Math.max(0, positif(b.passage && b.passage.minutes, D.passage.minutes)) },
    agregation: {
      ilot: choixAgreg(b.agregation && b.agregation.ilot, ["max","moyenne"], D.agregation.ilot),
      commune: choixAgreg(b.agregation && b.agregation.commune, ["moyenne","max"], D.agregation.commune),
    },
  };
  out.problemes = problemes;
  return out;
}

/* Le barème actif. LETTRES est modifié sur place : les pages l'ont importé une
   fois et doivent voir le changement sans se recharger. */
let B = normaliserBareme(BAREME_DEFAUT);
export const LETTRES = [];
export let FENETRE_PASSAGE = 0;

export function appliquerBareme(brut) {
  if (brut && Array.isArray(brut.versions) && brut.versions.length) {
    HISTO = brut.versions.map(preparerVersion).sort((a, b) => a.t - b.t);
    brut = versionA(Date.now()).B;
  } else HISTO = [];
  B = normaliserBareme(brut === undefined ? BAREME_DEFAUT : brut);
  LETTRES.length = 0;
  B.lettres.forEach((x,i) => {
    const st = STYLE_LETTRE[x.l] || { var:"--s"+x.l, fill: STYLE_SECOURS[Math.min(i,4)] };
    LETTRES.push({ l:x.l, max: x.max === null ? Infinity : x.max, lab:x.lab, desc:x.desc, var:st.var, fill:st.fill });
  });
  FENETRE_PASSAGE = B.passage.minutes * 60000;
  return B;
}
export const bareme = () => B;

/* ── Versions datées du barème ─────────────────────────────────────────────
   bareme.json peut porter une liste « versions », chacune avec sa date
   d'entrée en vigueur (« depuis », AAAA-MM-JJ). Un relevé est noté avec la
   version en vigueur le jour de la photo : changer de barème ne réécrit pas
   les notes déjà publiées. Sans liste, il n'y a qu'une version. */
let HISTO = [];
let LCOUR = LETTRES;
const debutJour = d => { const t = new Date(String(d) + "T00:00:00").getTime(); return Number.isFinite(t) ? t : -Infinity; };
function preparerVersion(brut, i) {
  const b = normaliserBareme(brut);
  const L = b.lettres.map((x, k) => {
    const st = STYLE_LETTRE[x.l] || { var:"--s"+x.l, fill: STYLE_SECOURS[Math.min(k,4)] };
    return { l:x.l, max: x.max === null ? Infinity : x.max, lab:x.lab, desc:x.desc, var:st.var, fill:st.fill };
  });
  return {
    t: brut && brut.depuis ? debutJour(brut.depuis) : -Infinity,
    depuis: String((brut && brut.depuis) || ""), id: String((brut && brut.id) || ("v" + (i + 1))),
    nom: String((brut && brut.nom) || ""), origine: String((brut && brut.origine) || ""),
    B: b, L, fenetre: b.passage.minutes * 60000,
  };
}
/* La version en vigueur à une date ; avant la première, la plus ancienne. */
function versionA(ts) {
  if (!HISTO.length) return null;
  const t = new Date(ts).getTime();
  let v = HISTO[0];
  for (const h of HISTO) if (h.t <= t) v = h;
  return v;
}
/* Exécute un calcul avec le barème en vigueur à cette date-là. */
function sous(ts, fn) {
  const h = versionA(ts);
  if (!h) return fn();
  const b0 = B, l0 = LCOUR, f0 = FENETRE_PASSAGE;
  B = h.B; LCOUR = h.L; FENETRE_PASSAGE = h.fenetre;
  try { return fn(); } finally { B = b0; LCOUR = l0; FENETRE_PASSAGE = f0; }
}
const infoVersion = h => h ? { id: h.id, nom: h.nom, depuis: h.depuis, origine: h.origine } : null;
export const versionDu = ts => infoVersion(versionA(ts));
export const versionsBareme = () => HISTO.map(infoVersion);

/* Le total maximum atteignable : sert d'échelle aux barres de la page. */
export const maxPoints = () =>
  [B.proprete, B.remplissage, B.recidive].reduce((a,c) =>
    a + Math.max(...c.paliers.map(p=>p.points), c === B.remplissage ? B.remplissage.inaccessible : 0), 0);

const pointsPalier = (paliers, valeur) => {
  for (const p of paliers) if (p.max === null || valeur <= p.max) return p.points;
  return paliers[paliers.length-1].points;
};
const indexPalier = (paliers, valeur) => {
  for (let i=0;i<paliers.length;i++) if (paliers[i].max === null || valeur <= paliers[i].max) return i;
  return paliers.length-1;
};

export const FLUX_LABEL={verre:"Verre",ordures_menageres:"Ordures ménagères",emballages:"Emballages",
  papier:"Papier",carton:"Carton",textile:"Textile",biodechets:"Biodéchets"};
export const CAUSE_LABEL={incivilite:"Incivilité",inadequation:"Inadéquation du dispositif",saturation:"Saturation"};
export const ORDRE_FLUX={verre:0,ordures_menageres:1,emballages:2,papier:3,carton:4,biodechets:5,textile:6};

/* ── Les trois critères, lus dans le barème actif ─────────────────────── */
export function lettre(pts){ return LCOUR.find(x=>pts<=x.max) || LCOUR[LCOUR.length-1]; }

export function ptsProprete(sacs,depot,detritus){
  if(!depot && sacs===0) return B.proprete.paliers[0].points;
  if(detritus && sacs===0) return B.proprete.detritus;
  /* Dépôt constaté sans sac dénombrable : un carton, un encombrant. Zéro
     serait faux, et le compter comme un sac serait arbitraire. */
  if(sacs===0) return B.proprete.depotSansSac;
  return pointsPalier(B.proprete.paliers,sacs);
}
export function ptsRemplissage(o,ref){
  if(o.inaccessible) return B.remplissage.inaccessible;
  if(!ref.n||o.vues===0) return B.remplissage.paliers[0].points;
  return pointsPalier(B.remplissage.paliers,taux(o,ref));
}
export function ptsRecidive(n){ return pointsPalier(B.recidive.paliers,n); }
/* La récidive appliquée à un relevé : rien si le relevé du jour est propre
   (réglage seulementSiDepot, actif par défaut). */
export function ptsRecidiveReleve(o,n){ return (B.recidive.seulementSiDepot && !o.depotSol) ? 0 : ptsRecidive(n); }

/* Arrondi au dix-millième : un seuil écrit 0,3333 dans bareme.json doit se
   comporter comme le tiers exact, sinon 1 conteneur plein sur 3 basculerait
   d'un palier à l'autre selon l'écriture du fichier. */
const taux=(o,ref)=>Math.round((o.bloquees+o.pleines)/ref.n*10000)/10000;

export function nPassagesAvecDepot(site,flux,tFin,obs){
  const fenetre=B.recidive.fenetreJours*86400000;
  const liste=obs.filter(x=>x.site===site&&x.flux===flux&&x.depotSol
    &&!(x.confiance<B.recidive.confianceMin)
    &&!x.detritus
    &&new Date(x.ts).getTime()<=tFin
    &&new Date(x.ts).getTime()>=tFin-fenetre)
    .sort((a,b)=>new Date(a.ts)-new Date(b.ts));
  let n=0,prec=-Infinity;
  liste.forEach(x=>{const t=new Date(x.ts).getTime(); if(t-prec>FENETRE_PASSAGE) n++; prec=t;});
  return n;
}

/* ── Le barème se raconte lui-même ─────────────────────────────────────────
   La page d'explication était écrite à la main, avec ses seuils recopiés : au
   premier réglage elle aurait menti. Elle est désormais fabriquée d'ici. */
const pct = v => Math.round(v*100)+" %";
function libellesPaliers(paliers, unite, rien){
  return paliers.map((p,i)=>{
    const bas = i===0 ? 0 : paliers[i-1].max+1;
    if(p.max===0) return rien;
    if(p.max===null) return bas+" "+unite+(bas>1?"s":"")+" ou plus";
    if(bas===p.max) return bas+" "+unite;
    return bas+" à "+p.max+" "+unite+"s";
  });
}
function libellesTaux(paliers){
  return paliers.map((p,i)=>{
    if(p.max===0) return "aucun plein";
    if(p.max===null) return "plus de "+pct(paliers[i-1] ? paliers[i-1].max : 0);
    return "jusqu'à "+pct(p.max);
  });
}
export function decrireBareme(){
  const txtPr = libellesPaliers(B.proprete.paliers,"sac","rien au sol");
  const txtRc = libellesPaliers(B.recidive.paliers,"passage","aucun passage");
  const txtRe = libellesTaux(B.remplissage.paliers);
  const itemsRe = B.remplissage.paliers.map((p,i)=>({texte:txtRe[i],points:p.points}));
  /* L'accès bloqué vaut un forfait : on le colle au palier de même poids
     plutôt que d'inventer une colonne de plus. */
  const memePoids = itemsRe.find(it=>it.points===B.remplissage.inaccessible);
  if(memePoids) memePoids.texte += " ou accès bloqué";
  else itemsRe.push({texte:"accès bloqué",points:B.remplissage.inaccessible});

  const critere=(cle,conf,items)=>({cle,libelle:conf.libelle,items,
    max:Math.max(...items.map(i=>i.points))});
  const criteres=[
    critere("pr",B.proprete,B.proprete.paliers.map((p,i)=>({texte:txtPr[i],points:p.points}))
      .concat(B.proprete.detritus!==B.proprete.paliers[0].points?[{texte:"petits détritus épars seulement",points:B.proprete.detritus}]:[])),
    critere("re",B.remplissage,itemsRe),
    critere("rc",{libelle:B.recidive.libelle+" sur "+B.recidive.fenetreJours+" jours"},
            B.recidive.paliers.map((p,i)=>({texte:txtRc[i],points:p.points}))),
  ];
  const max=criteres.reduce((a,c)=>a+c.max,0);
  const echelle=LETTRES.map((x,i)=>({
    l:x.l, lab:x.lab, desc:x.desc, var:x.var,
    bas: i===0 ? 0 : (LETTRES[i-1].max+1),
    haut: Number.isFinite(x.max) ? x.max : null,
  }));
  const derniere=echelle[echelle.length-1];
  return {
    criteres, max, echelle,
    seuilDerniereLettre: derniere.bas,
    derniereLettre: derniere.l,
    premiereLettre: echelle[0].l,
    fenetreJours: B.recidive.fenetreJours,
    recidiveSeulementSiDepot: B.recidive.seulementSiDepot,
    recidiveConfianceMin: B.recidive.confianceMin,
    passageMinutes: B.passage.minutes,
    agregation: {...B.agregation},
    problemes: B.problemes || [],
    versions: versionsBareme(),
    versionActive: versionDu(Date.now()),
  };
}

/* ── Mise en forme des dates (partagée, pour que les deux pages parlent
   la même langue) ───────────────────────────────────────────────────────── */
export function dateFR(iso){const d=new Date(iso);return d.toLocaleDateString('fr-FR',{day:'numeric',month:'long'})+' à '+d.toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'})}
export function jours(iso){return Math.floor((Date.now()-new Date(iso).getTime())/86400000)}

/* ── Données brutes → objets de travail ───────────────────────────────────
   donnees.json est publié depuis le classeur ; on n'y touche pas, on le
   normalise ici (drapeau « test » déduit de l'identifiant de la photo). */
export function normaliser(donnees){
  const REF=(donnees.referentiel||[]).map(r=>({
    site:String(r.site), nom:String(r.nom),
    lat:Number(r.lat), lon:Number(r.lon),
    flux:String(r.flux), nbUnites:Number(r.nbUnites)||0
  }));
  const OBS=(donnees.observations||[]).map(o=>({
    uuid:String(o.uuid), ts:o.ts, site:String(o.site), flux:String(o.flux),
    photo:o.photo||"", inaccessible:!!o.inaccessible,
    vues:Number(o.vues)||0, dessus:Number(o.dessus)||0,
    bloquees:Number(o.bloquees)||0, pleines:Number(o.pleines)||0,
    depotSol:!!o.depotSol, sacs:Number(o.sacs)||0,
    cause:o.cause||"", texte:o.texte||"",
    /* Absente des anciennes données : on la tient pour sûre. */
    confiance:(o.confiance===undefined||o.confiance===null||o.confiance==="")?1:(Number(o.confiance)||0),
    /* Deux drapeaux posés par le classifieur. Ils ne changent rien à la note :
       ils interdisent seulement de publier la photo. Absents du fichier (ancienne
       version des données), ils valent faux. */
    personneVisible:!!o.personneVisible, plaqueLisible:!!o.plaqueLisible,
    /* Signal « Propre » de l'agent (posé par n8n en tête du texte, ou champ propre). */
    agentPropre:!!o.propre||/^Signalé propre par l'agent/.test(String(o.texte||"")),
    /* Petits détritus épars seulement (repère posé par n8n en tête du texte). */
    detritus:/^Détritus épars seulement/.test(String(o.texte||"")),
    /* Signaux de l'agent sur cette photo : champ agent (« plein », « sale »)
       publié par n8n, ou repère en fin de texte. */
    agentPlein:/plein/.test(String(o.agent||""))||/\[agent : plein\]/.test(String(o.texte||"")),
    agentSale:/sale/.test(String(o.agent||""))||/\[agent : sale\]/.test(String(o.texte||"")),
    test:/^(test|cors)-/.test(String(o.uuid))
  }));
  /* Papier et carton : la même colonne « papier-cartonnette » est lue tantôt
     papier, tantôt carton. Si l'îlot n'a que l'un des deux au référentiel, un
     relevé de l'autre est rangé sur celui qui existe. */
  const SOEURS={papier:"carton",carton:"papier"};
  OBS.forEach(o=>{
    const aRef=f=>REF.some(r=>r.site===o.site&&r.flux===f);
    if(SOEURS[o.flux]&&!aRef(o.flux)&&aRef(SOEURS[o.flux])) o.flux=SOEURS[o.flux];
  });
  /* Signaux de l'agent (« Propre », « Sale », « Plein ») : l'humain a vu
     l'îlot, son constat l'emporte sur l'analyse des photos pendant tout le
     passage (photos à moins de la fenêtre de passage, avant ou après).
     Portée selon le cadrage de la photo signalée :
     - vue d'ensemble (plusieurs flux visibles) : Propre / Sale portent sur
       tout l'îlot ;
     - photo d'un seul flux : le signal ne porte que sur ce flux.
     « Plein » vise toujours le flux choisi par l'agent. */
  const fen=(FENETRE_PASSAGE||30*60000);
  const cle=o=>o.uuid||o.photo||o.ts;
  const lignesDe=k=>OBS.filter(o=>cle(o)===k);
  const fluxVus=k=>{ const l=lignesDe(k), v=new Set(l.filter(o=>o.vues>0||o.inaccessible).map(o=>o.flux)); return v.size?v:new Set(l.map(o=>o.flux)); };
  const duPassage=(src,fluxOk)=>{ const t=new Date(src.ts).getTime(); return OBS.filter(o=>o.site===src.site&&Math.abs(new Date(o.ts).getTime()-t)<=fen&&fluxOk(o.flux)); };
  const sources=f=>{ const vu=new Set(); return OBS.filter(o=>f(o)&&!vu.has(cle(o))&&vu.add(cle(o))); };
  // Plein : le flux choisi, sur tout le passage.
  OBS.filter(o=>o.agentPlein).forEach(src=>{
    src.agentPortee="flux";
    duPassage(src,f=>f===src.flux).forEach(o=>{ if(o!==src){ o.pleines=Math.max(o.pleines,1); o.vues=Math.max(o.vues,1); o.pleinEtendu=true; } });
  });
  // Sale : dépôt sur l'îlot (vue d'ensemble) ou sur le flux de la photo.
  sources(o=>o.agentSale).forEach(src=>{
    const fx=fluxVus(cle(src)), global=fx.size>=2;
    lignesDe(cle(src)).forEach(o=>{ o.agentPortee=global?"ilot":"flux"; });
    duPassage(src,f=>global||fx.has(f)).forEach(o=>{ if(!o.depotSol){ o.depotSol=true; o.saleEtendu=true; } });
  });
  // Propre : en dernier, il l'emporte.
  sources(o=>o.agentPropre).forEach(src=>{
    const fx=fluxVus(cle(src)), global=fx.size>=2;
    lignesDe(cle(src)).forEach(o=>{ o.agentPortee=global?"ilot":"flux"; o.agentPropreSource=true; });
    duPassage(src,f=>global||fx.has(f)).forEach(o=>Object.assign(o,{depotSol:false,sacs:0,pleines:0,bloquees:0,dessus:0,inaccessible:false,cause:"",agentPropre:true,saleEtendu:false,pleinEtendu:false}));
  });
  return {REF,OBS,commune:donnees.commune||"",departement:donnees.departement||"",maj:donnees.maj||null};
}

/* ── Lecture d'un couple îlot × flux ──────────────────────────────────────
   Sans nb_unites au référentiel, on se rabat sur le maximum déjà observé :
   c'est provisoire, sous-estimé, et la page doit le dire. */
export function unitesRef(REF,site,flux,obs){
  const r=REF.find(x=>x.site===site&&x.flux===flux);
  if(r&&r.nbUnites>0) return {n:r.nbUnites,provisoire:false};
  const maxVu=Math.max(0,...obs.filter(o=>o.site===site&&o.flux===flux).map(o=>o.vues));
  return {n:maxVu,provisoire:true};
}
/* Les niveaux 0-3 servent la météo (l'icône), pas la note. On les déduit du
   rang du palier atteint : un barème à plus de quatre paliers reste lisible,
   on plafonne simplement à l'icône la plus sombre. */
const rangDepuisPoints=(paliers,pts)=>{
  const i=paliers.findIndex(p=>p.points>=pts);
  return Math.min(3, i<0?paliers.length-1:i);
};
export function niveauProprete(o){
  return rangDepuisPoints(B.proprete.paliers, ptsProprete(o.sacs,o.depotSol,o.detritus));
}
export function niveauRemplissage(o,ref){
  if(o.inaccessible) return {n:rangDepuisPoints(B.remplissage.paliers,B.remplissage.inaccessible),txt:"accès bloqué"};
  if(o.vues===0) return {n:null,txt:"aucune unité visible"};
  if(!ref.n) return {n:null,txt:"nombre de conteneurs inconnu"};
  const occupe=o.bloquees+o.pleines;
  const n = Math.min(3, indexPalier(B.remplissage.paliers, taux(o,ref)));
  /* Conteneurs du poste absents des photos : rien ne dit qu'ils sont pleins,
     ils comptent comme disponibles. On le dit, pour ne pas laisser croire
     qu'on les a vus. */
  const nonVus=Math.max(0,ref.n-o.vues);
  return {n,txt:occupe+" sur "+ref.n+" conteneur"+(ref.n>1?"s":"")+" plein ou bloqué"+(occupe>1?"s":"")+(ref.provisoire?" (effectif provisoire)":"")
    +(nonVus&&!ref.provisoire?" · "+nonVus+" non photographié"+(nonVus>1?"s":"")+", compté"+(nonVus>1?"s":"")+" disponible"+(nonVus>1?"s":""):"")};
}

/* ── Un passage = toutes ses photos ────────────────────────────────────────
   Plusieurs photos prises coup sur coup forment UN passage. Pour un flux, la
   note du passage tient compte de toutes ces photos, pas de la dernière seule :
   on garde le pire constat (conteneurs pleins ou bloqués, sacs au sol), un
   dépôt vu sur une photo reste vu, et un signal de l'agent (« Plein »,
   « Sale ») n'est pas effacé par une photo prise juste après sans signal.
   Le reste (photo, texte, heure) vient de la photo la plus récente. */
export function fusionPassage(liste){
  if(liste.length<2) return liste[0];
  const tri=liste.slice().sort((a,b)=>new Date(b.ts)-new Date(a.ts));
  const f={...tri[0]}, max=k=>Math.max(...tri.map(o=>Number(o[k])||0));
  f.vues=max("vues"); f.dessus=max("dessus"); f.bloquees=max("bloquees"); f.pleines=max("pleines");
  f.sacs=max("sacs"); f.depotSol=tri.some(o=>o.depotSol); f.inaccessible=tri.some(o=>o.inaccessible);
  const pire=tri.slice().sort((a,b)=>(b.sacs-a.sacs)||((b.depotSol?1:0)-(a.depotSol?1:0)))[0];
  if(f.depotSol&&!tri[0].depotSol){ f.cause=pire.cause||f.cause; }
  f.confiance=Math.max(...tri.filter(o=>o.depotSol===f.depotSol).map(o=>o.confiance));
  f.nPhotos=tri.length; f.agentPropre=tri.some(o=>o.agentPropre);
  f.detritus=f.depotSol&&f.sacs===0&&tri.filter(o=>o.depotSol).every(o=>o.detritus);
  return f;
}
/* Les photos d'un flux qui appartiennent au même passage que le relevé o :
   on remonte les photos de l'îlot (tous flux) tant qu'elles se suivent à moins
   de FENETRE_PASSAGE d'intervalle. */
function photosDuPassage(o,obs){
  const site=obs.filter(x=>x.site===o.site&&new Date(x.ts)<=new Date(o.ts)).sort((a,b)=>new Date(b.ts)-new Date(a.ts));
  let debut=new Date(o.ts).getTime(), prec=debut;
  for(const x of site){ const t=new Date(x.ts).getTime(); if(prec-t>FENETRE_PASSAGE) break; debut=t; prec=t; }
  return site.filter(x=>x.flux===o.flux&&new Date(x.ts).getTime()>=debut);
}

/* ── État courant de chaque îlot ──────────────────────────────────────────
   Le dernier relevé de chaque flux ; l'îlot retient le flux le plus dégradé. */
export function calcule(REF,obs){
  const parSite={};
  REF.forEach(r=>{
    if(!parSite[r.site]) parSite[r.site]={site:r.site,nom:r.nom,lat:r.lat,lon:r.lon,flux:[],dernier:null,niveau:null};
  });
  const couples=new Set();
  REF.forEach(r=>couples.add(r.site+"|"+r.flux));
  obs.forEach(o=>couples.add(o.site+"|"+o.flux));
  [...couples].forEach(k=>{
    const [site,flux]=k.split("|");
    if(!parSite[site]) return;
    const liste=obs.filter(o=>o.site===site&&o.flux===flux).sort((a,b)=>new Date(b.ts)-new Date(a.ts));
    const o=liste[0] && fusionPassage(photosDuPassage(liste[0],obs));
    const horsRef=!REF.some(r=>r.site===site&&r.flux===flux);
    if(!o){parSite[site].flux.push({flux,niveau:null,horsRef,detail:"aucun relevé"});return}
    const ref=unitesRef(REF,site,flux,obs);
    if(o.vues===0 && !o.inaccessible){
      parSite[site].flux.push({flux,niveau:null,nonVisible:true,horsRef,detail:"conteneur non repéré sur la photo du "+dateFR(o.ts),ts:o.ts,test:o.test,
        photo:o.photo||"", publiable:!!o.photo && !o.personneVisible && !o.plaqueLisible, texte:o.texte||""});
      if(!parSite[site].dernier||new Date(o.ts)>new Date(parSite[site].dernier)) parSite[site].dernier=o.ts;
      return;
    }
    /* Ce relevé est noté avec le barème en vigueur le jour de sa photo. */
    const h0=versionA(o.ts), b0=B, l0=LCOUR, f0=FENETRE_PASSAGE;
    if(h0){B=h0.B; LCOUR=h0.L; FENETRE_PASSAGE=h0.fenetre;}
    const p=niveauProprete(o), rm=niveauRemplissage(o,ref);
    const niveau=Math.max(p, rm.n==null?0:rm.n);
    const nRecid=nPassagesAvecDepot(site,flux,new Date(o.ts).getTime(),obs);
    const sc={pr:ptsProprete(o.sacs,o.depotSol,o.detritus),re:ptsRemplissage(o,ref),rc:ptsRecidiveReleve(o,nRecid),nRecid};
    sc.total=sc.pr+sc.re+sc.rc; sc.L=lettre(sc.total);
    const bouts=[];
    bouts.push(o.sacs>0?o.sacs+" sac"+(o.sacs>1?"s":"")+" au sol":o.depotSol?(o.detritus?"petits détritus épars":"dépôt au sol"):"rien au sol");
    bouts.push(rm.txt);
    if(o.cause) bouts.push((CAUSE_LABEL[o.cause]||o.cause).toLowerCase());
    if(o.nPhotos>1) bouts.push(o.nPhotos+" photos de ce passage");
    if(o.agentPropre) bouts.push("signalé propre par l'agent");
    if(nRecid>1) bouts.push(nRecid+" passages avec dépôt sur "+B.recidive.fenetreJours+" j"+(sc.rc===0&&!o.depotSol&&B.recidive.seulementSiDepot?" (sans pénalité : rien au sol aujourd'hui)":""));
    B=b0; LCOUR=l0; FENETRE_PASSAGE=f0;
    /* Remplissage du poste pour la jauge du site : pleins ou bloqués sur
       l'effectif connu ; les conteneurs non photographiés comptent disponibles. */
    const rempl=ref.n&&!ref.provisoire&&!(o.vues===0&&!o.inaccessible)
      ? {occ:o.inaccessible?ref.n:Math.min(ref.n,(o.bloquees||0)+(o.pleines||0)),tot:ref.n} : null;
    parSite[site].flux.push({flux,niveau,horsRef,sc,rempl,bar:infoVersion(h0),detail:bouts.join(" · "),ts:o.ts,test:o.test,
      photo:o.photo||"", publiable:!!o.photo && !o.personneVisible && !o.plaqueLisible, texte:o.texte||""});
    if(!parSite[site].dernier||new Date(o.ts)>new Date(parSite[site].dernier)) parSite[site].dernier=o.ts;
  });
  /* Du flux à l'îlot : par défaut l'îlot retient son flux le plus dégradé —
     un point dont le verre déborde n'est pas « à moitié propre ». Une commune
     peut préférer la moyenne ; c'est un réglage, pas une vérité. */
  const pire=l=>B.agregation.ilot==="moyenne"
    ? Math.round(l.reduce((a,b)=>a+b,0)/l.length) : Math.max(...l);
  Object.values(parSite).forEach(s=>{
    const n=s.flux.filter(f=>f.niveau!==null).map(f=>f.niveau);
    s.niveau=n.length?pire(n):null;
    const scs=s.flux.filter(f=>f.sc).map(f=>f.sc.total);
    s.pts=scs.length?pire(scs):null;
    s.L=s.pts===null?null:sous(s.flux.filter(f=>f.sc).map(f=>f.ts).sort().pop(),()=>lettre(s.pts));
    /* La note de l'îlot est la moyenne des notes de ses photos du dernier jour
       de relevé : celles que montrent les miniatures, chacune avec sa note. */
    const mp=moyennePhotos(REF,obs,obs.filter(o=>o.site===s.site&&o.photo),true);
    if(mp){ s.pts=mp.pts; s.L=sous(mp.ts,()=>lettre(mp.pts)); s.nPhotos=mp.n; s.ptsMoyen=mp.moy; s.plancherAgent=mp.plancher; }
    s.flux.sort((a,b)=>(ORDRE_FLUX[a.flux]??9)-(ORDRE_FLUX[b.flux]??9));
    /* Jauge de remplissage du site : tous flux confondus. */
    const rs=s.flux.filter(f=>f.rempl), tot=rs.reduce((a,f)=>a+f.rempl.tot,0), occ=rs.reduce((a,f)=>a+f.rempl.occ,0);
    s.remplissage=tot?{occ,tot,taux:occ/tot,pleinFlux:rs.filter(f=>f.rempl.occ>=f.rempl.tot).map(f=>f.flux)}:null;
  });
  return Object.values(parSite).sort((a,b)=>a.site.localeCompare(b.site));
}

/* Moyenne des notes des photos d'une liste de relevés (arrondie à l'entier,
   comme la lettre). dernierJour : ne garder que le dernier jour de relevé. */
const jourParis=t=>new Date(t).toLocaleDateString("sv-SE",{timeZone:"Europe/Paris"});
function moyennePhotos(REF,obs,liste,dernierJour){
  let l=liste.filter(o=>o.photo);
  if(!l.length) return null;
  if(dernierJour){ const j=l.map(o=>jourParis(o.ts)).sort().pop(); l=l.filter(o=>jourParis(o.ts)===j); }
  const ids=[...new Set(l.map(o=>o.photo))];
  const notes=ids.map(id=>{ const n=notePhoto(REF,obs,id); if(n) n.agent=l.some(o=>o.photo===id&&(o.agentPlein||o.agentSale)); return n; }).filter(Boolean);
  if(!notes.length) return null;
  const moy=notes.reduce((a,n)=>a+n.pts,0)/notes.length;
  /* Un « Plein » ou un « Sale » de l'agent n'est pas noyé dans la moyenne :
     la note d'une photo signalée par l'agent est un minimum. */
  const plancher=Math.max(0,...notes.filter(n=>n.agent).map(n=>n.pts));
  return {pts:Math.max(Math.round(moy),plancher),moy:Math.round(moy*10)/10,plancher,n:notes.length,ts:l.map(o=>o.ts).sort().pop()};
}

/* ── Note d'une photo seule ───────────────────────────────────────────────
   Les miniatures montrent la note de CHAQUE photo (ce qu'elle montre à elle
   seule), à côté de celle du passage. Même barème que le relevé : version en
   vigueur ce jour-là, flux remontés à la photo comme à l'îlot (max ou moyenne). */
export function notePhoto(REF,obs,photoId){
  const lignes=obs.filter(o=>o.photo===photoId); if(!lignes.length) return null;
  return sous(lignes[0].ts,()=>{
    const scores=lignes.filter(o=>!(o.vues===0&&!o.inaccessible)).map(o=>{
      const ref=unitesRef(REF,o.site,o.flux,obs);
      const n=nPassagesAvecDepot(o.site,o.flux,new Date(o.ts).getTime(),obs);
      const sc={flux:o.flux,pr:ptsProprete(o.sacs,o.depotSol,o.detritus),re:ptsRemplissage(o,ref),rc:ptsRecidiveReleve(o,n)};
      sc.total=sc.pr+sc.re+sc.rc; return sc;
    });
    if(!scores.length) return null;
    const v=scores.map(x=>x.total);
    const pts=B.agregation.ilot==="moyenne"?Math.round(v.reduce((a,b)=>a+b,0)/v.length):Math.max(...v);
    return {pts,L:lettre(pts),flux:scores};
  });
}

/* ── Historique : un carré par passage ────────────────────────────────────
   Un « passage » regroupe les photos prises au même endroit à quelques
   minutes d'intervalle. Sa note est celle du flux le plus dégradé, calculée
   avec les données connues à cette date-là : la récidive ne compte que le
   passé, de sorte qu'un carré déjà affiché ne change plus. */
export function passagesParSite(REF,obs){
  const sites={};
  REF.forEach(r=>{if(!sites[r.site]) sites[r.site]={site:r.site,nom:r.nom,lots:[]}});
  const parSite={};
  obs.forEach(o=>{(parSite[o.site]=parSite[o.site]||[]).push(o)});
  Object.keys(sites).forEach(code=>{
    const liste=(parSite[code]||[]).slice().sort((a,b)=>new Date(a.ts)-new Date(b.ts));
    const lots=[];
    liste.forEach(o=>{
      const d=lots[lots.length-1];
      if(d && new Date(o.ts)-new Date(d.fin)<=FENETRE_PASSAGE){d.obs.push(o); d.fin=o.ts;}
      else lots.push({obs:[o],fin:o.ts});
    });
    lots.forEach(lot=>{
      const parFlux={};
      const groupes={};
      lot.obs.forEach(o=>{(groupes[o.flux]=groupes[o.flux]||[]).push(o)});
      Object.keys(groupes).forEach(fl=>{parFlux[fl]=fusionPassage(groupes[fl])});
      let pts=null,pire=null,depot=false,crit=null;
      Object.values(parFlux).forEach(o=>{
        if(o.depotSol) depot=true;
        if(o.vues===0 && !o.inaccessible) return;
        const ref=unitesRef(REF,o.site,o.flux,obs);
        
        // Détail par critère (pr, re, rc) gardé pour les statistiques de la page détaillée.
        const c=sous(o.ts,()=>({pr:ptsProprete(o.sacs,o.depotSol,o.detritus),re:ptsRemplissage(o,ref),rc:ptsRecidiveReleve(o,nPassagesAvecDepot(o.site,o.flux,new Date(o.ts).getTime(),obs))}));
        const total=c.pr+c.re+c.rc;
        if(pts===null||total>pts){pts=total; pire=o; crit=c;}
      });
      const mpl=moyennePhotos(REF,obs,lot.obs,false);
      if(mpl){ pts=mpl.pts; }
      lot.pts=pts; lot.L=pts===null?null:sous((pire||lot.obs[lot.obs.length-1]).ts,()=>lettre(pts)); lot.bar=pire?versionDu(pire.ts):null; lot.depot=depot; lot.crit=crit;
      lot.photo=(pire||lot.obs[0]).photo;
    });
    sites[code].lots=lots;
  });
  return Object.values(sites).sort((a,b)=>a.site.localeCompare(b.site));
}

/* ── Résumé pour la vignette ──────────────────────────────────────────────
   Les relevés de test sont écartés : la vignette est pour les habitants.
   La note de la commune est la moyenne des points des îlots notés ; elle est
   convertie en lettre sur le total arrondi, et le dénominateur (combien de
   points ont été relevés) voyage avec, pour que personne ne prenne une
   moyenne sur 4 points pour une moyenne sur 6. */
export function resume(REF,OBS,meta={}){
  const obs=OBS.filter(o=>!o.test);
  const sites=calcule(REF,obs);
  const notes=sites.filter(s=>s.pts!==null);
  const vals=notes.map(s=>s.pts);
  const moy=!vals.length?null
    : B.agregation.commune==="max" ? Math.max(...vals)
    : vals.reduce((a,b)=>a+b,0)/vals.length;
  const L=moy===null?null:lettre(Math.round(moy));
  return {
    commune:meta.commune||"",
    maj:meta.maj||new Date().toISOString(),
    global:L?{lettre:L.l,lab:L.lab,pts:Math.round(moy*10)/10,notes:notes.length}:null,
    total:sites.length,
    points:sites.map(s=>({code:s.site,nom:s.nom,lettre:s.L?s.L.l:null,lab:s.L?s.L.lab:null,pts:s.pts,dernier:s.dernier})),
    echelle:LETTRES.map(x=>({l:x.l,lab:x.lab,max:Number.isFinite(x.max)?x.max:null}))
  };
}

/* Barème par défaut actif dès l'import : une page qui ne charge pas
   bareme.json calcule quand même, avec les valeurs d'origine. */
appliquerBareme();
