const { Pool } = require("pg");

if (!process.env.DATABASE_URL) {
  console.error("✗ DATABASE_URL manquant. Ajoutez le plugin PostgreSQL sur Railway (ou renseignez .env).");
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.PGSSL === "true" ? { rejectUnauthorized: false } : false,
});

async function migrate() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('metier','ssi1','ssi2','dsi','admin')),
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
  `);
}

async function nextRef() {
  const { rows } = await pool.query("SELECT nextval('request_ref_seq') AS n");
  const year = new Date().getFullYear();
  return `REQ-${year}-${String(rows[0].n).padStart(4, "0")}`;
}

module.exports = { pool, migrate, nextRef };
