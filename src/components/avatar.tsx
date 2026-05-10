import Image from "next/image";
import { cn } from "@/lib/utils";

function initialsOf(name: string | null | undefined): string {
  if (!name) return "?";
  const cleaned = name.replace(/^@/, "").trim();
  const parts = cleaned.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

const PALETTE = [
  "bg-primary-light text-primary",
  "bg-teal-light text-teal",
  "bg-amber-light text-amber",
  "bg-blue-light text-blue",
];

function colorFor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return PALETTE[hash % PALETTE.length];
}

type AvatarProps = {
  src?: string | null;
  name?: string | null;
  size?: number;
  className?: string;
};

export function Avatar({ src, name, size = 36, className }: AvatarProps) {
  const dim = `${size}px`;
  const initials = initialsOf(name);
  const seed = name ?? "anon";

  if (src) {
    return (
      <Image
        src={src}
        alt={name ?? ""}
        width={size}
        height={size}
        className={cn("rounded-full shrink-0 object-cover", className)}
        style={{ width: dim, height: dim }}
        unoptimized
      />
    );
  }

  return (
    <span
      className={cn(
        "grid place-items-center rounded-full text-caption font-medium shrink-0",
        colorFor(seed),
        className
      )}
      style={{ width: dim, height: dim }}
      aria-hidden
    >
      {initials}
    </span>
  );
}
