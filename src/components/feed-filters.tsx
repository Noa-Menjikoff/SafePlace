import Link from "next/link";
import { getTranslations } from "next-intl/server";
import {
  List,
  MessageCircleQuestion,
  Heart,
  Lightbulb,
  Circle,
  EyeOff,
} from "lucide-react";
import { cn } from "@/lib/utils";

export type FeedFilter =
  | "all"
  | "questions"
  | "positive"
  | "constructive"
  | "neutral"
  | "hidden";

export type FilterCounts = Record<FeedFilter, number>;

const ITEMS: { value: FeedFilter; icon: typeof List }[] = [
  { value: "all", icon: List },
  { value: "questions", icon: MessageCircleQuestion },
  { value: "positive", icon: Heart },
  { value: "constructive", icon: Lightbulb },
  { value: "neutral", icon: Circle },
  { value: "hidden", icon: EyeOff },
];

export async function FeedFilters({
  active,
  counts,
  videoId,
}: {
  active: FeedFilter;
  counts: FilterCounts;
  videoId?: string | null;
}) {
  const t = await getTranslations("feed.filters");

  return (
    <div
      role="tablist"
      className="flex flex-wrap items-center gap-1.5 p-1 rounded-md border border-border bg-card"
    >
      {ITEMS.map((item) => {
        const isActive = item.value === active;
        const Icon = item.icon;
        const params = new URLSearchParams();
        if (item.value !== "all") params.set("filter", item.value);
        if (videoId) params.set("video", videoId);
        const href = "/feed" + (params.size ? `?${params.toString()}` : "");

        return (
          <Link
            key={item.value}
            href={href}
            role="tab"
            aria-selected={isActive}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md px-3 h-8 text-caption font-medium transition-colors duration-200 ease-out-soft",
              isActive
                ? "bg-primary-light text-primary"
                : "text-muted hover:text-ink hover:bg-bg/50"
            )}
          >
            <Icon className="h-3.5 w-3.5" aria-hidden />
            <span>{t(item.value)}</span>
            <span
              className={cn(
                "ml-0.5 inline-flex items-center justify-center min-w-[1.25rem] rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums",
                isActive
                  ? "bg-primary text-white"
                  : "bg-bg/60 text-muted"
              )}
            >
              {counts[item.value]}
            </span>
          </Link>
        );
      })}
    </div>
  );
}
