#!/usr/bin/env node
// Petit outil en ligne de commande : génère un hash (scrypt) du mot de
// passe administrateur, à coller dans ADMIN_PASSWORD_HASH (fichier .env
// ou variables d'environnement de l'hébergeur) à la place de
// ADMIN_PASSWORD en clair — voir le README, section "Protéger le
// tableau de bord par mot de passe".
//
// Usage : node hash-password.js
// (la saisie n'est pas affichée à l'écran, et n'est jamais écrite sur
// disque par ce script)
"use strict";

const { hashPassword } = require("./password-hash");

function promptHidden(question) {
  return new Promise((resolve) => {
    if (!process.stdin.isTTY) {
      // Pas de terminal interactif (script, pipe...) : on ne devine
      // rien, il faut lancer ce script directement dans un terminal.
      resolve("");
      return;
    }

    process.stdout.write(question);
    const stdin = process.stdin;
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding("utf8");

    let input = "";
    const onData = (char) => {
      char = char.toString();
      if (char === "\n" || char === "\r" || char === "\u0004") {
        stdin.setRawMode(false);
        stdin.pause();
        stdin.removeListener("data", onData);
        process.stdout.write("\n");
        resolve(input);
        return;
      }
      if (char === "\u0003") {
        process.stdout.write("\n");
        process.exit(1); // Ctrl+C
      }
      if (char === "\u007f" || char === "\b") {
        input = input.slice(0, -1);
        return;
      }
      input += char;
    };
    stdin.on("data", onData);
  });
}

(async () => {
  const password = await promptHidden("Mot de passe à hacher (saisie masquée, rien ne s'affiche) : ");
  if (!password) {
    console.error("Aucun mot de passe saisi. Relance : node hash-password.js");
    process.exit(1);
  }

  console.log("\nAjoute cette ligne à ton fichier .env (ou aux variables d'environnement de ton hébergeur), à la place de ADMIN_PASSWORD :\n");
  console.log(`ADMIN_PASSWORD_HASH=${hashPassword(password)}`);
  console.log("\nLe mot de passe en clair n'a été écrit nulle part par cet outil.");
})();
