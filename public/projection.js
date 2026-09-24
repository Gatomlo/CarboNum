/* ===================================================================
   Empreinte Numérique — mode projection
   Vue simplifiée des statistiques d'une classe (ou de toutes), sans
   aucun contrôle d'administration, pensée pour être projetée au
   tableau pendant que les élèves répondent. S'actualise automatique-
   ment (pas d'action de l'enseignant·e nécessaire une fois ouverte).
   Protégée par le même mot de passe que le tableau de bord (session
   partagée si ouverte dans le même navigateur) : voir dashboard.js
   pour la logique de connexion, reprise ici à l'identique.
   =================================================================== */

(function () {
  "use strict";

  const { REFERENCE_MOYENNE_BE, fmt, renderGaugeInto, renderBreakdownInto, renderEquivalencesInto, renderQrInto } = window.EmpreinteShared;

  const REFRESH_MS = 10000;

  const classeParam = new URLSearchParams(window.location.search).get("classe") || "";
  const classesList = classeParam
    ? classeParam.split(",").map((s) => s.trim()).filter(Boolean)
    : [];

  const loginStateEl = document.getElementById("login-state");
  const projStateEl = document.getElementById("proj-state");
  const loginForm = document.getElementById("login-form");
  const adminPasswordInput = document.getElementById("admin-password");
  const loginError = document.getElementById("login-error");

  const loadingEl = document.getElementById("proj-loading");
  const errorEl = document.getElementById("proj-error");
  const emptyEl = document.getElementById("proj-empty");
  const contentEl = document.getElementById("proj-content");
  const updatedEl = document.getElementById("proj-updated");

  // ---- Bascule moyenne / total sur les équivalences (avion, voiture,
  // bouteilles, forêt) — même bascule et même préférence (localStorage)
  // que le tableau de bord ; la jauge et la répartition par usage
  // restent "moyenne" (comparées au profil de référence, lui-même une
  // moyenne).

  const equivCardTitle = document.getElementById("equiv-card-title");
  const equivViewAvgBtn = document.getElementById("equiv-view-avg");
  const equivViewTotalBtn = document.getElementById("equiv-view-total");

  let equivView = "avg";
  try {
    const saved = localStorage.getItem("empreinte-equiv-view");
    if (saved === "avg" || saved === "total") equivView = saved;
  } catch (e) {
    /* stockage indisponible : reste sur "avg" */
  }

  let equivStats = null; // { avg, count } de la dernière réponse /api/stats

  function renderEquivCard() {
    if (!equivStats) return;
    const value = equivView === "total" ? equivStats.avg * equivStats.count : equivStats.avg;
    equivCardTitle.textContent =
      equivView === "total"
        ? "Ça représente quoi, au total pour tous les participants sur une année ?"
        : "Ça représente quoi, en moyenne par élève sur une année ?";
    renderEquivalencesInto(
      {
        avionKm: document.getElementById("proj-eq-avion-km"),
        avionSub: document.getElementById("proj-eq-avion-sub"),
        voitureKm: document.getElementById("proj-eq-voiture-km"),
        voitureSub: document.getElementById("proj-eq-voiture-sub"),
        bouteilles: document.getElementById("proj-eq-bouteilles"),
        bouteillesSub: document.getElementById("proj-eq-bouteilles-sub"),
        foret: document.getElementById("proj-eq-foret"),
        foretSub: document.getElementById("proj-eq-foret-sub"),
      },
      value
    );
  }

  function setEquivView(view) {
    equivView = view;
    equivViewAvgBtn.classList.toggle("is-active", view === "avg");
    equivViewTotalBtn.classList.toggle("is-active", view === "total");
    try {
      localStorage.setItem("empreinte-equiv-view", view);
    } catch (e) {
      /* stockage indisponible : pas bloquant */
    }
    renderEquivCard();
  }

  equivViewAvgBtn.classList.toggle("is-active", equivView === "avg");
  equivViewTotalBtn.classList.toggle("is-active", equivView === "total");
  equivViewAvgBtn.addEventListener("click", () => setEquivView("avg"));
  equivViewTotalBtn.addEventListener("click", () => setEquivView("total"));

  document.getElementById("proj-title").textContent =
    classesList.length === 1
      ? `Classe ${classesList[0]}`
      : classesList.length > 1
      ? `${classesList.length} classes sélectionnées`
      : "Toutes les classes";

  function showProj() {
    loginStateEl.hidden = true;
    projStateEl.hidden = false;
  }

  function showLogin() {
    projStateEl.hidden = true;
    loginStateEl.hidden = false;
  }

  async function checkAuth() {
    try {
      const res = await fetch("api/admin/session");
      if (!res.ok) return false;
      return !!(await res.json()).authenticated;
    } catch (e) {
      return false;
    }
  }

  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    loginError.hidden = true;
    const submitBtn = loginForm.querySelector("button[type=submit]");
    submitBtn.disabled = true;

    try {
      const res = await fetch("api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: adminPasswordInput.value }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        loginError.textContent = data.error || "Connexion impossible.";
        loginError.hidden = false;
        return;
      }
      adminPasswordInput.value = "";
      showProj();
      startRefreshLoop();
    } catch (e) {
      loginError.textContent =
        "Impossible de contacter le serveur. Ce mode nécessite que le site soit lancé avec le serveur Node inclus (voir le README).";
      loginError.hidden = false;
    } finally {
      submitBtn.disabled = false;
    }
  });

  async function refresh() {
    let stats;
    try {
      const url = classesList.length ? `api/stats?classes=${classesList.map(encodeURIComponent).join(",")}` : "api/stats";
      const res = await fetch(url);
      if (res.status === 401) {
        showLogin();
        return;
      }
      if (!res.ok) throw new Error("bad status");
      stats = await res.json();
    } catch (e) {
      loadingEl.hidden = true;
      contentEl.hidden = true;
      emptyEl.hidden = true;
      errorEl.hidden = false;
      return;
    }

    loadingEl.hidden = true;
    errorEl.hidden = true;
    updatedEl.textContent = `Actualisé à ${new Date().toLocaleTimeString("fr-BE", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}`;

    if (!stats.count) {
      contentEl.hidden = true;
      emptyEl.hidden = false;
      return;
    }

    emptyEl.hidden = true;
    contentEl.hidden = false;

    document.getElementById("proj-count").textContent = fmt(stats.count, 0);
    document.getElementById("proj-avg").textContent = fmt(stats.avg, 0);
    document.getElementById("proj-min").textContent = fmt(stats.min, 0);
    document.getElementById("proj-max").textContent = fmt(stats.max, 0);

    renderGaugeInto(
      {
        bandGood: document.getElementById("gauge-band-good"),
        bandWarn: document.getElementById("gauge-band-warn"),
        bandCrit: document.getElementById("gauge-band-crit"),
        needle: document.getElementById("gauge-needle"),
        refMarker: document.getElementById("gauge-ref-marker"),
      },
      stats.avg,
      REFERENCE_MOYENNE_BE
    );

    renderBreakdownInto(document.getElementById("proj-chart"), stats.avgByCategory);

    equivStats = { avg: stats.avg, count: stats.count };
    renderEquivCard();
  }

  let refreshTimer = null;

  function startRefreshLoop() {
    if (refreshTimer) return;
    refresh();
    refreshTimer = setInterval(refresh, REFRESH_MS);
  }

  // ---- Surimpression QR code : rejoindre une classe sans interrompre
  // l'affichage projeté. La liste des classes n'est chargée qu'à la
  // première ouverture (pas besoin de la tenir à jour en continu comme
  // les statistiques) ; un nouveau classement se voit au réouverture.

  const qrToggleBtn = document.getElementById("qr-toggle-btn");
  const qrCloseBtn = document.getElementById("qr-close-btn");
  const qrOverlay = document.getElementById("qr-overlay");
  const qrClassSelect = document.getElementById("qr-class-select");
  const qrCode = document.getElementById("qr-overlay-code");
  const qrUrl = document.getElementById("qr-overlay-url");
  const qrHint = document.getElementById("qr-overlay-hint");

  let qrClassesLoaded = false;

  function renderQrFor(classe) {
    if (!classe) {
      qrCode.hidden = true;
      qrUrl.textContent = "";
      qrHint.hidden = false;
      return;
    }
    qrHint.hidden = true;
    const url = new URL("index.html", window.location.href);
    url.searchParams.set("classe", classe);
    renderQrInto(qrCode, url.toString());
    qrUrl.textContent = url.toString();
  }

  async function loadQrClasses() {
    if (qrClassesLoaded) return;
    try {
      const res = await fetch("api/classes");
      if (!res.ok) return;
      const classes = (await res.json()).classes || [];
      qrClassSelect.innerHTML = "";
      const emptyOpt = document.createElement("option");
      emptyOpt.value = "";
      emptyOpt.textContent = "— Choisir une classe —";
      qrClassSelect.appendChild(emptyOpt);
      classes.forEach((c) => {
        const opt = document.createElement("option");
        opt.value = c.classe;
        opt.textContent = c.classe;
        qrClassSelect.appendChild(opt);
      });
      // Pré-sélectionne la classe déjà affichée en projection, si une
      // seule classe précise est projetée (pas "toutes les classes" ni
      // une sélection combinée, ambiguë quant à laquelle choisir).
      if (classesList.length === 1 && classes.some((c) => c.classe === classesList[0])) {
        qrClassSelect.value = classesList[0];
        renderQrFor(classesList[0]);
      }
      qrClassesLoaded = true;
    } catch (e) {
      /* liste indisponible : le menu reste vide, pas bloquant */
    }
  }

  function openQrOverlay() {
    qrOverlay.hidden = false;
    loadQrClasses();
  }

  function closeQrOverlay() {
    qrOverlay.hidden = true;
  }

  qrToggleBtn.addEventListener("click", openQrOverlay);
  qrCloseBtn.addEventListener("click", closeQrOverlay);
  qrOverlay.addEventListener("click", (e) => {
    if (e.target === qrOverlay) closeQrOverlay(); // clic sur le fond, pas sur la carte
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !qrOverlay.hidden) closeQrOverlay();
  });
  qrClassSelect.addEventListener("change", () => {
    renderQrFor(qrClassSelect.value);
  });

  (async function bootstrap() {
    if (await checkAuth()) {
      showProj();
      startRefreshLoop();
    } else {
      showLogin();
    }
  })();
})();
