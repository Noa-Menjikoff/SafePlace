"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  LayoutDashboard,
  Inbox,
  Heart,
  MessageSquareReply,
  BarChart3,
  Settings,
  Lock,
} from "lucide-react";
import { Logo } from "@/components/logo";
import { cn } from "@/lib/utils";

type NavKey =
  | "dashboard"
  | "feed"
  | "wall"
  | "reply"
  | "stats"
  | "settings";

type NavItem = {
  href: string;
  key: NavKey;
  icon: typeof LayoutDashboard;
  proOnly?: boolean;
};

const NAV: NavItem[] = [
  { href: "/dashboard", key: "dashboard", icon: LayoutDashboard },
  { href: "/feed", key: "feed", icon: Inbox },
  { href: "/wall", key: "wall", icon: Heart },
  { href: "/reply", key: "reply", icon: MessageSquareReply, proOnly: true },
  { href: "/stats", key: "stats", icon: BarChart3, proOnly: true },
  { href: "/settings", key: "settings", icon: Settings },
];

export function Sidebar({ plan = "free" }: { plan?: "free" | "pro" }) {
  const pathname = usePathname();
  const t = useTranslations("nav");

  return (
    <aside className="hidden md:flex w-64 shrink-0 flex-col border-r border-border bg-surface px-4 py-6 sticky top-0 h-screen overflow-y-auto">
      <div className="px-2">
        <Logo />
      </div>

      <nav className="mt-8 flex flex-col gap-1">
        {NAV.map((item) => {
          const active =
            pathname === item.href || pathname.startsWith(item.href + "/");
          const locked = item.proOnly && plan !== "pro";
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "group flex items-center gap-3 rounded-md px-3 py-2 text-body transition-colors duration-200 ease-out-soft",
                active
                  ? "bg-card text-ink shadow-card"
                  : "text-muted hover:bg-card/60 hover:text-ink"
              )}
            >
              <Icon className="h-4 w-4" aria-hidden />
              <span className="flex-1">{t(item.key)}</span>
              {locked ? (
                <Lock className="h-3.5 w-3.5 text-muted" aria-hidden />
              ) : null}
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto pt-6">
        <div className="ss-card p-4">
          <p className="text-caption text-muted">{t("currentPlan")}</p>
          <p className="mt-1 text-body font-medium">
            {plan === "pro" ? t("planPro") : t("planFree")}
          </p>
          {plan !== "pro" ? (
            <Link
              href="/settings?upgrade=1"
              className="mt-3 inline-flex w-full justify-center ss-button-primary py-2 text-caption"
            >
              {t("upgradeCta")}
            </Link>
          ) : null}
        </div>
      </div>
    </aside>
  );
}
