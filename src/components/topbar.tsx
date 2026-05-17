import { LogOut } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { MobileNav } from "@/components/mobile-nav";
import type { Plan } from "@/lib/plans";

type TopbarProps = {
  email?: string | null;
  channelName?: string | null;
  plan?: Plan;
};

export async function Topbar({ email, channelName, plan = "free" }: TopbarProps) {
  const t = await getTranslations("topbar");

  return (
    <header className="flex items-center justify-between border-b border-border bg-bg/80 px-4 sm:px-6 py-3 sm:py-4 backdrop-blur sticky top-0 z-30">
      <div className="flex items-center gap-3 min-w-0">
        <MobileNav plan={plan} />
        <div className="flex flex-col min-w-0">
          <span className="text-caption text-muted hidden sm:inline">
            {t("creatorSpace")}
          </span>
          <span className="text-body font-medium truncate">
            {channelName ?? t("noChannel")}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-3">
        {email ? (
          <span className="hidden lg:inline text-caption text-muted truncate max-w-[200px]">
            {email}
          </span>
        ) : null}
        <form action="/auth/signout" method="post">
          <button
            type="submit"
            className="ss-button-ghost h-9 px-3 text-caption"
            aria-label={t("logout")}
          >
            <LogOut className="h-4 w-4" aria-hidden />
            <span className="hidden sm:inline">{t("logout")}</span>
          </button>
        </form>
      </div>
    </header>
  );
}
