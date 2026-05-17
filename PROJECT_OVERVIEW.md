# SafeSpace — Compte rendu complet du projet

## Vision & contexte

**SafeSpace** est une web app SaaS qui sert de filtre intelligent de commentaires pour les créateurs de contenu YouTube (Instagram en phase 2). L'objectif est de transformer le bruit anxiogène des centaines de commentaires en quelques insights actionnables, sans toxicité ni stress.

**Proposition de valeur** : transformer 500 commentaires bruts en 5 insights actionnables en 30 secondes.

**Cible** : créateurs YouTube/Instagram solo, 10k–500k abonnés, qui n'ont pas d'équipe community manager et qui souffrent du bruit / de la toxicité en ligne.

**Philosophie de design** : zéro rouge, zéro badge qui clignote, zéro compteur anxiogène. L'app doit ressembler à un carnet, pas à un dashboard de startup. Chaque choix réduit l'anxiété (Metric Shield masque les chiffres de vanité par défaut, commentaires triés par pertinence et non par date, toxicité floutée pas supprimée, phrases bienveillantes).

---

## Stack technique

- **Framework** : Next.js 14 App Router + TypeScript
- **Styling** : Tailwind CSS (avec dark mode `[data-theme="dark"]`)
- **Base de données** : Supabase (Postgres + Auth + RLS)
- **Auth** : Google OAuth via Supabase Auth
- **IA** : Gemini 2.5 Flash + Flash-Lite (`@google/generative-ai`) — JSON natif
- **Paiements** : Stripe (Checkout + Customer Portal + Webhooks)
- **Emails** : Resend (configuré, non utilisé activement)
- **i18n** : `next-intl` v3 (FR/EN, no-routing mode, cookie `NEXT_LOCALE`)
- **Charts** : Chart.js + react-chartjs-2
- **Image export** : html2canvas (lazy)
- **Hébergement** : Vercel (déployé sur `safe-place-plum.vercel.app`)

---

## Schéma BDD (Supabase)

```sql
profiles         -- id (=auth.uid), plan (free|pro|shield),
                 -- stripe_customer_id, stripe_subscription_id,
                 -- filter_mode, language, metric_shield,
                 -- alerts_email_mode (immediate|digest_daily|digest_weekly|off),
                 -- alerts_min_severity (0..3)
channels         -- id, user_id, platform, platform_id, name, thumbnail_url,
                 -- access_token (chiffré AES-256-GCM), refresh_token (chiffré),
                 -- token_expires_at, subscriber_count, last_synced_at
                 -- UNIQUE (user_id, platform_id)
comments         -- id, channel_id, platform_comment_id (UNIQUE),
                 -- author_name, author_avatar, platform_author_id,
                 -- text, category (question|positive|constructive|neutral),
                 -- is_toxic, toxicity_score, is_hidden, is_saved_to_wall,
                 -- replied_at, published_at, video_id, video_title,
                 -- threat_level (0..3), threat_categories (jsonb), threat_analyzed_at,
                 -- topic_id (FK question_topics ON DELETE SET NULL)
summaries        -- id, channel_id, week_start, insights (jsonb),
                 -- raw_count, positive_ratio, community_score
                 -- UNIQUE (channel_id, week_start)
support_wall     -- id, user_id, comment_id?, custom_text?, author_name
checkins         -- id, user_id, mood (exhausted|tired|neutral|good|great)
stalker_profiles -- id, channel_id, platform_author_id, author_name, author_avatar,
                 -- comment_count, negative_count, threat_count, risk_score,
                 -- first_seen, last_seen, blocked, notes
                 -- UNIQUE (channel_id, platform_author_id)
threat_alerts    -- id, user_id, channel_id, alert_type (pii|stalker|raid|threat),
                 -- severity (0..3), comment_id?, stalker_id?, payload (jsonb),
                 -- email_sent, dismissed, created_at
                 -- UNIQUE INDEX (comment_id, alert_type) WHERE comment_id IS NOT NULL
question_topics  -- id, channel_id, label, example_text, question_count,
                 -- first_seen_at, last_seen_at,
                 -- status (pending|answered|dismissed),
                 -- answered_video_id, answered_at, language, notified_at
```

**RLS activé** sur toutes les tables. Policies "users own X" sur tout sauf `comments` / `stalker_profiles` / `question_topics` (qui héritent via channel ownership). Trigger `on_auth_user_created` auto-crée le profile.

9 migrations dans `supabase/migrations/` : initial schema, channels unique constraint, last_synced_at, summaries unique, comments is_hidden, comments replied_at, **threat detection (0007)**, **question topics (0008)**, **topic notifications (0009)**.

---

## Variables d'environnement

```env
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
GOOGLE_AI_API_KEY
YOUTUBE_CLIENT_ID
YOUTUBE_CLIENT_SECRET
YOUTUBE_REDIRECT_URI
STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
STRIPE_PRICE_ID_PRO
STRIPE_PRICE_ID_SHIELD   # 29 €/mo · plan Shield (Threat Detection)
RESEND_API_KEY
RESEND_FROM              # optionnel : "Brand <alerts@ton-domaine.com>" en prod
ENCRYPTION_KEY           # 32 bytes hex, chiffre les tokens YouTube
CRON_SECRET              # Bearer token Vercel cron
NEXT_PUBLIC_APP_URL
```

---

## Fonctionnalités livrées (les 14 étapes)

### 1. Socle authentifié

- Next.js 14 App Router (`src/app/(app)/...` route group pour les pages protégées partagées)
- Sidebar sticky (logo, nav, plan card) + Topbar (channel name, signout)
- Middleware protège `/dashboard /feed /wall /reply /stats /settings` (redirect `/login`) et bloque `/reply /stats` si plan ≠ pro
- Page `/login` minimale avec bouton "Continuer avec Google" via Supabase OAuth
- Auth callback `/auth/callback` exchange du code, upsert profile

### 2. OAuth YouTube

- Tokens chiffrés AES-256-GCM avant stockage (`src/lib/crypto.ts`)
- Routes `/api/youtube/connect` (CSRF state cookie), `/callback` (exchange + fetch chaîne + upsert), `/disconnect` (revoke + delete)
- Helper `getValidAccessToken(channel)` qui refresh auto si expiré

### 3. Sync commentaires

- `/api/youtube/sync` — pagine `commentThreads.list` avec `allThreadsRelatedToChannelId`, fenêtre 7 jours, cap 200 (free) / 2000 (pro)
- Batch fetch des titres de vidéos via `videos.list`
- Upsert sur `platform_comment_id` avec `ignoreDuplicates`

### 4. Classification IA Gemini

- `classifyBatch(comments)` via `gemini-2.5-flash` (JSON natif, temp 0.1)
- Prompt avec exemples explicites pour les négatifs courts ("Nul" → neutral, pas positive)
- `classifyChannelPending(channelId, { force? })` — batch de 40 comments, retry par batch, en parallèle pour les updates
- Auto-chaîné après chaque sync

### 5. Dashboard

- **Check-in humeur** : 5 boutons emoji, save dans `checkins`, redirige `/wall?from=checkin` si exhausted/tired
- **TL;DR IA** : `generateTldr` via `gemini-2.5-flash-lite` (pas de thinking, JSON robuste). Le prompt reçoit la **breakdown réelle** des catégories pour ancrer les % à la vérité de la base. Filtre les commentaires toxiques du contexte. Upsert weekly dans `summaries`.
- **4 métriques** : commentaires filtrés, toxicité bloquée, score communauté /100, abonnés (masqué par défaut, toggle œil ; respect global `metric_shield`)
- **Vidéos récentes** : grouping en JS sur 500 dernières lignes, top 5 par latest comment
- **Score communauté** pondéré : positive×1, question×0.7, constructive×0.6, neutral×0.4, toxic×−1, clamp 0–100

### 6. Clean Feed

- Tri par pertinence : Question (1) → Critique (2) → Positif (3) → Neutre (4) → Masqué (99)
- 6 filtres : Tous / Questions / Positifs / Critiques / Neutres / Masqués (avec compteurs)
- Param `?video=<id>` pour drill-down depuis le dashboard
- Toxiques **floutés** (`blur-sm`) avec hover-to-reveal, jamais supprimés de YouTube
- Actions par commentaire : **Suggestions IA** (3 brouillons via `generateReplies`, copy clipboard), **Mur de soutien** (idempotent), **Masquer/Réafficher**
- Le `filter_mode` du profil (sensitive/standard/tough) module dynamiquement quels commentaires sont marqués masqués

### 7. Mur de soutien

- Grille responsive 1/2/3 colonnes, font-serif (Georgia)
- 3 variants alternés violet/rose/teal (rose ajouté à la palette)
- **Partage PNG** via html2canvas (lazy import, scale 2 pour Retina) → tente `clipboard.write(ClipboardItem)`, fallback download
- Bandeau rose doux "Prends une pause" si `?from=checkin`
- **Ajout manuel** : textarea serif, save direct via `/api/comments/save-to-wall` (mode customText)
- Suppression idempotente, reset `is_saved_to_wall` sur le commentaire associé

### 8. Quick Reply (Pro)

- `groupQuestions(questions, lang)` : **un seul appel Gemini** qui regroupe ET génère 3 brouillons (tons enthousiaste / informatif / personnel)
- `/api/youtube/reply` : POST batch jusqu'à 25 commentaires, cache l'access_token par chaîne, marque `replied_at` après succès
- UI : aperçu des questions en attente → bouton "Grouper avec l'IA" → cards avec exemple, 3 brouillons cliquables, textarea éditable, "Envoyer à N personnes"
- Endpoint YouTube `comments.insert` avec `parentId = topLevelComment.id` (50 unités quota par envoi → cap conservateur)

### 9. Stats (Pro)

- `lib/stats.ts` : agrégation côté serveur, charge **fenêtre courante + précédente** en une seule requête (5000 rows max)
- **Score communauté** Line chart sur 30/90 jours (switcher `?window=`)
- **Ratio positif/négatif** card avec delta vs période précédente (teal hausse / amber baisse, pas de rouge)
- **Top topics** barres horizontales — tokenizer simple avec stop-words FR/EN, dédup intra-commentaire
- **Heures de pointe** bar chart 24h UTC, l'heure du pic ressort en violet plein
- **Export CSV** `/api/stats/export` jusqu'à 10k lignes, RFC 4180

### 10. Settings

- 3 modes de filtrage Sensible / Standard / Peau Dure (pénalité différente sur `toxicity_score`)
- Metric Shield toggle global
- Sélecteur langue FR/EN avec reload propre
- ThemeToggle Clair / Sombre / Auto (étape 14)
- Re-classifier tout (force Gemini sur tous les comments)
- Connexions YouTube (multi-chaînes selon plan)
- Card abonnement avec features + boutons Stripe
- Auto-save sur change avec rollback en cas d'erreur (transitions + router.refresh)

### 11. Stripe

- `/api/stripe/checkout` : ensure customer, crée la session subscription
- `/api/stripe/confirm` (success_url) : retrieve session + sync immédiat — **ne dépend pas du webhook** (utile en dev sans `stripe listen`)
- `/api/stripe/webhook` : verify signature sur raw body, écoute `checkout.session.completed`, `customer.subscription.created/updated/deleted`
- `/api/stripe/portal` : Customer Portal Stripe
- `/api/stripe/refresh-plan` : recovery manuel listant les subs Stripe et resyncant le profil
- **Bandeau ambre** "Subscription désynchronisée" + bouton Resynchroniser si `stripe_customer_id` présent mais plan = free
- Lib `syncSubscriptionToProfile` partagée entre webhook et confirm (idempotent)

### 12. Cron jobs Vercel

- `vercel.json` avec 2 schedules :
  - `0 6 * * *` → `/api/cron/sync-comments` (daily — Hobby plan max 1×/jour)
  - `0 7 * * 1` → `/api/cron/generate-summaries` (lundi 7h UTC)
- Auth via `Authorization: Bearer ${CRON_SECRET}` (Vercel injecte auto)
- Time budget 280s sur `maxDuration: 300`, batch jusqu'à 100/200 chaînes
- Erreurs isolées par chaîne, retours JSON résumés

### 13. i18n FR/EN

- next-intl v3 mode "no-routing" (URLs identiques)
- Détection en cascade : cookie `NEXT_LOCALE` → `profile.language` → header `Accept-Language` → fallback FR
- `/api/profile/update` pose le cookie quand la langue change → bascule instantanée
- Fichiers `messages/fr.json` et `messages/en.json` organisés par namespaces (`nav`, `topbar`, `login`, `dashboard`, `checkin`, `tldr`, `feed`, `comment`, `wall`, `reply`, `stats`, `settings`, `theme`)
- ICU MessageFormat (pluriels, variables)
- Les prompts Gemini reçoivent la langue du profil → réponses dans la bonne langue

### 14. Polish

- **Dark mode** complet via `[data-theme="dark"]` + variables CSS — variantes `*-light` deviennent des overlays semi-transparents (rgba 18-22%)
- Script no-flash inline dans `<head>` qui résout le thème **avant** le rendu
- ThemeToggle 3-états (Clair/Sombre/Auto), suit `prefers-color-scheme` en mode Auto via `matchMedia`
- Mobile : **drawer hamburger** rendu via `createPortal(document.body)` pour échapper au stacking context de la Topbar (sticky)
- Topbar sticky avec hamburger sur mobile
- Focus rings violets accessibles (`focus-visible`, pas au clic souris)
- Transitions 200ms ease-out, respect `prefers-reduced-motion`
- Top progress bar `nextjs-toploader` (#534AB7, 2px)

### 15. Threat & Stalker Detection (Feature 1, plan Shield)

- **Type Plan centralisé** (`src/lib/plans.ts`) : `"free" | "pro" | "shield"` + helpers `hasProFeatures()` / `hasShieldFeatures()` / `normalizePlan()`. Shield hérite de tous les quotas Pro (3 chaînes, cap 2000 commentaires).
- **Détection Gemini** (`analyzeThreatBatch` dans `lib/gemini.ts`) : 2.5-flash, JSON natif, prompt structuré avec exemples conservateurs. Échelle 0..3 (bénin → urgence) + 10 catégories : `pii_location`, `pii_school`, `pii_family`, `pii_identity`, `pii_routine`, `pii_photo`, `threat_violence`, `threat_doxxing`, `threat_sexual`, `harassment_pattern`. Excerpt ≤ 120 chars qui paraphrase sans exposer la PII en clair.
- **Pipeline `scanChannelThreats`** : batch de 25, cap 200/run. MAJ `comments.threat_*`, insert dans `threat_alerts` dès `severity >= alerts_min_severity` (défaut 2). Dédup via `UNIQUE (comment_id, alert_type)`.
- **`updateStalkerProfiles`** : agrégation par `platform_author_id` (capturé dans le sync depuis `authorChannelId` YouTube). Score = `(negative_ratio × 0.6 + threat_ratio × 0.4) × log10(comment_count+1) × recency_factor`. Auteurs avec < 3 commentaires ignorés.
- **`detectRaid`** : fenêtre glissante 2h, déclenchement si ≥ 10 commentaires et ≥ 30 % toxiques. Dédup horaire (pas de doublon < 1h).
- **Page `/security`** avec 4 onglets via `?tab=...` : **Alertes** (filter `active`/`dismissed`/`all`, scan manuel, dismiss, lien YouTube `?lc=<id>` qui scrolle au commentaire, "Bloquer l'auteur" si stalker existe), **Profils à surveiller** (risk tier high/moderate/low, block/unblock), **Raids**, **Préférences** (4 modes email + slider sévérité min, auto-save).
- **Composants** `src/components/security/` : `security-tabs`, `alert-card`, `stalker-row`, `severity-badge` (0/1 = primary, 2 = ambre-light, 3 = ambre plein — **zéro rouge**), `email-prefs-form`, `critical-alerts-banner`.
- **Intégration dashboard** : bandeau ambre si alertes sev=3 non archivées, **métrique "Sécurité" remplace "Toxicité bloquée"** (count d'alertes 30j, ambre si urgences en attente), card cliquable vers `/security`.
- **Intégration Clean Feed** : `CommentCard` accepte `threat_level`, affiche pill graduel "À surveiller" / "Menace détectée" / "Menace · urgence" (cliquable → `/security?tab=alerts`). Blocage d'un auteur via `/api/stalkers/[id]/block` masque automatiquement tous ses commentaires existants (`is_hidden=true`).
- **6 routes API** : `/api/ai/threat-scan` (manuel, supporte `redirectTo`), `/api/cron/threat-monitor` (Bearer cron, accessible manuellement via curl), `/api/threats/dismiss`, `/api/threats/email-prefs`, `/api/stalkers/[id]/block`, `/api/stalkers/[id]/notes`.
- **Chaînage cron** : le cron `sync-comments` existant déclenche désormais sync → classify → **threat-scan → updateStalkers → detectRaid → daily digest**. Chaque étape est isolée par try/catch — une erreur Gemini ne plante pas le sync. Le digest hebdomadaire est chaîné dans `generate-summaries` (lundi 7h UTC). Pas de cron supplémentaire ajouté à `vercel.json` pour rester dans la limite Hobby (2 max).
- **Emails Resend** (`src/lib/emails.ts`) : HTML inline bilingue FR/EN, palette ambre/primary (pas de rouge), `from` configurable via `RESEND_FROM` (défaut `onboarding@resend.dev` pour le test sans vérification de domaine).
  - **Immédiat** : envoyé depuis `scanChannelThreats` quand l'utilisateur est en mode `immediate` ET `severity === 3`. Marque `email_sent = true` après succès.
  - **Digest quotidien** : `sendDigests("digest_daily")` chaîné dans le cron sync, regroupe toutes les alertes non envoyées des 24h.
  - **Digest hebdomadaire** : `sendDigests("digest_weekly")` chaîné dans le cron generate-summaries.
- **Stripe Shield** (29 €/mo) : `getShieldPriceId()`, `planFromPriceId(priceId)` qui lit le `price.id` du premier item de la subscription pour mapper vers `pro` / `shield` / `free`. `syncSubscriptionToProfile` met le bon plan sans hardcoder. Route `/api/stripe/checkout` accepte `plan=pro|shield` en form param. Metadata subscription contient `target_plan` pour debug.
- **Middleware** : `SHIELD_PREFIXES = ["/security"]` redirige vers `/settings?upgrade=shield` si plan ≠ shield. `PRO_PREFIXES` accepte Pro **ET** Shield.
- **SubscriptionCard** (`src/components/settings/subscription-card.tsx`) : 3 tiers (Free, Pro, Shield), upsell card "Activer Shield" visible pour les free/pro. Pills ambré pour le tier Shield.
- **Sidebar / MobileNav** : 7e item "Sécurité" (icône `Shield`), label plan `SafeSpace Shield`, CTA "Activer Shield" pour les Pro.
- **Setting page** : bandeau success Shield-aware (`stripeShieldSuccessTitle/Desc`), `channelLimit` calculé via `plan === "free" ? 1 : 3`.
- **i18n** : namespace `security` complet (sévérités, types d'alerte, 10 catégories PII/threat, modes email, risk tiers, raids). Pluriels ICU. Toutes les chaînes FR + EN.

### 16. Questions → Idées de contenu (Feature 2, plan Pro)

- **Clustering Gemini** (`clusterQuestionsForChannel` dans `lib/gemini.ts`) : `gemini-2.5-flash-lite`, prompt qui réutilise les topics existants par id quand l'intent matche, validation anti-hallucination des ids. Cap 150 questions / run, retourne `{ id?, label, example, comment_ids }`.
- **Orchestrateur** `clusterChannelTopics(channelId)` (`lib/topics.ts`) : fetch questions `category='question' AND replied_at IS NULL` sur 90j, fetch topics `pending` < 60j, appel Gemini, UPSERT topics + UPDATE `comments.topic_id`, auto-archivage des topics inactifs > 60j. Idempotent.
- **Détection de langue heuristique** des questions (FR/EN via mots-stop) pour ne pas dépendre du profile à chaque run.
- **`detectAnsweredTopics(channelId)`** : matche les 5 vidéos les plus récentes (< 14j) contre les topics ouverts via `matchVideosToOpenTopics` (Gemini Flash-Lite). Topics matchés → `status='answered'` + `answered_video_id`. Match sur titres uniquement en V1 (pas de fetch descriptions YouTube).
- **`sendNewTopicsDigest()`** : trouve les topics `pending` ≥ 5 questions jamais notifiés, bundle par user, gate Pro/Shield via plan, envoie un seul email digest par user, marque `notified_at` après succès. Indépendant de `alerts_email_mode` (qui ne concerne que les menaces).
- **4 routes API** : `/api/ai/cluster-topics` (manual trigger, gated Pro/Shield, supporte `redirectTo`), `/api/topics/[id]/dismiss`, `/api/topics/[id]/mark-answered` (accepte `videoId` optionnel pour le tracking ROI futur), `/api/topics/[id]/reply` (batch reply jusqu'à 50 commentaires du topic, marque automatiquement `answered` après ≥ 1 succès).
- **Chaînage cron** : `cluster → detectAnswered` chaînés dans `sync-comments` **après le pipeline threat**, uniquement pour les chaînes Pro/Shield. `sendNewTopicsDigest()` chaîné après la boucle (à côté du daily threat digest). Cohérent avec la limite Hobby de 2 crons.
- **Page `/ideas`** avec 3 onglets `?status=pending|answered|dismissed` : top topics par `question_count` desc puis `last_seen_at` desc, bouton "Rafraîchir" (POST → `/api/ai/cluster-topics`), bandeau teal `?cluster=done&created=N&updated=N`. Fetch des `pending_replies` par topic pour le compteur du `TopicReplyForm`.
- **Composants** `src/components/ideas/` : `topic-card` (server, label h2 + count pill + example en **font-serif Georgia** comme le Mur de soutien + actions selon status), `topic-reply-form` (client, collapsable textarea + bouton "Envoyer à N personnes" via fetch JSON), `dashboard-ideas-card` (top 3 topics ou upsell Free).
- **Intégration dashboard** : `<DashboardIdeasCard>` inséré entre les métriques et "Vidéos récentes". Affiche soit le top 3 topics (Pro/Shield), soit un upsell "Passer en Pro" (Free) — **pas de redirect frustrant**.
- **Intégration `/reply`** : `QuickReplyBoard` accepte `initialTopics`, ajoute un système d'onglets `tabs.all` / `tabs.topics`. L'onglet "Par topic" est masqué si 0 topic. `TopicsView` réutilise `TopicReplyForm` — pas de duplication. L'onglet IA live continue de marcher comme avant.
- **Emails Resend** (`sendNewTopicsEmail` dans `lib/emails.ts`) : palette **primary violet** (pas ambre — c'est une opportunité, pas une alerte), liste des topics avec count + example en italic font-serif, CTA "Voir toutes les idées".
- **Middleware** : `/ideas` ajouté à `PRO_PREFIXES` (gated Pro & Shield, redirect `/settings?upgrade=1` pour les Free).
- **Sidebar / MobileNav** : item "Idées de vidéos" (icône `Lightbulb`), `proOnly: true` (cadenas pour les Free).
- **i18n** : namespace `ideas` complet (tabs, empty states, card actions, reply flow avec pluriels ICU) + `dashboard.ideas` (preview + upsell) + `reply.tabs` + `reply.topics*`. FR + EN.
- **Fix collatéral** : `/api/youtube/reply` utilisait `plan !== "pro"` qui rejetait les Shield. Migré vers `hasProFeatures(normalizePlan(plan))`.

---

## Optimisations de performance

- **Route group `(app)`** : un seul layout pour toutes les pages protégées → l'AppShell ne re-render plus entre navigations
- **`getAppContext()` cached** via `React.cache()` : layout + page partagent user/profile/channels en une seule requête déduplique
- **loading.tsx** au niveau (app) → skeleton instantané au clic
- Dashboard : 7 COUNT séparés → 1 SELECT + agrégation JS
- Lazy imports : html2canvas, dark mode no-flash inline (1 KB)

---

## Structure du projet

```
safespace/
├── messages/
│   ├── fr.json
│   └── en.json
├── supabase/migrations/    # 9 migrations SQL versionnées
├── src/
│   ├── app/
│   │   ├── (app)/          # Routes protégées (shared AppShell)
│   │   │   ├── layout.tsx
│   │   │   ├── loading.tsx
│   │   │   ├── dashboard/page.tsx
│   │   │   ├── feed/page.tsx
│   │   │   ├── wall/page.tsx
│   │   │   ├── ideas/page.tsx
│   │   │   ├── reply/page.tsx
│   │   │   ├── stats/page.tsx
│   │   │   ├── security/page.tsx
│   │   │   └── settings/page.tsx
│   │   ├── login/
│   │   ├── auth/{callback,signout}/
│   │   ├── api/
│   │   │   ├── ai/{classify,summarize,replies,group-questions,threat-scan,cluster-topics}/
│   │   │   ├── checkin/
│   │   │   ├── comments/{hide,save-to-wall}/
│   │   │   ├── profile/update/
│   │   │   ├── stats/export/
│   │   │   ├── stripe/{checkout,confirm,portal,refresh-plan,webhook}/
│   │   │   ├── threats/{dismiss,email-prefs}/
│   │   │   ├── stalkers/[id]/{block,notes}/
│   │   │   ├── topics/[id]/{dismiss,mark-answered,reply}/
│   │   │   ├── wall/delete/
│   │   │   ├── youtube/{connect,callback,disconnect,sync,reply}/
│   │   │   └── cron/{sync-comments,generate-summaries,threat-monitor}/
│   │   ├── layout.tsx
│   │   └── globals.css
│   ├── components/
│   │   ├── settings/{filter-mode,metric-shield,language,theme,subscription-card}
│   │   ├── stats/{community-score,topics,peak-hours,ratio-card,chart-setup}
│   │   ├── security/{security-tabs,alert-card,stalker-row,severity-badge,email-prefs-form,critical-alerts-banner}
│   │   ├── ideas/{topic-card,topic-reply-form,dashboard-ideas-card}
│   │   ├── app-shell, sidebar, topbar, mobile-nav
│   │   ├── checkin-banner, tldr-card, metric-card, video-row
│   │   ├── feed-filters, comment-card, suggestions-button
│   │   ├── support-wall-card, wall-share-button, add-to-wall-form
│   │   ├── quick-reply-board
│   │   ├── avatar, logo, page-stub, skeleton
│   ├── lib/
│   │   ├── supabase/{client,server,admin,middleware}
│   │   ├── auth-context     # cached user/profile/channels
│   │   ├── gemini           # classifyBatch, generateTldr, generateReplies, groupQuestions, analyzeThreatBatch, clusterQuestionsForChannel, matchVideosToOpenTopics
│   │   ├── threat-detection # scanChannelThreats, updateStalkerProfiles, detectRaid, sendDigests
│   │   ├── topics           # clusterChannelTopics, detectAnsweredTopics, sendNewTopicsDigest
│   │   ├── emails           # Resend wrapper : sendThreatAlertEmail, sendThreatDigestEmail, sendNewTopicsEmail
│   │   ├── plans            # type Plan + hasProFeatures / hasShieldFeatures / normalizePlan
│   │   ├── classify, summary, stats, score
│   │   ├── youtube, youtube-sync, crypto
│   │   ├── stripe, theme, format, filter-mode
│   │   ├── cron-auth, utils
│   ├── i18n/request.ts      # detectLocale (cookie → profile → header)
│   └── middleware.ts
├── vercel.json              # 2 crons (sync-comments enchaîne threat + topics)
├── next.config.mjs          # next-intl plugin
├── tailwind.config.ts       # dark mode + design tokens
└── tsconfig.json            # target ES2020
```

---

## Plans tarifaires

| | Free | Pro | Shield |
|---|---|---|---|
| **Prix** | 0 €/mois | 14 €/mois | 29 €/mois |
| **Chaînes** | 1 YouTube | 3 (+ Instagram phase 2) | 3 (+ Instagram phase 2) |
| **TL;DR** | hebdo (lundi) | quotidien + par vidéo | quotidien + par vidéo |
| **Cap par sync** | 200 commentaires | 2000 | 2000 |
| **Quick Reply** | ❌ | ✅ | ✅ |
| **Stats** | ❌ | 90 jours + export CSV | 90 jours + export CSV |
| **Metric Shield** | ❌ | ✅ | ✅ |
| **Idées de vidéos** (topics) | ❌ | ✅ quotidien + email | ✅ quotidien + email |
| **Reply batch par topic** | ❌ | ✅ | ✅ |
| **Threat Detection** | ❌ | ❌ | ✅ (PII / doxxing / sev 0-3) |
| **Profils stalker** | ❌ | ❌ | ✅ (risk score 90j) |
| **Raid detection** | ❌ | ❌ | ✅ (fenêtre glissante 2h) |
| **Alertes email** | ❌ | ❌ | ✅ (immédiat / daily / weekly) |

---

## Déploiement actuel

- **URL prod** : `https://safe-place-plum.vercel.app`
- Repo GitHub privé
- Vercel Hobby (crons quotidiens uniquement)
- Stripe en mode **test** (cartes `4242 4242 4242 4242`)
- Supabase configuré pour autoriser `localhost:3000` ET `safe-place-plum.vercel.app` dans Auth Redirect URLs
- Google Cloud Console : OAuth client autorisé sur les 2 environnements

---

## Reste éventuellement à faire / améliorations possibles

- **Traduction complète** : `/reply` a encore quelques chaînes hardcodées en FR (l'onglet "Toutes les questions" notamment, le `GroupCard`). `CommentCard` a été migré en i18n complet au Chunk 3 Feature 1 polish. `/stats` reste en FR partiel.
- **Custom domain** sur Vercel (au lieu de `safe-place-plum.vercel.app`)
- **Domaine Resend vérifié** : actuellement `from: onboarding@resend.dev` (limité à l'email du compte Resend). Vérifier un domaine en prod et poser `RESEND_FROM` pour envoyer à n'importe qui.
- **Vercel Pro** pour avoir les crons toutes les 6h au lieu de daily — débloquerait le `/api/cron/threat-monitor` séparé au lieu du chaînage actuel dans `sync-comments`. Permettrait aussi un cron horaire pour la sync (vs daily aujourd'hui).
- **Heure de sync configurable par user** (au lieu de l'horaire global fixe) — nécessite Vercel Pro (cron horaire qui filtre par `preferred_sync_hour_utc`) OU un déclencheur externe gratuit (cron-job.org).
- **Auto-cluster pour Free** : actuellement Free n'a pas de clustering quotidien. Spec prévoit un cluster hebdo top-3 via le cron `generate-summaries` — à ajouter.
- **Détection auto-answered avec description vidéo** : V1 ne match que sur les titres. Étendre `fetchVideoTitles` → `fetchVideoDetails` (snippet) pour une meilleure précision.
- **UI pour les notes stalker** : l'API `/api/stalkers/[id]/notes` existe, pas d'UI dans la `StalkerRow`.
- **Émissions email** complémentaires : welcome, weekly TL;DR notification, confirmation d'abonnement (pour l'instant Resend ne sert qu'aux alertes menace + digest topics).
- **Analytics** produit (PostHog/Plausible)
- **Onboarding tour** au premier login
- **Phase 2** : intégration Instagram (déjà des placeholders UI)
- **Tests** unitaires / e2e (aucun test pour l'instant) — en particulier sur `analyzeThreatBatch` (prompt sensible), `clusterQuestionsForChannel` (idempotence du re-clustering), `planFromPriceId` (mapping Stripe), `matchVideosToOpenTopics` (anti-faux-positifs).
- **Rate limiting** sur les routes API publiques (login, signup spam) — et sur `/api/ai/threat-scan` / `/api/ai/cluster-topics` pour limiter le coût Gemini en cas de spam clic.
- **Vérification OAuth Google** au-delà de 100 users (à demander tôt à Google)
