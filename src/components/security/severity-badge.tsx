import { useTranslations } from "next-intl";
import { Info, Eye, AlertTriangle, ShieldAlert } from "lucide-react";
import { cn } from "@/lib/utils";

export type Severity = 0 | 1 | 2 | 3;

const META: Record<Severity, { className: string; icon: typeof Info }> = {
  // Pas de rouge — fidèle au design system. La gravité monte via l'opacité
  // / l'icône + l'ambre foncé pour les urgences.
  0: { className: "bg-primary-light text-primary", icon: Info },
  1: { className: "bg-primary-light text-primary", icon: Eye },
  2: { className: "bg-amber-light text-amber", icon: AlertTriangle },
  3: { className: "bg-amber text-white", icon: ShieldAlert },
};

export function SeverityBadge({
  level,
  className,
}: {
  level: Severity;
  className?: string;
}) {
  const t = useTranslations("security.severity");
  const meta = META[level];
  const Icon = meta.icon;
  return (
    <span
      className={cn(
        "ss-pill",
        meta.className,
        className
      )}
    >
      <Icon className="h-3 w-3" aria-hidden />
      {t(String(level))}
    </span>
  );
}
