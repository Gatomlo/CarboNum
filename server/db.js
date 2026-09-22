// Base SQLite locale — un seul fichier, aucune donnée identifiante
// (classe/pseudo sont des libellés libres fournis par lien d'URL ou
// saisis par l'élève lui-même, jamais son vrai nom). "included"
// permet à l'enseignant·e d'exclure une réponse du calcul sans la
// supprimer (voir la gestion de classe dans le tableau de bord).
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
    consoleTv REAL NOT NULL DEFAULT 0,
    streaming REAL NOT NULL,
    visio REAL NOT NULL DEFAULT 0,
    ia REAL NOT NULL,
    included INTEGER NOT NULL DEFAULT 1
  )
`);

// Migrations légères pour une base créée avant l'ajout de ces colonnes.
const existingColumns = db.prepare("PRAGMA table_info(submissions)").all().map((c) => c.name);
if (!existingColumns.includes("classe")) {
  db.exec("ALTER TABLE submissions ADD COLUMN classe TEXT NOT NULL DEFAULT ''");
}
if (!existingColumns.includes("eleve")) {
  db.exec("ALTER TABLE submissions ADD COLUMN eleve TEXT NOT NULL DEFAULT ''");
}
if (!existingColumns.includes("included")) {
  db.exec("ALTER TABLE submissions ADD COLUMN included INTEGER NOT NULL DEFAULT 1");
}
if (!existingColumns.includes("consoleTv")) {
  db.exec("ALTER TABLE submissions ADD COLUMN consoleTv REAL NOT NULL DEFAULT 0");
}
if (!existingColumns.includes("visio")) {
  db.exec("ALTER TABLE submissions ADD COLUMN visio REAL NOT NULL DEFAULT 0");
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
