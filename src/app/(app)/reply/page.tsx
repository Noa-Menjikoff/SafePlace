import { MessageSquareReply } from "lucide-react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  QuickReplyBoard,
  type InitialTopic,
} from "@/components/quick-reply-board";

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

  let initialTopics: InitialTopic[] = [];

  if (channelIds.length > 0) {
    const [questionsRes, topicsRes] = await Promise.all([
      supabase
        .from("comments")
        .select("id, text, author_name, video_id, video_title")
        .in("channel_id", channelIds)
        .eq("category", "question")
        .eq("is_toxic", false)
        .eq("is_hidden", false)
        .is("replied_at", null)
        .order("published_at", { ascending: false })
        .limit(80),
      supabase
        .from("question_topics")
        .select(
          "id, label, example_text, question_count, last_seen_at"
        )
        .in("channel_id", channelIds)
        .eq("status", "pending")
        .order("question_count", { ascending: false })
        .order("last_seen_at", { ascending: false })
        .limit(20),
    ]);

    initialQuestions = (questionsRes.data ?? []).map((r) => ({
      id: r.id,
      text: r.text ?? "",
      authorName: r.author_name,
      videoId: r.video_id,
      videoTitle: r.video_title,
    }));

    // Compte les commentaires non répondus par topic — sert au bouton
    // "Envoyer à N personnes" du TopicReplyForm.
    const topicIds = (topicsRes.data ?? []).map((t) => t.id as string);
    const pendingByTopic = new Map<string, number>();
    if (topicIds.length > 0) {
      const { data: pendingRows } = await supabase
        .from("comments")
        .select("topic_id")
        .in("topic_id", topicIds)
        .is("replied_at", null);
      for (const row of pendingRows ?? []) {
        const id = row.topic_id as string | null;
        if (!id) continue;
        pendingByTopic.set(id, (pendingByTopic.get(id) ?? 0) + 1);
      }
    }

    initialTopics = (topicsRes.data ?? []).map((t) => ({
      id: t.id as string,
      label: t.label as string,
      example: (t.example_text as string | null) ?? null,
      questionCount: t.question_count as number,
      pendingReplies: pendingByTopic.get(t.id as string) ?? 0,
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

      <QuickReplyBoard
        initialQuestions={initialQuestions}
        initialTopics={initialTopics}
      />
    </div>
  );
}
