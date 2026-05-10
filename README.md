# SafeSpace

Filtre intelligent de commentaires YouTube/Instagram pour créateurs.
Transforme 500 commentaires bruts en 5 insights actionnables, sans toxicité.

## Stack

- Next.js 14 (App Router) + TypeScript
- Tailwind CSS
- Supabase (Postgres + Auth + RLS)
- Gemini 2.5 Flash (`@google/generative-ai`)
- Stripe + Resend
- Déploiement Vercel + Vercel Cron

## Getting started

```bash
npm install
npm run dev
```

L'app tourne sur http://localhost:3000.

## Configuration Supabase

1. Exécute toutes les migrations `supabase/migrations/*.sql` dans le SQL editor.
2. Active le provider **Google** dans `Authentication → Providers` :
   - Client ID : valeur de `YOUTUBE_CLIENT_ID`
   - Client Secret : valeur de `YOUTUBE_CLIENT_SECRET`
   - Redirect URL : `https://<ref>.supabase.co/auth/v1/callback`
3. Dans Google Cloud Console, ajoute :
   - `http://localhost:3000/auth/callback` (login Supabase)
   - `http://localhost:3000/api/youtube/callback` (connexion chaîne)

## Configuration Stripe

1. Dans le dashboard Stripe (mode test), crée un **produit** "SafeSpace Pro"
   avec un **price récurrent à 14 €/mois**.
2. Copie le `price_id` (commence par `price_…`) dans `.env.local` :
   ```
   STRIPE_PRICE_ID_PRO=price_xxxxxxxxxxxxxxxxxx
   ```
3. Active le **Customer Portal** dans
   `Settings → Billing → Customer portal` (sinon /api/stripe/portal échoue).
4. **Webhook en local** : lance Stripe CLI et forward vers Next :
   ```bash
   stripe listen --forward-to localhost:3000/api/stripe/webhook
   ```
   Le CLI te donne un `whsec_…` à mettre dans `STRIPE_WEBHOOK_SECRET`.
5. Cartes de test : `4242 4242 4242 4242` (succès), `4000 0000 0000 9995`
   (refusé). Date future et CVC au choix.

## Variables d'environnement

Voir `.env.local`. Aucune valeur n'est commitée.

## Roadmap d'implémentation

1. Socle : Next.js + Supabase Auth + Middleware + Layout Sidebar
2. OAuth YouTube
3. Sync commentaires
4. Classification IA Gemini
5. Dashboard TL;DR
6. Clean Feed
7. Support Wall
8. Quick Reply (Pro)
9. Stats (Pro)
10. Settings
11. Stripe — fait
12. Cron jobs
13. i18n FR/EN
14. Polish
