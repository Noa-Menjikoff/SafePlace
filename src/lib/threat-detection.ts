import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { analyzeThreatBatch, type ThreatCategory } from "@/lib/gemini";
import {
  sendThreatAlertEmail,
  sendThreatDigestEmail,
  getAppUrl,
} from "@/lib/emails";

export const THREAT_BATCH_SIZE = 25;
export const THREAT_MAX_PER_RUN = 200;
export const THREAT_TEXT_TRUNCATE = 800;

/** Sévérités possibles pour les alertes / commentaires. */
export type ThreatSeverity = 0 | 1 | 2 | 3;

export type ScanChannelResult = {
  channelId: string;
  pending: number;
  analyzed: number;
  flagged: number;
  failedBatches: number;
};

export type ScanOptions = {
  /** Si true, ré-analyse aussi les commentaires déjà scannés. */
  force?: boolean;
};

/**
 * Lance Gemini sur les commentaires non encore analysés d'une chaîne, met
 * à jour `threat_level` / `threat_categories` / `threat_analyzed_at`, et
 * crée une alerte par commentaire dès `threat_level >= alerts_min_severity`
 * (l'alerte est dédupliquée via UNIQUE (comment_id, alert_type)).
 */
export async function scanChannelThreats(
  channelId: string,
  options: ScanOptions = {}
): Promise<ScanChannelResult> {
  const admin = createSupabaseAdminClient();

  const { data: channel, error: channelError } = await admin
    .from("channels")
    .select("id, user_id")
    .eq("id", channelId)
    .single();

  if (channelError || !channel) {
    throw new Error(
      `scanChannelThreats: channel ${channelId} introuvable (${channelError?.message ?? ""})`
    );
  }

  const { data: profile } = await admin
    .from("profiles")
    .select("alerts_min_severity, alerts_email_mode, language")
    .eq("id", channel.user_id)
    .single();

  const minSeverity: ThreatSeverity = clampSeverity(
    profile?.alerts_min_severity ?? 2
  );
  const emailMode = (profile?.alerts_email_mode ?? "digest_daily") as
    | "immediate"
    | "digest_daily"
    | "digest_weekly"
    | "off";
  const userLanguage: "fr" | "en" =
    profile?.language === "en" ? "en" : "fr";

  // Récupère l'email du user pour les envois immédiats (un seul fetch).
  const wantsImmediate = emailMode === "immediate";
  let userEmail: string | null = null;
  if (wantsImmediate) {
    const { data: userData } = await admin.auth.admin.getUserById(
      channel.user_id
    );
    userEmail = userData?.user?.email ?? null;
  }

  const baseQuery = admin
    .from("comments")
    .select("id, text")
    .eq("channel_id", channelId)
    .order("published_at", { ascending: false })
    .limit(THREAT_MAX_PER_RUN);

  const { data: pending, error } = options.force
    ? await baseQuery
    : await baseQuery.is("threat_analyzed_at", null);

  if (error) {
    throw new Error(`Fetching pending comments failed: ${error.message}`);
  }

  if (!pending || pending.length === 0) {
    return {
      channelId,
      pending: 0,
      analyzed: 0,
      flagged: 0,
      failedBatches: 0,
    };
  }

  let analyzed = 0;
  let flagged = 0;
  let failedBatches = 0;

  for (let i = 0; i < pending.length; i += THREAT_BATCH_SIZE) {
    const chunk = pending.slice(i, i + THREAT_BATCH_SIZE).map((c) => ({
      id: c.id,
      text: (c.text ?? "").slice(0, THREAT_TEXT_TRUNCATE),
    }));

    let results;
    try {
      results = await analyzeThreatBatch(chunk);
    } catch (e) {
      failedBatches += 1;
      console.error("Gemini threat batch failed", e);
      continue;
    }

    if (results.length === 0) continue;

    const now = new Date().toISOString();

    const updates = await Promise.all(
      results.map((r) =>
        admin
          .from("comments")
          .update({
            threat_level: r.level,
            threat_categories: r.categories,
            threat_analyzed_at: now,
          })
          .eq("id", r.id)
          .eq("channel_id", channelId)
      )
    );

    analyzed += updates.filter((u) => !u.error).length;

    const alertable = results.filter((r) => r.level >= minSeverity);
    if (alertable.length > 0) {
      const alertRows = alertable.map((r) => ({
        user_id: channel.user_id,
        channel_id: channelId,
        alert_type: deriveAlertType(r.categories),
        severity: r.level,
        comment_id: r.id,
        payload: {
          categories: r.categories,
          excerpt: r.excerpt,
        },
      }));

      const { data: inserted, error: insertError } = await admin
        .from("threat_alerts")
        .insert(alertRows)
        .select("id, severity, comment_id, payload");

      if (insertError && insertError.code !== "23505") {
        // 23505 = unique violation (alerte déjà émise pour ce comment), OK.
        console.error("threat_alerts insert failed", insertError);
      } else {
        flagged += alertRows.length;
      }

      // Envoi immédiat des alertes de niveau 3 si le user a opt-in.
      if (
        wantsImmediate &&
        userEmail &&
        inserted &&
        inserted.length > 0
      ) {
        for (const alert of inserted) {
          if ((alert.severity ?? 0) < 3) continue;
          const payload = (alert.payload ?? {}) as {
            excerpt?: string;
          };
          const comment = chunk.find((c) => c.id === alert.comment_id);
          const ok = await sendThreatAlertEmail({
            to: userEmail,
            language: userLanguage,
            appUrl: getAppUrl(),
            alert: {
              severity: alert.severity ?? 3,
              alert_type: "threat",
              excerpt: payload.excerpt,
              author_name: null,
              created_at: new Date().toISOString(),
            },
          });
          if (ok) {
            await admin
              .from("threat_alerts")
              .update({ email_sent: true })
              .eq("id", alert.id);
          }
          void comment; // (placeholder pour enrichir si besoin)
        }
      }
    }
  }

  return {
    channelId,
    pending: pending.length,
    analyzed,
    flagged,
    failedBatches,
  };
}

/**
 * Recalcule les profils stalker pour une chaîne à partir des commentaires
 * stockés. Idempotent : on UPSERT un compteur agrégé par auteur, plus un
 * `risk_score` qui combine fréquence / négativité / récence.
 *
 *   score = (negative_ratio * 0.6 + threat_ratio * 0.4)
 *           * log10(comment_count + 1)
 *           * recency_factor   // 1.0 si vu < 7j, ↓ jusqu'à 0.3 à 90j
 *
 * Les auteurs avec moins de 3 commentaires sont ignorés (bruit).
 */
export type StalkerUpdateResult = {
  channelId: string;
  upserted: number;
};

export async function updateStalkerProfiles(
  channelId: string
): Promise<StalkerUpdateResult> {
  const admin = createSupabaseAdminClient();
  const ninetyDaysAgo = new Date(
    Date.now() - 90 * 24 * 60 * 60 * 1000
  ).toISOString();

  const { data: comments, error } = await admin
    .from("comments")
    .select(
      "platform_author_id, author_name, author_avatar, is_toxic, threat_level, published_at"
    )
    .eq("channel_id", channelId)
    .not("platform_author_id", "is", null)
    .gte("published_at", ninetyDaysAgo);

  if (error) {
    throw new Error(`updateStalkerProfiles fetch failed: ${error.message}`);
  }

  if (!comments || comments.length === 0) {
    return { channelId, upserted: 0 };
  }

  type Agg = {
    platform_author_id: string;
    author_name: string | null;
    author_avatar: string | null;
    comment_count: number;
    negative_count: number;
    threat_count: number;
    first_seen: string;
    last_seen: string;
  };

  const byAuthor = new Map<string, Agg>();

  for (const c of comments) {
    const id = c.platform_author_id as string | null;
    if (!id) continue;
    const ts = c.published_at ?? new Date().toISOString();
    const isNeg = Boolean(c.is_toxic);
    const isThreat = Number(c.threat_level ?? 0) >= 1;

    const existing = byAuthor.get(id);
    if (!existing) {
      byAuthor.set(id, {
        platform_author_id: id,
        author_name: c.author_name as string | null,
        author_avatar: c.author_avatar as string | null,
        comment_count: 1,
        negative_count: isNeg ? 1 : 0,
        threat_count: isThreat ? 1 : 0,
        first_seen: ts,
        last_seen: ts,
      });
      continue;
    }
    existing.comment_count += 1;
    if (isNeg) existing.negative_count += 1;
    if (isThreat) existing.threat_count += 1;
    if (ts < existing.first_seen) existing.first_seen = ts;
    if (ts > existing.last_seen) existing.last_seen = ts;
    if (!existing.author_name && c.author_name) {
      existing.author_name = c.author_name as string;
    }
    if (!existing.author_avatar && c.author_avatar) {
      existing.author_avatar = c.author_avatar as string;
    }
  }

  const now = Date.now();
  const rows = Array.from(byAuthor.values())
    .filter((a) => a.comment_count >= 3)
    .map((a) => {
      const negativeRatio = a.negative_count / a.comment_count;
      const threatRatio = a.threat_count / a.comment_count;
      const lastSeenMs = new Date(a.last_seen).getTime();
      const ageDays = Math.max(0, (now - lastSeenMs) / (24 * 60 * 60 * 1000));
      const recency = Math.max(0.3, 1 - ageDays / 120);
      const volume = Math.log10(a.comment_count + 1);
      const score =
        (negativeRatio * 0.6 + threatRatio * 0.4) * volume * recency;
      return {
        channel_id: channelId,
        platform_author_id: a.platform_author_id,
        author_name: a.author_name,
        author_avatar: a.author_avatar,
        comment_count: a.comment_count,
        negative_count: a.negative_count,
        threat_count: a.threat_count,
        risk_score: Number(score.toFixed(4)),
        first_seen: a.first_seen,
        last_seen: a.last_seen,
        updated_at: new Date().toISOString(),
      };
    });

  if (rows.length === 0) {
    return { channelId, upserted: 0 };
  }

  const { error: upsertError } = await admin
    .from("stalker_profiles")
    .upsert(rows, { onConflict: "channel_id,platform_author_id" });

  if (upsertError) {
    throw new Error(`stalker_profiles upsert failed: ${upsertError.message}`);
  }

  return { channelId, upserted: rows.length };
}

/**
 * Détecte un raid coordonné sur les 2 dernières heures :
 * pic de toxicité (≥ 30 % de toxiques) sur ≥ 10 commentaires.
 * Crée une alerte unique groupée (pas une par commentaire).
 *
 * Idempotent : si une alerte de raid a été créée sur la chaîne dans la
 * dernière heure, on n'en recrée pas une seconde.
 */
export type RaidDetectionResult = {
  channelId: string;
  raidDetected: boolean;
  total: number;
  toxic: number;
};

export async function detectRaid(
  channelId: string
): Promise<RaidDetectionResult> {
  const admin = createSupabaseAdminClient();
  const since = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();

  const { data: channel } = await admin
    .from("channels")
    .select("id, user_id")
    .eq("id", channelId)
    .single();
  if (!channel) {
    return { channelId, raidDetected: false, total: 0, toxic: 0 };
  }

  const { data: recent, error } = await admin
    .from("comments")
    .select("id, is_toxic, toxicity_score")
    .eq("channel_id", channelId)
    .gte("published_at", since)
    .limit(500);

  if (error) {
    throw new Error(`detectRaid fetch failed: ${error.message}`);
  }

  const total = recent?.length ?? 0;
  const toxic = (recent ?? []).filter((c) => c.is_toxic).length;
  const ratio = total > 0 ? toxic / total : 0;
  const raidDetected = total >= 10 && ratio >= 0.3;

  if (!raidDetected) {
    return { channelId, raidDetected: false, total, toxic };
  }

  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { data: existing } = await admin
    .from("threat_alerts")
    .select("id")
    .eq("channel_id", channelId)
    .eq("alert_type", "raid")
    .gte("created_at", oneHourAgo)
    .limit(1);

  if (existing && existing.length > 0) {
    return { channelId, raidDetected: true, total, toxic };
  }

  await admin.from("threat_alerts").insert({
    user_id: channel.user_id,
    channel_id: channelId,
    alert_type: "raid",
    severity: 2 as ThreatSeverity,
    payload: {
      total,
      toxic,
      ratio: Number(ratio.toFixed(2)),
      window_minutes: 120,
    },
  });

  return { channelId, raidDetected: true, total, toxic };
}

/**
 * Envoie un digest des alertes non-envoyées aux utilisateurs ayant opt-in
 * pour le mode donné. Cap à 24h pour daily, 7j pour weekly.
 *
 * Idempotent : marque `email_sent = true` après chaque envoi réussi, donc
 * un run répété sur la même journée n'enverra pas de doublon.
 */
export type DigestRunResult = {
  mode: "digest_daily" | "digest_weekly";
  usersConsidered: number;
  usersEmailed: number;
  alertsSent: number;
};

export async function sendDigests(
  mode: "digest_daily" | "digest_weekly"
): Promise<DigestRunResult> {
  const admin = createSupabaseAdminClient();
  const windowMs =
    mode === "digest_daily" ? 24 * 60 * 60 * 1000 : 7 * 24 * 60 * 60 * 1000;
  const since = new Date(Date.now() - windowMs).toISOString();

  const { data: profiles } = await admin
    .from("profiles")
    .select("id, language")
    .eq("alerts_email_mode", mode);

  const result: DigestRunResult = {
    mode,
    usersConsidered: profiles?.length ?? 0,
    usersEmailed: 0,
    alertsSent: 0,
  };

  if (!profiles || profiles.length === 0) return result;

  for (const p of profiles) {
    const { data: alerts } = await admin
      .from("threat_alerts")
      .select("id, severity, alert_type, payload, created_at, comment_id")
      .eq("user_id", p.id)
      .eq("email_sent", false)
      .eq("dismissed", false)
      .gte("created_at", since)
      .order("severity", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(50);

    if (!alerts || alerts.length === 0) continue;

    const { data: userData } = await admin.auth.admin.getUserById(p.id);
    const email = userData?.user?.email;
    if (!email) continue;

    // Récupère les auteurs des commentaires liés pour enrichir le digest.
    const commentIds = alerts
      .map((a) => a.comment_id)
      .filter((id): id is string => typeof id === "string");
    const authorsById = new Map<string, string | null>();
    if (commentIds.length > 0) {
      const { data: comments } = await admin
        .from("comments")
        .select("id, author_name")
        .in("id", commentIds);
      for (const c of comments ?? []) {
        authorsById.set(c.id, c.author_name);
      }
    }

    const language: "fr" | "en" = p.language === "en" ? "en" : "fr";
    const ok = await sendThreatDigestEmail({
      to: email,
      language,
      appUrl: getAppUrl(),
      alerts: alerts.map((a) => {
        const payload = (a.payload ?? {}) as { excerpt?: string };
        return {
          severity: a.severity ?? 0,
          alert_type: a.alert_type,
          excerpt: payload.excerpt,
          author_name: a.comment_id
            ? (authorsById.get(a.comment_id) ?? null)
            : null,
          created_at: a.created_at,
        };
      }),
    });

    if (ok) {
      const ids = alerts.map((a) => a.id);
      await admin
        .from("threat_alerts")
        .update({ email_sent: true })
        .in("id", ids);
      result.usersEmailed += 1;
      result.alertsSent += alerts.length;
    }
  }

  return result;
}

/* ------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* ------------------------------------------------------------------------- */

function clampSeverity(n: unknown): ThreatSeverity {
  const v = Math.round(Number(n));
  if (!Number.isFinite(v) || v < 0) return 0;
  if (v > 3) return 3;
  return v as ThreatSeverity;
}

/** Choisit le `alert_type` le plus parlant à partir des catégories Gemini. */
function deriveAlertType(
  categories: ThreatCategory[]
): "pii" | "threat" | "stalker" {
  if (
    categories.includes("threat_violence") ||
    categories.includes("threat_doxxing") ||
    categories.includes("threat_sexual")
  ) {
    return "threat";
  }
  if (categories.includes("harassment_pattern")) {
    return "stalker";
  }
  return "pii";
}
