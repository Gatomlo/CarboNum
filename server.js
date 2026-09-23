// Sert l'application statique (public/) et expose une API minimale pour
// les statistiques de classe (stockage JSON local, données anonymes
// uniquement — aucun nom, aucune adresse IP stockée). "classe" et
// "eleve" sont des libellés libres passés en paramètre d'URL par
// l'enseignant·e (ex. ?classe=5B&eleve=12), pas des données d'identité.
//
// Ce module exporte l'app Express (module.exports = app) plutôt que
// d'appeler app.listen() inconditionnellement, pour pouvoir être monté
// tel quel par une passerelle Node.js (ex. node-gateway) qui héberge
// plusieurs outils sur un seul processus, via app.use('/mon-outil',
// require('./server.js')) — Express retire alors automatiquement le
// préfixe avant que les routes ci-dessous ne le voient. Lancé seul
// (node server.js / npm start), il continue de démarrer son propre
// serveur normalement, voir le bloc require.main tout en bas.
"use strict";

const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const express = require("express");
const db = require("./db");
const { hashPassword, verifyPassword } = require("./password-hash");

// Petit chargeur de .env local (facultatif) — évite une dépendance
// externe (dotenv) pour un besoin d'une seule variable (PORT). Sur
// l'hébergement (Infomaniak…), on règle plutôt PORT via les variables
// d'environnement du panneau d'administration si besoin ; ce fichier ne
// sert qu'au confort en développement local. Ne touche jamais une
// variable déjà définie par l'environnement réel. Le mot de passe
// administrateur, lui, ne passe plus par ici du tout (voir plus bas) :
// il est saisi via le tableau de bord et stocké haché dans les données
// de classe.
(function loadDotEnv() {
  const envPath = path.join(__dirname, ".env");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)\s*$/);
    if (!match) continue;
    let value = match[2].trim().replace(/^["']|["']$/g, "");
    if (!(match[1] in process.env)) process.env[match[1]] = value;
  }
})();

const CATEGORIES = ["smartphone", "tablette", "ordinateur", "objets", "consoleTv", "streaming", "visio", "ia"];
const MAX_PLAUSIBLE_KG = 10000; // garde-fou anti-abus, très au-delà d'un cas réel
const MAX_LABEL_LEN = 60;

const app = express();
// Un seul niveau de proxy inverse devant l'app (cas standard d'un
// hébergement comme Infomaniak) : permet à req.secure et req.ip de
// refléter la vraie connexion cliente plutôt que celle du proxy.
app.set("trust proxy", 1);
app.use(express.json());
// Uniquement les fichiers destinés aux visiteurs (public/) — jamais le
// dossier racine, qui contient aussi la base de données et le code serveur.
app.use(express.static(path.join(__dirname, "public")));

// -------------------------------------------------------------------
// Authentification de l'espace enseignant (tableau de bord + API de
// statistiques). Un seul mot de passe partagé, pas de comptes
// individuels : c'est un outil pour une seule personne par déploiement.
// Session en mémoire (pas de dépendance à express-session) : un
// redémarrage du serveur déconnecte, ce qui est sans conséquence ici.
//
// Le mot de passe (haché, voir password-hash.js) est stocké avec les
// données de classe (db.js / empreinte.json) : défini une première fois
// depuis le tableau de bord lui-même (POST /api/admin/setup), rien à
// configurer sur le serveur — pas de variable d'environnement, pas de
// fichier. Il peut ensuite être changé à tout moment depuis le tableau
// de bord.
// -------------------------------------------------------------------

function isPasswordConfigured() {
  return !!db.getAdminPasswordHash();
}

function checkPassword(password) {
  if (!password) return false;
  const stored = db.getAdminPasswordHash();
  return stored ? verifyPassword(password, stored) : false;
}

const SESSION_COOKIE = "admin_session";
const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12 h
const sessions = new Map(); // token -> expiresAt

// Anti-force-brute minimal : verrouille une IP après plusieurs échecs.
const MAX_ATTEMPTS = 10;
const LOCKOUT_WINDOW_MS = 15 * 60 * 1000;
const failedAttempts = new Map(); // ip -> [timestamps]

function isLockedOut(ip) {
  const attempts = (failedAttempts.get(ip) || []).filter((t) => Date.now() - t < LOCKOUT_WINDOW_MS);
  failedAttempts.set(ip, attempts);
  return attempts.length >= MAX_ATTEMPTS;
}

function recordFailedAttempt(ip) {
  const attempts = failedAttempts.get(ip) || [];
  attempts.push(Date.now());
  failedAttempts.set(ip, attempts);
}

function parseCookies(req) {
  const header = req.headers.cookie;
  const cookies = {};
  if (!header) return cookies;
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    cookies[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim());
  }
  return cookies;
}

function isValidSession(token) {
  if (!token || !sessions.has(token)) return false;
  const expiresAt = sessions.get(token);
  if (Date.now() > expiresAt) {
    sessions.delete(token);
    return false;
  }
  return true;
}

function requireAdmin(req, res, next) {
  const token = parseCookies(req)[SESSION_COOKIE];
  if (!isValidSession(token)) {
    return res.status(401).json({ error: "non authentifié" });
  }
  next();
}

// Ouvre une session admin (cookie) : factorisé, utilisé après une
// connexion réussie comme après la définition initiale du mot de passe.
function openAdminSession(req, res) {
  const token = crypto.randomBytes(24).toString("hex");
  sessions.set(token, Date.now() + SESSION_TTL_MS);
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: req.secure,
    maxAge: SESSION_TTL_MS,
    path: "/",
  });
}

app.post("/api/admin/login", (req, res) => {
  if (!isPasswordConfigured()) {
    return res.status(503).json({ error: "Aucun mot de passe n'est encore configuré : ouvre le tableau de bord pour en définir un." });
  }

  const ip = req.ip || req.socket.remoteAddress || "unknown";
  if (isLockedOut(ip)) {
    return res.status(429).json({ error: "Trop de tentatives. Réessaie dans quelques minutes." });
  }

  const password = req.body && typeof req.body.password === "string" ? req.body.password : "";
  if (!checkPassword(password)) {
    recordFailedAttempt(ip);
    return res.status(401).json({ error: "Mot de passe incorrect." });
  }

  openAdminSession(req, res);
  res.json({ ok: true });
});

app.post("/api/admin/logout", (req, res) => {
  const token = parseCookies(req)[SESSION_COOKIE];
  if (token) sessions.delete(token);
  res.clearCookie(SESSION_COOKIE, { path: "/" });
  res.json({ ok: true });
});

app.get("/api/admin/session", (req, res) => {
  const token = parseCookies(req)[SESSION_COOKIE];
  res.json({ authenticated: isValidSession(token), configured: isPasswordConfigured() });
});

// Définit le mot de passe administrateur la toute première fois — sans
// authentification préalable, puisque personne ne peut encore se
// connecter. Volontairement à usage unique (refusé dès qu'un mot de
// passe existe déjà) : sinon n'importe qui connaissant l'URL du tableau
// de bord pourrait s'approprier le compte. Voir le README pour la
// fenêtre d'exposition que ça implique tant que le mot de passe n'a pas
// encore été défini.
app.post("/api/admin/setup", (req, res) => {
  if (isPasswordConfigured()) {
    return res.status(409).json({ error: "Un mot de passe est déjà configuré." });
  }
  const password = req.body && typeof req.body.password === "string" ? req.body.password : "";
  if (password.length < 8) {
    return res.status(400).json({ error: "Le mot de passe doit contenir au moins 8 caractères." });
  }

  db.setAdminPasswordHash(hashPassword(password));
  openAdminSession(req, res);
  res.json({ ok: true });
});

// Change le mot de passe stocké — nécessite une session valide.
app.post("/api/admin/change-password", requireAdmin, (req, res) => {
  const password = req.body && typeof req.body.password === "string" ? req.body.password : "";
  if (password.length < 8) {
    return res.status(400).json({ error: "Le mot de passe doit contenir au moins 8 caractères." });
  }
  db.setAdminPasswordHash(hashPassword(password));
  res.json({ ok: true });
});

function isValidNumber(n) {
  return typeof n === "number" && Number.isFinite(n) && n >= 0 && n <= MAX_PLAUSIBLE_KG;
}

function sanitizeLabel(v) {
  if (typeof v !== "string") return "";
  return v.trim().slice(0, MAX_LABEL_LEN);
}

function computeStats(rows) {
  if (rows.length === 0) return { count: 0 };

  const count = rows.length;
  const totals = rows.map((r) => r.total);
  const min = Math.min(...totals);
  const max = Math.max(...totals);
  const avg = totals.reduce((a, b) => a + b, 0) / count;

  const avgByCategory = {};
  for (const c of CATEGORIES) {
    avgByCategory[c] = rows.reduce((sum, r) => sum + r[c], 0) / count;
  }

  return { count, min, max, avg, avgByCategory };
}

app.post("/api/submit", (req, res) => {
  const body = req.body || {};
  const values = {};

  if (!isValidNumber(body.total)) {
    return res.status(400).json({ error: "total invalide" });
  }
  for (const c of CATEGORIES) {
    if (!isValidNumber(body[c])) {
      return res.status(400).json({ error: `${c} invalide` });
    }
    values[c] = body[c];
  }

  const classe = sanitizeLabel(body.classe);
  const eleve = sanitizeLabel(body.eleve);

  // Avec classe + élève renseignés, une nouvelle réponse remplace la
  // précédente du même élève (upsert) plutôt que de créer un doublon —
  // sauf si la classe est en politique "une seule réponse" et que cet
  // élève n'a pas été débloqué (voir getClassSettings dans db.js). Le
  // client (script.js) vérifie déjà ça avant de lancer le quiz, mais
  // c'est ici, côté serveur, que c'est réellement fait respecter.
  if (classe && eleve) {
    const existing = db.findSubmission(classe, eleve);
    if (existing) {
      const settings = db.getClassSettings(classe);
      const unlocked = settings.unlockedAll || settings.unlockedStudents.includes(eleve);
      if (settings.policy === "single" && !unlocked) {
        return res.status(403).json({
          error: "Une réponse a déjà été enregistrée pour ce pseudo dans cette classe. Demande à ton enseignant·e de te débloquer si tu dois la refaire.",
        });
      }
      // Déblocage individuel à usage unique : consommé dès qu'il sert,
      // pour ne pas avoir à re-verrouiller manuellement après coup.
      // Le déblocage "toute la classe" n'est lui jamais consommé tout
      // seul — l'enseignant·e le désactive explicitement.
      if (!settings.unlockedAll && settings.unlockedStudents.includes(eleve)) {
        db.consumeStudentUnlock(classe, eleve);
      }
    }
  }

  db.upsertSubmission({ created_at: new Date().toISOString(), classe, eleve, total: body.total, ...values });
  res.json({ ok: true });
});

// Permet à l'élève de savoir, avant de commencer le quiz, s'il a déjà
// répondu pour cette classe et ce pseudo, et si une nouvelle réponse
// est actuellement autorisée — pour proposer de reprendre/refaire au
// lieu de laisser une tentative échouer silencieusement à la fin.
// Publique comme /api/submit : classe + pseudo sont déjà contrôlés par
// l'élève lui-même via son lien, ce n'est pas une donnée à protéger.
app.get("/api/submission-status", (req, res) => {
  const classe = sanitizeLabel(req.query.classe || "");
  const eleve = sanitizeLabel(req.query.eleve || "");
  if (!classe || !eleve) {
    return res.json({ submitted: false, locked: false });
  }
  const existing = db.findSubmission(classe, eleve);
  if (!existing) {
    return res.json({ submitted: false, locked: false });
  }
  const settings = db.getClassSettings(classe);
  const unlocked = settings.unlockedAll || settings.unlockedStudents.includes(eleve);
  res.json({ submitted: true, locked: settings.policy === "single" && !unlocked });
});

// À partir d'ici, toutes les routes exposent des données de classe :
// réservées à l'enseignant·e connecté·e (voir requireAdmin plus haut).
// /api/submit reste public : c'est la seule route que les élèves
// utilisent, et elle n'expose aucune donnée en retour.

// Liste des classes distinctes ayant au moins une réponse (incluse ou
// non), pour peupler le sélecteur du tableau de bord — une classe dont
// tous les élèves seraient exclus doit rester sélectionnable pour être
// gérée. Le compte affiché ne porte que sur les réponses comptabilisées.
app.get("/api/classes", requireAdmin, (req, res) => {
  const countByClasse = {};
  for (const r of db.getAll()) {
    if (!r.classe) continue;
    countByClasse[r.classe] = (countByClasse[r.classe] || 0) + (r.included ? 1 : 0);
  }
  const classes = Object.keys(countByClasse)
    .sort((a, b) => a.localeCompare(b, "fr", { sensitivity: "base" }))
    .map((classe) => ({ classe, count: countByClasse[classe] }));
  res.json({ classes });
});

// Politique de réponse d'une classe ("multiple", par défaut — une
// nouvelle réponse remplace toujours la précédente — ou "single", une
// seule réponse par élève sauf déblocage) et son état de déblocage.
app.get("/api/class-settings", requireAdmin, (req, res) => {
  const classe = sanitizeLabel(req.query.classe || "");
  if (!classe) {
    return res.status(400).json({ error: "paramètre classe requis" });
  }
  res.json(db.getClassSettings(classe));
});

app.post("/api/class-settings/policy", requireAdmin, (req, res) => {
  const classe = sanitizeLabel(req.body && req.body.classe);
  const policy = req.body && req.body.policy;
  if (!classe || (policy !== "single" && policy !== "multiple")) {
    return res.status(400).json({ error: "paramètres invalides" });
  }
  db.setClassPolicy(classe, policy);
  res.json({ ok: true });
});

// Débloque (ou reverrouille) toute la classe d'un coup — reste actif
// jusqu'à ce que l'enseignant·e le désactive explicitement, contrairement
// au déblocage par élève ci-dessous, à usage unique.
app.post("/api/class-settings/unlock-all", requireAdmin, (req, res) => {
  const classe = sanitizeLabel(req.body && req.body.classe);
  if (!classe) {
    return res.status(400).json({ error: "paramètre classe requis" });
  }
  db.setClassUnlockedAll(classe, !!(req.body && req.body.unlocked));
  res.json({ ok: true });
});

app.post("/api/class-settings/unlock-student", requireAdmin, (req, res) => {
  const classe = sanitizeLabel(req.body && req.body.classe);
  const eleve = sanitizeLabel(req.body && req.body.eleve);
  if (!classe || !eleve) {
    return res.status(400).json({ error: "paramètres classe et eleve requis" });
  }
  db.setStudentUnlocked(classe, eleve, !!(req.body && req.body.unlocked));
  res.json({ ok: true });
});

// ?classes=A,B,C limite aux réponses de ces classes précises et renvoie
// leur moyenne combinée (utilisé par la sélection multiple de l'onglet
// Statistiques). À défaut, ?classe=... limite à une seule classe ; sans
// aucun paramètre, renvoie les statistiques combinées de toutes les
// classes (compatibilité avec les anciens liens). Dans tous les cas,
// seules les réponses non exclues (included = 1) comptent.
app.get("/api/stats", requireAdmin, (req, res) => {
  const all = db.getAll();
  let rows, classesCount;

  if (req.query.classes !== undefined) {
    const classesList = String(req.query.classes)
      .split(",")
      .map((s) => sanitizeLabel(s.trim()))
      .filter(Boolean);
    rows = all.filter((r) => r.included && classesList.includes(r.classe));
    classesCount = classesList.length;
  } else {
    const classe = sanitizeLabel(req.query.classe || "");
    rows = all.filter((r) => r.included && (!classe || r.classe === classe));
    classesCount = classe ? 1 : new Set(all.filter((r) => r.classe && r.included).map((r) => r.classe)).size;
  }

  const stats = computeStats(rows);
  stats.classesCount = classesCount;
  res.json(stats);
});

// Liste nominative (pseudo) des réponses d'une classe, incluses ou non,
// pour la gestion de classe du tableau de bord. classe est obligatoire.
app.get("/api/submissions", requireAdmin, (req, res) => {
  const classe = sanitizeLabel(req.query.classe || "");
  if (!classe) {
    return res.status(400).json({ error: "paramètre classe requis" });
  }
  const rows = db
    .getAll()
    .filter((r) => r.classe === classe)
    .sort((a, b) => b.total - a.total)
    .map((r) => ({ id: r.id, eleve: r.eleve, total: r.total, included: r.included, created_at: r.created_at }));
  res.json({ submissions: rows });
});

// Inclut ou exclut une réponse précise du calcul des statistiques,
// sans la supprimer.
app.patch("/api/submissions/:id", requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const included = req.body ? req.body.included : undefined;
  if (!Number.isInteger(id) || typeof included !== "boolean") {
    return res.status(400).json({ error: "paramètres invalides" });
  }
  if (!db.setIncluded(id, included)) {
    return res.status(404).json({ error: "introuvable" });
  }
  res.json({ ok: true });
});

// ?classe=... ne réinitialise que cette classe ; sans paramètre,
// réinitialise l'ensemble des données (toutes classes confondues).
// Supprime aussi bien les réponses incluses qu'exclues.
app.delete("/api/submissions", requireAdmin, (req, res) => {
  const classe = sanitizeLabel(req.query.classe || "");
  if (classe) {
    db.deleteByClasse(classe);
  } else {
    db.deleteAll();
  }
  res.json({ ok: true });
});

function csvField(value) {
  const s = value === undefined || value === null ? "" : String(value);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// Réduit une classe (texte libre saisi par un élève) à un nom de fichier
// sûr : la valeur traverse Content-Disposition, donc jamais de guillemets,
// de retours à la ligne ou d'autres caractères qui y auraient un sens.
function safeFilenamePart(s) {
  const cleaned = String(s || "")
    .normalize("NFKD")
    .replace(/[^\w-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return cleaned || "classe";
}

// Export CSV des réponses d'une ou plusieurs classes (?classes=A,B,C ou
// ?classe=...) ou de toutes les classes, pour archiver ou comparer les
// données avant une suppression.
app.get("/api/export.csv", requireAdmin, (req, res) => {
  let rows, filenamePart;
  if (req.query.classes !== undefined) {
    const classesList = String(req.query.classes)
      .split(",")
      .map((s) => sanitizeLabel(s.trim()))
      .filter(Boolean);
    rows = db.getAll().filter((r) => classesList.includes(r.classe));
    filenamePart = classesList.length === 1 ? safeFilenamePart(classesList[0]) : "classes-selectionnees";
  } else {
    const classe = sanitizeLabel(req.query.classe || "");
    rows = db.getAll().filter((r) => !classe || r.classe === classe);
    filenamePart = classe ? safeFilenamePart(classe) : "toutes-classes";
  }

  const header = ["classe", "eleve", "inclus", "total_kg", ...CATEGORIES, "date"];
  const lines = [header.map(csvField).join(",")];
  for (const r of rows) {
    const line = [r.classe || "", r.eleve || "", r.included ? "oui" : "non", r.total, ...CATEGORIES.map((c) => r[c]), r.created_at || ""];
    lines.push(line.map(csvField).join(","));
  }

  const filename = `empreinte-${filenamePart}.csv`;
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.send(`﻿${lines.join("\r\n")}`);
});

// Filet de sécurité : si une route lève une exception (le cas le plus
// probable étant une écriture d'empreinte.json impossible — dossier de
// l'app non accessible en écriture sur l'hébergeur), répond en JSON
// exploitable plutôt qu'avec la page HTML d'erreur par défaut d'Express,
// qui casse silencieusement le fetch() côté client (res.json() échoue,
// et l'appelant retombe sur un message générique sans piste). Doit
// rester la dernière chose déclarée sur l'app (convention Express pour
// un middleware d'erreur à 4 arguments).
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({
    error: "Erreur serveur inattendue. Vérifie que le dossier de l'app est accessible en écriture sur l'hébergeur (fichier empreinte.json), et consulte les journaux du serveur pour le détail.",
  });
});

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Empreinte Numérique — serveur lancé sur http://localhost:${PORT}`);
    console.log(`Tableau de bord enseignant : http://localhost:${PORT}/dashboard.html`);
  });
}

module.exports = app;
