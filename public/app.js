const API = "/api";
let TOKEN = localStorage.getItem("bceg_token");
let ME = null;
let REQUESTS = [];

/* ---------------------------------------------------------------- */
/*  Utilitaires                                                       */
/* ---------------------------------------------------------------- */

async function api(path, options = {}) {
  const res = await fetch(API + path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(TOKEN ? { Authorization: "Bearer " + TOKEN } : {}),
      ...(options.headers || {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Une erreur est survenue.");
  return data;
}

function initials(name) {
  return (name || "?").split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();
}

/* ---------------------------------------------------------------- */
/*  Connexion                                                         */
/* ---------------------------------------------------------------- */

document.getElementById("login-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = document.getElementById("login-email").value.trim();
  const password = document.getElementById("login-password").value;
  const errEl = document.getElementById("login-error");
  errEl.classList.add("hidden");
  try {
    const { token, user } = await api("/auth/login", { method: "POST", body: JSON.stringify({ email, password }) });
    TOKEN = token;
    localStorage.setItem("bceg_token", token);
    ME = user;
    boot();
  } catch (err) {
    errEl.textContent = err.message;
    errEl.classList.remove("hidden");
  }
});

document.getElementById("logout-btn").addEventListener("click", () => {
  TOKEN = null;
  localStorage.removeItem("bceg_token");
  location.reload();
});

async function boot() {
  try {
    const { user } = await api("/me");
    ME = user;
  } catch {
    localStorage.removeItem("bceg_token");
    document.getElementById("login-screen").classList.remove("hidden-force");
    document.getElementById("app-shell").classList.add("hidden-force");
    return;
  }
  document.getElementById("login-screen").classList.add("hidden-force");
  document.getElementById("app-shell").classList.remove("hidden-force");
  document.getElementById("user-avatar").textContent = initials(ME.name);
  document.getElementById("user-name").textContent = ME.name;
  document.getElementById("user-role").textContent = roleLabel(ME.role);
  if (ME.role !== "metier" && ME.role !== "admin") { document.getElementById("nav-new").classList.add("hidden-force"); document.getElementById("new-request-btn").classList.add("hidden-force"); }
  lucide.createIcons();
  await loadRequests();
}

function roleLabel(role) {
  return { metier: "Métier", ssi1: "SSI · Contrôle sécurité", ssi2: "SSI · Traitement", dsi: "DSI", admin: "Administrateur" }[role] || role;
}

/* ---------------------------------------------------------------- */
/*  Dashboard                                                         */
/* ---------------------------------------------------------------- */

const stageMeta = {
  ssi1_wait: { col: "col-demande" }, // affiché uniquement quand badge=retour (attente correction métier)
  ssi1: { col: "col-ssi1" },
  ssi2: { col: "col-ssi2" },
  dsi: { col: "col-dsi" },
  ssi2_info: { col: "col-ssi2" },
  cloture: { col: "col-cloture" },
};
const badgeMeta = {
  retour: { text: "Retour avec note", cls: "bg-clay/10 text-clay" },
  flag: { text: "Dossier flagué", cls: "bg-gold/15 text-gold" },
  info: { text: "Pour information", cls: "bg-leaf/15 text-leaf" },
};

async function loadRequests() {
  const { requests } = await api("/requests");
  REQUESTS = requests;
  renderBoard();
}

function columnFor(r) {
  if (r.stage === "ssi1" && r.badge === "retour") return "col-demande";
  return stageMeta[r.stage]?.col || "col-demande";
}

function renderBoard() {
  ["col-demande", "col-ssi1", "col-ssi2", "col-dsi", "col-cloture"].forEach((id) => (document.getElementById(id).innerHTML = ""));
  const counts = { "col-demande": 0, "col-ssi1": 0, "col-ssi2": 0, "col-dsi": 0, "col-cloture": 0 };

  REQUESTS.forEach((r) => {
    const colId = columnFor(r);
    counts[colId]++;
    const badge = r.badge ? `<span class="text-[10px] font-medium px-2 py-0.5 rounded-full ${badgeMeta[r.badge].cls}">${badgeMeta[r.badge].text}</span>` : "";
    const card = document.createElement("button");
    card.className = "w-full text-left bg-surface rounded-xl border border-[--line] shadow-card p-4 hover:border-forest/40 hover:shadow-md transition-all";
    card.innerHTML = `
      <div class="flex items-start justify-between gap-2 mb-2.5">
        <span class="font-mono text-[11px] text-ink/40">${r.ref}</span>
        ${badge}
      </div>
      <div class="flex items-center gap-2.5 mb-2">
        <div class="w-8 h-8 rounded-full bg-sage-soft text-forest text-[11px] font-semibold flex items-center justify-center shrink-0 font-display">${initials(r.demandeur)}</div>
        <div class="min-w-0">
          <p class="text-[13px] font-medium truncate">${r.demandeur}</p>
          <p class="text-[11px] text-ink/45 truncate">${r.poste || ""}</p>
        </div>
      </div>
      <div class="flex items-center justify-between mt-3 pt-3 border-t border-[--line]">
        <span class="text-[11px] text-ink/45">${r.direction || "—"}</span>
        <span class="text-[11px] font-medium bg-sage-soft text-forest px-2 py-0.5 rounded-full">${(r.type_demande || "").split(" ")[0] || "—"}</span>
      </div>`;
    card.addEventListener("click", () => openDetail(r.id));
    document.getElementById(colId).appendChild(card);
  });

  Object.entries(counts).forEach(([id, n]) => {
    const suffix = id.replace("col-", "count-");
    const el = document.getElementById(suffix);
    if (el) el.textContent = n;
  });

  const retours = REQUESTS.filter((r) => r.badge === "retour").length;
  document.getElementById("stats-line").innerHTML =
    `<span class="font-display font-semibold text-lg">${REQUESTS.length}</span> <span class="text-ink/45">en cours</span>` +
    `<span class="mx-3 text-ink/20">·</span><span class="font-display font-semibold text-lg text-clay">${retours}</span> <span class="text-ink/45">retours en attente</span>`;
}

/* ---------------------------------------------------------------- */
/*  Fil de suivi                                                      */
/* ---------------------------------------------------------------- */

function renderTimeline(steps) {
  return steps.map((s, i) => {
    const isLast = i === steps.length - 1;
    const dot = s.state === "done" ? "bg-forest border-forest"
      : s.state === "current" ? "bg-white border-forest status-dot"
      : s.state === "rejected" ? "bg-clay border-clay"
      : "bg-white border-[--line]";
    const textCls = s.state === "pending" ? "text-ink/35" : "text-ink";
    const line = !isLast ? `<div class="absolute left-[7px] top-5 w-px bg-[--line]" style="height:calc(100% - 4px)"></div>` : "";
    const note = s.note ? `
      <div class="mt-2 ml-1 relative">
        <svg width="20" height="16" class="absolute -left-4 top-1 text-clay/50" viewBox="0 0 20 16" fill="none"><path d="M0 0 C 4 0, 4 8, 10 8 L 18 8" stroke="currentColor" stroke-width="1.2"/></svg>
        <div class="ml-4 bg-clay/[0.06] border border-clay/20 rounded-lg px-3 py-2 text-[12px] text-clay/90 leading-snug">${s.note}</div>
      </div>` : "";
    return `
      <div class="relative pl-7 pb-6 last:pb-0">
        ${line}
        <div class="absolute left-0 top-0.5 w-3.5 h-3.5 rounded-full border-2 ${dot}"></div>
        <p class="text-[13px] font-medium ${textCls}">${s.label}</p>
        <p class="text-[11px] text-ink/45 mt-0.5">${s.actor}</p>
        <p class="text-[11px] font-mono text-ink/35 mt-0.5">${s.date}</p>
        ${note}
      </div>`;
  }).join("");
}

/* ---------------------------------------------------------------- */
/*  Panneau de détail + actions                                       */
/* ---------------------------------------------------------------- */

function actionButtons(r) {
  const role = ME.role;
  const btn = (label, cls, handler, needsNote = false) =>
    `<button data-note="${needsNote}" class="action-btn w-full text-sm font-medium px-4 py-2.5 rounded-lg ${cls} hover:opacity-90 transition-opacity" data-handler="${handler}">${label}</button>`;

  if (r.stage === "ssi1" && r.badge === "retour") {
    if (role === "metier" || role === "admin") return btn("Corriger et renvoyer au SSI1", "bg-forest text-white", "resend");
    return `<p class="text-sm text-ink/45">En attente de correction par le demandeur.</p>`;
  }
  if (r.stage === "ssi1") {
    if (role === "ssi1" || role === "admin") return btn("Valider — transmettre au SSI2", "bg-forest text-white", "validate") + btn("Rejeter avec note", "bg-clay/10 text-clay", "reject", true);
    return `<p class="text-sm text-ink/45">En attente de contrôle SSI1.</p>`;
  }
  if (r.stage === "ssi2") {
    if (role === "ssi2" || role === "admin") return btn("Valider — transmettre à la DSI", "bg-forest text-white", "validate") + btn("Rejeter vers SSI1", "bg-clay/10 text-clay", "reject", true);
    return `<p class="text-sm text-ink/45">En attente de traitement SSI2.</p>`;
  }
  if (r.stage === "dsi") {
    if (role === "dsi" || role === "admin") return btn("Traitement terminé — retour SSI2", "bg-forest text-white", "complete");
    return `<p class="text-sm text-ink/45">En attente de traitement DSI.</p>`;
  }
  if (r.stage === "ssi2_info") {
    if (role === "ssi2" || role === "admin") return btn("Confirmer et notifier l'utilisateur", "bg-forest text-white", "acknowledge");
    return `<p class="text-sm text-ink/45">En attente de confirmation SSI2.</p>`;
  }
  return `<div class="flex items-center gap-2 text-leaf text-sm font-medium"><i data-lucide="check-circle-2" class="w-4 h-4"></i> Dossier clôturé — utilisateur notifié</div>`;
}

async function openDetail(id) {
  const { request: r } = await api(`/requests/${id}`);
  const content = document.getElementById("detail-content");
  content.innerHTML = `
    <div class="sticky top-0 bg-surface/95 backdrop-blur border-b border-[--line] px-5 py-4 flex items-start justify-between gap-3 z-10">
      <div>
        <p class="font-mono text-[11px] text-ink/40 mb-1">${r.ref}</p>
        <h2 class="font-display font-semibold text-base leading-tight">${r.demandeur}</h2>
        <p class="text-[12px] text-ink/45">${r.poste || ""} · ${r.direction || ""}</p>
      </div>
      <button id="close-detail" class="w-8 h-8 rounded-full hover:bg-sage-soft flex items-center justify-center text-ink/50 shrink-0"><i data-lucide="x" class="w-4 h-4"></i></button>
    </div>
    <div class="p-5 space-y-6">
      <div>
        <h3 class="text-xs font-semibold uppercase tracking-wide text-ink/50 mb-3">Suivi du dossier</h3>
        <div>${renderTimeline(r.timeline)}</div>
      </div>
      <div class="grid grid-cols-2 gap-3 text-[12px]">
        <div class="bg-sage-soft rounded-lg px-3 py-2.5"><p class="text-ink/45 mb-0.5">Type de demande</p><p class="font-medium">${r.type_demande || "—"}</p></div>
        <div class="bg-sage-soft rounded-lg px-3 py-2.5"><p class="text-ink/45 mb-0.5">Code utilisateur</p><p class="font-mono font-medium">${r.code_utilisateur || "—"}</p></div>
        <div class="bg-sage-soft rounded-lg px-3 py-2.5"><p class="text-ink/45 mb-0.5">Département</p><p class="font-medium">${r.departement || "—"}</p></div>
        <div class="bg-sage-soft rounded-lg px-3 py-2.5"><p class="text-ink/45 mb-0.5">Agence</p><p class="font-medium">${r.agence || "—"}</p></div>
      </div>
      <div>
        <h3 class="text-xs font-semibold uppercase tracking-wide text-ink/50 mb-2">Motif</h3>
        <p class="text-[13px] text-ink/75 leading-relaxed">${r.motif || "—"}</p>
      </div>
      <div>
        <h3 class="text-xs font-semibold uppercase tracking-wide text-ink/50 mb-2">Accès demandés</h3>
        <ul class="space-y-1.5">
          ${(r.apps || []).map((a) => `<li class="flex items-start gap-2 text-[13px] text-ink/75"><i data-lucide="dot" class="w-4 h-4 text-forest shrink-0 -mt-0.5"></i>${a}</li>`).join("") || '<li class="text-[13px] text-ink/40">Aucune application cochée.</li>'}
        </ul>
      </div>
      <div id="note-field" class="hidden">
        <label class="text-xs text-ink/50 mb-1 block">Note justificative</label>
        <textarea id="action-note" rows="2" class="w-full px-3 py-2 text-sm rounded-lg border border-[--line] focus:border-forest/50 focus:outline-none" placeholder="Motif du rejet…"></textarea>
      </div>
      <p id="action-error" class="text-sm text-clay hidden"></p>
      <div class="pt-2 space-y-2">${actionButtons(r)}</div>
    </div>`;
  document.getElementById("close-detail").addEventListener("click", closeDetail);
  content.querySelectorAll(".action-btn").forEach((b) => b.addEventListener("click", () => runAction(r.id, b)));
  lucide.createIcons();
  document.getElementById("detail-panel").classList.remove("drawer-hidden");
  document.getElementById("drawer-overlay").classList.remove("hidden");
}

async function runAction(id, btnEl) {
  const handler = btnEl.dataset.handler;
  const needsNote = btnEl.dataset.note === "true";
  const noteField = document.getElementById("note-field");
  const errEl = document.getElementById("action-error");
  errEl.classList.add("hidden");

  if (needsNote && noteField.classList.contains("hidden")) {
    noteField.classList.remove("hidden");
    document.getElementById("action-note").focus();
    return;
  }
  const note = needsNote ? document.getElementById("action-note").value.trim() : undefined;
  if (needsNote && !note) {
    errEl.textContent = "Merci de préciser une note justificative.";
    errEl.classList.remove("hidden");
    return;
  }
  try {
    if (handler === "resend") {
      await api(`/requests/${id}/resend`, { method: "POST" });
    } else {
      await api(`/requests/${id}/action`, { method: "POST", body: JSON.stringify({ action: handler, note }) });
    }
    closeDetail();
    await loadRequests();
  } catch (err) {
    errEl.textContent = err.message;
    errEl.classList.remove("hidden");
  }
}

function closeDetail() {
  document.getElementById("detail-panel").classList.add("drawer-hidden");
  document.getElementById("drawer-overlay").classList.add("hidden");
}
document.getElementById("drawer-overlay").addEventListener("click", closeDetail);

/* ---------------------------------------------------------------- */
/*  Nouvelle demande                                                   */
/* ---------------------------------------------------------------- */

document.getElementById("new-request-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const errEl = document.getElementById("new-error");
  errEl.classList.add("hidden");
  const apps = Array.from(document.querySelectorAll("#apps-checkboxes input:checked")).map((c) => c.value);
  const acces = document.getElementById("f-acces").value.trim();
  if (acces) apps.push(`Accès système/réseau : ${acces}`);

  const payload = {
    demandeur: document.getElementById("f-demandeur").value.trim(),
    user_email: document.getElementById("f-email").value.trim(),
    poste: document.getElementById("f-poste").value.trim(),
    direction: document.getElementById("f-direction").value.trim(),
    agence: document.getElementById("f-agence").value.trim(),
    departement: document.getElementById("f-departement").value.trim(),
    service: document.getElementById("f-service").value.trim(),
    type_demande: document.querySelector('input[name="type"]:checked').value,
    motif: document.getElementById("f-motif").value.trim(),
    code_utilisateur: document.getElementById("f-code").value.trim(),
    apps,
  };
  try {
    await api("/requests", { method: "POST", body: JSON.stringify(payload) });
    e.target.reset();
    showView("dashboard");
    await loadRequests();
  } catch (err) {
    errEl.textContent = err.message;
    errEl.classList.remove("hidden");
  }
});

/* ---------------------------------------------------------------- */
/*  Navigation                                                         */
/* ---------------------------------------------------------------- */

function showView(name) {
  document.querySelectorAll(".view").forEach((v) => v.classList.remove("active"));
  document.getElementById("view-" + name).classList.add("active");
  document.querySelectorAll(".nav-link").forEach((l) => {
    if (l.dataset.view === name) { l.classList.add("bg-white/10", "text-white"); l.classList.remove("text-white/70"); }
    else { l.classList.remove("bg-white/10", "text-white"); l.classList.add("text-white/70"); }
  });
}
document.querySelectorAll("[data-view]").forEach((el) => el.addEventListener("click", (e) => { e.preventDefault(); showView(el.dataset.view); }));
document.querySelectorAll("[data-view-btn]").forEach((el) => el.addEventListener("click", () => showView(el.dataset.viewBtn)));

/* ---------------------------------------------------------------- */

lucide.createIcons();
if (TOKEN) boot();
