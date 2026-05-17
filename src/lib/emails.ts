import { Resend } from "resend";

/**
 * Adresse d'expédition. Par défaut `onboarding@resend.dev` qui marche
 * sans vérification de domaine MAIS uniquement vers l'email du compte
 * Resend (utile en dev). En prod, définis RESEND_FROM=
 *   "SafeSpace <alerts@ton-domaine-vérifié.com>"
 * après avoir vérifié le domaine dans le dashboard Resend.
 */
const FROM_DEFAULT =
  process.env.RESEND_FROM ?? "SafeSpace <onboarding@resend.dev>";

let _resend: Resend | null = null;

function getResend(): Resend | null {
  if (_resend) return _resend;
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  _resend = new Resend(key);
  return _resend;
}

export type ThreatAlertEmailInput = {
  to: string;
  language: "fr" | "en";
  /** URL absolue vers /security?tab=alerts (avec NEXT_PUBLIC_APP_URL). */
  appUrl: string;
  alert: {
    severity: number;
    alert_type: string;
    excerpt?: string | null;
    author_name?: string | null;
    created_at?: string | null;
  };
};

export type ThreatDigestEmailInput = {
  to: string;
  language: "fr" | "en";
  appUrl: string;
  alerts: Array<{
    severity: number;
    alert_type: string;
    excerpt?: string | null;
    author_name?: string | null;
    created_at?: string | null;
  }>;
};

export type NewTopicsEmailInput = {
  to: string;
  language: "fr" | "en";
  appUrl: string;
  topics: Array<{
    id: string;
    label: string;
    example: string | null;
    questionCount: number;
  }>;
};

const STRINGS = {
  fr: {
    immediateSubject: "🚨 SafeSpace : menace urgente détectée",
    digestSubjectN: (n: number) =>
      n === 1
        ? "SafeSpace : 1 alerte aujourd'hui"
        : `SafeSpace : ${n} alertes aujourd'hui`,
    intro:
      "Une menace de niveau urgent a été détectée sur ta chaîne. SafeSpace ne supprime jamais ce commentaire de YouTube — il est juste mis en évidence ici.",
    digestIntro: (n: number) =>
      `${n} alerte${n > 1 ? "s" : ""} demande${n > 1 ? "nt" : ""} ton attention sur ta chaîne. SafeSpace les a triées pour toi.`,
    fromAuthor: "Auteur",
    excerptLabel: "Extrait",
    severityLabel: "Sévérité",
    cta: "Voir dans SafeSpace",
    footer:
      "Tu reçois cet email parce que la détection de menaces est activée. Tu peux changer la fréquence dans Réglages → Sécurité → Préférences.",
    levels: ["Bénin", "Attention", "Menace", "Urgence"],
    newTopicsSubjectN: (n: number) =>
      n === 1
        ? "Une idée de vidéo émerge sur SafeSpace"
        : `${n} idées de vidéos émergent sur SafeSpace`,
    newTopicsIntro: (n: number) =>
      n === 1
        ? "Une thématique revient assez dans tes commentaires pour valoir une vidéo. Voici ce que ta communauté attend."
        : `${n} thématiques reviennent assez dans tes commentaires pour valoir des vidéos. Voici ce que ta communauté attend.`,
    newTopicsCta: "Voir toutes les idées",
    newTopicsLabel: "personnes en attente",
    newTopicsFooter:
      "Tu reçois cet email parce que de nouveaux topics ont émergé sur ta chaîne. Tu peux désactiver les emails dans Réglages.",
  },
  en: {
    immediateSubject: "🚨 SafeSpace: urgent threat detected",
    digestSubjectN: (n: number) =>
      n === 1
        ? "SafeSpace: 1 alert today"
        : `SafeSpace: ${n} alerts today`,
    intro:
      "An urgent-level threat was detected on your channel. SafeSpace never removes the comment from YouTube — it just surfaces it here.",
    digestIntro: (n: number) =>
      `${n} alert${n > 1 ? "s" : ""} need${n === 1 ? "s" : ""} your attention on your channel. SafeSpace sorted them for you.`,
    fromAuthor: "Author",
    excerptLabel: "Excerpt",
    severityLabel: "Severity",
    cta: "View in SafeSpace",
    footer:
      "You're receiving this email because threat detection is enabled. Change the frequency in Settings → Security → Preferences.",
    levels: ["Benign", "Watch", "Threat", "Urgent"],
    newTopicsSubjectN: (n: number) =>
      n === 1
        ? "A video idea is emerging on SafeSpace"
        : `${n} video ideas are emerging on SafeSpace`,
    newTopicsIntro: (n: number) =>
      n === 1
        ? "One theme keeps coming up in your comments — enough to be worth a video. Here's what your community is waiting for."
        : `${n} themes keep coming up in your comments — enough to be worth videos. Here's what your community is waiting for.`,
    newTopicsCta: "View all ideas",
    newTopicsLabel: "people waiting",
    newTopicsFooter:
      "You're receiving this email because new topics have emerged on your channel. You can disable emails in Settings.",
  },
};

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function severityColor(level: number): string {
  // Pas de rouge — fidèle au design system.
  if (level >= 3) return "#ef9f27"; // amber
  if (level >= 2) return "#faeeda"; // amber-light bg → texte ambré
  return "#eeedfe"; // primary-light
}

function alertBlock(
  alert: ThreatAlertEmailInput["alert"],
  s: (typeof STRINGS)["fr"]
): string {
  const level = Math.max(0, Math.min(3, Math.round(alert.severity ?? 0)));
  const color = severityColor(level);
  return `
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:100%;background:#ffffff;border:1px solid #e6e4ef;border-radius:8px;margin:12px 0;">
      <tr><td style="padding:16px;">
        <div style="display:inline-block;padding:4px 10px;border-radius:9999px;background:${color};color:${level >= 3 ? "#ffffff" : "#534ab7"};font-size:12px;font-weight:500;">
          ${s.severityLabel} · ${escapeHtml(s.levels[level])}
        </div>
        ${
          alert.author_name
            ? `<p style="margin:10px 0 4px 0;color:#1c1b27;font-size:14px;"><strong>${s.fromAuthor} :</strong> ${escapeHtml(alert.author_name)}</p>`
            : ""
        }
        ${
          alert.excerpt
            ? `<p style="margin:6px 0 0 0;color:#615e76;font-size:13px;line-height:1.5;font-style:italic;">${s.excerptLabel} : ${escapeHtml(alert.excerpt)}</p>`
            : ""
        }
      </td></tr>
    </table>`;
}

function shellHtml(args: {
  title: string;
  intro: string;
  blocks: string;
  cta: string;
  ctaUrl: string;
  footer: string;
}): string {
  return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8" /><title>${escapeHtml(args.title)}</title></head>
<body style="margin:0;padding:0;background:#f8f7fb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1c1b27;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:100%;background:#f8f7fb;padding:40px 16px;">
    <tr><td align="center">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;width:100%;background:#ffffff;border-radius:12px;padding:32px;text-align:left;">
        <tr><td>
          <p style="margin:0 0 4px 0;font-size:12px;color:#615e76;letter-spacing:.04em;text-transform:uppercase;">SafeSpace</p>
          <h1 style="margin:0 0 16px 0;font-size:22px;color:#1c1b27;">${escapeHtml(args.title)}</h1>
          <p style="margin:0 0 16px 0;color:#615e76;line-height:1.55;font-size:14px;">${escapeHtml(args.intro)}</p>
          ${args.blocks}
          <p style="margin:24px 0 0 0;">
            <a href="${args.ctaUrl}" style="display:inline-block;background:#534ab7;color:#ffffff;text-decoration:none;padding:10px 18px;border-radius:6px;font-size:14px;font-weight:500;">${escapeHtml(args.cta)}</a>
          </p>
          <p style="margin:32px 0 0 0;font-size:12px;color:#9591a8;line-height:1.5;">${escapeHtml(args.footer)}</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

/**
 * Envoie un email pour une alerte unique (mode `immediate`). Renvoie `false`
 * si Resend n'est pas configuré ou si l'envoi échoue — l'appelant peut
 * décider de retry ou de marquer email_sent=true seulement en cas de succès.
 */
export async function sendThreatAlertEmail(
  input: ThreatAlertEmailInput
): Promise<boolean> {
  const resend = getResend();
  if (!resend) {
    console.warn("RESEND_API_KEY missing — skipping immediate email");
    return false;
  }
  const s = STRINGS[input.language];
  const ctaUrl = `${input.appUrl.replace(/\/$/, "")}/security?tab=alerts`;

  const html = shellHtml({
    title: s.immediateSubject.replace(/^🚨\s*/, ""),
    intro: s.intro,
    blocks: alertBlock(input.alert, s),
    cta: s.cta,
    ctaUrl,
    footer: s.footer,
  });

  try {
    const res = await resend.emails.send({
      from: FROM_DEFAULT,
      to: input.to,
      subject: s.immediateSubject,
      html,
    });
    if (res.error) {
      console.error("Resend send failed", res.error);
      return false;
    }
    return true;
  } catch (e) {
    console.error("Resend send threw", e);
    return false;
  }
}

/**
 * Envoie un digest récapitulatif (mode `digest_daily` / `digest_weekly`).
 * Reçoit la liste des alertes non envoyées. Trie par sévérité descendante,
 * cap à 20 dans l'email pour ne pas exploser la taille.
 */
export async function sendThreatDigestEmail(
  input: ThreatDigestEmailInput
): Promise<boolean> {
  const resend = getResend();
  if (!resend) {
    console.warn("RESEND_API_KEY missing — skipping digest email");
    return false;
  }
  if (input.alerts.length === 0) return true;

  const s = STRINGS[input.language];
  const sorted = input.alerts
    .slice()
    .sort((a, b) => (b.severity ?? 0) - (a.severity ?? 0))
    .slice(0, 20);
  const subject = s.digestSubjectN(input.alerts.length);
  const ctaUrl = `${input.appUrl.replace(/\/$/, "")}/security?tab=alerts`;

  const blocks = sorted.map((a) => alertBlock(a, s)).join("");

  const html = shellHtml({
    title: subject,
    intro: s.digestIntro(input.alerts.length),
    blocks,
    cta: s.cta,
    ctaUrl,
    footer: s.footer,
  });

  try {
    const res = await resend.emails.send({
      from: FROM_DEFAULT,
      to: input.to,
      subject,
      html,
    });
    if (res.error) {
      console.error("Resend digest failed", res.error);
      return false;
    }
    return true;
  } catch (e) {
    console.error("Resend digest threw", e);
    return false;
  }
}

/**
 * Envoie un digest "nouveaux topics émergent" listant les topics qui
 * viennent de dépasser le seuil. Bundle par user — un seul email par run.
 */
export async function sendNewTopicsEmail(
  input: NewTopicsEmailInput
): Promise<boolean> {
  const resend = getResend();
  if (!resend) {
    console.warn("RESEND_API_KEY missing — skipping new topics email");
    return false;
  }
  if (input.topics.length === 0) return true;

  const s = STRINGS[input.language];
  const ctaUrl = `${input.appUrl.replace(/\/$/, "")}/ideas`;
  const subject = s.newTopicsSubjectN(input.topics.length);

  const blocks = input.topics
    .slice(0, 10)
    .map(
      (t) => `
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:100%;background:#ffffff;border:1px solid #e6e4ef;border-radius:8px;margin:12px 0;">
      <tr><td style="padding:16px;">
        <p style="margin:0;color:#1c1b27;font-size:15px;font-weight:500;line-height:1.4;">${escapeHtml(t.label)}</p>
        <p style="margin:6px 0 0 0;color:#534ab7;font-size:13px;font-weight:500;">${t.questionCount} ${escapeHtml(s.newTopicsLabel)}</p>
        ${
          t.example
            ? `<p style="margin:8px 0 0 0;color:#615e76;font-size:13px;line-height:1.5;font-style:italic;border-left:2px solid #afa9ec;padding-left:10px;">${escapeHtml(t.example.slice(0, 200))}</p>`
            : ""
        }
      </td></tr>
    </table>`
    )
    .join("");

  const html = shellHtml({
    title: subject,
    intro: s.newTopicsIntro(input.topics.length),
    blocks,
    cta: s.newTopicsCta,
    ctaUrl,
    footer: s.newTopicsFooter,
  });

  try {
    const res = await resend.emails.send({
      from: FROM_DEFAULT,
      to: input.to,
      subject,
      html,
    });
    if (res.error) {
      console.error("Resend new-topics failed", res.error);
      return false;
    }
    return true;
  } catch (e) {
    console.error("Resend new-topics threw", e);
    return false;
  }
}

export function getAppUrl(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL ?? "https://safe-place-plum.vercel.app"
  );
}
