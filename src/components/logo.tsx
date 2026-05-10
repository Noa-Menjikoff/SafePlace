import { cn } from "@/lib/utils";

export function Logo({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div
        aria-hidden
        className="grid h-8 w-8 place-items-center rounded-md bg-primary text-white font-semibold"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          className="h-4 w-4"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M12 3l8 4v5c0 4.5-3.5 8.5-8 9-4.5-.5-8-4.5-8-9V7l8-4z" />
          <path d="M9 12l2 2 4-4" />
        </svg>
      </div>
      <span className="text-h2 font-medium tracking-tight">SafeSpace</span>
    </div>
  );
}
