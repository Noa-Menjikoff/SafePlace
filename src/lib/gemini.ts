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
