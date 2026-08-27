const { Pool } = require("pg");

if (!process.env.DATABASE_URL) {
  console.error("✗ DATABASE_URL manquant. Ajoutez le plugin PostgreSQL sur Railway (ou renseignez .env).");
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.PGSSL === "true" ? { rejectUnauthorized: false } : false,
});

/* Rôles disponibles dans le Hub Digital */
const ROLES = [
  "metier", "ssi1", "ssi2", "dsi", "admin",
  "ciso", "analyste_ssi", "analyste_risque", "gestionnaire_iam",
  "compliance", "admin_ad", "admin_siem", "chef_projet",
];

async function migrate() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT now()
    );

    CREATE SEQUENCE IF NOT EXISTS request_ref_seq START 100;

    CREATE TABLE IF NOT EXISTS requests (
      id SERIAL PRIMARY KEY,
      ref TEXT UNIQUE NOT NULL,
      demandeur TEXT NOT NULL,
      user_email TEXT,
      poste TEXT,
      direction TEXT,
      agence TEXT,
      departement TEXT,
      service TEXT,
      type_demande TEXT,
      motif TEXT,
      apps JSONB DEFAULT '[]',
      code_utilisateur TEXT,
      stage TEXT NOT NULL DEFAULT 'ssi1',
      badge TEXT,
      timeline JSONB NOT NULL DEFAULT '[]',
      created_by INTEGER REFERENCES users(id),
      created_at TIMESTAMPTZ DEFAULT now(),
      updated_at TIMESTAMPTZ DEFAULT now()
    );

    ALTER TABLE requests ADD COLUMN IF NOT EXISTS checklist JSONB NOT NULL DEFAULT '[]';
    ALTER TABLE requests ADD COLUMN IF NOT EXISTS ciso_approved BOOLEAN NOT NULL DEFAULT false;
    ALTER TABLE requests ADD COLUMN IF NOT EXISTS ciso_note TEXT NOT NULL DEFAULT '';

    ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
    ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN (${ROLES.map((r) => `'${r}'`).join(",")}));
  `);
}

/* Checklist de sécurité SSI — 14 critères, chacun rattaché au rôle qui en est responsable
   (base transmise par Daniel Koumba) */
const CHECKLIST_TEMPLATE = [
  { id: "dossier_complet", criterion: "Dossier d'habilitation complet", role: "chef_projet" },
  { id: "justification", criterion: "Justification métier explicite", role: "chef_projet" },
  { id: "doublon", criterion: "Vérification doublon demandes", role: "analyste_ssi" },
  { id: "classification", criterion: "Classification des données (PUBLIC/INT/CONF/TC)", role: "analyste_ssi" },
  { id: "cvss", criterion: "CVSS des accès demandés ≤ seuil", role: "analyste_risque" },
  { id: "moindre_privilege", criterion: "Vérification du principe de moindre privilège", role: "gestionnaire_iam" },
  { id: "separation_duties", criterion: "Pas de conflit de séparation des tâches", role: "analyste_ssi" },
  { id: "rgpd", criterion: "Conformité RGPD", role: "compliance" },
  { id: "pci_dss", criterion: "Conformité PCI-DSS (si monétique)", role: "compliance" },
  { id: "iso27001", criterion: "Conformité ISO 27001", role: "compliance" },
  { id: "mfa", criterion: "MFA activé", role: "admin_ad" },
  { id: "siem_logging", criterion: "Logging SIEM configuré", role: "admin_siem" },
  { id: "alertes", criterion: "Alertes anomalies définies", role: "admin_siem" },
  { id: "audit_trail", criterion: "Audit trail complet", role: "admin_siem" },
];

function defaultChecklist() {
  return CHECKLIST_TEMPLATE.map((c) => ({
    ...c,
    status: "a_faire", // 'valide' | 'en_cours' | 'a_faire' | 'na'
    responsible: "",
    comment: "",
  }));
}

async function nextRef() {
  const { rows } = await pool.query("SELECT nextval('request_ref_seq') AS n");
  const year = new Date().getFullYear();
  return `REQ-${year}-${String(rows[0].n).padStart(4, "0")}`;
}

module.exports = { pool, migrate, nextRef, defaultChecklist, ROLES };
