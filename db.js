// Stockage local en JSON — un seul fichier, aucune donnée identifiante
// (classe/pseudo sont des libellés libres fournis par lien d'URL ou
// saisis par l'élève lui-même, jamais son vrai nom). "included" permet
// à l'enseignant·e d'exclure une réponse du calcul sans la supprimer
// (voir la gestion de classe dans le tableau de bord).
//
// Volontairement en JSON plutôt qu'en SQLite : better-sqlite3 est un
// module natif (compilé), qui échoue à l'installation sur certains
// hébergements mutualisés dépourvus de compilateur ou de binaire
// précompilé pour leur configuration exacte. Un fichier JSON lu/écrit
// de façon synchrone n'a besoin d'aucune dépendance externe et convient
// largement au volume d'une classe (au plus quelques centaines de
// réponses) — les écritures synchrones évitent toute course entre deux
// requêtes qui modifieraient le fichier en même temps.
"use strict";

const fs = require("fs");
const path = require("path");

const DB_PATH = path.join(__dirname, "empreinte.json");

function load() {
  try {
    const parsed = JSON.parse(fs.readFileSync(DB_PATH, "utf8"));
    if (Array.isArray(parsed.submissions) && typeof parsed.nextId === "number") return parsed;
  } catch (e) {
    /* fichier absent ou illisible : on repart d'une base vide */
  }
  return { submissions: [], nextId: 1 };
}

function save() {
  fs.writeFileSync(DB_PATH, JSON.stringify(state), "utf8");
}

let state = load();

// fields = { created_at, classe, eleve, total, smartphone, ... } (une
// valeur par catégorie). Avec classe + eleve non vides, une nouvelle
// soumission du même élève remplace la précédente (met à jour toutes
// ses valeurs, mais conserve son "included" existant) plutôt que d'en
// créer une autre.
function upsertSubmission(fields) {
  if (fields.classe && fields.eleve) {
    const existing = state.submissions.find((s) => s.classe === fields.classe && s.eleve === fields.eleve);
    if (existing) {
      Object.assign(existing, fields);
      save();
      return existing;
    }
  }
  const row = { id: state.nextId++, included: 1, ...fields };
  state.submissions.push(row);
  save();
  return row;
}

function getAll() {
  return state.submissions;
}

function findSubmission(classe, eleve) {
  return state.submissions.find((s) => s.classe === classe && s.eleve === eleve) || null;
}

function setIncluded(id, included) {
  const row = state.submissions.find((s) => s.id === id);
  if (!row) return false;
  row.included = included ? 1 : 0;
  save();
  return true;
}

function deleteByClasse(classe) {
  state.submissions = state.submissions.filter((s) => s.classe !== classe);
  if (state.classSettings) delete state.classSettings[classe];
  save();
}

function deleteAll() {
  state.submissions = [];
  save();
}

// Politique de réponse d'une classe : "multiple" (défaut — remplace le
// comportement historique, une nouvelle réponse écrase toujours la
// précédente) ou "single" (une seule réponse par élève, sauf
// déblocage explicite). unlockedAll est un interrupteur classe entière
// qui reste actif jusqu'à ce que l'enseignant·e le désactive à nouveau
// (utile pour "on refait l'exercice ensemble aujourd'hui") ;
// unlockedStudents est une autorisation à usage unique par élève,
// consommée automatiquement dès que cet élève renvoie une réponse
// (voir consumeStudentUnlock, appelé depuis /api/submit).
function getClassSettings(classe) {
  const s = state.classSettings && state.classSettings[classe];
  return {
    policy: (s && s.policy) || "multiple",
    unlockedAll: !!(s && s.unlockedAll),
    unlockedStudents: (s && s.unlockedStudents) || [],
  };
}

function ensureClassSettings(classe) {
  if (!state.classSettings) state.classSettings = {};
  if (!state.classSettings[classe]) {
    state.classSettings[classe] = { policy: "multiple", unlockedAll: false, unlockedStudents: [] };
  }
  return state.classSettings[classe];
}

function setClassPolicy(classe, policy) {
  const s = ensureClassSettings(classe);
  s.policy = policy === "single" ? "single" : "multiple";
  save();
}

function setClassUnlockedAll(classe, unlocked) {
  const s = ensureClassSettings(classe);
  s.unlockedAll = !!unlocked;
  save();
}

function setStudentUnlocked(classe, eleve, unlocked) {
  const s = ensureClassSettings(classe);
  const idx = s.unlockedStudents.indexOf(eleve);
  if (unlocked && idx === -1) s.unlockedStudents.push(eleve);
  if (!unlocked && idx !== -1) s.unlockedStudents.splice(idx, 1);
  save();
}

function consumeStudentUnlock(classe, eleve) {
  const s = state.classSettings && state.classSettings[classe];
  if (!s) return;
  const idx = s.unlockedStudents.indexOf(eleve);
  if (idx !== -1) {
    s.unlockedStudents.splice(idx, 1);
    save();
  }
}

// Mot de passe administrateur (haché, voir password-hash.js), stocké ici
// pour que le tableau de bord soit utilisable sans rien configurer sur
// le serveur (pas de fichier .env à déployer) : il est défini une
// première fois depuis le tableau de bord lui-même (voir /api/admin/setup
// dans server.js), puis modifiable depuis celui-ci. Une variable
// d'environnement ADMIN_PASSWORD_HASH / ADMIN_PASSWORD reste possible et
// est alors prioritaire (utile en secours si l'accès est perdu).
function getAdminPasswordHash() {
  return state.adminPasswordHash || null;
}

function setAdminPasswordHash(hash) {
  state.adminPasswordHash = hash;
  save();
}

module.exports = {
  upsertSubmission,
  getAll,
  findSubmission,
  setIncluded,
  deleteByClasse,
  deleteAll,
  getAdminPasswordHash,
  setAdminPasswordHash,
  getClassSettings,
  setClassPolicy,
  setClassUnlockedAll,
  setStudentUnlocked,
  consumeStudentUnlock,
};
