/* ===================================================================
   Empreinte Numérique — tableau de bord enseignant
   Protégé par un mot de passe unique, stocké haché avec les données de
   classe (voir server.js / db.js) : rien à configurer sur le serveur.
   Écran "setup" tant qu'aucun mot de passe n'a encore été défini,
   écran de connexion ensuite tant qu'aucune session valide n'existe —
   toutes les routes de données répondent 401 sans elle. Affiche
   ensuite les statistiques agrégées et anonymes récupérées via l'API
   du serveur Node (server.js). N'a aucun effet en hébergement statique
   (GitHub Pages…) : l'écran de connexion l'indique dès la tentative.

   Une classe peut être sélectionnée via le sélecteur ou l'URL
   (?classe=5B) ; sans sélection, les statistiques combinent toutes
   les classes ayant répondu. Quand une classe précise est affichée,
   une liste permet d'inclure/exclure chaque élève (par pseudo) du
   calcul des statistiques sans supprimer sa réponse.
   =================================================================== */

(function () {
  "use strict";

  const { REFERENCE_MOYENNE_BE, fmt, renderGaugeInto, renderBreakdownInto, renderEquivalencesInto } = window.EmpreinteShared;

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
  const dashboardUpdated = document.getElementById("dashboard-updated");
  const resetBtn = document.getElementById("reset-btn");

  // ---- Connexion (mot de passe unique, session en mémoire côté serveur) ----
  // Le mot de passe lui-même est normalement stocké avec les données de
  // classe (voir server.js / db.js), défini la première fois via l'écran
  // "setup-state" ci-dessous — pas de fichier à déployer sur le serveur.

  const setupStateEl = document.getElementById("setup-state");
  const loginStateEl = document.getElementById("login-state");
  const appStateEl = document.getElementById("app-state");
  const loginForm = document.getElementById("login-form");
  const adminPasswordInput = document.getElementById("admin-password");
  const loginError = document.getElementById("login-error");
  const logoutBtn = document.getElementById("logout-btn");

  const setupForm = document.getElementById("setup-form");
  const setupPasswordInput = document.getElementById("setup-password");
  const setupPasswordConfirmInput = document.getElementById("setup-password-confirm");
  const setupError = document.getElementById("setup-error");

  // Actualisation automatique des statistiques affichées (et de la liste
  // de gestion, rafraîchie avec elles — voir la fin de loadStats), au
  // même rythme que le mode projection : pas besoin de recharger la page
  // pendant que les élèves répondent.
  const AUTO_REFRESH_MS = 10000;
  let autoRefreshTimer = null;

  function startAutoRefresh() {
    if (autoRefreshTimer) return;
    autoRefreshTimer = setInterval(() => {
      loadStats(currentClasse(), { silent: true });
    }, AUTO_REFRESH_MS);
  }

  function stopAutoRefresh() {
    if (autoRefreshTimer) {
      clearInterval(autoRefreshTimer);
      autoRefreshTimer = null;
    }
  }

  function showApp() {
    setupStateEl.hidden = true;
    loginStateEl.hidden = true;
    appStateEl.hidden = false;
    logoutBtn.hidden = false;
    startAutoRefresh();
  }

  function showLogin() {
    setupStateEl.hidden = true;
    appStateEl.hidden = true;
    loginStateEl.hidden = false;
    logoutBtn.hidden = true;
    stopAutoRefresh();
  }

  function showSetup() {
    appStateEl.hidden = true;
    loginStateEl.hidden = true;
    setupStateEl.hidden = false;
    logoutBtn.hidden = true;
    stopAutoRefresh();
  }

  // À utiliser juste après un fetch() vers une route de données : si la
  // session a expiré (ou n'a jamais existé), repasse à l'écran de
  // connexion au lieu de laisser l'appelant afficher une erreur
  // générique "serveur inaccessible", trompeuse dans ce cas précis.
  function redirectToLoginIfUnauthorized(res) {
    if (res.status === 401) {
      showLogin();
      return true;
    }
    return false;
  }

  async function fetchSessionInfo() {
    try {
      const res = await fetch("api/admin/session");
      if (!res.ok) return { authenticated: false, configured: true };
      return await res.json();
    } catch (e) {
      return { authenticated: false, configured: true };
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
      showApp();
      init();
    } catch (e) {
      loginError.textContent =
        "Impossible de contacter le serveur. Ce tableau de bord nécessite que le site soit lancé avec le serveur Node inclus (voir le README).";
      loginError.hidden = false;
    } finally {
      submitBtn.disabled = false;
    }
  });

  setupForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    setupError.hidden = true;

    if (setupPasswordInput.value.length < 8) {
      setupError.textContent = "Le mot de passe doit contenir au moins 8 caractères.";
      setupError.hidden = false;
      return;
    }
    if (setupPasswordInput.value !== setupPasswordConfirmInput.value) {
      setupError.textContent = "Les deux mots de passe ne correspondent pas.";
      setupError.hidden = false;
      return;
    }

    const submitBtn = setupForm.querySelector("button[type=submit]");
    submitBtn.disabled = true;
    try {
      const res = await fetch("api/admin/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: setupPasswordInput.value }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setupError.textContent = data.error || "Impossible de définir le mot de passe.";
        setupError.hidden = false;
        return;
      }
      setupPasswordInput.value = "";
      setupPasswordConfirmInput.value = "";
      showApp();
      init();
    } catch (e) {
      setupError.textContent = "Impossible de contacter le serveur.";
      setupError.hidden = false;
    } finally {
      submitBtn.disabled = false;
    }
  });

  logoutBtn.addEventListener("click", async () => {
    try {
      await fetch("api/admin/logout", { method: "POST" });
    } catch (e) {
      /* pas grave : on repasse à l'écran de connexion de toute façon */
    }
    showLogin();
  });

  // ---- Changer le mot de passe (depuis le tableau de bord, une fois connecté·e) ----

  const changePwForm = document.getElementById("change-pw-form");
  const changePwNewInput = document.getElementById("change-pw-new");
  const changePwConfirmInput = document.getElementById("change-pw-confirm");
  const changePwError = document.getElementById("change-pw-error");
  const changePwSuccess = document.getElementById("change-pw-success");

  changePwForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    changePwError.hidden = true;
    changePwSuccess.hidden = true;

    if (changePwNewInput.value.length < 8) {
      changePwError.textContent = "Le mot de passe doit contenir au moins 8 caractères.";
      changePwError.hidden = false;
      return;
    }
    if (changePwNewInput.value !== changePwConfirmInput.value) {
      changePwError.textContent = "Les deux mots de passe ne correspondent pas.";
      changePwError.hidden = false;
      return;
    }

    const submitBtn = changePwForm.querySelector("button[type=submit]");
    submitBtn.disabled = true;
    try {
      const res = await fetch("api/admin/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: changePwNewInput.value }),
      });
      if (redirectToLoginIfUnauthorized(res)) return;
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        changePwError.textContent = data.error || "Impossible de mettre à jour le mot de passe.";
        changePwError.hidden = false;
        return;
      }
      changePwNewInput.value = "";
      changePwConfirmInput.value = "";
      changePwSuccess.hidden = false;
    } catch (e) {
      changePwError.textContent = "Impossible de contacter le serveur.";
      changePwError.hidden = false;
    } finally {
      submitBtn.disabled = false;
    }
  });

  function currentClasse() {
    return classSelect.value || "";
  }

  // ---- Générateur de lien de classe ----

  const linkGenForm = document.getElementById("link-gen-form");
  const linkGenClasseInput = document.getElementById("link-gen-classe");
  const linkGenOutput = document.getElementById("link-gen-output");
  const linkGenUrlInput = document.getElementById("link-gen-url");
  const linkGenCopyBtn = document.getElementById("link-gen-copy");
  const linkGenCopiedMsg = document.getElementById("link-gen-copied");
  const linkGenQr = document.getElementById("link-gen-qr");

  // Rendu du QR code en SVG, entièrement côté client (bibliothèque
  // vendorisée, voir qrcode-lib.js). Toujours en noir sur blanc, quel
  // que soit le thème du site : un QR code themé (contraste réduit en
  // thème sombre) risquerait de ne plus être lisible par un scanner.
  function renderLinkQr(url) {
    if (typeof qrcode !== "function") {
      linkGenQr.hidden = true;
      return;
    }
    const qr = qrcode(0, "M");
    qr.addData(url);
    qr.make();
    linkGenQr.innerHTML = qr.createSvgTag({ cellSize: 4, margin: 8, scalable: true });
    linkGenQr.hidden = false;
  }

  linkGenForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const classe = linkGenClasseInput.value.trim();
    linkGenCopiedMsg.hidden = true;
    if (!classe) {
      linkGenOutput.hidden = true;
      linkGenQr.hidden = true;
      return;
    }
    // dashboard.html et index.html sont toujours dans le même dossier,
    // que l'app soit servie à la racine ou sous une passerelle.
    const url = new URL("index.html", window.location.href);
    url.searchParams.set("classe", classe);
    linkGenUrlInput.value = url.toString();
    linkGenOutput.hidden = false;
    linkGenUrlInput.select();
    renderLinkQr(url.toString());
  });

  linkGenCopyBtn.addEventListener("click", async () => {
    linkGenUrlInput.select();
    try {
      await navigator.clipboard.writeText(linkGenUrlInput.value);
      linkGenCopiedMsg.hidden = false;
    } catch (e) {
      try {
        document.execCommand("copy"); // navigateur sans l'API Clipboard
        linkGenCopiedMsg.hidden = false;
      } catch (e2) {
        linkGenCopiedMsg.hidden = true;
      }
    }
  });

  function updateUrl(classe) {
    const url = new URL(window.location.href);
    if (classe) url.searchParams.set("classe", classe);
    else url.searchParams.delete("classe");
    window.history.replaceState({}, "", url);
  }

  // Dernière liste de classes obtenue avec succès. Une classe ne doit
  // jamais disparaître du sélecteur suite à un simple échec réseau
  // passager — seule une suppression explicite côté serveur (reset)
  // doit la faire disparaître. Un échec de /api/classes garde donc la
  // liste précédemment connue plutôt que de la vider ; elle est aussi
  // mise en cache dans localStorage pour survivre à un rechargement de
  // page pendant une panne réseau (sinon la mémoire JS serait perdue).
  let knownClasses = readCachedClasses();

  function readCachedClasses() {
    try {
      const raw = localStorage.getItem("empreinte-known-classes");
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return [];
    }
  }

  function writeCachedClasses(classes) {
    try {
      localStorage.setItem("empreinte-known-classes", JSON.stringify(classes));
    } catch (e) {
      /* stockage indisponible : pas bloquant */
    }
  }

  async function populateClassSelect(preselect) {
    try {
      const res = await fetch("api/classes");
      if (redirectToLoginIfUnauthorized(res)) return classSelect.value;
      if (res.ok) {
        knownClasses = (await res.json()).classes || [];
        writeCachedClasses(knownClasses);
      }
    } catch (e) {
      /* échec réseau : on garde la dernière liste connue, on ne la vide pas */
    }

    classSelect.innerHTML = "";
    const allOpt = document.createElement("option");
    allOpt.value = "";
    allOpt.textContent = "Toutes les classes (combiné)";
    classSelect.appendChild(allOpt);

    knownClasses.forEach((c) => {
      const opt = document.createElement("option");
      opt.value = c.classe;
      opt.textContent = `${c.classe} (${c.count})`;
      classSelect.appendChild(opt);
    });

    classSelect.value = knownClasses.some((c) => c.classe === preselect) ? preselect : "";
    return classSelect.value;
  }

  function renderBreakdown(avgByCategory) {
    const entries = renderBreakdownInto(document.getElementById("dashboard-chart"), avgByCategory);
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
      const res = await fetch(`api/submissions?classe=${encodeURIComponent(classe)}`);
      if (redirectToLoginIfUnauthorized(res)) return { excludedCount: 0 };
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
          const res = await fetch(`api/submissions/${s.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ included: checkbox.checked }),
          });
          if (redirectToLoginIfUnauthorized(res)) return;
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
      const url = classe ? `api/stats?classe=${encodeURIComponent(classe)}` : "api/stats";
      const res = await fetch(url);
      if (redirectToLoginIfUnauthorized(res)) return;
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
    dashboardUpdated.textContent = `Actualisé à ${new Date().toLocaleTimeString("fr-BE", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}`;

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

      const diffPct = ((stats.avg - REFERENCE_MOYENNE_BE) / REFERENCE_MOYENNE_BE) * 100;
      const avgContext = document.getElementById("avg-context");
      if (Math.abs(diffPct) < 3) {
        avgContext.textContent = "Cette moyenne est très proche du profil de référence (usage numérique moyen sur ces mêmes catégories, ~229 kg CO2e/an).";
      } else if (diffPct < 0) {
        avgContext.textContent = `Soit environ ${fmt(Math.abs(diffPct), 0)} % de moins que le profil de référence (usage numérique moyen sur ces mêmes catégories, ~229 kg CO2e/an).`;
      } else {
        avgContext.textContent = `Soit environ ${fmt(diffPct, 0)} % de plus que le profil de référence (usage numérique moyen sur ces mêmes catégories, ~229 kg CO2e/an).`;
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
        REFERENCE_MOYENNE_BE
      );

      const top = renderBreakdown(stats.avgByCategory);
      const pctOfAvg = stats.avg > 0 ? (top.value / stats.avg) * 100 : 0;
      document.getElementById("dominant-swatch").style.background = top.color;
      document.getElementById("dominant-text").innerHTML = `En moyenne, c'est <strong>${top.article}</strong> qui pèse le plus dans l'empreinte du groupe (~${fmt(top.value, 0)} kg CO2e/an, soit environ ${fmt(pctOfAvg, 0)} % de l'empreinte moyenne).`;

      renderEquivalencesInto(
        {
          avionKm: document.getElementById("dash-eq-avion-km"),
          avionSub: document.getElementById("dash-eq-avion-sub"),
          voitureKm: document.getElementById("dash-eq-voiture-km"),
          voitureSub: document.getElementById("dash-eq-voiture-sub"),
          bouteilles: document.getElementById("dash-eq-bouteilles"),
          bouteillesSub: document.getElementById("dash-eq-bouteilles-sub"),
          foret: document.getElementById("dash-eq-foret"),
          foretSub: document.getElementById("dash-eq-foret-sub"),
        },
        stats.avg
      );
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
      const url = classe ? `api/submissions?classe=${encodeURIComponent(classe)}` : "api/submissions";
      const res = await fetch(url, { method: "DELETE" });
      if (redirectToLoginIfUnauthorized(res)) return;
      if (!res.ok) throw new Error("bad status");
      const resolved = await populateClassSelect(classe);
      updateUrl(resolved);
      loadStats(resolved);
    } catch (e) {
      alert("Impossible de réinitialiser les données (serveur inaccessible).");
    }
  });

  // ---- Mode projection (vue simplifiée, actualisée automatiquement) ----

  document.getElementById("projection-btn").addEventListener("click", () => {
    const classe = currentClasse();
    const url = new URL("projection.html", window.location.href);
    if (classe) url.searchParams.set("classe", classe);
    window.open(url.toString(), "_blank", "noopener");
  });

  // ---- Impression du rapport ----

  document.getElementById("dashboard-print-btn").addEventListener("click", () => {
    window.print();
  });

  // ---- Export CSV ----

  document.getElementById("export-csv-btn").addEventListener("click", async () => {
    const classe = currentClasse();
    const url = classe ? `api/export.csv?classe=${encodeURIComponent(classe)}` : "api/export.csv";
    try {
      const res = await fetch(url);
      if (redirectToLoginIfUnauthorized(res)) return;
      if (!res.ok) throw new Error("bad status");
      const blob = await res.blob();
      const disposition = res.headers.get("Content-Disposition") || "";
      const match = disposition.match(/filename="([^"]+)"/);
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = match ? match[1] : "empreinte.csv";
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(link.href);
    } catch (e) {
      alert("Impossible d'exporter les données (serveur inaccessible).");
    }
  });

  // ---- Onglets (Statistiques / Gérer la classe / Partager / Compte) ----

  const tabButtons = Array.from(document.querySelectorAll(".tab-btn"));
  const tabPanels = {
    stats: document.getElementById("tab-panel-stats"),
    manage: document.getElementById("tab-panel-manage"),
    share: document.getElementById("tab-panel-share"),
    account: document.getElementById("tab-panel-account"),
  };

  function activateTab(name) {
    if (!tabPanels[name]) return;
    tabButtons.forEach((btn) => {
      const active = btn.dataset.tab === name;
      btn.classList.toggle("is-active", active);
      btn.setAttribute("aria-selected", active ? "true" : "false");
    });
    Object.keys(tabPanels).forEach((key) => {
      tabPanels[key].hidden = key !== name;
    });
    try {
      localStorage.setItem("empreinte-dashboard-tab", name);
    } catch (e) {
      /* stockage indisponible : pas bloquant */
    }
  }

  tabButtons.forEach((btn) => {
    btn.addEventListener("click", () => activateTab(btn.dataset.tab));
  });

  (function restoreTab() {
    try {
      const saved = localStorage.getItem("empreinte-dashboard-tab");
      if (saved) activateTab(saved);
    } catch (e) {
      /* stockage indisponible : reste sur l'onglet par défaut */
    }
  })();

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

  (async function bootstrap() {
    const session = await fetchSessionInfo();

    if (session.authenticated) {
      showApp();
      init();
    } else if (!session.configured) {
      showSetup();
    } else {
      showLogin();
    }
  })();
})();
