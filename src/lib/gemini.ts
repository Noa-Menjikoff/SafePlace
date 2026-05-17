import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY!);

export type CommentCategory =
  | "question"
  | "positive"
  | "constructive"
  | "neutral";

export type ClassificationResult = {
  id: string;
  category: CommentCategory;
  is_toxic: boolean;
  toxicity_score: number;
};

const VALID_CATEGORIES: CommentCategory[] = [
  "question",
  "positive",
  "constructive",
  "neutral",
];

// Modèles Gemini (cf. Google AI Studio — gemini-1.5 a été retiré).
// - Classification : 2.5-flash. Lite est trop charitable sur les négatifs
//   courts ("Nul", etc.) — il les marque "positive".
// - TL;DR : 2.5-flash-lite. Pas de thinking par défaut → réponse non tronquée
//   sur un budget de tokens raisonnable.
// - Replies : 2.5-flash. Génératif, le thinking aide à produire 3 tons variés.
export const CLASSIFIER_MODEL = "gemini-2.5-flash";
export const SUMMARY_MODEL = "gemini-2.5-flash-lite";
export const REPLIES_MODEL = "gemini-2.5-flash";

const classifierModel = genAI.getGenerativeModel({
  model: CLASSIFIER_MODEL,
  generationConfig: {
    responseMimeType: "application/json",
    temperature: 0.1,
    maxOutputTokens: 8192,
  },
});

function clamp01(n: unknown): number {
  const v = typeof n === "number" ? n : Number(n);
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(1, v));
}

function pct(part: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((part / total) * 100);
}

/**
 * Repair a JSON string that was truncated mid-stream by closing
 * unfinished strings, arrays, and objects. Best-effort — used as a
 * last resort when the model hits maxOutputTokens.
 */
function repairTruncatedJson(text: string): string {
  let s = text;
  // Drop trailing comma if any.
  s = s.replace(/,\s*$/, "");
  // Track open structures and string state.
  const stack: string[] = [];
  let inString = false;
  let escape = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (c === "\\") {
      escape = true;
      continue;
    }
    if (c === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (c === "[" || c === "{") stack.push(c);
    else if (c === "]" && stack[stack.length - 1] === "[") stack.pop();
    else if (c === "}" && stack[stack.length - 1] === "{") stack.pop();
  }

  if (inString) s += '"';
  // If the last value is incomplete (e.g. ended on a key or `:`), strip trailing chars.
  s = s.replace(/[,\s]*$/g, "");
  s = s.replace(/(["{[,])\s*$/g, ""); // drop dangling key/separator

  while (stack.length) {
    const c = stack.pop();
    s += c === "[" ? "]" : "}";
  }
  return s;
}

/**
 * Parse Gemini output even when the model returns markdown fences,
 * stray whitespace, trailing prose, or a response truncated by the
 * token budget.
 */
function parseGeminiJson(text: string): unknown {
  let cleaned = text.trim();

  // Strip ```json ... ``` or ``` ... ``` fences.
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json|JSON)?\s*/, "").replace(/```\s*$/, "");
    cleaned = cleaned.trim();
  }

  try {
    return JSON.parse(cleaned);
  } catch {
    /* fallthrough */
  }

  // Try to slice out a complete JSON array or object.
  const arrayStart = cleaned.indexOf("[");
  const arrayEnd = cleaned.lastIndexOf("]");
  if (arrayStart !== -1 && arrayEnd > arrayStart) {
    try {
      return JSON.parse(cleaned.slice(arrayStart, arrayEnd + 1));
    } catch {
      /* fallthrough */
    }
  }
  const objStart = cleaned.indexOf("{");
  const objEnd = cleaned.lastIndexOf("}");
  if (objStart !== -1 && objEnd > objStart) {
    try {
      return JSON.parse(cleaned.slice(objStart, objEnd + 1));
    } catch {
      /* fallthrough */
    }
  }

  // Last resort: try to repair a truncated array/object.
  const sliceStart = arrayStart !== -1 ? arrayStart : objStart;
  if (sliceStart !== -1) {
    const repaired = repairTruncatedJson(cleaned.slice(sliceStart));
    try {
      return JSON.parse(repaired);
    } catch {
      /* fallthrough */
    }
  }

  throw new Error(
    `Could not parse Gemini JSON. First 300 chars: ${text.slice(0, 300)}`
  );
}

export async function classifyBatch(
  comments: { id: string; text: string }[]
): Promise<ClassificationResult[]> {
  if (comments.length === 0) return [];

  const prompt = `Tu analyses des commentaires YouTube pour un créateur. Tu dois être HONNÊTE : un commentaire négatif n'est jamais "positive", même court.

CATÉGORIES (choisis UNE seule) :
- "question" : pose une question explicite, demande quelque chose
- "positive" : encouragement, compliment, gratitude SINCÈRE et claire (pas du sarcasme)
- "constructive" : critique avec un point précis ou une suggestion d'amélioration
- "neutral" : banalité, "premier !", commentaire court sans avis clair, OU critique vague sans suggestion ("nul", "bof", "pas top")

TOXICITÉ :
- is_toxic = true si insulte personnelle, attaque ad hominem, harcèlement, menace, raciste/sexiste/homophobe, ou spam évident
- toxicity_score : 0.0 (inoffensif) à 1.0 (très toxique)
- Une critique vague comme "nul" est NEUTRAL avec is_toxic=false (toxicity_score≈0.1)
- "T'es nul", "ferme ta gueule", "personne te regarde" → is_toxic=true (attaque personnelle)

EXEMPLES :
- "Super vidéo merci !" → {"category":"positive","is_toxic":false,"toxicity_score":0.0}
- "À quelle heure tu publies ?" → {"category":"question","is_toxic":false,"toxicity_score":0.0}
- "Le son est saturé, faudrait corriger" → {"category":"constructive","is_toxic":false,"toxicity_score":0.0}
- "Nul." → {"category":"neutral","is_toxic":false,"toxicity_score":0.1}
- "T'as vidéo est trop nul" → {"category":"neutral","is_toxic":false,"toxicity_score":0.3}
- "T'es trop nul, arrête YouTube" → {"category":"neutral","is_toxic":true,"toxicity_score":0.7}
- "Premier !" → {"category":"neutral","is_toxic":false,"toxicity_score":0.0}
- "Bah pourquoi tu fais ça franchement" → {"category":"neutral","is_toxic":false,"toxicity_score":0.2}

Conserve l'id EXACT de chaque commentaire.
Réponds UNIQUEMENT avec un tableau JSON, sans texte autour, sans markdown :
[{"id":"...","category":"...","is_toxic":false,"toxicity_score":0.0}]

Commentaires à classer :
${JSON.stringify(comments)}`;

  const result = await classifierModel.generateContent(prompt);
  const text = result.response.text();

  const parsed = parseGeminiJson(text);

  if (!Array.isArray(parsed)) {
    throw new Error("Gemini response is not an array");
  }

  return parsed
    .map((item): ClassificationResult | null => {
      if (!item || typeof item !== "object") return null;
      const o = item as Record<string, unknown>;
      const id = typeof o.id === "string" ? o.id : null;
      if (!id) return null;
      const rawCat = typeof o.category === "string" ? o.category : "neutral";
      const category = VALID_CATEGORIES.includes(rawCat as CommentCategory)
        ? (rawCat as CommentCategory)
        : "neutral";
      return {
        id,
        category,
        is_toxic: Boolean(o.is_toxic),
        toxicity_score: clamp01(o.toxicity_score),
      };
    })
    .filter((x): x is ClassificationResult => x !== null);
}

/* ------------------------------------------------------------------------- */
/* TL;DR + replies — utilisés aux étapes 5 et 8.                              */
/* ------------------------------------------------------------------------- */

export type TldrInsight = {
  label: string;
  percent: number;
  category: "question" | "positive" | "constructive";
};

export type TldrBreakdown = {
  question: number;
  positive: number;
  constructive: number;
  neutral: number;
  total: number;
};

export type GenerateTldrInput = {
  /** Comments enrichis avec leur catégorie déjà classée. */
  comments: { text: string; category: string | null }[];
  breakdown: TldrBreakdown;
  language: "fr" | "en";
};

export async function generateTldr(
  input: GenerateTldrInput
): Promise<TldrInsight[]> {
  const { comments, breakdown, language } = input;
  const model = genAI.getGenerativeModel({
    model: SUMMARY_MODEL,
    generationConfig: {
      responseMimeType: "application/json",
      temperature: 0.4,
      maxOutputTokens: 4096,
    },
  });

  const prompt = `Tu es un assistant bienveillant qui aide des créateurs de contenu à comprendre leur communauté.
Tu reçois ${breakdown.total} commentaires DÉJÀ classés par catégorie. Tu dois en tirer entre 3 et 5 insights thématiques (5 max).

RÉPARTITION RÉELLE (à respecter dans tes pourcentages) :
- Positifs : ${breakdown.positive} (${pct(breakdown.positive, breakdown.total)}%)
- Questions : ${breakdown.question} (${pct(breakdown.question, breakdown.total)}%)
- Critiques (avec ou sans suggestion) : ${breakdown.constructive + breakdown.neutral} (${pct(breakdown.constructive + breakdown.neutral, breakdown.total)}%)

Réponds UNIQUEMENT avec un tableau JSON, sans texte autour, sans markdown :
[{"label":"description courte et actionnable","percent":12,"category":"question|positive|constructive"}]

Règles :
- "category" peut prendre 3 valeurs : "positive" (compliments / enthousiasme), "question" (demandes), "constructive" (toute critique : vague comme "nul" OU précise comme "le son est saturé").
- Donne au moins 1 insight par catégorie présente. Si une catégorie est absente, n'invente rien.
- Insights positifs et questions en PREMIER, critiques en DERNIER.
- Pourcentages basés sur la répartition réelle ci-dessus, pas sur ton ressenti. Une critique vague ("nul") compte dans "constructive".
- Langue de réponse : ${language}.
- Précis et actionnable : "32% demandent un tuto montage" > "beaucoup aiment ton contenu".
- Pas de Markdown, pas de commentaire JSON, pas de virgule finale.

Commentaires (chaque ligne = "[catégorie] texte") :
${comments
  .slice(0, 200)
  .map((c) => `- [${c.category ?? "neutral"}] ${c.text}`)
  .join("\n")}`;

  const result = await model.generateContent(prompt);
  const text = result.response.text();
  const parsed = parseGeminiJson(text);

  if (!Array.isArray(parsed)) throw new Error("TL;DR response is not an array");
  return parsed.slice(0, 5).map((item: Record<string, unknown>) => ({
    label: String(item.label ?? ""),
    percent: Math.max(0, Math.min(100, Number(item.percent) || 0)),
    category: (
      ["question", "positive", "constructive"] as const
    ).includes(item.category as "question" | "positive" | "constructive")
      ? (item.category as "question" | "positive" | "constructive")
      : "positive",
  }));
}

export type QuestionForGrouping = {
  id: string;
  text: string;
  videoTitle: string | null;
};

export type QuestionGroup = {
  title: string;
  videoTitle: string | null;
  commentIds: string[];
  drafts: string[];
};

/**
 * Demande à Gemini de regrouper des questions similaires et de proposer
 * 3 brouillons de réponse pour chaque groupe. Une question unique peut
 * former un groupe singleton.
 */
export async function groupQuestions(
  questions: QuestionForGrouping[],
  language: "fr" | "en"
): Promise<QuestionGroup[]> {
  if (questions.length === 0) return [];

  const model = genAI.getGenerativeModel({
    model: REPLIES_MODEL,
    generationConfig: {
      responseMimeType: "application/json",
      temperature: 0.5,
      maxOutputTokens: 8192,
    },
  });

  const prompt = `Tu es un assistant qui aide un créateur YouTube à répondre efficacement à ses commentaires.
Tu reçois ${questions.length} QUESTIONS posées en commentaire. Regroupe les questions similaires sous une formulation canonique, puis génère 3 brouillons de réponse par groupe.

Réponds UNIQUEMENT avec un tableau JSON, sans markdown :
[{
  "title": "Formulation canonique de la question (max 80 chars)",
  "video_title": "Titre de la vidéo dominante du groupe (ou null)",
  "comment_ids": ["id1","id2"],
  "drafts": ["réponse 1 (max 2 phrases)","réponse 2","réponse 3"]
}]

Règles :
- 1 question = 1 groupe singleton, c'est OK.
- Ne fusionne que des questions vraiment proches (même intent).
- 3 brouillons par groupe avec des tons VARIÉS : enthousiaste, informatif/pratique, personnel/chaleureux.
- Chaque brouillon : max 2 phrases, ton humain et bienveillant. PAS de signature, PAS de "merci pour ton commentaire" générique.
- Si plusieurs vidéos dans un groupe, mets celle qui revient le plus dans "video_title", sinon null.
- Conserve les ids EXACTS des commentaires.
- Langue de réponse : ${language}.

Questions :
${questions
  .map(
    (q) =>
      `- id=${q.id} | video="${q.videoTitle ?? ""}" | text="${q.text.slice(0, 400)}"`
  )
  .join("\n")}`;

  const result = await model.generateContent(prompt);
  const parsed = parseGeminiJson(result.response.text());
  if (!Array.isArray(parsed)) {
    throw new Error("groupQuestions response is not an array");
  }

  return parsed
    .map((item): QuestionGroup | null => {
      if (!item || typeof item !== "object") return null;
      const o = item as Record<string, unknown>;
      const title = typeof o.title === "string" ? o.title.slice(0, 200) : null;
      const ids = Array.isArray(o.comment_ids)
        ? o.comment_ids.filter((x): x is string => typeof x === "string")
        : [];
      const drafts = Array.isArray(o.drafts)
        ? o.drafts.filter((x): x is string => typeof x === "string")
        : [];
      if (!title || ids.length === 0) return null;
      return {
        title,
        videoTitle:
          typeof o.video_title === "string" && o.video_title.length > 0
            ? o.video_title
            : null,
        commentIds: ids,
        drafts: drafts.slice(0, 3),
      };
    })
    .filter((g): g is QuestionGroup => g !== null);
}

export type VideoCandidate = {
  video_id: string;
  title: string;
};

export type VideoTopicMatch = {
  topic_id: string;
  video_id: string;
};

/**
 * Détecte si une vidéo récemment publiée répond à un ou plusieurs topics
 * ouverts. Un match par topic max — on prend la vidéo la plus pertinente
 * pour chaque topic (Gemini renvoie le couple le plus fort).
 *
 * Pour V1 : matching uniquement sur les titres (pas de description). Si la
 * précision est insuffisante, on pourra fetch les descriptions YouTube
 * via videos.list?part=snippet et étendre.
 */
export async function matchVideosToOpenTopics(input: {
  videos: VideoCandidate[];
  openTopics: { id: string; label: string; example: string | null }[];
  language: "fr" | "en";
}): Promise<VideoTopicMatch[]> {
  if (input.videos.length === 0 || input.openTopics.length === 0) return [];

  const model = genAI.getGenerativeModel({
    model: SUMMARY_MODEL,
    generationConfig: {
      responseMimeType: "application/json",
      temperature: 0.1,
      maxOutputTokens: 2048,
    },
  });

  const topicsBlock = input.openTopics
    .map(
      (t) =>
        `- id=${t.id} | label="${t.label}" | example="${(t.example ?? "").slice(0, 120)}"`
    )
    .join("\n");

  const videosBlock = input.videos
    .map((v) => `- video_id=${v.video_id} | title="${v.title.slice(0, 200)}"`)
    .join("\n");

  const prompt = `Tu aides un créateur YouTube. Tu reçois une liste de TOPICS de questions ouvertes (que sa communauté attend) et une liste de VIDÉOS récemment publiées. Détecte quels topics sont répondus par quelles vidéos.

RÈGLES :
- Un match est valide UNIQUEMENT si le titre de la vidéo répond vraiment au topic (correspondance forte d'intent, pas un thème vaguement lié).
- Une vidéo peut répondre à plusieurs topics. Un topic peut être répondu par une seule vidéo (la plus pertinente).
- Si aucun match clair pour un topic, NE LE METS PAS dans la réponse — pas de force.
- Pour les topics non liés (ex: topic = "Quel logiciel de montage" et vidéo = "Mon nouveau setup gaming"), ne match pas.
- Conserve les ids EXACTS.

Réponds UNIQUEMENT avec un tableau JSON, sans markdown :
[{"topic_id":"...","video_id":"..."}]

TOPICS OUVERTS :
${topicsBlock}

VIDÉOS RÉCENTES :
${videosBlock}`;

  const result = await model.generateContent(prompt);
  const parsed = parseGeminiJson(result.response.text());
  if (!Array.isArray(parsed)) return [];

  const validTopicIds = new Set(input.openTopics.map((t) => t.id));
  const validVideoIds = new Set(input.videos.map((v) => v.video_id));
  const seen = new Set<string>();

  return parsed
    .map((item): VideoTopicMatch | null => {
      if (!item || typeof item !== "object") return null;
      const o = item as Record<string, unknown>;
      const topicId = typeof o.topic_id === "string" ? o.topic_id : null;
      const videoId = typeof o.video_id === "string" ? o.video_id : null;
      if (!topicId || !videoId) return null;
      if (!validTopicIds.has(topicId) || !validVideoIds.has(videoId)) return null;
      if (seen.has(topicId)) return null; // un topic répondu une seule fois
      seen.add(topicId);
      return { topic_id: topicId, video_id: videoId };
    })
    .filter((m): m is VideoTopicMatch => m !== null);
}

/* ------------------------------------------------------------------------- */
/* Threat detection — Feature 1.                                              */
/* ------------------------------------------------------------------------- */

export type ThreatCategory =
  | "pii_location"
  | "pii_school"
  | "pii_family"
  | "pii_identity"
  | "pii_routine"
  | "pii_photo"
  | "threat_violence"
  | "threat_doxxing"
  | "threat_sexual"
  | "harassment_pattern";

export type ThreatAnalysis = {
  id: string;
  /** 0 = info / bénin · 1 = attention · 2 = menace · 3 = urgence */
  level: 0 | 1 | 2 | 3;
  categories: ThreatCategory[];
  /** Extrait court (≤ 120 chars) qui justifie le score, sans exposer la PII en clair. */
  excerpt: string;
};

const VALID_THREAT_CATEGORIES: ThreatCategory[] = [
  "pii_location",
  "pii_school",
  "pii_family",
  "pii_identity",
  "pii_routine",
  "pii_photo",
  "threat_violence",
  "threat_doxxing",
  "threat_sexual",
  "harassment_pattern",
];

function clampLevel(n: unknown): 0 | 1 | 2 | 3 {
  const v = Math.round(Number(n));
  if (v <= 0 || !Number.isFinite(v)) return 0;
  if (v >= 3) return 3;
  return v as 1 | 2;
}

/**
 * Analyse un batch de commentaires pour détecter PII exposée, menaces
 * directes, ou patterns de harcèlement. Retourne un score 0..3 par
 * commentaire — 0 = bénin, 3 = urgence (doxxing actif, menace explicite).
 *
 * Modèle : 2.5-flash (cohérent avec la classification, sensible aux nuances).
 */
export async function analyzeThreatBatch(
  comments: { id: string; text: string }[]
): Promise<ThreatAnalysis[]> {
  if (comments.length === 0) return [];

  const model = genAI.getGenerativeModel({
    model: CLASSIFIER_MODEL,
    generationConfig: {
      responseMimeType: "application/json",
      temperature: 0.1,
      maxOutputTokens: 8192,
    },
  });

  const prompt = `Tu es un analyste de sécurité pour un créateur YouTube. Tu lis des commentaires et tu détectes UNIQUEMENT les vraies menaces : exposition de données personnelles (PII), menaces directes, doxxing, harcèlement aggravé. Tu IGNORES les critiques, le sarcasme, les opinions négatives — ce n'est PAS ton rôle.

ÉCHELLE DE SÉVÉRITÉ (level) :
- 0 = bénin / info : aucun risque, ou mention publique générique ("J'habite Paris aussi !").
- 1 = attention : info personnelle spécifique non sollicitée mais sans intention claire ("Ma cousine est en BTS avec toi à Lyon").
- 2 = menace : croisement d'infos OU ton inquiétant OU pattern de harcèlement clair ("Je t'attendrai à la sortie du sport mardi", "Je te suivais avant que tu changes de prénom").
- 3 = urgence : doxxing actif, menace de violence explicite, contenu à caractère sexuel non consenti, exposition d'adresse précise ("J'ai trouvé ton adresse, c'est 12 rue X", "je vais venir chez toi").

CATÉGORIES (array, peut en contenir plusieurs ou être vide si level=0) :
- pii_location : adresse, lieu fréquenté, ville précise non publique
- pii_school : école, université, employeur, classe
- pii_family : membre de famille, conjoint, enfant
- pii_identity : vrai prénom/nom non public, ancien pseudo, deadname
- pii_routine : horaires habituels, itinéraires, lieux récurrents
- pii_photo : référence à photo/story privée, contexte visuel privé
- threat_violence : menace physique, intimidation
- threat_doxxing : intention claire de partager / partage d'infos privées
- threat_sexual : contenu sexuel non consenti, "deepfake", sexualisation insistante
- harassment_pattern : auteur qui revient avec hostilité répétée (à signaler à 1 ou 2)

EXEMPLES (à respecter strictement) :
- "Super vidéo merci !" → {"level":0,"categories":[],"excerpt":""}
- "Tu es nulle, arrête YouTube" → {"level":0,"categories":[],"excerpt":""}    (insulte mais pas une menace, traité par la classification existante)
- "J'habite Paris aussi !" → {"level":0,"categories":[],"excerpt":""}
- "Je sais que tu prends le métro à République le matin" → {"level":2,"categories":["pii_location","pii_routine"],"excerpt":"mention itinéraire métro"}
- "Ma cousine est dans ta promo à Sciences Po" → {"level":1,"categories":["pii_school"],"excerpt":"école nommée + lien indirect"}
- "Ton vrai prénom c'est Pierre Dupont, j'ai vérifié" → {"level":2,"categories":["pii_identity"],"excerpt":"identité civile exposée"}
- "Je vais venir chez toi" → {"level":3,"categories":["threat_violence"],"excerpt":"menace physique directe"}
- "Voilà l'adresse de [créatrice] : 12 rue X à Lyon" → {"level":3,"categories":["threat_doxxing","pii_location"],"excerpt":"adresse partagée publiquement"}
- "Comment va ta sœur Marie ?" → {"level":1,"categories":["pii_family"],"excerpt":"prénom membre famille"}

RÈGLES :
- Sois CONSERVATEUR : préfère level=0 si tu hésites. Une critique méchante n'est PAS une menace.
- "excerpt" : ≤ 120 chars, paraphrase qui justifie le score SANS recopier la PII en clair (ex : "adresse précise mentionnée" et non "12 rue X").
- Conserve l'id EXACT.
- Réponds UNIQUEMENT avec un tableau JSON, sans texte autour, sans markdown :
[{"id":"...","level":0,"categories":[],"excerpt":""}]

Commentaires à analyser :
${JSON.stringify(comments)}`;

  const result = await model.generateContent(prompt);
  const parsed = parseGeminiJson(result.response.text());
  if (!Array.isArray(parsed)) {
    throw new Error("analyzeThreatBatch response is not an array");
  }

  return parsed
    .map((item): ThreatAnalysis | null => {
      if (!item || typeof item !== "object") return null;
      const o = item as Record<string, unknown>;
      const id = typeof o.id === "string" ? o.id : null;
      if (!id) return null;
      const rawCats = Array.isArray(o.categories) ? o.categories : [];
      const categories = rawCats
        .filter((c): c is string => typeof c === "string")
        .filter((c): c is ThreatCategory =>
          VALID_THREAT_CATEGORIES.includes(c as ThreatCategory)
        );
      const excerpt =
        typeof o.excerpt === "string" ? o.excerpt.slice(0, 120) : "";
      return {
        id,
        level: clampLevel(o.level),
        categories,
        excerpt,
      };
    })
    .filter((x): x is ThreatAnalysis => x !== null);
}

/* ------------------------------------------------------------------------- */
/* Topic clustering — Feature 2 (Questions → Idées de contenu).               */
/* ------------------------------------------------------------------------- */

export type QuestionToCluster = {
  id: string;
  text: string;
  videoTitle: string | null;
};

export type ExistingTopic = {
  id: string;
  label: string;
  example: string | null;
};

export type ClusteredTopic = {
  /** Si défini, référence un topic existant (rattachement). Sinon nouveau. */
  id?: string;
  label: string;
  example: string;
  comment_ids: string[];
};

/**
 * Regroupe des questions par thème, en réutilisant les topics existants
 * de la chaîne quand le sens correspond. À utiliser dans un job persistant
 * (cron) plutôt qu'à chaque page load — diffère de `groupQuestions` qui
 * est éphémère et génère 3 brouillons par groupe.
 *
 * Cap pratique : 150 questions / appel pour rester sous maxOutputTokens.
 */
export async function clusterQuestionsForChannel(input: {
  questions: QuestionToCluster[];
  existingTopics: ExistingTopic[];
  language: "fr" | "en";
}): Promise<ClusteredTopic[]> {
  if (input.questions.length === 0) return [];

  const model = genAI.getGenerativeModel({
    model: SUMMARY_MODEL,
    generationConfig: {
      responseMimeType: "application/json",
      temperature: 0.2,
      maxOutputTokens: 8192,
    },
  });

  const existingBlock =
    input.existingTopics.length === 0
      ? "(aucun pour le moment)"
      : input.existingTopics
          .map(
            (t) =>
              `- id=${t.id} | label="${t.label}" | example="${(t.example ?? "").slice(0, 120)}"`
          )
          .join("\n");

  const prompt = `Tu aides un créateur YouTube à transformer les questions de sa communauté en idées de vidéos. Tu reçois ${input.questions.length} questions et la liste de ses topics existants. Groupe les questions par thématique précise — un topic = un sujet de vidéo concret.

TOPICS EXISTANTS (réutilise-les quand l'intent correspond, sinon crée-en de nouveaux) :
${existingBlock}

RÈGLES :
- Une question = une thématique. Si elle ne match avec rien d'existant et qu'elle est unique, crée un topic singleton — c'est OK.
- Ne fusionne que si l'intent est VRAIMENT proche (ex: "Quel micro tu utilises ?" et "Tu pourrais dire ta marque de micro ?" → même topic).
- Si tu rattaches à un topic existant, mets son "id" dans le champ id. Sinon laisse id absent.
- "label" : titre canonique court (≤ 80 chars), formulé en NEUTRE et descriptif. Si réutilisation d'un topic existant, garde son label.
- "example" : reproduis textuellement (≤ 200 chars) la question la plus claire/représentative du groupe — sans guillemets autour.
- "comment_ids" : tous les ids des questions du groupe (EXACTS).
- Langue de réponse : ${input.language}. Le label doit être dans cette langue, même si la question source est dans une autre langue.

Réponds UNIQUEMENT avec un tableau JSON, sans texte autour, sans markdown :
[{"id":"existing-uuid-or-omit","label":"...","example":"...","comment_ids":["..."]}]

Questions :
${input.questions
  .map(
    (q) =>
      `- id=${q.id} | video="${q.videoTitle ?? ""}" | text="${q.text.slice(0, 400).replace(/\n/g, " ")}"`
  )
  .join("\n")}`;

  const result = await model.generateContent(prompt);
  const parsed = parseGeminiJson(result.response.text());
  if (!Array.isArray(parsed)) {
    throw new Error("clusterQuestionsForChannel response is not an array");
  }

  const existingIds = new Set(input.existingTopics.map((t) => t.id));

  return parsed
    .map((item): ClusteredTopic | null => {
      if (!item || typeof item !== "object") return null;
      const o = item as Record<string, unknown>;
      const rawId = typeof o.id === "string" ? o.id : undefined;
      // On ne garde l'id que s'il pointe vers un topic existant — sinon le
      // modèle a halluciné et on traite comme un nouveau topic.
      const id = rawId && existingIds.has(rawId) ? rawId : undefined;
      const label =
        typeof o.label === "string" ? o.label.slice(0, 200).trim() : null;
      const example =
        typeof o.example === "string" ? o.example.slice(0, 280).trim() : "";
      const commentIds = Array.isArray(o.comment_ids)
        ? o.comment_ids.filter((x): x is string => typeof x === "string")
        : [];
      if (!label || commentIds.length === 0) return null;
      return { id, label, example, comment_ids: commentIds };
    })
    .filter((t): t is ClusteredTopic => t !== null);
}

export async function generateReplies(
  commentText: string,
  language: "fr" | "en"
): Promise<string[]> {
  const model = genAI.getGenerativeModel({
    model: REPLIES_MODEL,
    generationConfig: {
      responseMimeType: "application/json",
      temperature: 0.8,
      maxOutputTokens: 2048,
    },
  });

  const prompt = `Tu aides un créateur YouTube à répondre à ses commentaires de façon bienveillante.
Génère 3 réponses différentes. Réponds UNIQUEMENT : ["réponse1","réponse2","réponse3"]
Règles : ton chaleureux et humain, max 2 phrases par réponse, tons variés (enthousiaste/informatif/personnel).
Langue : ${language}
Commentaire : ${commentText}`;

  const result = await model.generateContent(prompt);
  const parsed = parseGeminiJson(result.response.text());
  if (!Array.isArray(parsed)) throw new Error("Replies response is not an array");
  return parsed.slice(0, 3).map((s) => String(s));
}
