import Link from "next/link";
import { useTranslations } from "next-intl";
import { Inbox, Users, Zap, Settings as SettingsIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type SecurityTab = "alerts" | "stalkers" | "raids" | "settings";

type Counts = {
  alerts: number;
  stalkers: number;
  raids: number;
};

const TABS: { key: SecurityTab; icon: typeof Inbox }[] = [
  { key: "alerts", icon: Inbox },
  { key: "stalkers", icon: Users },
  { key: "raids", icon: Zap },
  { key: "settings", icon: SettingsIcon },
];

export function SecurityTabs({
  active,
  counts,
}: {
  active: SecurityTab;
  counts: Counts;
}) {
  const t = useTranslations("security.tabs");
  return (
    <nav
      className="flex flex-wrap gap-1 border-b border-border"
      aria-label="Security sections"
    >
      {TABS.map((tab) => {
        const Icon = tab.icon;
        const isActive = active === tab.key;
        const count =
          tab.key === "alerts"
            ? counts.alerts
            : tab.key === "stalkers"
              ? counts.stalkers
              : tab.key === "raids"
                ? counts.raids
                : null;
        return (
          <Link
            key={tab.key}
            href={`/security?tab=${tab.key}`}
            className={cn(
              "inline-flex items-center gap-2 px-4 py-2.5 text-body border-b-2 -mb-px transition-colors duration-200 ease-out-soft",
              isActive
                ? "border-primary text-ink"
                : "border-transparent text-muted hover:text-ink"
            )}
          >
            <Icon className="h-4 w-4" aria-hidden />
            <span>{t(tab.key)}</span>
            {count !== null && count > 0 ? (
              <span
                className={cn(
                  "ml-1 inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1.5 rounded-full text-caption font-medium",
                  isActive
                    ? "bg-primary-light text-primary"
                    : "bg-card text-muted"
                )}
              >
                {count}
              </span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
