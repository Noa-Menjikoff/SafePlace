import Image from "next/image";
import {
  Check,
  AlertCircle,
  Plug,
  Plus,
  Lock,
  RefreshCw,
} from "lucide-react";
import { getAppContext } from "@/lib/auth-context";
import { relativeTimeFr } from "@/lib/format";
import { FilterModeSelector } from "@/components/settings/filter-mode-selector";
import { MetricShieldToggle } from "@/components/settings/metric-shield-toggle";
import { LanguageSelector } from "@/components/settings/language-selector";
import { SubscriptionCard } from "@/components/settings/subscription-card";

export const dynamic = "force-dynamic";

const REASONS: Record<string, string> = {
  state_mismatch: "Session OAuth invalide. Réessaie depuis cette page.",
  token_exchange: "Google a refusé l'échange du code. Réessaie.",
  channel_fetch: "Impossible de récupérer ta chaîne YouTube.",
  no_channel: "Aucune chaîne YouTube trouvée sur ce compte Google.",
  db: "Erreur d'enregistrement. Réessaie dans un instant.",
  missing_params: "Paramètres OAuth manquants.",
  access_denied:
    "Tu as refusé l'accès. SafeSpace a besoin de ces permissions pour aspirer tes commentaires.",
};

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: {
    yt?: string;
    reason?: string;
    upgrade?: string;
    sync?: string;
    count?: string;
    classified?: string;
    stripe?: string;
  };
}) {
  const ctx = await getAppContext();
  const youtubeChannels = ctx.channels.filter((c) => c.platform === "youtube");
  const plan = ctx.plan;
  const channelLimit = plan === "pro" ? 3 : 1;
  const canAddChannel = youtubeChannels.length < channelLimit;
  const filterMode = ctx.filterMode;
  const language = ctx.language;
  const metricShield = ctx.metricShield;
  // Recovery banner si on a un customer Stripe mais que plan=free (webhook raté en local).
  const showRecoveryBanner = plan === "free" && !!ctx.stripeCustomerId;

  return (
    <div className="mx-auto max-w-3xl flex flex-col gap-8">
      <div>
        <h1 className="text-h1">Réglages</h1>
        <p className="text-muted text-body mt-1">
          Connexions, filtrage, langue et abonnement.
        </p>
      </div>

      {searchParams.yt === "connected" ? (
        <div className="ss-card flex items-start gap-3 border-teal/30 bg-teal-light p-4">
          <Check className="h-4 w-4 mt-0.5 text-teal" aria-hidden />
          <div>
            <p className="text-body font-medium text-teal">
              Chaîne YouTube connectée
            </p>
            <p className="text-caption text-muted">
              Lance une première synchro pour aspirer les commentaires des 7
              derniers jours.
            </p>
          </div>
        </div>
      ) : null}

      {searchParams.yt === "error" ? (
        <div className="ss-card flex items-start gap-3 border-amber/30 bg-amber-light p-4">
          <AlertCircle className="h-4 w-4 mt-0.5 text-amber" aria-hidden />
          <div>
            <p className="text-body font-medium text-amber">
              Connexion YouTube échouée
            </p>
            <p className="text-caption text-muted">
              {REASONS[searchParams.reason ?? ""] ??
                "Une erreur est survenue. Réessaie."}
            </p>
          </div>
        </div>
      ) : null}

      {searchParams.yt === "disconnected" ? (
        <div className="ss-card flex items-start gap-3 border-border p-4">
          <Plug className="h-4 w-4 mt-0.5 text-muted" aria-hidden />
          <div>
            <p className="text-body font-medium">Chaîne déconnectée</p>
            <p className="text-caption text-muted">
              On ne touchera plus à tes commentaires. Tu peux reconnecter quand
              tu veux.
            </p>
          </div>
        </div>
      ) : null}

      {searchParams.sync === "done" ? (
        <div className="ss-card flex items-start gap-3 border-teal/30 bg-teal-light p-4">
          <Check className="h-4 w-4 mt-0.5 text-teal" aria-hidden />
          <div>
            <p className="text-body font-medium text-teal">
              Synchronisation terminée
            </p>
            <p className="text-caption text-muted">
              {searchParams.count ?? "0"} nouveau
              {Number(searchParams.count ?? 0) > 1 ? "x" : ""} commentaire
              {Number(searchParams.count ?? 0) > 1 ? "s" : ""} aspiré
              {Number(searchParams.count ?? 0) > 1 ? "s" : ""} ·{" "}
              {searchParams.classified ?? "0"} classé
              {Number(searchParams.classified ?? 0) > 1 ? "s" : ""} par
              l&apos;IA.
            </p>
          </div>
        </div>
      ) : null}

      {searchParams.sync === "error" ? (
        <div className="ss-card flex items-start gap-3 border-amber/30 bg-amber-light p-4">
          <AlertCircle className="h-4 w-4 mt-0.5 text-amber" aria-hidden />
          <div>
            <p className="text-body font-medium text-amber">
              Synchronisation interrompue
            </p>
            <p className="text-caption text-muted">
              YouTube a renvoyé une erreur. Vérifie les permissions ou réessaie
              dans un moment.
            </p>
          </div>
        </div>
      ) : null}

      {searchParams.stripe === "success" ? (
        <div className="ss-card flex items-start gap-3 border-teal/30 bg-teal-light p-4">
          <Check className="h-4 w-4 mt-0.5 text-teal" aria-hidden />
          <div>
            <p className="text-body font-medium text-teal">Bienvenue chez Pro</p>
            <p className="text-caption text-muted">
              Ton abonnement est actif. Quick Reply, Stats 90j et tout le reste
              sont débloqués.
            </p>
          </div>
        </div>
      ) : null}

      {searchParams.stripe === "cancel" ? (
        <div className="ss-card flex items-start gap-3 border-border p-4">
          <AlertCircle className="h-4 w-4 mt-0.5 text-muted" aria-hidden />
          <div>
            <p className="text-body font-medium">Paiement annulé</p>
            <p className="text-caption text-muted">
              Tu peux relancer le checkout à tout moment depuis cette page.
            </p>
          </div>
        </div>
      ) : null}

      {searchParams.stripe === "error" ? (
        <div className="ss-card flex items-start gap-3 border-amber/30 bg-amber-light p-4">
          <AlertCircle className="h-4 w-4 mt-0.5 text-amber" aria-hidden />
          <div>
            <p className="text-body font-medium text-amber">
              Stripe a renvoyé une erreur
            </p>
            <p className="text-caption text-muted">
              Vérifie ta configuration Stripe (price ID, clés) ou réessaie.
            </p>
          </div>
        </div>
      ) : null}

      {searchParams.stripe === "missing_config" ? (
        <div className="ss-card flex items-start gap-3 border-amber/30 bg-amber-light p-4">
          <AlertCircle className="h-4 w-4 mt-0.5 text-amber" aria-hidden />
          <div>
            <p className="text-body font-medium text-amber">
              Configuration Stripe incomplète
            </p>
            <p className="text-caption text-muted">
              Ajoute <code className="font-mono">STRIPE_PRICE_ID_PRO</code> dans
              <code className="font-mono"> .env.local</code> avant de pouvoir
              démarrer un checkout.
            </p>
          </div>
        </div>
      ) : null}

      {searchParams.stripe === "no_customer" ? (
        <div className="ss-card flex items-start gap-3 border-border p-4">
          <AlertCircle className="h-4 w-4 mt-0.5 text-muted" aria-hidden />
          <div>
            <p className="text-body font-medium">Aucun abonnement à gérer</p>
            <p className="text-caption text-muted">
              Tu n&apos;as pas encore souscrit. Passe en Pro pour activer le
              portail Stripe.
            </p>
          </div>
        </div>
      ) : null}

      {searchParams.stripe === "synced_pro" ? (
        <div className="ss-card flex items-start gap-3 border-teal/30 bg-teal-light p-4">
          <Check className="h-4 w-4 mt-0.5 text-teal" aria-hidden />
          <div>
            <p className="text-body font-medium text-teal">
              Abonnement synchronisé
            </p>
            <p className="text-caption text-muted">
              Plan Pro actif. Tout est débloqué.
            </p>
          </div>
        </div>
      ) : null}

      {searchParams.stripe === "synced_free" ? (
        <div className="ss-card flex items-start gap-3 border-border p-4">
          <Check className="h-4 w-4 mt-0.5 text-muted" aria-hidden />
          <div>
            <p className="text-body font-medium">Aucune subscription active</p>
            <p className="text-caption text-muted">
              Stripe ne renvoie pas de subscription active pour ce compte.
            </p>
          </div>
        </div>
      ) : null}

      {showRecoveryBanner ? (
        <div className="ss-card flex items-start gap-3 border-amber/30 bg-amber-light/60 p-4">
          <AlertCircle className="h-4 w-4 mt-0.5 text-amber" aria-hidden />
          <div className="flex-1 min-w-0">
            <p className="text-body font-medium text-amber">
              Subscription Stripe potentiellement désynchronisée
            </p>
            <p className="text-caption text-muted">
              Tu as un customer Stripe lié mais ton plan reste sur Gratuit. Le
              webhook a peut-être manqué l&apos;événement (en local, lance
              <code className="font-mono"> stripe listen</code>). Tu peux
              forcer la synchro :
            </p>
          </div>
          <form action="/api/stripe/refresh-plan" method="post">
            <button type="submit" className="ss-button-primary h-9 px-3 text-caption">
              <RefreshCw className="h-3.5 w-3.5" aria-hidden />
              Resynchroniser
            </button>
          </form>
        </div>
      ) : null}

      {/* 1. Connexions */}
      <section className="ss-card p-6">
        <header className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-h2">Connexions</h2>
            <p className="text-caption text-muted mt-0.5">
              Plan {plan === "pro" ? "Pro" : "Gratuit"} :
              {" "}
              {youtubeChannels.length}/{channelLimit} chaîne
              {channelLimit > 1 ? "s" : ""} connectée
              {youtubeChannels.length > 1 ? "s" : ""}.
            </p>
          </div>
        </header>

        <div className="mt-5 flex flex-col gap-3">
          {youtubeChannels.length === 0 ? (
            <div className="rounded-md border border-dashed border-border p-5 text-center">
              <p className="text-body font-medium">Aucune chaîne connectée</p>
              <p className="text-caption text-muted mt-1">
                Connecte ta chaîne YouTube pour démarrer l&apos;analyse.
              </p>
              <a
                href="/api/youtube/connect"
                className="ss-button-primary mt-4 inline-flex"
              >
                <Plus className="h-4 w-4" aria-hidden />
                Connecter YouTube
              </a>
            </div>
          ) : (
            <>
              {youtubeChannels.map((c) => (
                <div
                  key={c.id}
                  className="flex flex-col gap-3 rounded-md border border-border bg-bg/40 p-4 sm:flex-row sm:items-center"
                >
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    {c.thumbnail_url ? (
                      <Image
                        src={c.thumbnail_url}
                        alt=""
                        width={40}
                        height={40}
                        className="h-10 w-10 rounded-full"
                        unoptimized
                      />
                    ) : (
                      <div className="h-10 w-10 rounded-full bg-primary-light" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-body font-medium truncate">{c.name}</p>
                      <p className="text-caption text-muted">
                        YouTube ·{" "}
                        {(c.subscriber_count ?? 0).toLocaleString("fr-FR")}{" "}
                        abonnés · sync {relativeTimeFr(c.last_synced_at)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <form action="/api/youtube/sync" method="post">
                      <input type="hidden" name="channelId" value={c.id} />
                      <input type="hidden" name="redirect" value="1" />
                      <button
                        type="submit"
                        className="ss-button-ghost h-9 px-3 text-caption"
                      >
                        <RefreshCw className="h-3.5 w-3.5" aria-hidden />
                        Synchroniser
                      </button>
                    </form>
                    <form action="/api/youtube/disconnect" method="post">
                      <input type="hidden" name="channelId" value={c.id} />
                      <button
                        type="submit"
                        className="ss-button-ghost h-9 px-3 text-caption"
                      >
                        Déconnecter
                      </button>
                    </form>
                  </div>
                </div>
              ))}

              {canAddChannel ? (
                <a
                  href="/api/youtube/connect"
                  className="ss-button-ghost justify-center"
                >
                  <Plus className="h-4 w-4" aria-hidden />
                  Connecter une autre chaîne
                </a>
              ) : (
                <p className="text-caption text-muted text-center">
                  Tu as atteint la limite du plan {plan === "pro" ? "Pro" : "Gratuit"}.
                  {plan !== "pro" ? " Passe en Pro pour 3 chaînes." : ""}
                </p>
              )}
            </>
          )}

          <div className="flex items-center gap-3 rounded-md border border-dashed border-border bg-bg/40 p-4">
            <div className="h-10 w-10 rounded-full bg-primary-light grid place-items-center">
              <Lock className="h-4 w-4 text-primary" aria-hidden />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-body font-medium">Instagram</p>
              <p className="text-caption text-muted">Bientôt disponible (phase 2).</p>
            </div>
          </div>
        </div>
      </section>

      {/* 2. Niveau de filtrage */}
      <section className="ss-card p-6">
        <header>
          <h2 className="text-h2">Niveau de filtrage</h2>
          <p className="text-caption text-muted mt-0.5">
            Décide à partir de quel niveau de toxicité un commentaire est
            masqué dans le Clean Feed. Tu peux changer à tout moment.
          </p>
        </header>
        <div className="mt-5">
          <FilterModeSelector initial={filterMode} />
        </div>
      </section>

      {/* 3. Affichage */}
      <section className="ss-card p-6">
        <header>
          <h2 className="text-h2">Affichage</h2>
          <p className="text-caption text-muted mt-0.5">
            Préférences pour réduire l&apos;anxiété au quotidien.
          </p>
        </header>
        <div className="mt-5 flex flex-col gap-5">
          <MetricShieldToggle initial={metricShield} />
          <div>
            <p className="text-body font-medium mb-2">Langue</p>
            <LanguageSelector initial={language} />
          </div>
        </div>
      </section>

      {/* 4. Re-classifier (admin / debug) */}
      {youtubeChannels.length > 0 ? (
        <section className="ss-card p-6">
          <h2 className="text-h2">Re-classifier les commentaires</h2>
          <p className="text-caption text-muted mt-1">
            Force une nouvelle passe IA sur tous les commentaires existants.
            Utile si tu changes le niveau de filtrage ou si la classification
            précédente s&apos;est trompée.
          </p>
          <form action="/api/ai/classify" method="post" className="mt-4">
            <input type="hidden" name="force" value="1" />
            <input type="hidden" name="redirect" value="1" />
            <button type="submit" className="ss-button-ghost">
              <RefreshCw className="h-4 w-4" aria-hidden />
              Re-classifier tout
            </button>
          </form>
        </section>
      ) : null}

      {/* 5. Abonnement */}
      <SubscriptionCard plan={plan} />
    </div>
  );
}
