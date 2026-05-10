 # SafeSpace — 3 features prioritaires (post-MVP)

Spécifications détaillées des 3 features qui peuvent transformer SafeSpace de "filtre de commentaires" à "produit indispensable" pour les créateurs.

**Ordre d'implémentation recommandé :**
1. Threat & Stalker Detection (3-4 sem) — change le pricing power
2. Questions → Idées de contenu (2-3 sem) — change le pitch commercial
3. Carte hebdo partageable (1-2 sem) — débloque l'acquisition gratuite

---

# Feature 1 — Threat & Stalker Detection

## Vision

Transformer SafeSpace de "filtre anti-anxiété" en **outil de sécurité**. Détection en temps réel des menaces réelles (données personnelles exposées, langage menaçant, comportements de harcèlement) avec alertes par email.

## Objectif business

| Métrique | Avant | Après |
|---|---|---|
| Douleur perçue | "anxiogène" (diffuse) | "ma sécurité, ma famille" (aiguë) |
| Willingness to pay | 5-15€/mo | **30-80€/mo** |
| Cible primaire | tous créateurs | créatrices, LGBTQ+, politiques, gaming, true crime |
| Substituabilité | YouTube peut copier | non — c'est de la sécurité, pas du UX |

**Justifie un nouveau plan "SafeSpace Shield" à 29-49€/mois** pour le segment "exposed creators".

## Ce que ça fait concrètement

### A. Détection de données personnelles exposées

L'IA scanne chaque commentaire pour détecter :
- **Adresse / lieu** : "Je sais que tu habites à Lyon", "tu vas souvent au café X rue Y"
- **École / travail** : "Ma cousine est dans ta classe à Sorbonne"
- **Famille** : "Comment va ta sœur Marie ?", "ton fils est trop mignon"
- **Identité civile** : "Ton vrai prénom c'est Pierre Dupont"
- **Routine** : "Tu sors toujours du sport à 18h le mardi"
- **Photos / contexte privé** : référence à des éléments visibles dans des stories perso

Score de sévérité 0-3 :
- **0 — Info** : mention bénigne ("j'habite Lyon aussi !")
- **1 — Attention** : mention spécifique non sollicitée
- **2 — Menace** : croisement d'infos personnelles + ton inquiétant
- **3 — Urgence** : exposition claire avec intention (doxxing, traque)

### B. Détection de patterns de harcèlement

Tracking par auteur (cross-video sur la chaîne) :
- Auteur qui commente >20 fois en 7 jours sur tes vidéos
- Auteur dont >50% des commentaires sont négatifs
- Auteur qui pose des questions intrusives répétées
- Auteur qui apparaît systématiquement sur chaque nouvelle vidéo dans les 5 minutes
- Score de risque agrégé par "stalker_profile"

### C. Détection de raids / brigades

Pic anomal détecté quand :
- >X% (typique 30%) de commentaires négatifs en <2h
- Tous depuis comptes <30 jours créés
- Patterns lexicaux similaires (copier-coller, mêmes insultes)
- Source potentielle (cross-platform mention sur Twitter/Reddit)

Alerte unique groupée plutôt qu'une notif par commentaire.

### D. Alertes email temps réel

Niveaux configurables :
- **Immédiat** : sévérité 3 uniquement
- **Quotidien** : digest des alertes 1-2-3 du jour
- **Hebdomadaire** : récap complet
- **Off** : pas d'email, tout reste dans le dashboard

Email contient : extrait du commentaire (sans révéler la donnée personnelle complète), score, lien direct vers `/security/alert/<id>`.

## Intégration dans l'app actuelle

### Migration BDD (0007)

```sql
-- Étendre la table comments
alter table public.comments
  add column if not exists threat_level smallint default 0,
  add column if not exists threat_categories jsonb;

create index if not exists idx_comments_threat
  on public.comments (channel_id, threat_level desc, published_at desc)
  where threat_level >= 1;

-- Profils de "stalkers" suivis dans le temps
create table if not exists public.stalker_profiles (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid references public.channels not null,
  platform_author_id text not null,
  author_name text,
  author_avatar text,
  comment_count integer default 0,
  negative_count integer default 0,
  risk_score numeric default 0,
  first_seen timestamptz default now(),
  last_seen timestamptz default now(),
  blocked boolean default false,
  notes text,
  created_at timestamptz default now(),
  unique (channel_id, platform_author_id)
);

create index if not exists idx_stalker_risk
  on public.stalker_profiles (channel_id, risk_score desc);

alter table public.stalker_profiles enable row level security;

create policy "users read own stalker profiles" on public.stalker_profiles
  for select using (
    channel_id in (select id from public.channels where user_id = auth.uid())
  );

-- Alertes regroupées (UI inbox)
create table if not exists public.threat_alerts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  channel_id uuid references public.channels,
  alert_type text not null,    -- 'pii' | 'stalker' | 'raid' | 'threat'
  severity smallint not null,  -- 0..3
  comment_id uuid references public.comments,
  stalker_id uuid references public.stalker_profiles,
  payload jsonb,               -- détails contextuels (catégories, extrait)
  email_sent boolean default false,
  dismissed boolean default false,
  created_at timestamptz default now()
);

create index if not exists idx_alerts_user_unread
  on public.threat_alerts (user_id, dismissed, severity desc, created_at desc);

alter table public.threat_alerts enable row level security;
create policy "users own alerts" on public.threat_alerts
  for all using (auth.uid() = user_id);

-- Préférences notification (extension de profiles)
alter table public.profiles
  add column if not exists alerts_email_mode text default 'digest_daily',
  -- 'immediate' | 'digest_daily' | 'digest_weekly' | 'off'
  add column if not exists alerts_min_severity smallint default 2;
```

### Nouveau lib `src/lib/threat-detection.ts`

Function principale `analyzeThreatBatch(comments)` :
- Appel Gemini sur batch de 20-30 comments
- Prompt structuré avec exemples (PII detection, threat patterns)
- Retourne `[{ id, level, categories[] }]`
- Catégories : `pii_location`, `pii_school`, `pii_family`, `pii_routine`, `threat_violence`, `threat_doxxing`, `harassment_pattern`

Function `updateStalkerProfiles(channelId)` :
- Agrégation SQL par `platform_author_id`
- Calcul du risk_score : `negative_count/comment_count * log(comment_count) * recency_factor`
- Update / upsert dans `stalker_profiles`

Function `detectRaid(channelId)` :
- Query : commentaires des 2 dernières heures, % négatifs
- Si >30% ET >10 comments → crée alerte `raid` agrégée

### Routes API à créer

```
/api/ai/threat-scan          POST  → scanne les comments récents non analysés
/api/cron/threat-monitor     GET   → cron horaire (Vercel) : threat-scan + raid detection
/api/threats/dismiss         POST  → marque alerte dismissed
/api/threats/email-prefs     POST  → met à jour alerts_email_mode + min_severity
/api/stalkers/{id}/block     POST  → marque l'auteur bloqué (visible dans Clean Feed)
/api/stalkers/{id}/notes     POST  → ajoute note privée
```

### UI à créer

**Nouvelle page `/security` dans `(app)/`** :
- Hero : "X alertes en attente" avec compteur dynamique
- Onglets : Alertes / Stalkers / Raids / Réglages
- **Inbox d'alertes** : cards avec badge sévérité (couleur primary→amber→amber foncé, **pas de rouge** — fidèle au design system), extrait du commentaire, action "Voir / Dismisser / Bloquer l'auteur"
- **Liste stalkers** : avatar + nom, risk score, nombre de comments, "premier vu" / "dernier vu", action "Bloquer"
- **Réglages** : mode email (radio), seuil minimum de sévérité (slider)

**Intégration dashboard** :
- Si alertes sévérité 3 : bandeau ambre en haut de `/dashboard` ("3 alertes critiques")
- Métrique "Toxicité bloquée" remplacée par "Sécurité" (avec compteur d'alertes 30j)

**Intégration Clean Feed** :
- Bouton "Voir le profil" sur chaque commentaire d'un stalker (ouvre le profile dans `/security/stalker/<id>`)
- Si auteur bloqué : commentaire automatiquement masqué

### Email via Resend

Template `email-templates/threat-alert.tsx` (React Email) :
- Header SafeSpace
- Sévérité visuelle (icône + couleur)
- Extrait commentaire (tronqué + dot dot dot pour PII)
- Lien "Voir dans SafeSpace"
- Footer : "Modifier les préférences"

Cron `/api/cron/threat-monitor` (toutes les heures Hobby Vercel = 1×/jour, ou Pro pour vraies alertes) :
- Pour chaque user avec mode `immediate` ou `digest_daily` : check unread alerts
- Send via Resend, marque `email_sent = true`

### Plan integration

Nouveau pricing dans `messages/*.json` et settings :

| Plan | Prix | Features clés |
|---|---|---|
| Free | 0€/mo | 1 chaîne, TL;DR hebdo, Clean Feed, Mur de soutien |
| Pro | 14€/mo | 3 chaînes, TL;DR quotidien, Quick Reply, Stats 90j, Metric Shield |
| **Shield** | **29€/mo** | Tout Pro + Threat Detection + Stalker Tracking + Raid Detection + alertes email immédiat + 1 ambassadeur de support humain |

Stripe :
- Créer un nouveau price `STRIPE_PRICE_ID_SHIELD` à 29€/mo
- `profile.plan` enum étendu à `'free' | 'pro' | 'shield'`
- `isMaskedByFilter` et autres helpers prennent en compte `plan === 'shield'` ou `'pro'` pour les features pro
- Middleware : `/security` requiert `plan === 'shield'`

## Edge cases & risques

| Risque | Mitigation |
|---|---|
| Faux positifs PII ("J'habite Paris aussi !") | Prompt avec exemples nuancés, score 0 pour mentions bénignes |
| Notification fatigue | Mode digest par défaut, immediate seulement sur sévérité 3 |
| Hallucination IA sur threat detection | Double-pass : ré-évaluation des sévérités 3 par un 2ᵉ appel Gemini avec contexte étendu |
| Stockage de contenus sensibles | Truncation + masquage des PII détectées dans l'UI (jamais re-affichées en clair par défaut) |
| Coût IA additionnel | ~30% de tokens en plus par batch. À 0.03$/user/mo actuel → 0.04-0.05$/user/mo. Toujours <0.1% du prix. |
| Conformité RGPD (données auteur tiers) | Le profil stalker stocke un platform_author_id (pseudonyme YouTube), pas de PII. Si suppression demandée → cascade delete sur stalker_profiles. |

## Métriques de succès

- **% d'utilisateurs Pro qui upgrade vers Shield dans les 30 jours** suivant le lancement (cible ≥15%)
- **Email open rate** sur alertes (cible ≥40%, indique pertinence)
- **Dismiss rate** sur alertes (cible <30%, sinon trop de bruit)
- **Conversion landing → trial Shield** parmi cible "créatrices" (cible ≥3% vs <1% sur Pro)

---

# Feature 2 — Questions → Idées de contenu

## Vision

Transformer le flux de questions des commentaires en **pipeline de contenu**. L'IA cluster les questions par thématique sur des semaines, identifie les patterns ("23 personnes attendent un tuto montage"), et propose un dashboard "Idées de vidéos basées sur ta vraie audience".

## Objectif business

Connecter SafeSpace à la **monétisation** du créateur. Aujourd'hui, l'argument est "réduis ton anxiété". Demain : "fais des vidéos qui marchent en écoutant ton audience".

| Pitch | Avant | Après |
|---|---|---|
| Type de bénéfice | émotionnel | **rationnel + ROI** |
| Cycle de vente | "je verrai si je teste" | "ça m'aide à faire mes vidéos, je teste maintenant" |
| Rétention | dépend de la santé mentale | **liée à la production de contenu** (tâche hebdo récurrente) |

C'est l'**ancre commerciale** qui justifie le prix au moment de l'achat. La santé mentale, c'est le pourquoi de la rétention.

## Ce que ça fait concrètement

### A. Clustering automatique des questions

Toutes les 24-48h, un cron :
1. Récupère les questions non répondues des 90 derniers jours
2. Les passe à Gemini pour clustering thématique (similaire à `groupQuestions` mais persistant)
3. Crée/met à jour des "topics" : titre canonique, exemples, compte de questions, première/dernière apparition
4. Si un topic atteint un seuil (>5 questions distinctes) → notification au créateur

Exemple concret :
```
Topic: "Quel logiciel de montage tu utilises"
  Questions associées: 23
  Premier vu: il y a 47 jours
  Dernier vu: il y a 2 jours
  Vidéos sources: 8
  Status: pending
```

### B. Auto-detection des questions répondues

Quand le créateur publie une nouvelle vidéo, l'app :
1. Récupère le titre + description (sync YouTube existant)
2. Match via embedding/similarité sémantique avec les topics ouverts
3. Si match >80% → marque le topic comme `answered`
4. Tracking : les questions du topic deviennent "résolues"

### C. Dashboard "Idées de vidéos"

Nouvelle section qui montre :
- **Top 10 topics par count** (questions en attente)
- Pour chaque : titre, X personnes attendent, dernière question il y a Y jours, exemple, lien vers les commentaires source
- Actions : "Marquer comme idée à filmer", "Reporter", "Ignorer ce topic"
- Filtres : période, vidéo, status

### D. Quick Reply intégré

Pour chaque topic :
- Bouton "Répondre à toutes les questions de ce topic" (réutilise `/api/youtube/reply`)
- Le créateur peut répondre en masse "Bonne question, je prépare une vidéo dessus !" → génère engagement, prévient les abandons

### E. Mesure de ROI (optionnel, phase 2)

Tracking : quand un topic est marqué `answered` via une vidéo X, mesurer :
- Vues de la vidéo X vs moyenne créateur
- Engagement (likes, commentaires, watch time)
- Comparer aux vidéos non liées à un topic populaire

→ Tableau "Impact des idées SafeSpace" : "Tes 3 vidéos issues de SafeSpace ont +47% de vues moyennes"

## Intégration dans l'app actuelle

### Migration BDD (0008)

```sql
create table if not exists public.question_topics (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid references public.channels not null,
  label text not null,                    -- titre canonique
  example_text text,                      -- 1 commentaire représentatif
  question_count integer default 0,
  first_seen_at timestamptz default now(),
  last_seen_at timestamptz default now(),
  status text default 'pending',          -- 'pending' | 'answered' | 'dismissed'
  answered_video_id text,                 -- vidéo qui a répondu au topic
  answered_at timestamptz,
  language text default 'fr',
  created_at timestamptz default now()
);

create index if not exists idx_topics_channel_status
  on public.question_topics (channel_id, status, question_count desc);

alter table public.question_topics enable row level security;
create policy "users read own topics" on public.question_topics
  for select using (
    channel_id in (select id from public.channels where user_id = auth.uid())
  );

-- Lien commentaires ↔ topic
alter table public.comments
  add column if not exists topic_id uuid references public.question_topics;

create index if not exists idx_comments_topic
  on public.comments (topic_id) where topic_id is not null;
```

### Extension `src/lib/gemini.ts`

Nouvelle fonction `clusterQuestionsForChannel(channelId, existingTopics)` :
- Input : pending questions (90 jours) + topics existants pour `channel_id`
- Output : `{ topics: [{ id?, label, comment_ids[] }] }` — peut référencer un topic existant ou en créer un nouveau
- Prompt enrichi : "voici les topics existants, classe les nouvelles questions dans ceux qui matchent ou crée-en de nouveaux"

```typescript
export async function clusterQuestionsForChannel(input: {
  questions: { id: string; text: string; videoTitle: string | null }[];
  existingTopics: { id: string; label: string; example: string }[];
  language: 'fr' | 'en';
}): Promise<{
  topics: Array<{
    id?: string;          // undefined si nouveau topic
    label: string;
    comment_ids: string[];
  }>;
}>
```

### Routes API

```
/api/cron/cluster-topics       GET   → cron quotidien, batch tous les channels actifs
/api/topics/{id}/dismiss       POST  → status = 'dismissed'
/api/topics/{id}/mark-answered POST  → status = 'answered', store video_id
/api/topics/{id}/reply         POST  → batch reply à toutes les questions du topic via /api/youtube/reply
```

### Cron schedule (vercel.json)

Ajouter un 3ᵉ cron (passe à Vercel Pro nécessaire pour 3+ crons quotidiens, ou run manuellement) :

```json
{
  "path": "/api/cron/cluster-topics",
  "schedule": "0 5 * * *"
}
```

Ou réutiliser le cron `sync-comments` et chaîner le clustering après le sync (1×/jour).

### Auto-detection des vidéos publiées

Lors du sync, vérifier si de nouvelles vidéos sont publiées :
- Comparer la liste des `video_id` distincts dans les comments vs précédente
- Si nouvelle vidéo détectée : pour chaque topic `pending` du channel, calcule similarité titre/description
- Utiliser embeddings via Gemini (`embedContent` API) ou simple similarité de mots-clés en V1
- Si match → mark answered

### UI à créer

**Nouvelle section dashboard** "Idées de vidéos" :
- Card avec top 3 topics
- "23 personnes attendent une réponse sur **Tuto montage**"
- CTA "Voir tous les topics"

**Nouvelle page `/ideas` (ou intégré dans `/reply`)** :
- Liste des topics ranked
- Pour chaque card :
  - Titre canonique en h2
  - Pill "X personnes en attente"
  - Pill vidéo source (si majoritaire)
  - Quote du commentaire représentatif (font-serif comme le wall)
  - "Premier vu il y a X jours"
  - Actions : "Répondre à tous" / "Marquer comme filmé" / "Ignorer"

**Intégration `/reply`** : ajouter un onglet "Par topic" dans le QuickReplyBoard qui montre les groupes pré-clusterés (économise un appel Gemini live).

### Plan integration

| Plan | Topics |
|---|---|
| Free | Top 3 topics, refresh hebdo |
| Pro | Tous les topics, refresh quotidien, alertes par email quand un nouveau topic émerge (>5 questions) |
| Shield | Tout Pro |

## Edge cases & risques

| Risque | Mitigation |
|---|---|
| Topics qui dérivent dans le temps | Auto-decay : si pas de nouvelles questions en 60j, topic auto-archivé |
| Questions en multi-langues | Cluster par langue détectée + label dans la langue dominante |
| Sur-clustering (tout dans 1 topic) | Threshold dans le prompt : "ne fusionne que si l'intent est vraiment proche" |
| Sous-clustering (1 question = 1 topic) | Threshold inverse : "préfère regrouper si formulations similaires" |
| Faux positif sur "answered" | Ajouter une confirmation manuelle pour les topics fortement engagés (>10 questions) |
| Coût IA | Cron 1×/jour, batch unique par channel. ~5-10k tokens/run. Negligeable. |

## Métriques de succès

- **% d'utilisateurs qui ouvrent /ideas au moins 1×/semaine** (cible ≥40%)
- **# de topics marqués "answered" / mois** par utilisateur actif (cible ≥2)
- **Conversion email "nouveau topic émerge" → ouverture app** (cible ≥30%)
- **Témoignages** : "j'ai fait une vidéo grâce à SafeSpace qui a fait Xk vues" — leverage marketing

---

# Feature 3 — Carte hebdo partageable (boucle virale)

## Vision

Générer automatiquement chaque semaine une **carte image** belle et partageable récapitulant la santé de la communauté du créateur. Esthétique style Spotify Wrapped / Strava Year in Sport, mais hebdo. Bouton "Partager" qui pousse sur Twitter/Threads/IG/LinkedIn avec branding SafeSpace.

## Objectif business

C'est le **seul levier d'acquisition gratuite** réaliste pour ce type de produit B2C créateurs. Sans boucle virale, le CAC en ads ou cold outreach est >50€ et tue les unit economics à 14€/mo.

Modèle de référence : **Spotify Wrapped, Notion, Linear, Duolingo, Wordle**. Quand un créateur 100k subs partage sa carte, ses followers (souvent eux-mêmes créateurs) la voient et demandent "c'est quoi cet outil ?". Coût d'acquisition : 0€.

| Métrique | Sans boucle | Avec boucle |
|---|---|---|
| Acquisition coût (CAC) | 50-150€ via ads/outreach | 0-10€ via partages organiques |
| Croissance | linéaire (tu pousses) | exponentielle si engagement bon |
| Marketing budget nécessaire | énorme | minimal |

## Ce que ça fait concrètement

### A. Carte image générée auto

Chaque lundi (déjà aligné sur le cron `generate-summaries`), une image carte est générée pour chaque user avec :
- Période ("Semaine du 4 au 10 mai 2026")
- Nom du créateur (handle YouTube)
- **Score communauté** /100 en gros (style cuvette colorée)
- **Ambiance dominante** ("Positive vibe" / "Tense vibe")
- **Top 3 insights** (réutilise les insights du TL;DR)
- Stats clés : commentaires analysés, % positifs, top topic
- Branding subtil "via SafeSpace" en bas
- Format : 1080x1920 (story IG/TikTok) **et** 1200x630 (Twitter/Threads/LinkedIn)

Esthétique : font-serif pour les chiffres (cohérence avec le mur de soutien), palette violet/teal/amber/rose, beaucoup d'espace, **zéro red**.

### B. Page publique partageable

Si le créateur active le partage public :
- Page `/u/<handle>` (ex: `safe-place.app/u/marieyoutube`)
- Affiche la dernière carte hebdo
- CTA "Try SafeSpace free" en bas (acquisition)
- Open Graph tags pour unfurl propre sur Twitter/Discord/Slack
- Lien permalink par semaine (`/u/<handle>/2026-W19`)

### C. Bouton "Partager" sur le dashboard

Quand la carte de la semaine est générée → notification dashboard :
- "Ta carte de la semaine est prête 🎉"
- Preview de la carte
- Boutons : "Partager sur Twitter" / "Threads" / "IG Story" / "Télécharger"
- Auto-tweet pré-rédigé : *"Cette semaine sur ma chaîne : score communauté 87/100, top thème : enthousiasme général. Voir la carte → safe-place.app/u/marie"*

### D. Notification email hebdo (optionnelle)

Email lundi matin : "Ta carte SafeSpace de la semaine est prête" → ouvre direct sur la page de partage.

### E. Mécanique virale

Chaque carte partagée contient :
1. Un lien direct vers la page publique du créateur
2. Branding "via SafeSpace" cliquable vers la home
3. UTM tracking pour mesurer la conversion partage → signup

Modèle compté :
- 100 users actifs partagent leur carte = 100 posts sociaux
- Chaque post a en moyenne 500-2000 vues (selon le créateur)
- Conversion vers signup : 0.5-2%
- = 250-4000 nouveaux signups gratuits par semaine sans aucun ad spend

Même à la fourchette basse, c'est **le seul moyen rentable** de scaler sans VC.

## Intégration dans l'app actuelle

### Migration BDD (0009)

```sql
-- Handle public unique pour la page partagée
alter table public.profiles
  add column if not exists handle text unique,
  add column if not exists public_profile_enabled boolean default false,
  add column if not exists display_name text;

create index if not exists idx_profiles_handle on public.profiles (handle);

-- Pas besoin de table dédiée pour les cartes :
-- on les génère à la volée à partir des `summaries` existantes,
-- et on cache l'image (Vercel Blob ou file system) par (user, week_start)
```

### Génération de l'image

**Option A — `@vercel/og` (recommandé)** :
- ImageResponse natif de Next.js 14
- Génère un PNG via JSX + Tailwind subset
- Mise en cache automatique par Vercel
- Endpoint : `/api/cards/[handle]/[week_start]/image`

```typescript
// src/app/api/cards/[handle]/[week]/image/route.tsx
import { ImageResponse } from 'next/og';

export const runtime = 'edge'; // requis pour @vercel/og

export async function GET(req: Request, { params }) {
  const { handle, week } = params;
  const data = await fetchCardData(handle, week);

  return new ImageResponse(
    <CardLayout data={data} />,
    {
      width: 1080,
      height: 1920,
      // headers de cache
    }
  );
}
```

**Option B — html2canvas (déjà dans le projet)** :
- Réutiliser ce qui existe pour le mur de soutien
- Génération côté client uniquement
- Limite : pas d'unfurl Open Graph propre (besoin d'image server-side pour ça)
- À combiner avec `@vercel/og` pour les meta tags OG

→ Recommandation : **les deux**. `@vercel/og` pour les OG meta tags (Twitter unfurl, etc.), html2canvas pour le téléchargement client (Retina, plus rapide).

### Routes API & pages

```
/u/[handle]                      page publique (RSC, no auth)
/u/[handle]/[week]               permalink semaine spécifique
/api/cards/[handle]/[week]/image edge function ImageResponse
/api/profile/handle              POST : claim/change handle (validation unicité)
/api/profile/toggle-public       POST : opt-in / opt-out partage
```

### UI à créer

**Nouvelle section dashboard "Carte de la semaine"** :
- Apparaît automatiquement quand une nouvelle carte est dispo (lundi)
- Preview embedded de la carte (iframe ou img directement de l'endpoint OG)
- Boutons d'action :
  - "Partager sur Twitter" (window.open intent URL)
  - "Partager sur Threads"
  - "Partager IG Story" (deep link mobile)
  - "Copier le lien"
  - "Télécharger PNG"
- Toggle "Activer ma page publique" (si pas déjà)

**Settings — Profil public** :
- Champ handle (validation : a-z0-9-_, 3-30 chars, unique)
- Toggle public_profile_enabled
- Preview de l'URL : `safe-place.app/u/<handle>`
- Bouton "Régénérer ma carte de la semaine" (utile si on change le score plus tard)

**Page publique `/u/<handle>`** :
- Layout minimal : logo SafeSpace en haut, carte centrée, footer CTA
- Card preview large (1080x1920 ou responsive)
- Stats résumées en dessous (textuel pour SEO)
- CTA "Filtre tes commentaires comme [creator] → essaie SafeSpace gratuitement"
- Lien retour home
- Open Graph tags pleins (`og:image`, `twitter:card=summary_large_image`, etc.)

### Tweet pré-rédigé

À chaque carte, on suggère un tweet :

```
Cette semaine sur ma chaîne :
🌿 Score communauté 87/100
✨ 92% positifs · top thème : "tuto montage"

Voir le détail →
safe-place.app/u/marie

#CreatorTools
```

Bouton "Modifier avant de tweeter" (le user peut éditer).

### Cron

Pas besoin de nouveau cron : le cron existant `generate-summaries` (lundi 7h) calcule déjà les insights → on les utilise pour la carte. Ajouter à la fin du cron : pour chaque user avec `public_profile_enabled = true`, optionnellement pré-générer l'image (warm cache) et envoyer email.

### Plan integration

| Plan | Cartes |
|---|---|
| Free | Génération hebdo + page publique + partage |
| Pro | + carte quotidienne + cartes par vidéo + customisation thème (couleur principale) |
| Shield | Tout Pro |

**Volontairement, la carte est dans le plan Free** : c'est l'outil d'acquisition, il doit toucher tout le monde. Le branding "via SafeSpace" reste sur les cartes Free, peut être enlevé en Pro (incentive supplémentaire à upgrade).

## Edge cases & risques

| Risque | Mitigation |
|---|---|
| Handle collision | Unique constraint + suggestion automatique (handle-2, handle-3) |
| Privacy : créateur veut désactiver | Toggle simple en settings, supprime aussi les permalinks anciens |
| Pas assez de data la 1ère semaine | "Carte indisponible cette semaine — reviens lundi prochain" |
| Score volatil semaine vs semaine (anxiogène) | Lisser sur 4 semaines glissantes pour le score affiché |
| Image generation coûteuse | Cache Vercel Edge agressif (24h), regen seulement si data change |
| Spam page publique (SEO ranking | Respect.txt, noindex initial, opt-in pour indexation après vérification |
| User sans chaîne YouTube | Pas de carte (carte placeholder "connecte ta chaîne") |

## Métriques de succès

**Court terme (4 semaines après lancement) :**
- **% d'users actifs qui partagent leur carte** au moins 1× (cible ≥30%)
- **Vues de la page `/u/<handle>`** moyenne par carte partagée (cible ≥200)
- **Conversion vue → signup** sur les pages publiques (cible ≥1.5%)
- **Trafic organique** depuis Twitter/Threads UTM (cible : multiplier les signups par 2-3 vs base)

**Moyen terme (3 mois) :**
- **Coût d'acquisition (CAC) global** divisé par 2 vs sans boucle
- **K-factor** : nombre de signups générés par user existant (cible ≥0.3, idéalement >1 = croissance virale)

---

# Roadmap d'implémentation suggérée

| Sprint | Durée | Feature | Livrable |
|---|---|---|---|
| 1 | 2 sem | Threat Detection v1 | Migration 0007, lib/threat-detection, /security page, alertes inbox, stalker tracking |
| 2 | 1 sem | Threat Detection v2 | Email Resend, raid detection, plan Shield 29€/mo |
| 3 | 2 sem | Topics & content pipeline | Migration 0008, clusterQuestionsForChannel, /ideas page, intégration QuickReply |
| 4 | 1 sem | Topics polish | Auto-detection answered, métriques ROI, alertes nouveau topic |
| 5 | 1 sem | Carte hebdo v1 | Migration 0009, @vercel/og endpoint, page publique /u/handle, settings handle |
| 6 | 1 sem | Carte hebdo v2 | Boutons share Twitter/IG/Threads, tweet pré-rédigé, email hebdo |

**Total : ~8 semaines** pour les 3 features. À mener en parallèle de la distribution (cold outreach, partenariats créateurs) sur la base actuelle.

# Critères de décision après implémentation

À 30 jours du déploiement complet :

| Métrique | Seuil minimum | Si en-dessous |
|---|---|---|
| Conversion Pro → Shield | 10% | Threat Detection sous-utilisé, repenser pricing ou cible |
| Topics ouverts > 0 par user actif | 80% | Pas assez de questions OU clustering pas pertinent → ajuster prompt |
| % users qui partagent carte | 20% | Boucle virale ne fonctionne pas → revoir design carte ou messaging |
| Signups via UTM `card_share` | 50/mois | Besoin de pousser le partage (notif email plus agressive) |
| MRR total | 1500€ | Considérer pivot ou pause produit |

Si **2/5 ou plus en-dessous** → la stratégie ne fonctionne pas dans cette forme. Alternatives à évaluer :
- Pivot vertical (créatrices uniquement, ou true crime, ou gaming)
- Pivot catégorie (devenir un outil de productivité, pas de bien-être)
- Pause / mise en maintenance et report sur autre projet
