const nodemailer = require("nodemailer");

function getTransport() {
  if (!process.env.SMTP_HOST) return null;
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: Number(process.env.SMTP_PORT) === 465,
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
      : undefined,
  });
}

async function sendFinalNotification(request) {
  const transport = getTransport();
  const subject = `BCEG — Habilitation ${request.ref} activée`;
  const body = `Bonjour ${request.demandeur},

Votre demande d'habilitation ${request.ref} (${request.type_demande}) a été traitée et validée par la Sécurité des Systèmes d'Information et la DSI.

Vos accès sont désormais actifs.

Hub Digital BCEG — Réinventons l'avenir`;

  if (!transport || !request.user_email) {
    console.log(`[mailer] Envoi simulé (SMTP non configuré ou e-mail utilisateur absent) → ${request.ref}`);
    return { simulated: true };
  }

  await transport.sendMail({
    from: process.env.SMTP_FROM || "BCEG Hub Digital <no-reply@bceg.ga>",
    to: request.user_email,
    subject,
    text: body,
  });
  return { simulated: false };
}

module.exports = { sendFinalNotification };
