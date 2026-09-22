/* ===================================================================
   Empreinte Numérique — tableau de bord enseignant
   Affiche les statistiques agrégées et anonymes récupérées via
   l'API du serveur Node (server/). N'a aucun effet en hébergement
   statique (GitHub Pages…) : l'état d'erreur l'explique.

   Une classe peut être sélectionnée via le sélecteur ou l'URL
   (?classe=5B) ; sans sélection, les statistiques combinent toutes
   les classes ayant répondu. Quand une classe précise est affichée,
   une liste permet d'inclure/exclure chaque élève (par pseudo) du
   calcul des statistiques sans supprimer sa réponse.
   =================================================================== */

(function () {
  "use strict";

  const { REFERENCE_MOYENNE_FR, CATEGORY_META, fmt, renderGaugeInto } = window.EmpreinteShared;

  const loadingEl = document.getElementById("loading-state");
  const errorEl = document.getElementById("error-state");
  const contentEl = document.getElementById("content-block");
  const noDataEl = document.getElementById("no-data-note");
  const noDataText = document.getElementById("no-data-text");
  const statsCardsEl = document.getElementById("stats-cards");
  const manageCard = document.getElementById("manage-card");
  const manageList = document.getElementById("manage-list");
  const classSelect = document.getElementById("class-select");
  const scopeSummary = document.getElementById("scope-summary");
  const resetBtn = document.getElementById("reset-btn");

  function currentClasse() {
    return classSelect.value || "";
  }

  function updateUrl(classe) {
    const url = new URL(window.location.href);
    if (classe) url.searchParams.set("classe", classe);
    else url.searchParams.delete("classe");
    window.history.replaceState({}, "", url);
  }

  async function populateClassSelect(preselect) {
    let classes = [];
    try {
      const res = await fetch("/api/classes");
      if (res.ok) classes = (await res.json()).classes || [];
    } catch (e) {
      /* la liste reste vide ; seule l'option "toutes les classes" sera proposée */
    }

    classSelect.innerHTML = "";
    const allOpt = document.createElement("option");
    allOpt.value = "";
    allOpt.textContent = "Toutes les classes (combiné)";
    classSelect.appendChild(allOpt);

    classes.forEach((c) => {
      const opt = document.createElement("option");
      opt.value = c.classe;
      opt.textContent = `${c.classe} (${c.count})`;
      classSelect.appendChild(opt);
    });

    classSelect.value = classes.some((c) => c.classe === preselect) ? preselect : "";
    return classSelect.value;
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

  // ---- Gestion des élèves d'une classe (inclusion/exclusion) ----

  async function loadManageList(classe) {
    if (!classe) {
      manageCard.hidden = true;
      manageList.innerHTML = "";
      return { excludedCount: 0 };
    }

    let submissions = [];
    try {
      const res = await fetch(`/api/submissions?classe=${encodeURIComponent(classe)}`);
      if (!res.ok) throw new Error("bad status");
      submissions = (await res.json()).submissions || [];
    } catch (e) {
      manageCard.hidden = true;
      return { excludedCount: 0 };
    }

    manageCard.hidden = submissions.length === 0;
    manageList.innerHTML = "";

    submissions.forEach((s) => {
      const row = document.createElement("label");
      row.className = "manage-row" + (s.included ? "" : " is-excluded");

      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.checked = !!s.included;
      checkbox.addEventListener("change", async () => {
        checkbox.disabled = true;
        try {
          const res = await fetch(`/api/submissions/${s.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ included: checkbox.checked }),
          });
          if (!res.ok) throw new Error("bad status");
          const resolved = await populateClassSelect(currentClasse()); // rafraîchit le compte affiché dans le sélecteur
          loadStats(resolved, { silent: true }); // rafraîchit stats + liste, sans écran de chargement
        } catch (e) {
          checkbox.checked = !checkbox.checked; // annule le changement affiché
          alert("Impossible de mettre à jour cet élève (serveur inaccessible).");
          checkbox.disabled = false;
        }
      });

      const pseudo = document.createElement("span");
      pseudo.className = "manage-pseudo";
      pseudo.textContent = s.eleve || "(sans pseudo)";

      const total = document.createElement("span");
      total.className = "manage-total";
      total.textContent = `${fmt(s.total, 0)} kg`;

      row.append(checkbox, pseudo, total);
      manageList.appendChild(row);
    });

    return { excludedCount: submissions.filter((s) => !s.included).length };
  }

  // ---- Statistiques ----

  async function loadStats(classe, options) {
    const silent = options && options.silent;

    if (!silent) {
      contentEl.hidden = true;
      errorEl.hidden = true;
      loadingEl.hidden = false;
    }

    resetBtn.textContent = classe ? `↺ Réinitialiser les données de « ${classe} »` : "↺ Réinitialiser toutes les données (toutes classes)";

    let stats;
    try {
      const url = classe ? `/api/stats?classe=${encodeURIComponent(classe)}` : "/api/stats";
      const res = await fetch(url);
      if (!res.ok) throw new Error("bad status");
      stats = await res.json();
    } catch (e) {
      loadingEl.hidden = true;
      contentEl.hidden = true;
      errorEl.hidden = false;
      return;
    }

    loadingEl.hidden = true;
    contentEl.hidden = false;

    scopeSummary.textContent = classe
      ? `Classe « ${classe} » — ${fmt(stats.count, 0)} réponse(s) comptabilisée(s).`
      : `Toutes classes confondues — ${fmt(stats.count, 0)} réponse(s) comptabilisée(s)${stats.classesCount ? ` sur ${fmt(stats.classesCount, 0)} classe(s)` : ""}.`;

    if (!stats.count) {
      statsCardsEl.hidden = true;
      noDataText.innerHTML = classe
        ? `Aucune réponse comptabilisée pour la classe « ${classe} » pour l'instant.`
        : "Aucune réponse comptabilisée pour l'instant, toutes classes confondues.";
      noDataEl.hidden = false;
    } else {
      noDataEl.hidden = true;
      statsCardsEl.hidden = false;

      document.getElementById("stat-count").textContent = fmt(stats.count, 0);
      document.getElementById("stat-min").textContent = fmt(stats.min, 0);
      document.getElementById("stat-max").textContent = fmt(stats.max, 0);
      document.getElementById("stat-avg").textContent = fmt(stats.avg, 0);

      const diffPct = ((stats.avg - REFERENCE_MOYENNE_FR) / REFERENCE_MOYENNE_FR) * 100;
      const avgContext = document.getElementById("avg-context");
      if (Math.abs(diffPct) < 3) {
        avgContext.textContent = "Cette moyenne est très proche de la moyenne numérique d'un habitant en France (~250 kg CO2e/an).";
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
    }

    const { excludedCount } = await loadManageList(classe);
    if (excludedCount > 0) {
      scopeSummary.textContent += ` (${excludedCount} exclu${excludedCount > 1 ? "s" : ""} de la classe)`;
    }
  }

  async function init() {
    const initialClasse = new URLSearchParams(window.location.search).get("classe") || "";
    const resolved = await populateClassSelect(initialClasse);
    updateUrl(resolved);
    loadStats(resolved);
  }

  classSelect.addEventListener("change", () => {
    const classe = currentClasse();
    updateUrl(classe);
    loadStats(classe);
  });

  resetBtn.addEventListener("click", async () => {
    const classe = currentClasse();
    const confirmMsg = classe
      ? `Supprimer définitivement les données de la classe « ${classe} » ?`
      : "Supprimer définitivement toutes les données, de toutes les classes ?";
    if (!confirm(confirmMsg)) return;
    try {
      const url = classe ? `/api/submissions?classe=${encodeURIComponent(classe)}` : "/api/submissions";
      const res = await fetch(url, { method: "DELETE" });
      if (!res.ok) throw new Error("bad status");
      const resolved = await populateClassSelect(classe);
      updateUrl(resolved);
      loadStats(resolved);
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

  init();
})();
