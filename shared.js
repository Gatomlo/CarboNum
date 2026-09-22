/* ===================================================================
   Empreinte Numérique — constantes et helpers partagés
   Utilisé par script.js (calculateur) et dashboard.js (statistiques).
   =================================================================== */

(function (global) {
  "use strict";

  // kg CO2e/an, estimation de l'empreinte numérique moyenne d'un habitant
  // de Belgique. Faute d'étude belge dédiée équivalente à l'étude ADEME/
  // Arcep pour la France, ce repère combine : la part du numérique dans
  // les émissions belges (~2 %, Digital Wallonia / Bruxelles Environnement,
  // étude "Numérique et environnement") et l'empreinte carbone moyenne par
  // habitant en Belgique (~8,5 t CO2e/an, territoriale — écoconso/Our World
  // in Data). Ordre de grandeur pédagogique, pas une mesure officielle.
  const REFERENCE_MOYENNE_BE = 170;
  const GAUGE_MAX = 600; // kg CO2e/an, échelle max affichée sur la jauge
  const GAUGE_BANDS = [150, 350, GAUGE_MAX]; // bornes faible / moyen / élevé

  const CATEGORIES = ["smartphone", "tablette", "ordinateur", "objets", "streaming", "ia"];

  const CATEGORY_META = {
    smartphone: { label: "Smartphone", article: "le smartphone", color: "var(--cat-smartphone)" },
    tablette: { label: "Tablette", article: "la tablette", color: "var(--cat-tablette)" },
    ordinateur: { label: "Ordinateur", article: "l'ordinateur", color: "var(--cat-ordinateur)" },
    objets: { label: "Objets connectés", article: "les objets connectés", color: "var(--cat-objets)" },
    streaming: { label: "Streaming", article: "le streaming", color: "var(--cat-streaming)" },
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

  global.EmpreinteShared = {
    REFERENCE_MOYENNE_BE,
    GAUGE_MAX,
    GAUGE_BANDS,
    CATEGORIES,
    CATEGORY_META,
    fmt,
    renderGaugeInto,
  };
})(window);
