import { decrypt, encrypt } from "@/lib/crypto";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const YOUTUBE_SCOPES = [
  "https://www.googleapis.com/auth/youtube.readonly",
  "https://www.googleapis.com/auth/youtube.force-ssl",
];

const OAUTH_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const OAUTH_TOKEN_URL = "https://oauth2.googleapis.com/token";
const YOUTUBE_API = "https://www.googleapis.com/youtube/v3";

function getRedirectUri(): string {
  return (
    process.env.YOUTUBE_REDIRECT_URI ||
    `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/api/youtube/callback`
  );
}

export function buildYoutubeAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: process.env.YOUTUBE_CLIENT_ID!,
    redirect_uri: getRedirectUri(),
    response_type: "code",
    scope: YOUTUBE_SCOPES.join(" "),
    access_type: "offline",
    include_granted_scopes: "true",
    prompt: "consent",
    state,
  });
  return `${OAUTH_AUTH_URL}?${params.toString()}`;
}

export type GoogleTokenResponse = {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  scope: string;
  token_type: string;
  id_token?: string;
};

export async function exchangeCodeForTokens(
  code: string
): Promise<GoogleTokenResponse> {
  const body = new URLSearchParams({
    code,
    client_id: process.env.YOUTUBE_CLIENT_ID!,
    client_secret: process.env.YOUTUBE_CLIENT_SECRET!,
    redirect_uri: getRedirectUri(),
    grant_type: "authorization_code",
  });

  const res = await fetch(OAUTH_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Token exchange failed: ${res.status} ${text}`);
  }

  return res.json();
}

export async function refreshAccessToken(
  refreshToken: string
): Promise<GoogleTokenResponse> {
  const body = new URLSearchParams({
    client_id: process.env.YOUTUBE_CLIENT_ID!,
    client_secret: process.env.YOUTUBE_CLIENT_SECRET!,
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  });

  const res = await fetch(OAUTH_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Token refresh failed: ${res.status} ${text}`);
  }

  return res.json();
}

export type YoutubeChannelInfo = {
  id: string;
  title: string;
  thumbnailUrl: string | null;
  subscriberCount: number | null;
};

export async function fetchMineChannel(
  accessToken: string
): Promise<YoutubeChannelInfo | null> {
  const res = await fetch(
    `${YOUTUBE_API}/channels?part=snippet,statistics&mine=true`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    }
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`YouTube channels.list failed: ${res.status} ${text}`);
  }

  const data = (await res.json()) as {
    items?: Array<{
      id: string;
      snippet: {
        title: string;
        thumbnails?: { default?: { url?: string }; medium?: { url?: string } };
      };
      statistics?: { subscriberCount?: string };
    }>;
  };

  const channel = data.items?.[0];
  if (!channel) return null;

  return {
    id: channel.id,
    title: channel.snippet.title,
    thumbnailUrl:
      channel.snippet.thumbnails?.medium?.url ||
      channel.snippet.thumbnails?.default?.url ||
      null,
    subscriberCount: channel.statistics?.subscriberCount
      ? Number(channel.statistics.subscriberCount)
      : null,
  };
}

export type YoutubeCommentThread = {
  threadId: string;
  topLevelCommentId: string;
  authorName: string;
  authorAvatar: string | null;
  text: string;
  publishedAt: string;
  videoId: string;
};

export type FetchCommentsOptions = {
  maxComments?: number;
  sinceISO?: string;
};

/**
 * Fetches top-level comment threads for a channel via the YouTube Data API.
 * Stops paginating once {maxComments} is reached or once a comment older than
 * {sinceISO} is encountered (the API returns most-recent-first by default).
 */
export async function fetchChannelCommentThreads(
  accessToken: string,
  channelId: string,
  options: FetchCommentsOptions = {}
): Promise<YoutubeCommentThread[]> {
  const maxComments = options.maxComments ?? 200;
  const sinceMs = options.sinceISO
    ? new Date(options.sinceISO).getTime()
    : null;

  const collected: YoutubeCommentThread[] = [];
  let pageToken: string | undefined;

  while (collected.length < maxComments) {
    const params = new URLSearchParams({
      part: "snippet",
      allThreadsRelatedToChannelId: channelId,
      maxResults: "100",
      order: "time",
      textFormat: "plainText",
    });
    if (pageToken) params.set("pageToken", pageToken);

    const res = await fetch(`${YOUTUBE_API}/commentThreads?${params}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`commentThreads.list failed: ${res.status} ${text}`);
    }

    const data = (await res.json()) as {
      items?: Array<{
        id: string;
        snippet: {
          videoId: string;
          topLevelComment: {
            id: string;
            snippet: {
              authorDisplayName: string;
              authorProfileImageUrl?: string;
              textOriginal?: string;
              textDisplay?: string;
              publishedAt: string;
            };
          };
        };
      }>;
      nextPageToken?: string;
    };

    let reachedTimeBoundary = false;

    for (const item of data.items ?? []) {
      const snippet = item.snippet.topLevelComment.snippet;
      const publishedAt = snippet.publishedAt;

      if (sinceMs && new Date(publishedAt).getTime() < sinceMs) {
        reachedTimeBoundary = true;
        break;
      }

      collected.push({
        threadId: item.id,
        topLevelCommentId: item.snippet.topLevelComment.id,
        authorName: snippet.authorDisplayName,
        authorAvatar: snippet.authorProfileImageUrl ?? null,
        text: snippet.textOriginal || snippet.textDisplay || "",
        publishedAt,
        videoId: item.snippet.videoId,
      });

      if (collected.length >= maxComments) break;
    }

    if (reachedTimeBoundary || !data.nextPageToken) break;
    pageToken = data.nextPageToken;
  }

  return collected;
}

/**
 * Poste une réponse à un commentaire YouTube via l'API v3.
 * `parentCommentId` doit être l'id du commentaire parent (top-level),
 * tel que stocké dans `comments.platform_comment_id`.
 *
 * Endpoint: POST /youtube/v3/comments?part=snippet
 * Scope requis: youtube.force-ssl (déjà demandé à l'OAuth).
 */
export async function postCommentReply(
  accessToken: string,
  parentCommentId: string,
  textOriginal: string
): Promise<{ id: string }> {
  const res = await fetch(`${YOUTUBE_API}/comments?part=snippet`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      snippet: { parentId: parentCommentId, textOriginal },
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`comments.insert failed: ${res.status} ${text}`);
  }

  const data = (await res.json()) as { id?: string };
  return { id: data.id ?? "" };
}

/**
 * Returns a Map<videoId, title> for the given video IDs.
 * Batches in groups of 50 (the videos.list `id` cap).
 */
export async function fetchVideoTitles(
  accessToken: string,
  videoIds: string[]
): Promise<Map<string, string>> {
  const titles = new Map<string, string>();
  const unique = Array.from(new Set(videoIds.filter(Boolean)));

  for (let i = 0; i < unique.length; i += 50) {
    const chunk = unique.slice(i, i + 50);
    const params = new URLSearchParams({
      part: "snippet",
      id: chunk.join(","),
    });

    const res = await fetch(`${YOUTUBE_API}/videos?${params}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`videos.list failed: ${res.status} ${text}`);
    }

    const data = (await res.json()) as {
      items?: Array<{ id: string; snippet?: { title?: string } }>;
    };

    for (const v of data.items ?? []) {
      if (v.snippet?.title) titles.set(v.id, v.snippet.title);
    }
  }

  return titles;
}

export type StoredChannel = {
  id: string;
  user_id: string;
  platform: string;
  platform_id: string;
  name: string;
  thumbnail_url: string | null;
  access_token: string | null;
  refresh_token: string | null;
  token_expires_at: string | null;
  subscriber_count: number | null;
};

/**
 * Returns a fresh access_token for a channel, refreshing it via Google if
 * the stored token is expired or near expiry.
 */
export async function getValidAccessToken(channel: StoredChannel): Promise<string> {
  const expiresAt = channel.token_expires_at
    ? new Date(channel.token_expires_at).getTime()
    : 0;
  const now = Date.now();
  const isExpired = !expiresAt || expiresAt - now < 60_000;

  if (!isExpired && channel.access_token) {
    return decrypt(channel.access_token);
  }

  if (!channel.refresh_token) {
    throw new Error("No refresh token available for channel");
  }

  const refreshed = await refreshAccessToken(decrypt(channel.refresh_token));
  const newExpiresAt = new Date(Date.now() + refreshed.expires_in * 1000);

  const admin = createSupabaseAdminClient();
  await admin
    .from("channels")
    .update({
      access_token: encrypt(refreshed.access_token),
      token_expires_at: newExpiresAt.toISOString(),
      refresh_token: refreshed.refresh_token
        ? encrypt(refreshed.refresh_token)
        : channel.refresh_token,
    })
    .eq("id", channel.id);

  return refreshed.access_token;
}
