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

   L'onglet Statistiques a sa propre liste de classes à cocher
   (?classe=5B ou ?classe=5B,6A dans l'URL pour la pré-remplir) : une
   seule classe cochée affiche ses stats, plusieurs cochées affichent
   leur moyenne combinée (pondérée par le nombre de réponses). L'onglet
   Classe a son propre sélecteur, indépendant, pour choisir la classe
   dont on gère la politique de réponse et les élèves (inclusion,
   exclusion, déblocage). Une liste permet d'inclure/exclure chaque
   élève (par pseudo) du calcul des statistiques sans supprimer sa
   réponse.
   =================================================================== */

(function () {
  "use strict";

  const { REFERENCE_MOYENNE_BE, fmt, renderGaugeInto, renderBreakdownInto, renderEquivalencesInto, renderQrInto } = window.EmpreinteShared;

  const loadingEl = document.getElementById("loading-state");
  const errorEl = document.getElementById("error-state");
  const contentEl = document.getElementById("content-block");
  const noDataEl = document.getElementById("no-data-note");
  const noDataText = document.getElementById("no-data-text");
  const statsCardsEl = document.getElementById("stats-cards");
  const manageCard = document.getElementById("manage-card");
  const manageList = document.getElementById("manage-list");
  const manageClassSelect = document.getElementById("manage-class-select");
  const statsClassPickerCard = document.getElementById("stats-class-picker-card");
  const statsClassList = document.getElementById("stats-class-list");
  const statsEmptySelection = document.getElementById("stats-empty-selection");
  const scopeSummary = document.getElementById("scope-summary");
  const dashboardUpdated = document.getElementById("dashboard-updated");

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
      loadStats({ silent: true });
      if (manageClassSelect.value) loadManageClassData(manageClassSelect.value);
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


  // ---- Générateur de lien de classe ----
  // Le menu déroulant liste les classes connues (voir populateClasses) —
  // plus de champ texte libre, pour éviter de générer un lien vers une
  // classe mal orthographiée ou inexistante. Pour une classe qui n'a
  // encore aucune réponse, elle doit d'abord être créée dans l'onglet
  // « Classe » (voir plus bas) pour apparaître ici.

  const linkGenForm = document.getElementById("link-gen-form");
  const linkGenClasseSelect = document.getElementById("link-gen-classe");
  const linkGenNoClasses = document.getElementById("link-gen-no-classes");
  const linkGenOutput = document.getElementById("link-gen-output");
  const linkGenUrlInput = document.getElementById("link-gen-url");
  const linkGenCopyBtn = document.getElementById("link-gen-copy");
  const linkGenCopiedMsg = document.getElementById("link-gen-copied");
  const linkGenQr = document.getElementById("link-gen-qr");

  function populateLinkGenSelect() {
    const previous = linkGenClasseSelect.value;
    linkGenClasseSelect.innerHTML = "";
    const emptyOpt = document.createElement("option");
    emptyOpt.value = "";
    emptyOpt.textContent = "— Choisir une classe —";
    linkGenClasseSelect.appendChild(emptyOpt);
    knownClasses.forEach((c) => {
      const opt = document.createElement("option");
      opt.value = c.classe;
      opt.textContent = c.classe;
      linkGenClasseSelect.appendChild(opt);
    });
    linkGenClasseSelect.value = knownClasses.some((c) => c.classe === previous) ? previous : "";
    linkGenForm.hidden = knownClasses.length === 0;
    linkGenNoClasses.hidden = knownClasses.length > 0;
  }

  linkGenForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const classe = linkGenClasseSelect.value;
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
    renderQrInto(linkGenQr, url.toString());
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

  // Reflète la sélection de l'onglet Statistiques dans l'URL (pour
  // pouvoir la partager ou la retrouver après rechargement) — omise
  // quand elle correspond à "toutes les classes" (comportement par
  // défaut) ou quand rien n'est sélectionné.
  function updateUrlForSelection() {
    const url = new URL(window.location.href);
    const classesArr = Array.from(selectedStatsClasses);
    const allSelected = knownClasses.length > 0 && classesArr.length === knownClasses.length;
    if (classesArr.length === 0 || allSelected) url.searchParams.delete("classe");
    else url.searchParams.set("classe", classesArr.join(","));
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

  // Peuple le sélecteur (unique) de l'onglet Classe et la liste à cocher
  // (multiple) de l'onglet Statistiques à partir de /api/classes.
  // preselectManage : code de classe à présélectionner dans l'onglet
  // Classe (undefined/absent = ne pas y toucher, "" = désélectionner).
  // preselectStatsList : tableau de classes à cocher dans l'onglet
  // Statistiques lors du tout premier appel (voir renderStatsClassList).
  async function populateClasses(preselectManage, preselectStatsList) {
    try {
      const res = await fetch("api/classes");
      if (redirectToLoginIfUnauthorized(res)) return;
      if (res.ok) {
        knownClasses = (await res.json()).classes || [];
        writeCachedClasses(knownClasses);
      }
    } catch (e) {
      /* échec réseau : on garde la dernière liste connue, on ne la vide pas */
    }

    const manageValue = preselectManage === undefined ? manageClassSelect.value : preselectManage;
    manageClassSelect.innerHTML = "";
    const emptyOpt = document.createElement("option");
    emptyOpt.value = "";
    emptyOpt.textContent = "— Choisir une classe —";
    manageClassSelect.appendChild(emptyOpt);
    knownClasses.forEach((c) => {
      const opt = document.createElement("option");
      opt.value = c.classe;
      opt.textContent = `${c.classe} (${c.count})`;
      manageClassSelect.appendChild(opt);
    });
    manageClassSelect.value = knownClasses.some((c) => c.classe === manageValue) ? manageValue : "";

    renderStatsClassList(preselectStatsList);
    renderDeleteClassesList();
    populateLinkGenSelect();
  }

  // ---- Sélection des classes affichées dans l'onglet Statistiques ----
  // Coche à coche, plutôt qu'un unique menu : une classe cochée affiche
  // ses statistiques, plusieurs cochées affichent leur moyenne combinée
  // (pondérée par le nombre de réponses, calculée côté serveur).

  const selectedStatsClasses = new Set();
  let statsListInitialized = false;

  function renderStatsClassList(preselectList) {
    statsClassPickerCard.hidden = knownClasses.length === 0;

    if (!statsListInitialized) {
      if (preselectList && preselectList.length) {
        preselectList.forEach((c) => {
          if (knownClasses.some((k) => k.classe === c)) selectedStatsClasses.add(c);
        });
      } else {
        // Par défaut, toutes les classes connues sont cochées ("toutes
        // classes confondues").
        knownClasses.forEach((c) => selectedStatsClasses.add(c.classe));
      }
      statsListInitialized = true;
    } else {
      // Une classe supprimée entretemps ne doit plus rester cochée.
      Array.from(selectedStatsClasses).forEach((c) => {
        if (!knownClasses.some((k) => k.classe === c)) selectedStatsClasses.delete(c);
      });
    }

    statsClassList.innerHTML = "";
    knownClasses.forEach((c) => {
      const row = document.createElement("label");
      row.className = "manage-row" + (selectedStatsClasses.has(c.classe) ? "" : " is-excluded");

      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.checked = selectedStatsClasses.has(c.classe);
      checkbox.addEventListener("change", () => {
        if (checkbox.checked) selectedStatsClasses.add(c.classe);
        else selectedStatsClasses.delete(c.classe);
        row.classList.toggle("is-excluded", !checkbox.checked);
        updateUrlForSelection();
        loadStats();
      });

      const label = document.createElement("span");
      label.className = "manage-pseudo";
      label.textContent = `${c.classe} (${c.count})`;

      row.append(checkbox, label);
      statsClassList.appendChild(row);
    });
  }

  function renderBreakdown(avgByCategory) {
    const entries = renderBreakdownInto(document.getElementById("dashboard-chart"), avgByCategory);
    return entries[0];
  }

  // ---- Politique de réponse d'une classe (unique ou multiple) et
  // déblocages (classe entière ou élève par élève) ----

  const manageSelectClassHint = document.getElementById("manage-select-class-hint");
  const classPolicyCard = document.getElementById("class-policy-card");
  const classPolicyClasseName = document.getElementById("class-policy-classe-name");
  const classPolicySelect = document.getElementById("class-policy-select");
  const unlockAllRow = document.getElementById("unlock-all-row");
  const unlockAllCheckbox = document.getElementById("unlock-all-checkbox");
  const policyStatus = document.getElementById("policy-status");
  const policyStatusText = document.getElementById("policy-status-text");

  let currentClassSettings = null;

  // Statut affiché en toutes lettres au-dessus du sélecteur, plutôt que de
  // laisser deviner la politique en cours à partir de la seule valeur du
  // menu déroulant (peu visible au premier coup d'œil).
  function renderPolicyStatus(settings) {
    policyStatus.classList.remove("is-multiple", "is-single", "is-unlocked");
    if (settings.policy === "multiple") {
      policyStatus.classList.add("is-multiple");
      policyStatusText.textContent = "Réponses multiples autorisées — une nouvelle réponse remplace la précédente.";
    } else if (settings.unlockedAll) {
      policyStatus.classList.add("is-unlocked");
      policyStatusText.textContent = "Réponse unique, mais classe débloquée temporairement — tout le monde peut renvoyer une réponse.";
    } else {
      policyStatus.classList.add("is-single");
      policyStatusText.textContent = "Une seule réponse par élève — toute tentative supplémentaire est refusée.";
    }
  }

  async function loadClassSettings(classe) {
    manageSelectClassHint.hidden = !!classe;
    if (!classe) {
      classPolicyCard.hidden = true;
      currentClassSettings = null;
      return;
    }
    try {
      const res = await fetch(`api/class-settings?classe=${encodeURIComponent(classe)}`);
      if (redirectToLoginIfUnauthorized(res)) return;
      if (!res.ok) throw new Error("bad status");
      currentClassSettings = await res.json();
    } catch (e) {
      classPolicyCard.hidden = true;
      currentClassSettings = null;
      return;
    }
    classPolicyCard.hidden = false;
    classPolicyClasseName.textContent = classe;
    classPolicySelect.value = currentClassSettings.policy;
    unlockAllRow.hidden = currentClassSettings.policy !== "single";
    unlockAllCheckbox.checked = currentClassSettings.unlockedAll;
    renderPolicyStatus(currentClassSettings);
  }

  classPolicySelect.addEventListener("change", async () => {
    const classe = manageClassSelect.value;
    if (!classe) return;
    const policy = classPolicySelect.value;
    classPolicySelect.disabled = true;
    try {
      const res = await fetch("api/class-settings/policy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ classe, policy }),
      });
      if (redirectToLoginIfUnauthorized(res)) return;
      if (!res.ok) throw new Error("bad status");
      await loadClassSettings(classe);
      loadManageList(classe); // rafraîchit les boutons de déblocage par élève
    } catch (e) {
      alert("Impossible de mettre à jour la politique de cette classe (serveur inaccessible).");
    } finally {
      classPolicySelect.disabled = false;
    }
  });

  unlockAllCheckbox.addEventListener("change", async () => {
    const classe = manageClassSelect.value;
    if (!classe) return;
    const wanted = unlockAllCheckbox.checked;
    unlockAllCheckbox.disabled = true;
    try {
      const res = await fetch("api/class-settings/unlock-all", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ classe, unlocked: wanted }),
      });
      if (redirectToLoginIfUnauthorized(res)) return;
      if (!res.ok) throw new Error("bad status");
      await loadClassSettings(classe);
      loadManageList(classe);
    } catch (e) {
      unlockAllCheckbox.checked = !wanted;
      alert("Impossible de mettre à jour le déblocage (serveur inaccessible).");
    } finally {
      unlockAllCheckbox.disabled = false;
    }
  });

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
          await populateClasses(manageClassSelect.value, null); // rafraîchit les compteurs affichés
          loadStats({ silent: true }); // rafraîchit les stats, sans écran de chargement
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

      // Bouton de déblocage individuel : seulement utile en politique
      // "une seule réponse", tant que la classe entière n'est pas déjà
      // débloquée globalement, et seulement pour un pseudo identifiable.
      if (s.eleve && currentClassSettings && currentClassSettings.policy === "single" && !currentClassSettings.unlockedAll) {
        const isUnlocked = currentClassSettings.unlockedStudents.includes(s.eleve);
        const unlockBtn = document.createElement("button");
        unlockBtn.type = "button";
        unlockBtn.className = "btn btn-ghost btn-sm";
        unlockBtn.textContent = isUnlocked ? "🔓 Débloqué" : "🔒 Débloquer";
        unlockBtn.addEventListener("click", async (e) => {
          // Le bouton est dans un <label> lié à la case d'inclusion :
          // sans ça, le clic ferait aussi basculer la case.
          e.preventDefault();
          e.stopPropagation();
          unlockBtn.disabled = true;
          try {
            const res = await fetch("api/class-settings/unlock-student", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ classe, eleve: s.eleve, unlocked: !isUnlocked }),
            });
            if (redirectToLoginIfUnauthorized(res)) return;
            if (!res.ok) throw new Error("bad status");
            await loadClassSettings(classe);
            loadManageList(classe);
          } catch (e2) {
            alert("Impossible de mettre à jour le déblocage (serveur inaccessible).");
            unlockBtn.disabled = false;
          }
        });
        row.append(unlockBtn);
      }

      manageList.appendChild(row);
    });

    return { excludedCount: submissions.filter((s) => !s.included).length };
  }

  // ---- Statistiques ----

  async function loadStats(options) {
    const silent = options && options.silent;
    const classesArr = Array.from(selectedStatsClasses);

    // Aucune classe n'a encore jamais répondu : rien à cocher, ce n'est
    // pas la même situation qu'un enseignant qui aurait tout décoché.
    if (knownClasses.length === 0) {
      loadingEl.hidden = true;
      errorEl.hidden = true;
      statsEmptySelection.hidden = true;
      contentEl.hidden = false;
      statsCardsEl.hidden = true;
      dashboardUpdated.textContent = "";
      scopeSummary.textContent = "Aucune réponse comptabilisée pour l'instant.";
      noDataText.innerHTML = "Aucune réponse comptabilisée pour l'instant.<br>Demande à tes élèves de calculer leur empreinte et de cliquer sur « Partager mon résultat » à la fin.";
      noDataEl.hidden = false;
      return;
    }

    if (classesArr.length === 0) {
      loadingEl.hidden = true;
      errorEl.hidden = true;
      contentEl.hidden = true;
      statsEmptySelection.hidden = false;
      scopeSummary.textContent = "Aucune classe sélectionnée.";
      dashboardUpdated.textContent = "";
      return;
    }
    statsEmptySelection.hidden = true;

    if (!silent) {
      contentEl.hidden = true;
      errorEl.hidden = true;
      loadingEl.hidden = false;
    }

    const allSelected = knownClasses.length > 0 && classesArr.length === knownClasses.length;

    let stats;
    try {
      const url = `api/stats?classes=${classesArr.map(encodeURIComponent).join(",")}`;
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

    if (classesArr.length === 1) {
      scopeSummary.textContent = `Classe « ${classesArr[0]} » — ${fmt(stats.count, 0)} réponse(s) comptabilisée(s).`;
    } else if (allSelected) {
      scopeSummary.textContent = `Toutes classes confondues — ${fmt(stats.count, 0)} réponse(s) comptabilisée(s) sur ${fmt(stats.classesCount, 0)} classe(s).`;
    } else {
      scopeSummary.textContent = `Moyenne combinée de ${fmt(classesArr.length, 0)} classes sélectionnées — ${fmt(stats.count, 0)} réponse(s) comptabilisée(s).`;
    }

    if (!stats.count) {
      statsCardsEl.hidden = true;
      noDataText.innerHTML =
        classesArr.length === 1
          ? `Aucune réponse comptabilisée pour la classe « ${classesArr[0]} » pour l'instant.`
          : "Aucune réponse comptabilisée pour l'instant, pour les classes sélectionnées.";
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

  }

  // Charge la politique de réponse et la liste des élèves de la classe
  // choisie dans l'onglet Classe — indépendant de la sélection (multiple)
  // de l'onglet Statistiques.
  async function loadManageClassData(classe) {
    await loadClassSettings(classe);
    await loadManageList(classe);
  }

  async function init() {
    const params = new URLSearchParams(window.location.search);
    const classeParam = params.get("classe") || "";
    const initialStatsList = classeParam
      ? classeParam.split(",").map((s) => s.trim()).filter(Boolean)
      : [];
    const initialManage = initialStatsList.length === 1 ? initialStatsList[0] : "";

    await populateClasses(initialManage, initialStatsList);
    updateUrlForSelection();
    loadStats();
    loadManageClassData(manageClassSelect.value);
  }

  manageClassSelect.addEventListener("change", () => {
    loadManageClassData(manageClassSelect.value);
  });

  // ---- Créer une classe à l'avance (sans attendre de réponse d'élève),
  // pour pouvoir régler sa politique de réponse avant que les élèves ne
  // s'y connectent ----

  const createClassForm = document.getElementById("create-class-form");
  const createClassInput = document.getElementById("create-class-input");
  const createClassError = document.getElementById("create-class-error");
  const createClassSuccess = document.getElementById("create-class-success");

  createClassForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    createClassError.hidden = true;
    createClassSuccess.hidden = true;
    const classe = createClassInput.value.trim();
    if (!classe) return;

    const submitBtn = createClassForm.querySelector("button[type=submit]");
    submitBtn.disabled = true;
    try {
      const res = await fetch("api/classes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ classe }),
      });
      if (redirectToLoginIfUnauthorized(res)) return;
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        createClassError.textContent = data.error || "Impossible de créer cette classe.";
        createClassError.hidden = false;
        return;
      }
      createClassInput.value = "";
      createClassSuccess.hidden = false;
      // Préselectionne la classe créée dans le sélecteur de gestion, pour
      // enchaîner directement sur le réglage de sa politique de réponse.
      await populateClasses(data.classe, null);
      loadManageClassData(manageClassSelect.value);
      loadStats(); // rafraîchit la liste à cocher de l'onglet Statistiques
    } catch (e2) {
      createClassError.textContent = "Impossible de contacter le serveur.";
      createClassError.hidden = false;
    } finally {
      submitBtn.disabled = false;
    }
  });

  // ---- Supprimer les données d'une classe (classe par classe, plutôt
  // qu'un unique bouton "réinitialiser" dont la portée dépendait du
  // sélecteur) ----

  const deleteClassesList = document.getElementById("delete-classes-list");

  function renderDeleteClassesList() {
    deleteClassesList.innerHTML = "";
    knownClasses.forEach((c) => {
      const row = document.createElement("div");
      row.className = "manage-row";

      const label = document.createElement("span");
      label.className = "manage-pseudo";
      label.textContent = `${c.classe} (${c.count})`;

      const delBtn = document.createElement("button");
      delBtn.className = "btn btn-ghost btn-sm";
      delBtn.type = "button";
      delBtn.textContent = "🗑️ Supprimer";
      delBtn.addEventListener("click", async () => {
        // Confirmation renforcée (taper le nom de la classe) plutôt qu'un
        // simple OK/Annuler, vu le caractère irréversible de l'action.
        const typed = prompt(`Pour confirmer la suppression définitive de la classe « ${c.classe} » et de tous les élèves associés, tape exactement son nom ci-dessous :`);
        if (typed === null) return; // annulé
        if (typed !== c.classe) {
          alert("Le nom saisi ne correspond pas — suppression annulée.");
          return;
        }
        delBtn.disabled = true;
        try {
          const res = await fetch(`api/submissions?classe=${encodeURIComponent(c.classe)}`, { method: "DELETE" });
          if (redirectToLoginIfUnauthorized(res)) return;
          if (!res.ok) throw new Error("bad status");
          selectedStatsClasses.delete(c.classe);
          const wasManageSelected = manageClassSelect.value === c.classe;
          await populateClasses(wasManageSelected ? "" : manageClassSelect.value, null);
          updateUrlForSelection();
          loadStats();
          loadManageClassData(manageClassSelect.value);
        } catch (e) {
          alert("Impossible de supprimer cette classe (serveur inaccessible).");
          delBtn.disabled = false;
        }
      });

      row.append(label, delBtn);
      deleteClassesList.appendChild(row);
    });
  }

  // ---- Mode projection (vue simplifiée, actualisée automatiquement) ----

  document.getElementById("projection-btn").addEventListener("click", () => {
    const classesArr = Array.from(selectedStatsClasses);
    const allSelected = knownClasses.length > 0 && classesArr.length === knownClasses.length;
    const url = new URL("projection.html", window.location.href);
    if (classesArr.length > 0 && !allSelected) url.searchParams.set("classe", classesArr.join(","));
    window.open(url.toString(), "_blank", "noopener");
  });

  // ---- Impression du rapport ----

  document.getElementById("dashboard-print-btn").addEventListener("click", () => {
    window.print();
  });

  // ---- Export CSV ----

  document.getElementById("export-csv-btn").addEventListener("click", async () => {
    const classesArr = Array.from(selectedStatsClasses);
    if (classesArr.length === 0) return;
    const url = `api/export.csv?classes=${classesArr.map(encodeURIComponent).join(",")}`;
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
    info: document.getElementById("tab-panel-info"),
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
