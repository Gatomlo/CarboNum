// Hachage du mot de passe administrateur (scrypt, intégré à Node — pas
// de dépendance native comme bcrypt, pour ne pas revivre le problème de
// déploiement rencontré avec better-sqlite3 sur l'hébergement mutualisé).
// Utilisé par server.js (vérification à la connexion) et hash-password.js
// (génération d'un hash à coller dans ADMIN_PASSWORD_HASH).
"use strict";

const crypto = require("crypto");

const KEY_LENGTH = 64;

// Format stocké : "scrypt$<sel en hexadécimal>$<hash en hexadécimal>"
function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const derived = crypto.scryptSync(password, salt, KEY_LENGTH);
  return `scrypt$${salt.toString("hex")}$${derived.toString("hex")}`;
}

function verifyPassword(password, stored) {
  const parts = String(stored || "").split("$");
  if (parts.length !== 3 || parts[0] !== "scrypt") return false;

  let salt, expected;
  try {
    salt = Buffer.from(parts[1], "hex");
    expected = Buffer.from(parts[2], "hex");
  } catch (e) {
    return false;
  }
  if (!salt.length || expected.length !== KEY_LENGTH) return false;

  const actual = crypto.scryptSync(password, salt, KEY_LENGTH);
  return crypto.timingSafeEqual(actual, expected);
}

module.exports = { hashPassword, verifyPassword };
