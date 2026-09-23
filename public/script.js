/* ===================================================================
   Empreinte Numérique — logique de calcul et interface
   Le calcul s'exécute entièrement côté client. Le résultat (total +
   répartition par usage, avec classe/pseudo si renseignés) est
   transmis automatiquement à l'enseignant·e une fois le calcul
   terminé — voir "Transmission automatique du résultat" plus bas.
   =================================================================== */

(function () {
  "use strict";

  const { REFERENCE_MOYENNE_BE, CATEGORIES, CATEGORY_META, fmt, renderGaugeInto, renderBreakdownInto, renderEquivalencesInto } = window.EmpreinteShared;

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
    console: {
      manufacturing: 150, // kg CO2e, console de jeux fixe (ordre de grandeur)
      usagePerHourDay: 8, // kg CO2e/an par heure/jour de jeu (converti depuis h/semaine)
    },
    tv: {
      manufacturing: 320, // kg CO2e, TV connectée grand écran (ordre de grandeur ADEME)
      usagePerHourDay: 5, // kg CO2e/an par heure d'utilisation quotidienne
    },
    streaming: {
      gPerHour: { sd: 30, hd: 70, uhd: 200 },
    },
    visio: {
      gPerHour: 150, // g CO2e/h, appel vidéo bidirectionnel (ordre de grandeur entre HD et 4K)
    },
    ia: {
      gPerTextQuery: 3,
      gPerImage: 20,
    },
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

  document.getElementById("print-btn").addEventListener("click", () => {
    window.print();
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
    ["cs-life", "cs-life-out"],
    ["cs-hours", "cs-hours-out"],
    ["tv-life", "tv-life-out"],
    ["tv-hours", "tv-hours-out"],
    ["st-hours", "st-hours-out"],
    ["vc-hours", "vc-hours-out"],
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
  bindNoneToggle("cs-none", "cs-fields");
  bindNoneToggle("tv-none", "tv-fields");

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
      console: {
        none: document.getElementById("cs-none").checked,
        life: parseFloat(document.getElementById("cs-life").value),
        hoursWeek: parseFloat(document.getElementById("cs-hours").value),
      },
      tv: {
        none: document.getElementById("tv-none").checked,
        life: parseFloat(document.getElementById("tv-life").value),
        hours: parseFloat(document.getElementById("tv-hours").value),
      },
      streaming: {
        hoursWeek: parseFloat(document.getElementById("st-hours").value),
        quality,
      },
      visio: {
        hoursWeek: parseFloat(document.getElementById("vc-hours").value),
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

    const consoleKg = data.console.none
      ? 0
      : FACTORS.console.manufacturing / data.console.life +
        FACTORS.console.usagePerHourDay * (data.console.hoursWeek / 7);

    const tvKg = data.tv.none
      ? 0
      : FACTORS.tv.manufacturing / data.tv.life + FACTORS.tv.usagePerHourDay * data.tv.hours;

    result.consoleTv = consoleKg + tvKg;

    result.streaming =
      (data.streaming.hoursWeek * 52 * FACTORS.streaming.gPerHour[data.streaming.quality]) / 1000;

    result.visio = (data.visio.hoursWeek * 52 * FACTORS.visio.gPerHour) / 1000;

    result.ia =
      (data.ia.textPerDay * 365 * FACTORS.ia.gPerTextQuery + data.ia.imgPerWeek * 52 * FACTORS.ia.gPerImage) /
      1000;

    result.total =
      result.smartphone +
      result.tablette +
      result.ordinateur +
      result.objets +
      result.consoleTv +
      result.streaming +
      result.visio +
      result.ia;

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
    renderBreakdownInto(document.getElementById("breakdown-chart"), result);
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
    consoleTv:
      "Ta console de jeux et/ou ta TV connectée dominent ton empreinte : ce sont des appareils lourds à fabriquer. Les garder plus longtemps (plutôt que de changer de modèle à chaque nouvelle génération) est le levier le plus efficace.",
    streaming:
      "Le streaming vidéo domine ton empreinte. Regarder en HD plutôt qu'en 4K quand ce n'est pas nécessaire (petit écran, mobile) peut diviser cet impact par 2 à 3.",
    visio:
      "La visioconférence domine ton empreinte. Couper sa caméra quand ce n'est pas nécessaire, ou baisser la résolution, réduit sensiblement l'impact de chaque appel.",
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

    document.getElementById("result-total").textContent = fmt(result.total, 0);

    const printIdentityParts = [];
    if (CLASSE) printIdentityParts.push(`Classe ${CLASSE}`);
    if (ELEVE) printIdentityParts.push(`Pseudo ${ELEVE}`);
    document.getElementById("print-identity").textContent = printIdentityParts.length
      ? printIdentityParts.join(" — ")
      : "";

    const diffPct = ((result.total - REFERENCE_MOYENNE_BE) / REFERENCE_MOYENNE_BE) * 100;
    const contextEl = document.getElementById("result-context");
    if (Math.abs(diffPct) < 3) {
      contextEl.textContent = "C'est très proche du profil de référence (usage numérique moyen sur ces mêmes catégories, ~229 kg CO2e/an).";
    } else if (diffPct < 0) {
      contextEl.textContent = `Soit environ ${fmt(Math.abs(diffPct), 0)} % de moins que le profil de référence (usage numérique moyen sur ces mêmes catégories, ~229 kg CO2e/an).`;
    } else {
      contextEl.textContent = `Soit environ ${fmt(diffPct, 0)} % de plus que le profil de référence (usage numérique moyen sur ces mêmes catégories, ~229 kg CO2e/an).`;
    }

    renderGauge(result.total);
    renderBreakdown(result);
    renderTips(result);

    renderEquivalencesInto(
      {
        avionKm: document.getElementById("eq-avion-km"),
        avionSub: document.getElementById("eq-avion-sub"),
        voitureKm: document.getElementById("eq-voiture-km"),
        voitureSub: document.getElementById("eq-voiture-sub"),
        bouteilles: document.getElementById("eq-bouteilles"),
        bouteillesSub: document.getElementById("eq-bouteilles-sub"),
        foret: document.getElementById("eq-foret"),
        foretSub: document.getElementById("eq-foret-sub"),
      },
      result.total
    );

    submitResult(result);
  }

  // -------------------------------------------------------------
  // Transmission automatique du résultat à l'enseignant·e
  // Déclenchée dès que le résultat est calculé, sans action de la
  // part de l'élève. Envoie uniquement le total, la répartition par
  // usage, et la classe/le pseudo s'ils sont renseignés — jamais les
  // réponses détaillées au questionnaire. Ne fonctionne que si le
  // site est servi par le petit serveur Node fourni (server.js) ;
  // échoue avec un message discret sinon (usage autonome du
  // calculateur, ex. GitHub Pages).
  // -------------------------------------------------------------

  const shareStatus = document.getElementById("share-status");

  async function submitResult(result) {
    shareStatus.textContent = "";

    const payload = { total: result.total, classe: CLASSE, eleve: ELEVE };
    CATEGORIES.forEach((c) => {
      payload[c] = result[c];
    });

    try {
      const res = await fetch("api/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("bad status");
      shareStatus.textContent = "✓ Résultat transmis à ton enseignant·e.";
    } catch (e) {
      shareStatus.textContent = "Résultat non transmis : le serveur de classe n'est pas accessible.";
    }
  }

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
