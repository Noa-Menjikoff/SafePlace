import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  fetchChannelCommentThreads,
  fetchMineChannel,
  fetchVideoTitles,
  getValidAccessToken,
  type StoredChannel,
} from "@/lib/youtube";

export const FREE_PLAN_COMMENT_CAP = 200;
export const PRO_PLAN_COMMENT_CAP = 2000;
export const SYNC_WINDOW_DAYS = 7;

export type SyncResult = {
  channelId: string;
  fetched: number;
  inserted: number;
  cap: number;
};

export async function syncChannelComments(
  channel: StoredChannel,
  plan: "free" | "pro"
): Promise<SyncResult> {
  const cap = plan === "pro" ? PRO_PLAN_COMMENT_CAP : FREE_PLAN_COMMENT_CAP;
  const sinceISO = new Date(
    Date.now() - SYNC_WINDOW_DAYS * 24 * 60 * 60 * 1000
  ).toISOString();

  const accessToken = await getValidAccessToken(channel);

  const [threads, channelInfo] = await Promise.all([
    fetchChannelCommentThreads(accessToken, channel.platform_id, {
      maxComments: cap,
      sinceISO,
    }),
    fetchMineChannel(accessToken).catch(() => null),
  ]);

  const admin = createSupabaseAdminClient();

  if (threads.length === 0) {
    await admin
      .from("channels")
      .update({
        last_synced_at: new Date().toISOString(),
        subscriber_count:
          channelInfo?.subscriberCount ?? channel.subscriber_count,
      })
      .eq("id", channel.id);

    return { channelId: channel.id, fetched: 0, inserted: 0, cap };
  }

  const videoIds = Array.from(new Set(threads.map((t) => t.videoId)));
  const videoTitles = await fetchVideoTitles(accessToken, videoIds).catch(
    () => new Map<string, string>()
  );

  const rows = threads.map((t) => ({
    channel_id: channel.id,
    platform_comment_id: t.topLevelCommentId,
    author_name: t.authorName,
    author_avatar: t.authorAvatar,
    text: t.text,
    published_at: t.publishedAt,
    video_id: t.videoId,
    video_title: videoTitles.get(t.videoId) ?? null,
  }));

  // Upsert sur platform_comment_id (UNIQUE en base) :
  // resync sans dupliquer ni écraser la classification existante.
  const { data: inserted, error } = await admin
    .from("comments")
    .upsert(rows, {
      onConflict: "platform_comment_id",
      ignoreDuplicates: true,
    })
    .select("id");

  if (error) {
    throw new Error(`Comments upsert failed: ${error.message}`);
  }

  await admin
    .from("channels")
    .update({
      last_synced_at: new Date().toISOString(),
      subscriber_count:
        channelInfo?.subscriberCount ?? channel.subscriber_count,
    })
    .eq("id", channel.id);

  return {
    channelId: channel.id,
    fetched: threads.length,
    inserted: inserted?.length ?? 0,
    cap,
  };
}
