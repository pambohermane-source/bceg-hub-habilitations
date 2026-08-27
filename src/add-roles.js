require("dotenv").config();
const { pool, migrate } = require("./db");
const { hashPassword } = require("./auth");

const NEW_USERS = [
  { name: "Dimitri Bayoupi", email: "ciso@bceg.ga", role: "ciso" },
  { name: "Analyste SSI", email: "analyste-ssi@bceg.ga", role: "analyste_ssi" },
  { name: "Analyste Risque", email: "analyste-risque@bceg.ga", role: "analyste_risque" },
  { name: "Gestionnaire IAM", email: "iam@bceg.ga", role: "gestionnaire_iam" },
  { name: "Compliance", email: "compliance@bceg.ga", role: "compliance" },
  { name: "Admin AD", email: "admin-ad@bceg.ga", role: "admin_ad" },
  { name: "Admin SIEM", email: "admin-siem@bceg.ga", role: "admin_siem" },
  { name: "Chef Projet", email: "chef-projet@bceg.ga", role: "chef_projet" },
];
const DEMO_PASSWORD = "demo1234";

async function addRoles() {
  await migrate();
  let created = 0;
  for (const u of NEW_USERS) {
    const { rows } = await pool.query("SELECT id FROM users WHERE email = $1", [u.email]);
    if (rows.length > 0) {
      console.log(`- ${u.email} existe déjà, ignoré.`);
      continue;
    }
    await pool.query(
      "INSERT INTO users (name, email, password_hash, role) VALUES ($1,$2,$3,$4)",
      [u.name, u.email, hashPassword(DEMO_PASSWORD), u.role]
    );
    console.log(`✓ ${u.email} (${u.role}) créé.`);
    created++;
  }
  console.log(`\n${created} nouveau(x) compte(s) créé(s) (mot de passe : demo1234).`);
  process.exit(0);
}

addRoles().catch((e) => {
  console.error(e);
  process.exit(1);
});
