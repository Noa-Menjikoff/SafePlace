import { Sparkles, Check } from "lucide-react";

const FREE_FEATURES = [
  "1 chaîne YouTube",
  "TL;DR hebdomadaire",
  "Clean Feed + Mur de soutien",
  "Limite : 200 commentaires par analyse",
];

const PRO_FEATURES = [
  "3 chaînes (+ Instagram phase 2)",
  "TL;DR quotidien + par vidéo",
  "Quick Reply + Stats 90j + Export CSV",
  "Metric Shield complet · sans limite",
];

export function SubscriptionCard({
  plan,
}: {
  plan: "free" | "pro";
}) {
  const isPro = plan === "pro";

  return (
    <div className="ss-card p-6 flex flex-col gap-4">
      <header className="flex items-start justify-between gap-3">
        <div>
          <span className="ss-pill-primary inline-flex">
            <Sparkles className="h-3.5 w-3.5" aria-hidden />
            {isPro ? "Plan Pro" : "Plan Gratuit"}
          </span>
          <h2 className="text-h2 mt-3">
            {isPro
              ? "SafeSpace Pro"
              : "Tout l'essentiel pour démarrer"}
          </h2>
          <p className="text-caption text-muted mt-0.5">
            {isPro
              ? "14 €/mois · facturé via Stripe"
              : "0 €/mois · upgrade quand tu veux"}
          </p>
        </div>
        {isPro ? (
          <form action="/api/stripe/portal" method="post">
            <button type="submit" className="ss-button-ghost h-9 px-3 text-caption">
              Gérer via Stripe
            </button>
          </form>
        ) : (
          <form action="/api/stripe/checkout" method="post">
            <button
              type="submit"
              className="ss-button-primary h-9 px-3 text-caption"
            >
              Passer en Pro · 14€/mois
            </button>
          </form>
        )}
      </header>

      <ul className="grid gap-2 sm:grid-cols-2">
        {(isPro ? PRO_FEATURES : FREE_FEATURES).map((f) => (
          <li
            key={f}
            className="flex items-center gap-2 text-caption text-muted"
          >
            <Check
              className={`h-3.5 w-3.5 ${
                isPro ? "text-teal" : "text-primary"
              }`}
              aria-hidden
            />
            <span>{f}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
