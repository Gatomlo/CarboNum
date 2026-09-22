/* ===================================================================
   Empreinte Numérique — tableau de bord enseignant
   Affiche les statistiques agrégées et anonymes récupérées via
   l'API du serveur Node (server/). N'a aucun effet en hébergement
   statique (GitHub Pages…) : l'état d'erreur l'explique.
   =================================================================== */

(function () {
  "use strict";

  const { REFERENCE_MOYENNE_FR, CATEGORY_META, fmt, renderGaugeInto } = window.EmpreinteShared;

  const loadingEl = document.getElementById("loading-state");
  const emptyEl = document.getElementById("empty-state");
  const errorEl = document.getElementById("error-state");
  const resultsEl = document.getElementById("results-block");

  function showOnly(el) {
    [loadingEl, emptyEl, errorEl, resultsEl].forEach((e) => {
      e.hidden = e !== el;
    });
  }

  function renderBreakdown(avgByCategory) {
    const container = document.getElementById("dashboard-chart");
    container.innerHTML = "";

    const entries = Object.keys(CATEGORY_META)
      .map((key) => ({ key, value: avgByCategory[key] || 0, ...CATEGORY_META[key] }))
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

    return entries[0];
  }

  async function load() {
    showOnly(loadingEl);
    let stats;
    try {
      const res = await fetch("/api/stats");
      if (!res.ok) throw new Error("bad status");
      stats = await res.json();
    } catch (e) {
      showOnly(errorEl);
      return;
    }

    if (!stats.count) {
      showOnly(emptyEl);
      return;
    }

    document.getElementById("stat-count").textContent = fmt(stats.count, 0);
    document.getElementById("stat-min").textContent = fmt(stats.min, 0);
    document.getElementById("stat-max").textContent = fmt(stats.max, 0);
    document.getElementById("stat-avg").textContent = fmt(stats.avg, 0);

    const diffPct = ((stats.avg - REFERENCE_MOYENNE_FR) / REFERENCE_MOYENNE_FR) * 100;
    const avgContext = document.getElementById("avg-context");
    if (Math.abs(diffPct) < 3) {
      avgContext.textContent = "La moyenne de la classe est très proche de la moyenne numérique d'un habitant en France (~250 kg CO2e/an).";
    } else if (diffPct < 0) {
      avgContext.textContent = `Soit environ ${fmt(Math.abs(diffPct), 0)} % de moins que la moyenne numérique d'un habitant en France (~250 kg CO2e/an).`;
    } else {
      avgContext.textContent = `Soit environ ${fmt(diffPct, 0)} % de plus que la moyenne numérique d'un habitant en France (~250 kg CO2e/an).`;
    }

    renderGaugeInto(
      {
        bandGood: document.getElementById("gauge-band-good"),
        bandWarn: document.getElementById("gauge-band-warn"),
        bandCrit: document.getElementById("gauge-band-crit"),
        needle: document.getElementById("gauge-needle"),
        refMarker: document.getElementById("gauge-ref-marker"),
      },
      stats.avg,
      REFERENCE_MOYENNE_FR
    );

    const top = renderBreakdown(stats.avgByCategory);
    const pctOfAvg = stats.avg > 0 ? (top.value / stats.avg) * 100 : 0;
    document.getElementById("dominant-swatch").style.background = top.color;
    document.getElementById("dominant-text").innerHTML = `En moyenne, c'est <strong>${top.article}</strong> qui pèse le plus dans l'empreinte du groupe (~${fmt(top.value, 0)} kg CO2e/an, soit environ ${fmt(pctOfAvg, 0)} % de l'empreinte moyenne).`;

    showOnly(resultsEl);
  }

  document.getElementById("reset-btn").addEventListener("click", async () => {
    if (!confirm("Supprimer définitivement toutes les données partagées par la classe ?")) return;
    try {
      const res = await fetch("/api/submissions", { method: "DELETE" });
      if (!res.ok) throw new Error("bad status");
      load();
    } catch (e) {
      alert("Impossible de réinitialiser les données (serveur inaccessible).");
    }
  });

  // ---- Thème clair / sombre (identique au calculateur) ----

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

  load();
})();
