require("dotenv").config();
const { pool, migrate } = require("./db");
const { hashPassword } = require("./auth");

const DEMO_USERS = [
  { name: "Sylvie Metier", email: "metier@bceg.ga", role: "metier" },
  { name: "Christian Oyono", email: "ssi1@bceg.ga", role: "ssi1" },
  { name: "Larissa Nze", email: "ssi2@bceg.ga", role: "ssi2" },
  { name: "Fabrice Ondo", email: "dsi@bceg.ga", role: "dsi" },
];
const DEMO_PASSWORD = "demo1234";

async function seed() {
  await migrate();
  const { rows } = await pool.query("SELECT COUNT(*)::int AS n FROM users");
  if (rows[0].n > 0) {
    console.log("Des comptes existent déjà — seed ignoré.");
    process.exit(0);
  }
  for (const u of DEMO_USERS) {
    await pool.query(
      "INSERT INTO users (name, email, password_hash, role) VALUES ($1,$2,$3,$4)",
      [u.name, u.email, hashPassword(DEMO_PASSWORD), u.role]
    );
  }
  console.log("✓ Comptes de démonstration créés (mot de passe : demo1234) :");
  DEMO_USERS.forEach((u) => console.log(`  - ${u.email} (${u.role})`));
  console.log("⚠ À changer immédiatement avant toute mise en production réelle.");
  process.exit(0);
}

seed().catch((e) => {
  console.error(e);
  process.exit(1);
});
