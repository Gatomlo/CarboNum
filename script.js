/* ===================================================================
   Empreinte Numérique — logique de calcul et interface
   Aucune donnée ne quitte le navigateur : tout est calculé côté client.
   =================================================================== */

(function () {
  "use strict";

  const { REFERENCE_MOYENNE_BE, CATEGORIES, CATEGORY_META, fmt, renderGaugeInto } = window.EmpreinteShared;

  // -------------------------------------------------------------
  // Contexte classe / élève : résolu par paramètre d'URL
  // (ex. index.html?classe=5B&eleve=12), sinon mémorisé dans
  // sessionStorage après une saisie manuelle, sinon demandé via
  // le petit formulaire de l'écran d'accueil.
  // -------------------------------------------------------------

  const urlParams = new URLSearchParams(window.location.search);
  let CLASSE = (urlParams.get("classe") || "").trim().slice(0, 60);
  let ELEVE = (urlParams.get("eleve") || urlParams.get("id") || "").trim().slice(0, 60);

  function readStoredIdentity() {
    try {
      return {
        classe: sessionStorage.getItem("empreinte-classe") || "",
        eleve: sessionStorage.getItem("empreinte-eleve") || "",
      };
    } catch (e) {
      return { classe: "", eleve: "" };
    }
  }

  function storeIdentity(classe, eleve) {
    try {
      sessionStorage.setItem("empreinte-classe", classe);
      sessionStorage.setItem("empreinte-eleve", eleve);
    } catch (e) {
      /* stockage indisponible : pas bloquant */
    }
  }

  if (!CLASSE && !ELEVE) {
    const stored = readStoredIdentity();
    CLASSE = stored.classe;
    ELEVE = stored.eleve;
  }

  const contextBadge = document.getElementById("context-badge");
  const identityForm = document.getElementById("identity-form");
  const identityClasseInput = document.getElementById("identity-classe");
  const identityEleveInput = document.getElementById("identity-eleve");
  const identityError = document.getElementById("identity-error");

  function showBadge() {
    const parts = [];
    if (CLASSE) parts.push(`classe ${CLASSE}`);
    if (ELEVE) parts.push(`pseudo ${ELEVE}`);
    contextBadge.textContent = `Tu réponds pour : ${parts.join(" — ")}`;
    contextBadge.hidden = false;
  }

  if (CLASSE || ELEVE) {
    showBadge();
  } else {
    identityForm.hidden = false;
  }

  // -------------------------------------------------------------
  // Facteurs d'émission (ordres de grandeur pédagogiques)
  // Sources : ADEME (Base Carbone, étude "Évaluation environnementale
  // des impacts du numérique en France", 2022), Arcep, GreenIT.fr,
  // The Shift Project. Voir la section "Méthodologie" de la page.
  // -------------------------------------------------------------

  const FACTORS = {
    smartphone: {
      manufacturing: { entree: 45, milieu: 65, haut: 85 }, // kg CO2e, fabrication
      usagePerHourDay: 2, // kg CO2e/an par heure d'écran quotidienne
    },
    tablette: {
      manufacturing: 110,
      usagePerHourDay: 2.5, // par heure/jour (converti depuis h/semaine)
    },
    ordinateur: {
      manufacturing: { portable: 200, fixe: 300 },
      usagePerHourDay: { portable: 6, fixe: 10 },
    },
    objetConnecte: {
      manufacturingEach: 30,
      usageEach: 1.5, // kg CO2e/an par objet (veille, synchronisation)
    },
    streaming: {
      gPerHour: { sd: 30, hd: 70, uhd: 200 },
    },
    ia: {
      gPerTextQuery: 3,
      gPerImage: 20,
    },
  };

  const EQUIV = {
    avionGParKm: 230, // g CO2e / km-passager, vol moyen-courrier
    voitureGParKm: 193, // g CO2e / km, moyenne du parc automobile
    bouteilleG: 83, // g CO2e / bouteille plastique 0.5L (fabrication)
    foretGParM2: 40000, // g CO2e / m², déforestation (ordre de grandeur GIEC/FAO, 35-50 t/ha)
    refAvionKm: 1090, // Bruxelles - Barcelone, aller simple
    refVoitureKm: 310, // Bruxelles - Paris, aller simple
    refForetM2: 4, // surface d'un tapis de salon, pour donner une échelle
  };

  // -------------------------------------------------------------
  // Navigation entre écrans
  // -------------------------------------------------------------

  const screens = {
    hero: document.getElementById("screen-hero"),
    wizard: document.getElementById("screen-wizard"),
    results: document.getElementById("screen-results"),
  };

  function showScreen(name) {
    Object.values(screens).forEach((s) => s.classList.remove("is-active"));
    screens[name].classList.add("is-active");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  // -------------------------------------------------------------
  // Wizard : étapes
  // -------------------------------------------------------------

  const steps = Array.from(document.querySelectorAll("fieldset.step"));
  let currentStep = 0;

  const progressFill = document.getElementById("progress-fill");
  const progressBar = document.getElementById("progress-bar");
  const stepLabel = document.getElementById("step-label");
  const prevBtn = document.getElementById("prev-btn");
  const nextBtn = document.getElementById("next-btn");

  function renderStep() {
    steps.forEach((s, i) => s.classList.toggle("is-visible", i === currentStep));
    const n = currentStep + 1;
    const total = steps.length;
    progressFill.style.width = (n / total) * 100 + "%";
    progressBar.setAttribute("aria-valuenow", String(n));
    stepLabel.textContent = `Étape ${n} / ${total}`;
    prevBtn.disabled = currentStep === 0;
    prevBtn.style.visibility = currentStep === 0 ? "hidden" : "visible";
    nextBtn.textContent = currentStep === total - 1 ? "Voir mon résultat →" : "Suivant →";
  }

  prevBtn.addEventListener("click", () => {
    if (currentStep > 0) {
      currentStep -= 1;
      renderStep();
    }
  });

  nextBtn.addEventListener("click", () => {
    if (currentStep < steps.length - 1) {
      currentStep += 1;
      renderStep();
    } else {
      computeAndRenderResults();
      showScreen("results");
    }
  });

  document.getElementById("start-btn").addEventListener("click", () => {
    if (!identityForm.hidden) {
      const classeVal = identityClasseInput.value.trim().slice(0, 60);
      const eleveVal = identityEleveInput.value.trim().slice(0, 60);
      if (!classeVal || !eleveVal) {
        identityError.textContent = "Indique le code de ta classe et choisis un pseudo pour continuer.";
        identityError.hidden = false;
        return;
      }
      CLASSE = classeVal;
      ELEVE = eleveVal;
      storeIdentity(CLASSE, ELEVE);
      identityForm.hidden = true;
      identityError.hidden = true;
      showBadge();
    }

    currentStep = 0;
    renderStep();
    showScreen("wizard");
  });

  document.getElementById("restart-btn").addEventListener("click", () => {
    currentStep = 0;
    renderStep();
    showScreen("hero");
  });

  // -------------------------------------------------------------
  // Champs à valeur affichée en direct (range -> output)
  // -------------------------------------------------------------

  function bindRangeOutput(rangeId, outputId) {
    const range = document.getElementById(rangeId);
    const output = document.getElementById(outputId);
    const sync = () => {
      const v = parseFloat(range.value);
      output.textContent = Number.isInteger(v) ? String(v) : v.toFixed(1).replace(/\.0$/, "");
    };
    range.addEventListener("input", sync);
    sync();
  }

  [
    ["sp-life", "sp-life-out"],
    ["sp-hours", "sp-hours-out"],
    ["tb-life", "tb-life-out"],
    ["tb-hours", "tb-hours-out"],
    ["pc-life", "pc-life-out"],
    ["pc-hours", "pc-hours-out"],
    ["obj-count", "obj-count-out"],
    ["obj-life", "obj-life-out"],
    ["st-hours", "st-hours-out"],
    ["ia-text", "ia-text-out"],
    ["ia-img", "ia-img-out"],
  ].forEach(([r, o]) => bindRangeOutput(r, o));

  // -------------------------------------------------------------
  // "Je n'ai pas cet appareil" : désactive les champs du bloc
  // -------------------------------------------------------------

  function bindNoneToggle(checkboxId, fieldsId) {
    const cb = document.getElementById(checkboxId);
    const fields = document.getElementById(fieldsId);
    const sync = () => fields.classList.toggle("is-disabled", cb.checked);
    cb.addEventListener("change", sync);
    sync();
  }

  bindNoneToggle("sp-none", "sp-fields");
  bindNoneToggle("tb-none", "tb-fields");
  bindNoneToggle("pc-none", "pc-fields");

  // -------------------------------------------------------------
  // Calcul de l'empreinte
  // -------------------------------------------------------------

  function readForm() {
    const quality = document.querySelector('input[name="st-quality"]:checked').value;
    return {
      smartphone: {
        none: document.getElementById("sp-none").checked,
        gamme: document.getElementById("sp-gamme").value,
        life: parseFloat(document.getElementById("sp-life").value),
        hours: parseFloat(document.getElementById("sp-hours").value),
      },
      tablette: {
        none: document.getElementById("tb-none").checked,
        life: parseFloat(document.getElementById("tb-life").value),
        hoursWeek: parseFloat(document.getElementById("tb-hours").value),
      },
      ordinateur: {
        none: document.getElementById("pc-none").checked,
        type: document.getElementById("pc-type").value,
        life: parseFloat(document.getElementById("pc-life").value),
        hours: parseFloat(document.getElementById("pc-hours").value),
      },
      objets: {
        count: parseFloat(document.getElementById("obj-count").value),
        life: parseFloat(document.getElementById("obj-life").value),
      },
      streaming: {
        hoursWeek: parseFloat(document.getElementById("st-hours").value),
        quality,
      },
      ia: {
        textPerDay: parseFloat(document.getElementById("ia-text").value),
        imgPerWeek: parseFloat(document.getElementById("ia-img").value),
      },
    };
  }

  function calculate(data) {
    const result = {};

    result.smartphone = data.smartphone.none
      ? 0
      : FACTORS.smartphone.manufacturing[data.smartphone.gamme] / data.smartphone.life +
        FACTORS.smartphone.usagePerHourDay * data.smartphone.hours;

    result.tablette = data.tablette.none
      ? 0
      : FACTORS.tablette.manufacturing / data.tablette.life +
        FACTORS.tablette.usagePerHourDay * (data.tablette.hoursWeek / 7);

    result.ordinateur = data.ordinateur.none
      ? 0
      : FACTORS.ordinateur.manufacturing[data.ordinateur.type] / data.ordinateur.life +
        FACTORS.ordinateur.usagePerHourDay[data.ordinateur.type] * data.ordinateur.hours;

    result.objets =
      (FACTORS.objetConnecte.manufacturingEach * data.objets.count) / data.objets.life +
      FACTORS.objetConnecte.usageEach * data.objets.count;

    result.streaming =
      (data.streaming.hoursWeek * 52 * FACTORS.streaming.gPerHour[data.streaming.quality]) / 1000;

    result.ia =
      (data.ia.textPerDay * 365 * FACTORS.ia.gPerTextQuery + data.ia.imgPerWeek * 52 * FACTORS.ia.gPerImage) /
      1000;

    result.total = result.smartphone + result.tablette + result.ordinateur + result.objets + result.streaming + result.ia;

    return result;
  }

  function renderGauge(total) {
    renderGaugeInto(
      {
        bandGood: document.getElementById("gauge-band-good"),
        bandWarn: document.getElementById("gauge-band-warn"),
        bandCrit: document.getElementById("gauge-band-crit"),
        needle: document.getElementById("gauge-needle"),
        refMarker: document.getElementById("gauge-ref-marker"),
      },
      total,
      REFERENCE_MOYENNE_BE
    );
  }

  // -------------------------------------------------------------
  // Graphique de répartition (barres horizontales)
  // -------------------------------------------------------------

  function renderBreakdown(result) {
    const container = document.getElementById("breakdown-chart");
    container.innerHTML = "";

    const entries = Object.keys(CATEGORY_META)
      .map((key) => ({ key, value: result[key], ...CATEGORY_META[key] }))
      .sort((a, b) => b.value - a.value);

    const max = Math.max(...entries.map((e) => e.value), 0.0001);

    entries.forEach((e) => {
      const row = document.createElement("div");
      row.className = "bar-row";
      row.innerHTML = `
        <div class="bar-row-label"><span class="bar-swatch" style="background:${e.color}"></span>${e.label}</div>
        <div class="bar-track"><div class="bar-fill" style="width:${(e.value / max) * 100}%;background:${e.color}"></div></div>
        <div class="bar-value">${fmt(e.value, 0)} kg</div>
      `;
      container.appendChild(row);
    });
  }

  // -------------------------------------------------------------
  // Conseils dynamiques
  // -------------------------------------------------------------

  const DOMINANT_TIPS = {
    smartphone:
      "Ton smartphone est ton principal poste d'impact. C'est surtout la fabrication qui pèse lourd : le garder plus longtemps (ou choisir du reconditionné) réduit bien plus l'empreinte que changer tes réglages d'usage.",
    tablette:
      "Ta tablette pèse le plus dans ton empreinte. Comme pour le smartphone, l'essentiel vient de sa fabrication : allonger sa durée de vie est le levier le plus efficace.",
    ordinateur:
      "Ton ordinateur domine ton empreinte numérique. Le prolonger de quelques années (nettoyage, changement de batterie ou de disque) a plus d'impact que n'importe quel réglage logiciel.",
    objets:
      "Tes objets connectés cumulés pèsent lourd. Avant d'ajouter un nouvel objet connecté, demande-toi s'il t'est vraiment utile : chaque objet ajoute sa propre fabrication à l'empreinte totale.",
    streaming:
      "Le streaming vidéo domine ton empreinte. Regarder en HD plutôt qu'en 4K quand ce n'est pas nécessaire (petit écran, mobile) peut diviser cet impact par 2 à 3.",
    ia: "Tes usages d'IA générative pèsent particulièrement dans ton empreinte. Réserver l'IA générative aux tâches qui en ont vraiment besoin, plutôt qu'à une simple recherche, réduit sensiblement ton empreinte.",
  };

  const GENERIC_TIPS = [
    "Garde tes appareils le plus longtemps possible : la fabrication représente souvent 70 à 80 % de l'empreinte totale d'un appareil numérique.",
    "Privilégie le reconditionné ou l'occasion pour ton prochain achat.",
    "Répare plutôt que remplacer : batterie, écran et autres pièces peuvent souvent être changés.",
    "Préfère le Wi-Fi à la 4G/5G quand c'est possible, et réduis la qualité de streaming quand elle n'apporte rien.",
  ];

  function renderTips(result) {
    const entries = Object.keys(CATEGORY_META).map((key) => ({ key, value: result[key] }));
    entries.sort((a, b) => b.value - a.value);
    const top = entries[0];

    const tipMain = document.getElementById("tip-main");
    tipMain.textContent = top.value > 0 ? DOMINANT_TIPS[top.key] : "Ajoute des usages pour obtenir un conseil personnalisé.";

    const list = document.getElementById("tip-list");
    list.innerHTML = "";
    GENERIC_TIPS.forEach((t) => {
      const li = document.createElement("li");
      li.textContent = t;
      list.appendChild(li);
    });
  }

  // -------------------------------------------------------------
  // Rendu final des résultats
  // -------------------------------------------------------------

  let lastResult = null;

  function computeAndRenderResults() {
    const data = readForm();
    const result = calculate(data);
    lastResult = result;
    resetShareUI();

    document.getElementById("result-total").textContent = fmt(result.total, 0);

    const diffPct = ((result.total - REFERENCE_MOYENNE_BE) / REFERENCE_MOYENNE_BE) * 100;
    const contextEl = document.getElementById("result-context");
    if (Math.abs(diffPct) < 3) {
      contextEl.textContent = "C'est très proche de la moyenne numérique estimée d'un habitant en Belgique (~170 kg CO2e/an).";
    } else if (diffPct < 0) {
      contextEl.textContent = `Soit environ ${fmt(Math.abs(diffPct), 0)} % de moins que la moyenne numérique estimée d'un habitant en Belgique (~170 kg CO2e/an).`;
    } else {
      contextEl.textContent = `Soit environ ${fmt(diffPct, 0)} % de plus que la moyenne numérique estimée d'un habitant en Belgique (~170 kg CO2e/an).`;
    }

    renderGauge(result.total);
    renderBreakdown(result);
    renderTips(result);

    // équivalences
    const totalG = result.total * 1000;

    const kmAvion = totalG / EQUIV.avionGParKm;
    const kmVoiture = totalG / EQUIV.voitureGParKm;
    const nbBouteilles = totalG / EQUIV.bouteilleG;
    const m2Foret = totalG / EQUIV.foretGParM2;

    document.getElementById("eq-avion-km").textContent = `${fmt(kmAvion, 0)} km`;
    document.getElementById("eq-voiture-km").textContent = `${fmt(kmVoiture, 0)} km`;
    document.getElementById("eq-bouteilles").textContent = fmt(nbBouteilles, 0);
    document.getElementById("eq-foret").textContent = `${fmt(m2Foret, 1)} m²`;

    const avionTrips = kmAvion / (EQUIV.refAvionKm * 2);
    const voitureTrips = kmVoiture / (EQUIV.refVoitureKm * 2);
    const foretTrips = m2Foret / EQUIV.refForetM2;

    document.getElementById("eq-avion-sub").textContent =
      avionTrips >= 0.1
        ? `≈ ${fmt(avionTrips, 1)} aller(s)-retour(s) Bruxelles ↔ Barcelone`
        : "";
    document.getElementById("eq-voiture-sub").textContent =
      voitureTrips >= 0.1
        ? `≈ ${fmt(voitureTrips, 1)} aller(s)-retour(s) Bruxelles ↔ Paris`
        : "";
    document.getElementById("eq-bouteilles-sub").textContent =
      nbBouteilles >= 6 ? `≈ ${fmt(nbBouteilles / 6, 0)} packs de 6 bouteilles` : "";
    document.getElementById("eq-foret-sub").textContent =
      foretTrips >= 0.1 ? `≈ ${fmt(foretTrips, 1)} fois un tapis de salon (4 m²)` : "";
  }

  // -------------------------------------------------------------
  // Partage anonyme vers les statistiques de la classe
  // N'envoie rien tant que l'élève n'a pas cliqué explicitement.
  // Ne fonctionne que si le site est servi par le petit serveur Node
  // fourni (server/) ; échoue silencieusement (avec message) sinon.
  // -------------------------------------------------------------

  const shareBtn = document.getElementById("share-btn");
  const shareStatus = document.getElementById("share-status");

  function resetShareUI() {
    shareBtn.disabled = false;
    shareBtn.textContent = "Partager mon résultat (anonyme)";
    shareStatus.innerHTML = "";
  }

  shareBtn.addEventListener("click", async () => {
    if (!lastResult) return;
    shareBtn.disabled = true;
    shareStatus.textContent = "Envoi…";

    const payload = { total: lastResult.total, classe: CLASSE, eleve: ELEVE };
    CATEGORIES.forEach((c) => {
      payload[c] = lastResult[c];
    });

    try {
      const res = await fetch("/api/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("bad status");
      shareBtn.textContent = "✓ Résultat partagé";
      const dashboardHref = CLASSE ? `dashboard.html?classe=${encodeURIComponent(CLASSE)}` : "dashboard.html";
      shareStatus.innerHTML = `Merci ! Ton résultat anonyme a été ajouté aux statistiques de la classe. <a href="${dashboardHref}">Voir les statistiques →</a>`;
    } catch (e) {
      shareBtn.disabled = false;
      shareStatus.textContent =
        "Impossible de contacter le serveur de la classe. Cette fonctionnalité nécessite que le site soit lancé avec le serveur inclus (voir README).";
    }
  });

  // -------------------------------------------------------------
  // Thème clair / sombre (préférence mémorisée localement)
  // -------------------------------------------------------------

  const themeToggle = document.getElementById("theme-toggle");
  themeToggle.addEventListener("click", () => {
    const root = document.documentElement;
    const current = root.getAttribute("data-theme");
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const isDark = current ? current === "dark" : prefersDark;
    const next = isDark ? "light" : "dark";
    root.setAttribute("data-theme", next);
    try {
      localStorage.setItem("empreinte-theme", next);
    } catch (e) {
      /* stockage indisponible : pas bloquant */
    }
  });

  (function restoreTheme() {
    try {
      const saved = localStorage.getItem("empreinte-theme");
      if (saved) document.documentElement.setAttribute("data-theme", saved);
    } catch (e) {
      /* stockage indisponible : pas bloquant */
    }
  })();

  // -------------------------------------------------------------
  // Init
  // -------------------------------------------------------------

  renderStep();
})();
