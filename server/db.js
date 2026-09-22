// Base SQLite locale — un seul fichier, aucune donnée identifiante.
"use strict";

const path = require("path");
const Database = require("better-sqlite3");

const db = new Database(path.join(__dirname, "empreinte.db"));

db.exec(`
  CREATE TABLE IF NOT EXISTS submissions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at TEXT NOT NULL,
    total REAL NOT NULL,
    smartphone REAL NOT NULL,
    tablette REAL NOT NULL,
    ordinateur REAL NOT NULL,
    objets REAL NOT NULL,
    streaming REAL NOT NULL,
    ia REAL NOT NULL
  )
`);

module.exports = db;
