// Base SQLite locale — un seul fichier, aucune donnée identifiante
// (classe/élève sont des libellés libres fournis par l'enseignant·e
// via l'URL, pas des données d'identité).
"use strict";

const path = require("path");
const Database = require("better-sqlite3");

const db = new Database(path.join(__dirname, "empreinte.db"));

db.exec(`
  CREATE TABLE IF NOT EXISTS submissions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at TEXT NOT NULL,
    classe TEXT NOT NULL DEFAULT '',
    eleve TEXT NOT NULL DEFAULT '',
    total REAL NOT NULL,
    smartphone REAL NOT NULL,
    tablette REAL NOT NULL,
    ordinateur REAL NOT NULL,
    objets REAL NOT NULL,
    streaming REAL NOT NULL,
    ia REAL NOT NULL
  )
`);

// Migration légère pour une base créée avant l'ajout de classe/eleve.
const existingColumns = db.prepare("PRAGMA table_info(submissions)").all().map((c) => c.name);
if (!existingColumns.includes("classe")) {
  db.exec("ALTER TABLE submissions ADD COLUMN classe TEXT NOT NULL DEFAULT ''");
}
if (!existingColumns.includes("eleve")) {
  db.exec("ALTER TABLE submissions ADD COLUMN eleve TEXT NOT NULL DEFAULT ''");
}

// Un même élève (classe+eleve non vides) ne compte qu'une fois : une
// nouvelle soumission met à jour la précédente plutôt que d'en créer
// une autre (voir la clause ON CONFLICT dans server.js).
db.exec(`
  CREATE UNIQUE INDEX IF NOT EXISTS idx_submissions_classe_eleve
  ON submissions(classe, eleve)
  WHERE classe != '' AND eleve != ''
`);

module.exports = db;
