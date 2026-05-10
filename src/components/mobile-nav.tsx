"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  Menu,
  X,
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

const NAV: {
  href: string;
  key: NavKey;
  icon: typeof LayoutDashboard;
  proOnly?: boolean;
}[] = [
  { href: "/dashboard", key: "dashboard", icon: LayoutDashboard },
  { href: "/feed", key: "feed", icon: Inbox },
  { href: "/wall", key: "wall", icon: Heart },
  { href: "/reply", key: "reply", icon: MessageSquareReply, proOnly: true },
  { href: "/stats", key: "stats", icon: BarChart3, proOnly: true },
  { href: "/settings", key: "settings", icon: Settings },
];

export function MobileNav({ plan = "free" }: { plan?: "free" | "pro" }) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const pathname = usePathname();
  const t = useTranslations("nav");

  // Marqueur de montage pour autoriser createPortal côté client uniquement.
  useEffect(() => {
    setMounted(true);
  }, []);

  // Ferme le drawer après navigation
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Empêche le scroll body quand drawer ouvert
  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  const drawer = (
    <div
      className="fixed inset-0 z-[100] md:hidden flex"
      role="dialog"
      aria-modal="true"
    >
      <aside
        style={{ backgroundColor: "var(--color-card)" }}
        className={cn(
          "relative w-72 max-w-[80vw] border-r border-border px-4 py-6 flex flex-col shadow-2xl"
        )}
      >
        <div className="flex items-center justify-between">
          <Logo />
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="inline-flex items-center justify-center h-9 w-9 rounded-md text-muted hover:text-ink hover:bg-bg/60"
            aria-label="Close"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
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
                    ? "bg-bg text-ink shadow-card"
                    : "text-muted hover:bg-bg/60 hover:text-ink"
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
          <div className="rounded-lg border border-border bg-bg p-4">
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

      <button
        type="button"
        aria-label="Close menu"
        className="flex-1 bg-black/50 backdrop-blur-sm"
        onClick={() => setOpen(false)}
      />
    </div>
  );

  return (
    <>
      <button
        type="button"
        className="md:hidden inline-flex items-center justify-center h-9 w-9 rounded-md border border-border bg-card text-ink"
        onClick={() => setOpen(true)}
        aria-label="Open menu"
      >
        <Menu className="h-4 w-4" aria-hidden />
      </button>

      {/* Portal vers <body> pour échapper au stacking context de la Topbar
          (sticky top-0 z-30) — sinon <main> qui suit dans le DOM passe
          devant le drawer. */}
      {open && mounted ? createPortal(drawer, document.body) : null}
    </>
  );
}
