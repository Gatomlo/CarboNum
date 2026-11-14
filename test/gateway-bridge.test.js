// Connexion centralisee de node-gateway : req.gateway avec le droit « admin » authentifie la requete comme
// administrateur, a chaque requete et sans session (coupe des que la passerelle ne garantit plus). Un simple
// « membre » n'obtient rien. Le mot de passe local reste valable. Hors passerelle : inchange.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const http = require("http");

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "carbonum-gw-"));
process.env.CARBONUM_DB_PATH = path.join(dir, "empreinte.json");
const express = require("express");
const app = require("../server");

let srv, base;
const gw = (role) => ({ "x-test-gateway": JSON.stringify({ app: "carbonum", role, user: { login: "thomas", name: "Thomas", email: null, isSuper: false } }) });
const get = (p, headers = {}) => fetch(base + p, { headers });

test.before(async () => {
  const outer = express();
  outer.use((req, res, next) => { const h = req.get("x-test-gateway"); if (h) req.gateway = JSON.parse(h); next(); });
  outer.use("/carbonum", app);
  srv = http.createServer(outer);
  await new Promise((r) => srv.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${srv.address().port}/carbonum`;
});
test.after(() => { srv.close(); fs.rmSync(dir, { recursive: true, force: true }); setImmediate(() => process.exit(0)); });

test("droit admin de la passerelle -> acces administrateur, sans session", async () => {
  const s = await (await get("/api/admin/session", gw("admin"))).json();
  assert.equal(s.authenticated, true);
  const r = await get("/api/classes", gw("admin"));
  assert.equal(r.status, 200);
  assert.equal(r.headers.get("set-cookie"), null, "aucun cookie pose");
});

test("coupe aussitot quand la passerelle ne garantit plus (aucune session persistante)", async () => {
  assert.equal((await get("/api/classes", gw("admin"))).status, 200);
  assert.equal((await get("/api/classes")).status, 401);
});

test("un simple membre, un anonyme ou un droit nul n'obtiennent rien", async () => {
  for (const h of [gw("member"), gw(null), {}]) {
    assert.equal((await get("/api/classes", h)).status, 401);
    assert.equal((await (await get("/api/admin/session", h)).json()).authenticated, false);
  }
});

test("mot de passe local inchange : definition puis connexion", async () => {
  let r = await fetch(base + "/api/admin/setup", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ password: "motdepasse-solide" }) });
  assert.equal(r.status, 200);
  const cookie = r.headers.get("set-cookie").split(";")[0];
  assert.equal((await get("/api/classes", { cookie })).status, 200);
  assert.equal((await get("/api/classes")).status, 401);
});
