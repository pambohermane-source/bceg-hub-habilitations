require("dotenv").config();
const path = require("path");
const express = require("express");
const { pool, migrate, nextRef, defaultChecklist } = require("./db");
const { hashPassword, verifyPassword, signToken, requireAuth, requireRole } = require("./auth");
const { sendFinalNotification } = require("./mailer");

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, "..", "public")));

const now = () =>
  new Date().toLocaleString("fr-FR", { dateStyle: "long", timeStyle: "short" });

/* ---------------------------------------------------------------- */
/*  Auth                                                             */
/* ---------------------------------------------------------------- */

app.post("/api/auth/login", async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: "E-mail et mot de passe requis." });

  const { rows } = await pool.query("SELECT * FROM users WHERE email = $1", [email.toLowerCase()]);
  const user = rows[0];
  if (!user || !verifyPassword(password, user.password_hash)) {
    return res.status(401).json({ error: "Identifiants invalides." });
  }
  const token = signToken(user);
  res.json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
});

app.get("/api/me", requireAuth, (req, res) => res.json({ user: req.user }));

/* ---------------------------------------------------------------- */
/*  Lecture des demandes                                             */
/* ---------------------------------------------------------------- */

app.get("/api/requests", requireAuth, async (req, res) => {
  const { rows } = await pool.query("SELECT * FROM requests ORDER BY updated_at DESC");
  res.json({ requests: rows });
});

app.get("/api/requests/:id", requireAuth, async (req, res) => {
  const { rows } = await pool.query("SELECT * FROM requests WHERE id = $1", [req.params.id]);
  if (!rows[0]) return res.status(404).json({ error: "Demande introuvable." });
  res.json({ request: rows[0] });
});

/* ---------------------------------------------------------------- */
/*  Création d'une demande (rôle métier / admin)                     */
/* ---------------------------------------------------------------- */

app.post("/api/requests", requireAuth, requireRole("metier", "admin"), async (req, res) => {
  const b = req.body || {};
  if (!b.demandeur || !b.poste) {
    return res.status(400).json({ error: "Nom et poste de l'utilisateur requis." });
  }
  const ref = await nextRef();
  const timeline = [
    { label: "Demande soumise", actor: `${req.user.name} (métier)`, date: now(), state: "done" },
    { label: "Contrôle SSI1", actor: "en attente", date: "—", state: "current" },
  ];
  const { rows } = await pool.query(
    `INSERT INTO requests
      (ref, demandeur, user_email, poste, direction, agence, departement, service, type_demande, motif, apps, code_utilisateur, stage, badge, timeline, checklist, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'ssi1',NULL,$13,$14,$15)
     RETURNING *`,
    [
      ref, b.demandeur, b.user_email || null, b.poste, b.direction, b.agence, b.departement,
      b.service, b.type_demande, b.motif, JSON.stringify(b.apps || []), b.code_utilisateur,
      JSON.stringify(timeline), JSON.stringify(defaultChecklist()), req.user.id,
    ]
  );
  res.status(201).json({ request: rows[0] });
});

/* ---------------------------------------------------------------- */
/*  Renvoi d'une demande corrigée par le métier (après rejet SSI1)   */
/* ---------------------------------------------------------------- */

app.post("/api/requests/:id/resend", requireAuth, requireRole("metier", "admin"), async (req, res) => {
  const { rows } = await pool.query("SELECT * FROM requests WHERE id = $1", [req.params.id]);
  const r = rows[0];
  if (!r) return res.status(404).json({ error: "Demande introuvable." });
  if (r.stage !== "ssi1" || r.badge !== "retour") {
    return res.status(409).json({ error: "Cette demande n'est pas en attente de correction." });
  }
  const timeline = [
    ...r.timeline,
    { label: "Demande corrigée et renvoyée", actor: `${req.user.name} (métier)`, date: now(), state: "done" },
    { label: "Contrôle SSI1", actor: "en attente", date: "—", state: "current" },
  ];
  const { rows: updated } = await pool.query(
    `UPDATE requests SET badge = NULL, timeline = $1, updated_at = now() WHERE id = $2 RETURNING *`,
    [JSON.stringify(timeline), r.id]
  );
  res.json({ request: updated[0] });
});

/* ---------------------------------------------------------------- */
/*  Checklist de sécurité SSI (14 critères, chacun rattaché à un rôle)*/
/* ---------------------------------------------------------------- */

app.patch("/api/requests/:id/checklist", requireAuth, async (req, res) => {
  const { itemId, status, responsible, comment } = req.body || {};
  const validStatuses = ["valide", "en_cours", "a_faire", "na"];
  if (status !== undefined && !validStatuses.includes(status)) {
    return res.status(400).json({ error: "Statut de critère invalide." });
  }
  if (!itemId) return res.status(400).json({ error: "Critère non identifié." });

  const { rows } = await pool.query("SELECT * FROM requests WHERE id = $1", [req.params.id]);
  const r = rows[0];
  if (!r) return res.status(404).json({ error: "Demande introuvable." });

  const target = (r.checklist || []).find((c) => c.id === itemId);
  if (!target) return res.status(404).json({ error: "Critère introuvable sur ce dossier." });

  const role = req.user.role;
  const canEdit = role === "admin" || role === "ssi1" || role === target.role;
  if (!canEdit) {
    return res.status(403).json({ error: `Ce critère est réservé au rôle ${target.role}.` });
  }

  const checklist = (r.checklist || []).map((c) =>
    c.id === itemId
      ? { ...c, status: status !== undefined ? status : c.status, responsible: responsible ?? c.responsible, comment: comment ?? c.comment }
      : c
  );

  const { rows: updated } = await pool.query(
    `UPDATE requests SET checklist = $1, updated_at = now() WHERE id = $2 RETURNING *`,
    [JSON.stringify(checklist), r.id]
  );
  res.json({ request: updated[0] });
});

/* ---------------------------------------------------------------- */
/*  Approbation CISO (préalable à la transmission SSI1 → SSI2)       */
/* ---------------------------------------------------------------- */

app.patch("/api/requests/:id/ciso", requireAuth, requireRole("ciso", "admin"), async (req, res) => {
  const { approved, note } = req.body || {};
  const { rows } = await pool.query("SELECT * FROM requests WHERE id = $1", [req.params.id]);
  const r = rows[0];
  if (!r) return res.status(404).json({ error: "Demande introuvable." });
  if (r.stage !== "ssi1") {
    return res.status(409).json({ error: "L'approbation CISO ne s'applique qu'au contrôle SSI1." });
  }

  let timeline = [...r.timeline];
  if (approved) {
    timeline.push({ label: "Approbation CISO", actor: `${req.user.name} — approuvé`, date: now(), state: "done" });
  }

  const { rows: updated } = await pool.query(
    `UPDATE requests SET ciso_approved = $1, ciso_note = $2, timeline = $3, updated_at = now() WHERE id = $4 RETURNING *`,
    [!!approved, note || "", JSON.stringify(timeline), r.id]
  );
  res.json({ request: updated[0] });
});

/* ---------------------------------------------------------------- */
/*  Circuit de validation : SSI1 → SSI2 → DSI → SSI2 (info) → clôture */
/* ---------------------------------------------------------------- */

app.post("/api/requests/:id/action", requireAuth, async (req, res) => {
  const { action, note } = req.body || {};
  const { rows } = await pool.query("SELECT * FROM requests WHERE id = $1", [req.params.id]);
  const r = rows[0];
  if (!r) return res.status(404).json({ error: "Demande introuvable." });

  const role = req.user.role;
  const actor = req.user.name;
  let timeline = [...r.timeline];
  let newStage = r.stage;
  let newBadge = r.badge;

  const bad = () => res.status(409).json({ error: "Action non valide pour l'étape actuelle du dossier." });

  if (r.stage === "ssi1" && !r.badge) {
    if (role !== "ssi1" && role !== "admin") return res.status(403).json({ error: "Réservé au SSI1." });
    if (action === "validate") {
      const restants = (r.checklist || []).filter((c) => c.status !== "valide" && c.status !== "na");
      if (restants.length > 0) {
        return res.status(409).json({
          error: `Checklist de sécurité incomplète : ${restants.length} critère(s) restant(s) (${restants.map((c) => c.criterion).slice(0, 3).join(", ")}${restants.length > 3 ? "…" : ""}).`,
        });
      }
      if (!r.ciso_approved) {
        return res.status(409).json({ error: "Approbation du CISO requise avant transmission au SSI2." });
      }
      timeline.push({ label: "Contrôle SSI1", actor: `${actor} — visa OK`, date: now(), state: "done" });
      timeline.push({ label: "Traitement SSI2", actor: "en attente", date: "—", state: "current" });
      newStage = "ssi2"; newBadge = null;
    } else if (action === "reject") {
      if (!note) return res.status(400).json({ error: "Une note justificative est requise pour un rejet." });
      timeline.push({ label: "Contrôle SSI1", actor, date: now(), state: "rejected", note });
      timeline.push({ label: "Retour au demandeur", actor: "avec note justificative", date: now(), state: "current" });
      newStage = "ssi1"; newBadge = "retour";
    } else return bad();

  } else if (r.stage === "ssi2") {
    if (role !== "ssi2" && role !== "admin") return res.status(403).json({ error: "Réservé au SSI2." });
    if (action === "validate") {
      timeline.push({ label: "Traitement SSI2", actor: `${actor} — profil créé, dossier flagué`, date: now(), state: "done" });
      timeline.push({ label: "Traitement DSI", actor: "en attente", date: "—", state: "current" });
      newStage = "dsi"; newBadge = "flag";
    } else if (action === "reject") {
      if (!note) return res.status(400).json({ error: "Une note justificative est requise pour un rejet." });
      timeline.push({ label: "Traitement SSI2", actor, date: now(), state: "rejected", note });
      timeline.push({ label: "Retour au SSI1", actor: "avec note", date: now(), state: "current" });
      newStage = "ssi1"; newBadge = "retour";
    } else return bad();

  } else if (r.stage === "dsi") {
    if (role !== "dsi" && role !== "admin") return res.status(403).json({ error: "Réservé à la DSI." });
    if (action === "complete") {
      timeline.push({ label: "Traitement DSI", actor: `${actor} — exécution système terminée`, date: now(), state: "done" });
      timeline.push({ label: "Retour SSI2 pour information", actor: "en attente", date: "—", state: "current" });
      newStage = "ssi2_info"; newBadge = "info";
    } else return bad();

  } else if (r.stage === "ssi2_info") {
    if (role !== "ssi2" && role !== "admin") return res.status(403).json({ error: "Réservé au SSI2." });
    if (action === "acknowledge") {
      timeline.push({ label: "Retour SSI2 pour information", actor: `${actor} — pris acte`, date: now(), state: "done" });
      timeline.push({ label: "Notification utilisateur", actor: "e-mail en cours d'envoi", date: now(), state: "done" });
      newStage = "cloture"; newBadge = null;
    } else return bad();

  } else {
    return res.status(409).json({ error: "Ce dossier est clôturé." });
  }

  const { rows: updated } = await pool.query(
    `UPDATE requests SET stage=$1, badge=$2, timeline=$3, updated_at=now() WHERE id=$4 RETURNING *`,
    [newStage, newBadge, JSON.stringify(timeline), r.id]
  );

  if (newStage === "cloture") {
    try {
      await sendFinalNotification(updated[0]);
    } catch (e) {
      console.error("Échec envoi e-mail :", e.message);
    }
  }

  res.json({ request: updated[0] });
});

/* ---------------------------------------------------------------- */

app.get("/api/health", (req, res) => res.json({ ok: true }));

const PORT = process.env.PORT || 3000;

migrate()
  .then(() => {
    app.listen(PORT, () => console.log(`✓ BCEG Hub Digital en écoute sur le port ${PORT}`));
  })
  .catch((e) => {
    console.error("Échec de l'initialisation de la base :", e);
    process.exit(1);
  });
