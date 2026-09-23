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

  const { REFERENCE_MOYENNE_BE, fmt, renderGaugeInto, renderBreakdownInto, renderEquivalencesInto } = window.EmpreinteShared;

  const REFRESH_MS = 10000;

  const classe = new URLSearchParams(window.location.search).get("classe") || "";

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

  document.getElementById("proj-title").textContent = classe ? `Classe ${classe}` : "Toutes les classes";

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
      const url = classe ? `api/stats?classe=${encodeURIComponent(classe)}` : "api/stats";
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
      stats.avg
    );
  }

  let refreshTimer = null;

  function startRefreshLoop() {
    if (refreshTimer) return;
    refresh();
    refreshTimer = setInterval(refresh, REFRESH_MS);
  }

  (async function bootstrap() {
    if (await checkAuth()) {
      showProj();
      startRefreshLoop();
    } else {
      showLogin();
    }
  })();
})();
