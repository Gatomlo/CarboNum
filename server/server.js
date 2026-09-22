// Petit serveur Node.js : sert l'application statique et expose une API
// minimale pour les statistiques de classe (base SQLite locale, données
// anonymes uniquement — aucun nom, aucune adresse IP stockée).
"use strict";

const path = require("path");
const express = require("express");
const db = require("./db");

const CATEGORIES = ["smartphone", "tablette", "ordinateur", "objets", "streaming", "ia"];
const MAX_PLAUSIBLE_KG = 10000; // garde-fou anti-abus, très au-delà d'un cas réel

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, "..")));

function isValidNumber(n) {
  return typeof n === "number" && Number.isFinite(n) && n >= 0 && n <= MAX_PLAUSIBLE_KG;
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

  const stmt = db.prepare(`
    INSERT INTO submissions (created_at, total, smartphone, tablette, ordinateur, objets, streaming, ia)
    VALUES (@created_at, @total, @smartphone, @tablette, @ordinateur, @objets, @streaming, @ia)
  `);
  stmt.run({ created_at: new Date().toISOString(), total: body.total, ...values });

  res.json({ ok: true });
});

app.get("/api/stats", (req, res) => {
  const rows = db.prepare("SELECT * FROM submissions").all();

  if (rows.length === 0) {
    return res.json({ count: 0 });
  }

  const count = rows.length;
  const totals = rows.map((r) => r.total);
  const min = Math.min(...totals);
  const max = Math.max(...totals);
  const avg = totals.reduce((a, b) => a + b, 0) / count;

  const avgByCategory = {};
  for (const c of CATEGORIES) {
    avgByCategory[c] = rows.reduce((sum, r) => sum + r[c], 0) / count;
  }

  res.json({ count, min, max, avg, avgByCategory });
});

app.delete("/api/submissions", (req, res) => {
  db.prepare("DELETE FROM submissions").run();
  res.json({ ok: true });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Empreinte Numérique — serveur lancé sur http://localhost:${PORT}`);
  console.log(`Tableau de bord enseignant : http://localhost:${PORT}/dashboard.html`);
});
