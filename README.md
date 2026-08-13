# BCEG Hub Digital — Habilitations utilisateur

Application fonctionnelle (Node.js/Express + PostgreSQL) qui gère le circuit réel :

```
Métier (DG/DGA/N+1) → SSI1 → SSI2 → DSI → SSI2 (information) → clôture + e-mail
```

Chaque validation, rejet et note justificative est enregistré et horodaté. Le rejet SSI1
renvoie au demandeur ; le rejet SSI2 renvoie au SSI1 ; après traitement DSI, le dossier
repasse obligatoirement par le SSI2 avant l'envoi de l'e-mail final à l'utilisateur.

## 1. Tester en local (facultatif)

```bash
cp .env.example .env          # renseigner DATABASE_URL (une base Postgres locale ou distante)
npm install
npm run seed                  # crée les comptes de démo (metier/ssi1/ssi2/dsi @bceg.ga — demo1234)
npm start                     # http://localhost:3000
```

## 2. Déployer sur GitHub

```bash
git init
git add .
git commit -m "BCEG Hub Digital — v1"
git branch -M main
git remote add origin https://github.com/<votre-compte>/bceg-hub-habilitations.git
git push -u origin main
```

Le fichier `.env` n'est jamais poussé (voir `.gitignore`) — les secrets se configurent
uniquement dans Railway (étape suivante).

## 3. Déployer sur Railway

1. Sur [railway.app](https://railway.app) → **New Project → Deploy from GitHub repo** → sélectionner `bceg-hub-habilitations`.
2. Dans le même projet, cliquer **+ New → Database → Add PostgreSQL**. Railway injecte
   automatiquement `DATABASE_URL` dans le service web — rien à copier manuellement.
3. Sur le service web, onglet **Variables**, ajouter :
   - `JWT_SECRET` — une chaîne longue et aléatoire (obligatoire)
   - `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` — pour l'envoi réel
     de l'e-mail final. Tant que ces variables sont vides, l'envoi est simulé et journalisé
     dans les logs (l'appli reste utilisable pour valider le workflow).
   - `PGSSL` — laisser à `false` (la connexion interne Railway n'en a pas besoin).
4. Railway détecte `npm start` automatiquement (voir `package.json`). Au premier
   déploiement, le serveur crée les tables tout seul (`migrate()` dans `src/db.js`).
5. Créer les comptes de démonstration une seule fois, depuis l'onglet **Deployments →
   Run command** (ou `railway run npm run seed` en local avec le CLI Railway relié au
   projet) :
   ```bash
   npm run seed
   ```
6. Ouvrir l'URL fournie par Railway (`*.up.railway.app`) — l'écran de connexion s'affiche.

## 4. Après validation métier — migration vers votre propre serveur

L'app n'a aucune dépendance propre à Railway :

- N'importe quel serveur Node ≥ 18 + une base PostgreSQL suffisent.
- Copier `.env.example` → `.env`, renseigner `DATABASE_URL` de votre PostgreSQL interne
  et un nouveau `JWT_SECRET`.
- `npm install --production && npm run seed && npm start`, ou faire tourner le process
  derrière `pm2`/`systemd` + un reverse proxy (nginx) pour le HTTPS interne.
- Penser à changer immédiatement les mots de passe des comptes de démonstration (ou les
  supprimer et créer les comptes réels directement en base).

## Comptes de démonstration (à changer avant tout usage réel)

| Rôle | E-mail | Mot de passe |
|---|---|---|
| Métier (DG/DGA/N+1) | metier@bceg.ga | demo1234 |
| SSI1 | ssi1@bceg.ga | demo1234 |
| SSI2 | ssi2@bceg.ga | demo1234 |
| DSI | dsi@bceg.ga | demo1234 |

## Ce qui reste volontairement simple dans cette v1

- Un seul rôle par personne (pas de délégation ni de suppléance).
- Pas de pièce jointe (le formulaire original prévoit des signatures papier — ici
  remplacées par le circuit de validation numérique horodaté).
- Le rejet SSI2 revient au SSI1 en tête de file (pas de file "à corriger" séparée) —
  à ajuster si votre équipe le souhaite.

Charte graphique appliquée : vert #4D553D, sage #A6AA9E, typographies Space Grotesk /
Inter (proches d'Utendo / Acumin), motif "écorce" repris dans le rail latéral et le fil
de suivi de dossier.
