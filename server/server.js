// Petit serveur Node.js : sert l'application statique et expose une API
// minimale pour les statistiques de classe (base SQLite locale, données
// anonymes uniquement — aucun nom, aucune adresse IP stockée). "classe"
// et "eleve" sont des libellés libres passés en paramètre d'URL par
// l'enseignant·e (ex. ?classe=5B&eleve=12), pas des données d'identité.
"use strict";

const path = require("path");
const express = require("express");
const db = require("./db");

const CATEGORIES = ["smartphone", "tablette", "ordinateur", "objets", "consoleTv", "streaming", "visio", "ia"];
const MAX_PLAUSIBLE_KG = 10000; // garde-fou anti-abus, très au-delà d'un cas réel
const MAX_LABEL_LEN = 60;

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, "..")));

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
  const params = { created_at: new Date().toISOString(), classe, eleve, total: body.total, ...values };

  // Colonnes générées depuis CATEGORIES pour éviter la duplication
  // manuelle à chaque ajout de catégorie.
  const columns = ["created_at", "classe", "eleve", "total", ...CATEGORIES];
  const placeholders = columns.map((c) => `@${c}`).join(", ");

  // Avec classe + élève renseignés, une nouvelle réponse remplace la
  // précédente du même élève (upsert) plutôt que de créer un doublon.
  const sql =
    classe && eleve
      ? `
    INSERT INTO submissions (${columns.join(", ")})
    VALUES (${placeholders})
    ON CONFLICT(classe, eleve) WHERE classe != '' AND eleve != ''
    DO UPDATE SET created_at = excluded.created_at, total = excluded.total,
      ${CATEGORIES.map((c) => `${c} = excluded.${c}`).join(", ")}
  `
      : `
    INSERT INTO submissions (${columns.join(", ")})
    VALUES (${placeholders})
  `;

  db.prepare(sql).run(params);
  res.json({ ok: true });
});

// Liste des classes distinctes ayant au moins une réponse (incluse ou
// non), pour peupler le sélecteur du tableau de bord — une classe dont
// tous les élèves seraient exclus doit rester sélectionnable pour être
// gérée. Le compte affiché ne porte que sur les réponses comptabilisées.
app.get("/api/classes", (req, res) => {
  const classes = db
    .prepare(
      `SELECT classe, SUM(included) as count FROM submissions WHERE classe != '' GROUP BY classe ORDER BY classe COLLATE NOCASE`
    )
    .all();
  res.json({ classes });
});

// ?classe=... limite aux réponses de cette classe ; sans paramètre,
// renvoie les statistiques combinées de toutes les classes. Dans les
// deux cas, seules les réponses non exclues (included = 1) comptent.
app.get("/api/stats", (req, res) => {
  const classe = sanitizeLabel(req.query.classe || "");
  const rows = classe
    ? db.prepare("SELECT * FROM submissions WHERE classe = ? AND included = 1").all(classe)
    : db.prepare("SELECT * FROM submissions WHERE included = 1").all();

  const stats = computeStats(rows);
  if (!classe) {
    stats.classesCount = db
      .prepare("SELECT COUNT(DISTINCT classe) as n FROM submissions WHERE classe != '' AND included = 1")
      .get().n;
  }
  res.json(stats);
});

// Liste nominative (pseudo) des réponses d'une classe, incluses ou non,
// pour la gestion de classe du tableau de bord. classe est obligatoire.
app.get("/api/submissions", (req, res) => {
  const classe = sanitizeLabel(req.query.classe || "");
  if (!classe) {
    return res.status(400).json({ error: "paramètre classe requis" });
  }
  const rows = db
    .prepare(
      "SELECT id, eleve, total, included, created_at FROM submissions WHERE classe = ? ORDER BY total DESC"
    )
    .all(classe);
  res.json({ submissions: rows });
});

// Inclut ou exclut une réponse précise du calcul des statistiques,
// sans la supprimer.
app.patch("/api/submissions/:id", (req, res) => {
  const id = Number(req.params.id);
  const included = req.body ? req.body.included : undefined;
  if (!Number.isInteger(id) || typeof included !== "boolean") {
    return res.status(400).json({ error: "paramètres invalides" });
  }
  const result = db.prepare("UPDATE submissions SET included = ? WHERE id = ?").run(included ? 1 : 0, id);
  if (result.changes === 0) {
    return res.status(404).json({ error: "introuvable" });
  }
  res.json({ ok: true });
});

// ?classe=... ne réinitialise que cette classe ; sans paramètre,
// réinitialise l'ensemble des données (toutes classes confondues).
// Supprime aussi bien les réponses incluses qu'exclues.
app.delete("/api/submissions", (req, res) => {
  const classe = sanitizeLabel(req.query.classe || "");
  if (classe) {
    db.prepare("DELETE FROM submissions WHERE classe = ?").run(classe);
  } else {
    db.prepare("DELETE FROM submissions").run();
  }
  res.json({ ok: true });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Empreinte Numérique — serveur lancé sur http://localhost:${PORT}`);
  console.log(`Tableau de bord enseignant : http://localhost:${PORT}/dashboard.html`);
});
