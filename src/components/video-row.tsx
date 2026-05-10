import Link from "next/link";
import { Play, MessageCircleQuestion, Heart, EyeOff } from "lucide-react";
import { relativeTimeFr } from "@/lib/format";

export type VideoSummary = {
  videoId: string;
  videoTitle: string | null;
  total: number;
  questions: number;
  positives: number;
  hidden: number;
  latestComment: string | null;
};

export function VideoRow({ video }: { video: VideoSummary }) {
  const youtubeUrl = `https://www.youtube.com/watch?v=${video.videoId}`;
  const feedUrl = `/feed?video=${encodeURIComponent(video.videoId)}`;

  return (
    <li className="flex flex-col gap-3 rounded-md border border-border bg-card p-4 transition-colors duration-200 hover:bg-bg/30 sm:flex-row sm:items-center">
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <a
          href={youtubeUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="grid place-items-center h-12 w-20 shrink-0 rounded-md bg-primary-light text-primary"
          aria-label="Ouvrir sur YouTube"
        >
          <Play className="h-4 w-4" aria-hidden />
        </a>
        <div className="flex-1 min-w-0">
          <Link href={feedUrl} className="text-body font-medium hover:text-primary truncate block">
            {video.videoTitle ?? "Vidéo sans titre"}
          </Link>
          <p className="text-caption text-muted mt-0.5">
            {video.total} commentaire{video.total > 1 ? "s" : ""}
            {video.latestComment
              ? ` · dernier ${relativeTimeFr(video.latestComment)}`
              : ""}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5 shrink-0">
        {video.questions > 0 ? (
          <span className="ss-pill-blue">
            <MessageCircleQuestion className="h-3 w-3" aria-hidden />
            {video.questions} question{video.questions > 1 ? "s" : ""}
          </span>
        ) : null}
        {video.positives > 0 ? (
          <span className="ss-pill-teal">
            <Heart className="h-3 w-3" aria-hidden />
            {video.positives} positif{video.positives > 1 ? "s" : ""}
          </span>
        ) : null}
        {video.hidden > 0 ? (
          <span className="ss-pill-primary">
            <EyeOff className="h-3 w-3" aria-hidden />
            {video.hidden} masqué{video.hidden > 1 ? "s" : ""}
          </span>
        ) : null}
      </div>
    </li>
  );
}
