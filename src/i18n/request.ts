import { getRequestConfig } from "next-intl/server";
import { cookies, headers } from "next/headers";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const SUPPORTED_LOCALES = ["fr", "en"] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];

export const LOCALE_COOKIE = "NEXT_LOCALE";
const DEFAULT_LOCALE: Locale = "fr";

function isSupported(value: string | null | undefined): value is Locale {
  return (
    typeof value === "string" &&
    (SUPPORTED_LOCALES as readonly string[]).includes(value)
  );
}

/**
 * Détermine la langue à utiliser pour la requête courante :
 *   1. cookie `NEXT_LOCALE` (mis à jour quand le user change la langue)
 *   2. profil utilisateur (`profiles.language`) — premier login
 *   3. header Accept-Language du navigateur
 *   4. fallback FR
 *
 * Le cookie est posé par `/api/profile/update` à chaque changement de langue,
 * ce qui rend la résolution locale instantanée et indépendante de la BDD.
 */
async function detectLocale(): Promise<Locale> {
  // 1. Cookie (rapide, ne dépend pas de Supabase)
  const cookieValue = cookies().get(LOCALE_COOKIE)?.value;
  if (isSupported(cookieValue)) return cookieValue;

  // 2. Profil utilisateur (premier login, avant que le cookie soit posé)
  try {
    const supabase = createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      const { data } = await supabase
        .from("profiles")
        .select("language")
        .eq("id", user.id)
        .maybeSingle();
      if (isSupported(data?.language)) return data!.language as Locale;
    }
  } catch {
    /* fallthrough */
  }

  // 3. Accept-Language
  const accept = headers().get("accept-language") ?? "";
  const first = accept.split(",")[0]?.trim().toLowerCase() ?? "";
  if (first.startsWith("en")) return "en";
  if (first.startsWith("fr")) return "fr";

  // 4. Default
  return DEFAULT_LOCALE;
}

export default getRequestConfig(async () => {
  const locale = await detectLocale();
  const messages = (await import(`../../messages/${locale}.json`)).default;
  return { locale, messages };
});
