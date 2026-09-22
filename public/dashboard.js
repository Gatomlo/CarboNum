/* ===================================================================
   Empreinte Numérique — tableau de bord enseignant
   Protégé par un mot de passe unique (ADMIN_PASSWORD côté serveur,
   voir server.js) : l'écran de connexion s'affiche tant qu'aucune
   session valide n'existe, et toutes les routes de données répondent
   401 sans elle. Affiche ensuite les statistiques agrégées et
   anonymes récupérées via l'API du serveur Node (server.js). N'a
   aucun effet en hébergement statique (GitHub Pages…) : l'écran de
   connexion l'indique dès la tentative de connexion.

   Une classe peut être sélectionnée via le sélecteur ou l'URL
   (?classe=5B) ; sans sélection, les statistiques combinent toutes
   les classes ayant répondu. Quand une classe précise est affichée,
   une liste permet d'inclure/exclure chaque élève (par pseudo) du
   calcul des statistiques sans supprimer sa réponse.
   =================================================================== */

(function () {
  "use strict";

  const { REFERENCE_MOYENNE_BE, fmt, renderGaugeInto, renderBreakdownInto } = window.EmpreinteShared;

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

  // ---- Connexion (mot de passe unique, session en mémoire côté serveur) ----

  const loginStateEl = document.getElementById("login-state");
  const appStateEl = document.getElementById("app-state");
  const loginForm = document.getElementById("login-form");
  const adminPasswordInput = document.getElementById("admin-password");
  const loginError = document.getElementById("login-error");
  const logoutBtn = document.getElementById("logout-btn");

  function showApp() {
    loginStateEl.hidden = true;
    appStateEl.hidden = false;
    logoutBtn.hidden = false;
  }

  function showLogin() {
    appStateEl.hidden = true;
    loginStateEl.hidden = false;
    logoutBtn.hidden = true;
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

  logoutBtn.addEventListener("click", async () => {
    try {
      await fetch("api/admin/logout", { method: "POST" });
    } catch (e) {
      /* pas grave : on repasse à l'écran de connexion de toute façon */
    }
    showLogin();
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
    if (await checkAuth()) {
      showApp();
      init();
    } else {
      showLogin();
    }
  })();
})();
