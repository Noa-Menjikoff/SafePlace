import { MessageSquareReply } from "lucide-react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { QuickReplyBoard } from "@/components/quick-reply-board";

export const dynamic = "force-dynamic";

export default async function ReplyPage() {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: channels } = await supabase
    .from("channels")
    .select("id")
    .eq("user_id", user!.id);

  const channelIds = (channels ?? []).map((c) => c.id);

  let initialQuestions: {
    id: string;
    text: string;
    authorName: string | null;
    videoId: string | null;
    videoTitle: string | null;
  }[] = [];

  if (channelIds.length > 0) {
    const { data: rows } = await supabase
      .from("comments")
      .select("id, text, author_name, video_id, video_title")
      .in("channel_id", channelIds)
      .eq("category", "question")
      .eq("is_toxic", false)
      .eq("is_hidden", false)
      .is("replied_at", null)
      .order("published_at", { ascending: false })
      .limit(80);

    initialQuestions = (rows ?? []).map((r) => ({
      id: r.id,
      text: r.text ?? "",
      authorName: r.author_name,
      videoId: r.video_id,
      videoTitle: r.video_title,
    }));
  }

  return (
    <div className="mx-auto max-w-4xl flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <span className="ss-pill-primary inline-flex w-fit">
          <MessageSquareReply className="h-3.5 w-3.5" aria-hidden />
          Plan Pro
        </span>
        <h1 className="text-h1">Quick Reply</h1>
        <p className="text-muted text-body">
          Réponds à dix questions similaires en un seul mouvement. L&apos;IA
          regroupe ce qui se ressemble et te propose 3 brouillons par groupe.
        </p>
      </header>

      <QuickReplyBoard initialQuestions={initialQuestions} />
    </div>
  );
}
