import Link from "next/link";
import { useTranslations } from "next-intl";
import { ShieldAlert } from "lucide-react";

/**
 * Bandeau ambre affiché en haut du dashboard quand au moins une alerte de
 * sévérité 3 (urgence) est non dismissed. Linke vers /security.
 *
 * Pas de rouge, fidèle au design system. La couleur ambre (la même que
 * pour les sévérités 2/3 des badges) signale l'urgence sans agresser.
 */
export function CriticalAlertsBanner({ count }: { count: number }) {
  const t = useTranslations("dashboard.criticalAlerts");
  if (count <= 0) return null;
  return (
    <Link
      href="/security?tab=alerts"
      className="flex items-center gap-3 rounded-md border border-amber/40 bg-amber-light px-4 py-3 hover:bg-amber-light/70 transition-colors duration-200"
    >
      <span className="grid place-items-center h-9 w-9 rounded-md bg-amber text-white shrink-0">
        <ShieldAlert className="h-4 w-4" aria-hidden />
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-body font-medium text-ink">
          {t("title", { count })}
        </p>
        <p className="text-caption text-muted">{t("subtitle")}</p>
      </div>
      <span className="text-caption text-amber font-medium shrink-0">
        {t("cta")}
      </span>
    </Link>
  );
}
