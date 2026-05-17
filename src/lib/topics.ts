import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  clusterQuestionsForChannel,
  matchVideosToOpenTopics,
  type ClusteredTopic,
  type ExistingTopic,
  type VideoCandidate,
} from "@/lib/gemini";
import { sendNewTopicsEmail, getAppUrl } from "@/lib/emails";

export const TOPICS_QUESTION_WINDOW_DAYS = 90;
/** Cap par run (limite tokens Gemini + budget). */
export const TOPICS_MAX_QUESTIONS_PER_RUN = 150;
/** Topics inactifs depuis N jours sont auto-archivés (status = dismissed). */
export const TOPICS_AUTO_ARCHIVE_DAYS = 60;
/** Seuil pour qu'un topic déclenche un email "nouveau topic émerge". */
export const TOPICS_NOTIFY_THRESHOLD = 5;
/** Fenêtre pour considérer une vidéo "récente" lors du matching auto-answer. */
export const TOPICS_RECENT_VIDEO_DAYS = 14;
/** Cap du nombre de vidéos analysées par run de matching. */
export const TOPICS_MAX_VIDEOS_PER_MATCH = 5;

export type ClusterRunResult = {
  channelId: string;
  questionsConsidered: number;
  topicsCreated: number;
  topicsUpdated: number;
  topicsArchived: number;
};

/**
 * Rafraîchit le clustering pour une chaîne :
 *   1. fetch des questions non répondues des 90j (cap 150)
 *   2. fetch des topics existants (status = pending, < 60j)
 *   3. appel Gemini → groupes (id existant OU nouveau)
 *   4. UPSERT des topics + UPDATE comments.topic_id
 *   5. auto-archivage des topics sans nouvelle question depuis 60j
 *
 * Idempotent : ré-exécutable plusieurs fois par jour, le re-clustering
 * convergera vers le même résultat tant que les commentaires source n'ont
 * pas changé.
 */
export async function clusterChannelTopics(
  channelId: string
): Promise<ClusterRunResult> {
  const admin = createSupabaseAdminClient();
  const windowMs = TOPICS_QUESTION_WINDOW_DAYS * 24 * 60 * 60 * 1000;
  const sinceISO = new Date(Date.now() - windowMs).toISOString();

  // 1. Questions à clusteriser (non répondues = replied_at IS NULL, catégorie question)
  const { data: rawQuestions } = await admin
    .from("comments")
    .select("id, text, video_title, language, replied_at")
    .eq("channel_id", channelId)
    .eq("category", "question")
    .is("replied_at", null)
    .gte("published_at", sinceISO)
    .order("published_at", { ascending: false })
    .limit(TOPICS_MAX_QUESTIONS_PER_RUN);

  const questions = (rawQuestions ?? []).map((q) => ({
    id: q.id,
    text: (q.text as string).slice(0, 400),
    videoTitle: (q.video_title as string | null) ?? null,
  }));

  // Détecte la langue dominante des questions (heuristique simple : présence
  // de mots français très fréquents). Fallback en français.
  const language = detectDominantLanguage(
    (rawQuestions ?? []).map((q) => q.text as string)
  );

  // 2. Topics existants (pending, raisonnablement récents)
  const archiveCutoff = new Date(
    Date.now() - TOPICS_AUTO_ARCHIVE_DAYS * 24 * 60 * 60 * 1000
  ).toISOString();

  const { data: existing } = await admin
    .from("question_topics")
    .select("id, label, example_text, last_seen_at, status")
    .eq("channel_id", channelId)
    .eq("status", "pending")
    .gte("last_seen_at", archiveCutoff);

  const existingTopics: ExistingTopic[] = (existing ?? []).map((t) => ({
    id: t.id,
    label: t.label as string,
    example: (t.example_text as string | null) ?? null,
  }));

  if (questions.length === 0) {
    // Toujours faire le tour d'archivage même sans nouvelles questions.
    const archived = await autoArchiveStaleTopics(channelId);
    return {
      channelId,
      questionsConsidered: 0,
      topicsCreated: 0,
      topicsUpdated: 0,
      topicsArchived: archived,
    };
  }

  // 3. Gemini clustering
  let clusters: ClusteredTopic[];
  try {
    clusters = await clusterQuestionsForChannel({
      questions,
      existingTopics,
      language,
    });
  } catch (e) {
    console.error("clusterChannelTopics: Gemini call failed", channelId, e);
    return {
      channelId,
      questionsConsidered: questions.length,
      topicsCreated: 0,
      topicsUpdated: 0,
      topicsArchived: 0,
    };
  }

  // 4. UPSERT topics + rattachement des commentaires
  let topicsCreated = 0;
  let topicsUpdated = 0;
  const now = new Date().toISOString();

  for (const cluster of clusters) {
    if (cluster.comment_ids.length === 0) continue;

    let topicId = cluster.id;

    if (topicId) {
      // Mise à jour d'un topic existant : on incrémente le count + last_seen
      const { error: updateError } = await admin
        .from("question_topics")
        .update({
          label: cluster.label,
          example_text: cluster.example || null,
          question_count: cluster.comment_ids.length,
          last_seen_at: now,
          language,
          updated_at: now,
        })
        .eq("id", topicId)
        .eq("channel_id", channelId);

      if (updateError) {
        console.error(
          "clusterChannelTopics: update topic failed",
          topicId,
          updateError
        );
        continue;
      }
      topicsUpdated += 1;
    } else {
      const { data: inserted, error: insertError } = await admin
        .from("question_topics")
        .insert({
          channel_id: channelId,
          label: cluster.label,
          example_text: cluster.example || null,
          question_count: cluster.comment_ids.length,
          first_seen_at: now,
          last_seen_at: now,
          language,
          status: "pending",
        })
        .select("id")
        .single();

      if (insertError || !inserted) {
        console.error(
          "clusterChannelTopics: insert topic failed",
          insertError
        );
        continue;
      }
      topicId = inserted.id as string;
      topicsCreated += 1;
    }

    // Rattache les commentaires de ce groupe au topic
    await admin
      .from("comments")
      .update({ topic_id: topicId })
      .in("id", cluster.comment_ids)
      .eq("channel_id", channelId);
  }

  // 5. Auto-archivage des topics stales
  const topicsArchived = await autoArchiveStaleTopics(channelId);

  return {
    channelId,
    questionsConsidered: questions.length,
    topicsCreated,
    topicsUpdated,
    topicsArchived,
  };
}

/**
 * Détecte les topics répondus par des vidéos récemment publiées.
 *
 * Stratégie : on récupère les vidéos vues dans le canal sur les 14 derniers
 * jours (cap 5, dédupé par video_id), puis on demande à Gemini de matcher
 * ces vidéos contre les topics encore ouverts. Les topics matchés passent
 * en `status='answered'` avec `answered_video_id` rempli.
 *
 * Idempotent : un topic déjà `answered` n'est plus dans `openTopics`.
 */
export type DetectAnsweredResult = {
  channelId: string;
  videosConsidered: number;
  topicsAnswered: number;
};

export async function detectAnsweredTopics(
  channelId: string
): Promise<DetectAnsweredResult> {
  const admin = createSupabaseAdminClient();

  // 1. Topics ouverts du canal (au moins 1 question)
  const { data: openTopics } = await admin
    .from("question_topics")
    .select("id, label, example_text")
    .eq("channel_id", channelId)
    .eq("status", "pending")
    .gte("question_count", 1);

  if (!openTopics || openTopics.length === 0) {
    return { channelId, videosConsidered: 0, topicsAnswered: 0 };
  }

  // 2. Vidéos récentes — on prend les video_id distincts ordonnés par max
  //    published_at des commentaires (proxy de "récemment publiée").
  const sinceISO = new Date(
    Date.now() - TOPICS_RECENT_VIDEO_DAYS * 24 * 60 * 60 * 1000
  ).toISOString();

  const { data: recentComments } = await admin
    .from("comments")
    .select("video_id, video_title, published_at")
    .eq("channel_id", channelId)
    .gte("published_at", sinceISO)
    .not("video_id", "is", null)
    .not("video_title", "is", null)
    .order("published_at", { ascending: false })
    .limit(500);

  const videosMap = new Map<string, VideoCandidate>();
  for (const c of recentComments ?? []) {
    const vid = c.video_id as string | null;
    if (!vid || videosMap.has(vid)) continue;
    const title = (c.video_title as string | null) ?? "";
    if (!title) continue;
    videosMap.set(vid, { video_id: vid, title });
    if (videosMap.size >= TOPICS_MAX_VIDEOS_PER_MATCH) break;
  }

  if (videosMap.size === 0) {
    return { channelId, videosConsidered: 0, topicsAnswered: 0 };
  }

  // 3. Langue : on regarde profile.language du propriétaire du canal
  //    (heuristique simple et correcte ici contrairement au clustering).
  const { data: channel } = await admin
    .from("channels")
    .select("user_id")
    .eq("id", channelId)
    .single();
  let language: "fr" | "en" = "fr";
  if (channel?.user_id) {
    const { data: profile } = await admin
      .from("profiles")
      .select("language")
      .eq("id", channel.user_id)
      .single();
    if (profile?.language === "en") language = "en";
  }

  // 4. Gemini match
  let matches;
  try {
    matches = await matchVideosToOpenTopics({
      videos: Array.from(videosMap.values()),
      openTopics: (openTopics ?? []).map((t) => ({
        id: t.id as string,
        label: t.label as string,
        example: (t.example_text as string | null) ?? null,
      })),
      language,
    });
  } catch (e) {
    console.error("detectAnsweredTopics: Gemini call failed", channelId, e);
    return {
      channelId,
      videosConsidered: videosMap.size,
      topicsAnswered: 0,
    };
  }

  if (matches.length === 0) {
    return {
      channelId,
      videosConsidered: videosMap.size,
      topicsAnswered: 0,
    };
  }

  // 5. Marque les topics comme answered
  const now = new Date().toISOString();
  let updated = 0;
  for (const m of matches) {
    const { error } = await admin
      .from("question_topics")
      .update({
        status: "answered",
        answered_video_id: m.video_id,
        answered_at: now,
        updated_at: now,
      })
      .eq("id", m.topic_id)
      .eq("channel_id", channelId)
      .eq("status", "pending");
    if (!error) updated += 1;
  }

  return {
    channelId,
    videosConsidered: videosMap.size,
    topicsAnswered: updated,
  };
}

/**
 * Envoie un digest "nouveaux topics émergents" aux users qui ont des topics
 * jamais notifiés ayant dépassé le seuil de 5 questions. Bundle par user
 * pour éviter le spam. Marque `notified_at` après envoi réussi.
 *
 * Indépendant du mode `alerts_email_mode` (qui n'est que pour les threats) :
 * ici on respecte juste le plan (Pro & Shield seulement).
 */
export type NewTopicsDigestResult = {
  usersConsidered: number;
  usersEmailed: number;
  topicsNotified: number;
};

export async function sendNewTopicsDigest(): Promise<NewTopicsDigestResult> {
  const admin = createSupabaseAdminClient();
  const result: NewTopicsDigestResult = {
    usersConsidered: 0,
    usersEmailed: 0,
    topicsNotified: 0,
  };

  // 1. Topics éligibles : pending, jamais notifiés, ≥ 5 questions
  const { data: topics } = await admin
    .from("question_topics")
    .select(
      "id, channel_id, label, example_text, question_count, language"
    )
    .eq("status", "pending")
    .is("notified_at", null)
    .gte("question_count", TOPICS_NOTIFY_THRESHOLD)
    .order("question_count", { ascending: false })
    .limit(200);

  if (!topics || topics.length === 0) return result;

  // 2. Map channel_id → user_id (un seul fetch pour tous)
  const channelIds = Array.from(
    new Set(topics.map((t) => t.channel_id as string))
  );
  const { data: channels } = await admin
    .from("channels")
    .select("id, user_id")
    .in("id", channelIds);

  const userByChannel = new Map<string, string>();
  for (const c of channels ?? []) {
    userByChannel.set(c.id as string, c.user_id as string);
  }

  // 3. Groupe les topics par user, vérifie le plan (Pro & Shield seulement)
  type Bundle = {
    userId: string;
    topics: Array<{
      id: string;
      label: string;
      example: string | null;
      questionCount: number;
    }>;
    language: "fr" | "en";
  };
  const byUser = new Map<string, Bundle>();
  for (const t of topics) {
    const channelId = t.channel_id as string;
    const userId = userByChannel.get(channelId);
    if (!userId) continue;

    if (!byUser.has(userId)) {
      byUser.set(userId, {
        userId,
        topics: [],
        language: t.language === "en" ? "en" : "fr",
      });
    }
    byUser.get(userId)!.topics.push({
      id: t.id as string,
      label: t.label as string,
      example: (t.example_text as string | null) ?? null,
      questionCount: t.question_count as number,
    });
  }

  result.usersConsidered = byUser.size;
  if (byUser.size === 0) return result;

  // 4. Filtre les users Pro/Shield + récupère leur email
  const userIds = Array.from(byUser.keys());
  const { data: profiles } = await admin
    .from("profiles")
    .select("id, plan, language")
    .in("id", userIds);

  const planByUser = new Map<string, string>();
  for (const p of profiles ?? []) {
    planByUser.set(p.id as string, (p.plan as string) ?? "free");
    // sync de langue si le profile en a une (plus fiable que celle du topic)
    const bundle = byUser.get(p.id as string);
    if (bundle && p.language === "en") bundle.language = "en";
    if (bundle && p.language === "fr") bundle.language = "fr";
  }

  for (const [userId, bundle] of byUser.entries()) {
    const plan = planByUser.get(userId) ?? "free";
    if (plan !== "pro" && plan !== "shield") continue;

    const { data: userData } = await admin.auth.admin.getUserById(userId);
    const email = userData?.user?.email;
    if (!email) continue;

    const ok = await sendNewTopicsEmail({
      to: email,
      language: bundle.language,
      appUrl: getAppUrl(),
      topics: bundle.topics,
    });

    if (ok) {
      const ids = bundle.topics.map((t) => t.id);
      await admin
        .from("question_topics")
        .update({ notified_at: new Date().toISOString() })
        .in("id", ids);
      result.usersEmailed += 1;
      result.topicsNotified += bundle.topics.length;
    }
  }

  return result;
}

/**
 * Archive automatiquement les topics qui n'ont pas eu de nouvelle question
 * depuis TOPICS_AUTO_ARCHIVE_DAYS jours. Évite que la liste se transforme
 * en cimetière de questions oubliées.
 */
async function autoArchiveStaleTopics(channelId: string): Promise<number> {
  const admin = createSupabaseAdminClient();
  const cutoff = new Date(
    Date.now() - TOPICS_AUTO_ARCHIVE_DAYS * 24 * 60 * 60 * 1000
  ).toISOString();

  const { data, error } = await admin
    .from("question_topics")
    .update({ status: "dismissed", updated_at: new Date().toISOString() })
    .eq("channel_id", channelId)
    .eq("status", "pending")
    .lt("last_seen_at", cutoff)
    .select("id");

  if (error) {
    console.error("autoArchiveStaleTopics failed", channelId, error);
    return 0;
  }
  return data?.length ?? 0;
}

/**
 * Détection heuristique de la langue dominante. On regarde la présence
 * de mots-stop français fréquents dans un échantillon des textes. Utile
 * pour que le clustering Gemini réponde dans la bonne langue sans avoir
 * besoin de fetch profile.language à chaque commentaire.
 */
function detectDominantLanguage(texts: string[]): "fr" | "en" {
  const sample = texts.slice(0, 30).join(" ").toLowerCase();
  if (!sample) return "fr";
  const frHits = (
    sample.match(/\b(le|la|les|tu|je|merci|pourquoi|comment|est-ce|une|un|qui|quoi|où|c'est|qu'est-ce)\b/g) ??
    []
  ).length;
  const enHits = (
    sample.match(/\b(the|you|what|why|how|please|thanks|where|when|which|i'm|don't)\b/g) ??
    []
  ).length;
  return enHits > frHits ? "en" : "fr";
}
