/* ===================================================================
   Empreinte Numérique — constantes et helpers partagés
   Utilisé par script.js (calculateur) et dashboard.js (statistiques).
   =================================================================== */

(function (global) {
  "use strict";

  // kg CO2e/an — repère de comparaison affiché sur la jauge.
  //
  // Construit à dessein avec les MÊMES catégories et le MÊME modèle de
  // calcul que ce quiz (voir FACTORS et calculate() dans script.js),
  // plutôt qu'avec une statistique belge externe (part du numérique
  // dans les émissions nationales, etc.) : cette dernière couvre un
  // périmètre bien plus large (usages professionnels, stockage cloud,
  // infrastructures...) que ce que le quiz mesure réellement, ce qui
  // rendait la comparaison trompeuse. Le repère est donc la somme des
  // huit catégories du quiz pour un "profil moyen" plausible :
  //   smartphone (milieu de gamme, 3 ans, 4h/j)      ≈  29,7 kg
  //   tablette (4 ans, 5h/semaine)                    ≈  29,3 kg
  //   ordinateur (portable, 5 ans, 3h/j)               ≈  58,0 kg
  //   objets connectés (1 objet, 4 ans)                ≈   9,0 kg
  //   console & TV (pas de console ; TV 7 ans, 2h/j)   ≈  55,7 kg
  //   streaming vidéo (7h/semaine, HD)                 ≈  25,5 kg
  //   visioconférence (2h/semaine)                     ≈  15,6 kg
  //   IA générative (5 requêtes/j, 1 image/semaine)    ≈   6,5 kg
  //                                                  total ≈ 229 kg CO2e/an
  // Un profil moyen reste une simplification pédagogique (il mélange
  // propriétaires et non-propriétaires de chaque appareil) : ce n'est
  // pas une mesure officielle, mais un point de comparaison cohérent
  // avec ce que le quiz mesure réellement.
  const REFERENCE_MOYENNE_BE = 229;

  // Le détail par catégorie du même profil moyen, pour comparer chaque
  // poste (pas seulement le total) au repère — affiché comme un petit
  // repère sur chaque barre de "Répartition par usage". La somme des
  // huit valeurs ci-dessous fait REFERENCE_MOYENNE_BE (229, arrondi).
  const REFERENCE_BREAKDOWN = {
    smartphone: 29.7,
    tablette: 29.3,
    ordinateur: 58.0,
    objets: 9.0,
    consoleTv: 55.7,
    streaming: 25.5,
    visio: 15.6,
    ia: 6.5,
  };

  const GAUGE_MAX = 600; // kg CO2e/an, échelle max affichée sur la jauge
  const GAUGE_BANDS = [150, 350, GAUGE_MAX]; // bornes faible / moyen / élevé

  const CATEGORIES = ["smartphone", "tablette", "ordinateur", "objets", "consoleTv", "streaming", "visio", "ia"];

  const CATEGORY_META = {
    smartphone: { label: "Smartphone", article: "le smartphone", color: "var(--cat-smartphone)" },
    tablette: { label: "Tablette", article: "la tablette", color: "var(--cat-tablette)" },
    ordinateur: { label: "Ordinateur", article: "l'ordinateur", color: "var(--cat-ordinateur)" },
    objets: { label: "Objets connectés", article: "les objets connectés", color: "var(--cat-objets)" },
    consoleTv: { label: "Console & TV", article: "la console ou la télé connectée", color: "var(--cat-consoleTv)" },
    streaming: { label: "Streaming", article: "le streaming", color: "var(--cat-streaming)" },
    visio: { label: "Visioconférence", article: "la visioconférence", color: "var(--cat-visio)" },
    ia: { label: "IA générative", article: "l'IA générative", color: "var(--cat-ia)" },
  };

  const fmt = (n, decimals = 0) =>
    n.toLocaleString("fr-FR", { maximumFractionDigits: decimals, minimumFractionDigits: decimals });

  // ---- Géométrie de la jauge semi-circulaire (SVG, calculée) ----

  function polarToCartesian(cx, cy, r, angleDeg) {
    const a = (angleDeg * Math.PI) / 180;
    return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
  }

  // angle 180° = extrémité gauche, 360°(=0°) = extrémité droite, passe par le haut (270°)
  function describeArc(cx, cy, r, startAngle, endAngle) {
    const start = polarToCartesian(cx, cy, r, startAngle);
    const end = polarToCartesian(cx, cy, r, endAngle);
    const largeArc = endAngle - startAngle <= 180 ? 0 : 1;
    return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 1 ${end.x} ${end.y}`;
  }

  function angleForValue(v) {
    const p = Math.max(0, Math.min(1, v / GAUGE_MAX));
    return 180 + p * 180;
  }

  // els = { bandGood, bandWarn, bandCrit, needle, refMarker } (éléments DOM, refMarker optionnel)
  function renderGaugeInto(els, value, refValue) {
    const cx = 100;
    const cy = 100;
    const r = 80;

    const bounds = [0, ...GAUGE_BANDS];
    const bandEls = [els.bandGood, els.bandWarn, els.bandCrit];
    const bandColors = ["var(--good)", "var(--warn)", "var(--crit)"];

    bandEls.forEach((el, i) => {
      const a0 = angleForValue(bounds[i]);
      const a1 = angleForValue(bounds[i + 1]);
      el.setAttribute("d", describeArc(cx, cy, r, a0, a1));
      el.style.stroke = bandColors[i];
    });

    const needleAngle = angleForValue(value);
    els.needle.setAttribute("transform", `rotate(${needleAngle - 270} ${cx} ${cy})`);

    if (els.refMarker && typeof refValue === "number") {
      const refAngle = angleForValue(refValue);
      const refOuter = polarToCartesian(cx, cy, r + 11, refAngle);
      const refInner = polarToCartesian(cx, cy, r - 11, refAngle);
      els.refMarker.innerHTML = `<line x1="${refInner.x}" y1="${refInner.y}" x2="${refOuter.x}" y2="${refOuter.y}" stroke="var(--ink-2)" stroke-width="2.5" stroke-linecap="round"/>`;
    }
  }

  // ---- Graphique de répartition par usage (barres horizontales) ----
  // Utilisé par le calculateur (empreinte de l'élève) et le tableau de
  // bord (moyenne de la classe) : mêmes catégories, même repère de
  // comparaison par poste.

  // container = élément DOM ; valuesByCategory = { smartphone: 30, ... }
  // Renvoie les entrées triées par valeur décroissante (la première est
  // la catégorie dominante), pour que l'appelant construise son propre
  // texte ("c'est le streaming qui pèse le plus...").
  function renderBreakdownInto(container, valuesByCategory) {
    container.innerHTML = "";

    const entries = Object.keys(CATEGORY_META)
      .map((key) => ({
        key,
        value: valuesByCategory[key] || 0,
        ref: REFERENCE_BREAKDOWN[key] || 0,
        ...CATEGORY_META[key],
      }))
      .sort((a, b) => b.value - a.value);

    const max = Math.max(...entries.map((e) => Math.max(e.value, e.ref)), 0.0001);

    entries.forEach((e) => {
      const row = document.createElement("div");
      row.className = "bar-row";
      const refPct = Math.min((e.ref / max) * 100, 100);
      row.innerHTML = `
        <div class="bar-row-label"><span class="bar-swatch" style="background:${e.color}"></span>${e.label}</div>
        <div class="bar-track">
          <div class="bar-fill" style="width:${(e.value / max) * 100}%;background:${e.color}"></div>
          <div class="bar-ref-mark" style="left:${refPct}%" title="Profil de référence : ${fmt(e.ref, 0)} kg"></div>
        </div>
        <div class="bar-value">${fmt(e.value, 0)} kg</div>
      `;
      container.appendChild(row);
    });

    return entries;
  }

  global.EmpreinteShared = {
    REFERENCE_MOYENNE_BE,
    REFERENCE_BREAKDOWN,
    GAUGE_MAX,
    GAUGE_BANDS,
    CATEGORIES,
    CATEGORY_META,
    fmt,
    renderGaugeInto,
    renderBreakdownInto,
  };
})(window);
