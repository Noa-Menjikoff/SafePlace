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
profiles      -- id (=auth.uid), plan, stripe_customer_id, stripe_subscription_id,
              -- filter_mode, language, metric_shield
channels      -- id, user_id, platform, platform_id, name, thumbnail_url,
              -- access_token (chiffré AES-256-GCM), refresh_token (chiffré),
              -- token_expires_at, subscriber_count, last_synced_at
              -- UNIQUE (user_id, platform_id)
comments      -- id, channel_id, platform_comment_id (UNIQUE),
              -- author_name, author_avatar, text,
              -- category (question|positive|constructive|neutral),
              -- is_toxic, toxicity_score, is_hidden, is_saved_to_wall,
              -- replied_at, published_at, video_id, video_title
summaries     -- id, channel_id, week_start, insights (jsonb),
              -- raw_count, positive_ratio, community_score
              -- UNIQUE (channel_id, week_start)
support_wall  -- id, user_id, comment_id?, custom_text?, author_name
checkins      -- id, user_id, mood (exhausted|tired|neutral|good|great)
```

**RLS activé** sur toutes les tables. Policies "users own X" sur tout sauf comments (qui hérite via channel ownership). Trigger `on_auth_user_created` auto-crée le profile.

7 migrations dans `supabase/migrations/` : initial schema, channels unique constraint, last_synced_at, summaries unique, comments is_hidden, comments replied_at.

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
RESEND_API_KEY
ENCRYPTION_KEY        # 32 bytes hex, chiffre les tokens YouTube
CRON_SECRET           # Bearer token Vercel cron
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
├── supabase/migrations/    # 6 migrations SQL versionnées
├── src/
│   ├── app/
│   │   ├── (app)/          # Routes protégées (shared AppShell)
│   │   │   ├── layout.tsx
│   │   │   ├── loading.tsx
│   │   │   ├── dashboard/page.tsx
│   │   │   ├── feed/page.tsx
│   │   │   ├── wall/page.tsx
│   │   │   ├── reply/page.tsx
│   │   │   ├── stats/page.tsx
│   │   │   └── settings/page.tsx
│   │   ├── login/
│   │   ├── auth/{callback,signout}/
│   │   ├── api/
│   │   │   ├── ai/{classify,summarize,replies,group-questions}/
│   │   │   ├── checkin/
│   │   │   ├── comments/{hide,save-to-wall}/
│   │   │   ├── profile/update/
│   │   │   ├── stats/export/
│   │   │   ├── stripe/{checkout,confirm,portal,refresh-plan,webhook}/
│   │   │   ├── wall/delete/
│   │   │   ├── youtube/{connect,callback,disconnect,sync,reply}/
│   │   │   └── cron/{sync-comments,generate-summaries}/
│   │   ├── layout.tsx
│   │   └── globals.css
│   ├── components/
│   │   ├── settings/{filter-mode,metric-shield,language,theme,subscription-card}
│   │   ├── stats/{community-score,topics,peak-hours,ratio-card,chart-setup}
│   │   ├── app-shell, sidebar, topbar, mobile-nav
│   │   ├── checkin-banner, tldr-card, metric-card, video-row
│   │   ├── feed-filters, comment-card, suggestions-button
│   │   ├── support-wall-card, wall-share-button, add-to-wall-form
│   │   ├── quick-reply-board
│   │   ├── avatar, logo, page-stub, skeleton
│   ├── lib/
│   │   ├── supabase/{client,server,admin,middleware}
│   │   ├── auth-context     # cached user/profile/channels
│   │   ├── gemini           # classifyBatch, generateTldr, generateReplies, groupQuestions
│   │   ├── classify, summary, stats, score
│   │   ├── youtube, youtube-sync, crypto
│   │   ├── stripe, theme, format, filter-mode
│   │   ├── cron-auth, utils
│   ├── i18n/request.ts      # detectLocale (cookie → profile → header)
│   └── middleware.ts
├── vercel.json              # 2 crons
├── next.config.mjs          # next-intl plugin
├── tailwind.config.ts       # dark mode + design tokens
└── tsconfig.json            # target ES2020
```

---

## Plans tarifaires

| | Free | Pro |
|---|---|---|
| **Prix** | 0 €/mois | 14 €/mois |
| **Chaînes** | 1 YouTube | 3 (+ Instagram phase 2) |
| **TL;DR** | hebdo (lundi) | quotidien + par vidéo |
| **Cap par sync** | 200 commentaires | 2000 |
| **Quick Reply** | ❌ | ✅ |
| **Stats** | ❌ | 90 jours + export CSV |
| **Metric Shield** | ❌ | ✅ |

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

- **Traduction complète** : `/reply`, `/stats`, `CommentCard` ont quelques chaînes encore en FR (les clés sont déjà dans les JSON, c'est juste du remplacement mécanique)
- **Custom domain** sur Vercel (au lieu de `safe-place-plum.vercel.app`)
- **Vercel Pro** pour avoir les crons toutes les 6h au lieu de daily
- **Emails** Resend (welcome, weekly TL;DR notification, abonnement) — l'API key est en env mais aucun mail n'est envoyé
- **Analytics** produit (PostHog/Plausible)
- **Onboarding tour** au premier login
- **Phase 2** : intégration Instagram (déjà des placeholders UI)
- **Tests** unitaires / e2e (aucun test pour l'instant)
- **Rate limiting** sur les routes API publiques (login, signup spam)
- **Vérification OAuth Google** au-delà de 100 users (à demander tôt à Google)
