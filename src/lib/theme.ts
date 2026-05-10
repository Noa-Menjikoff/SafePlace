export type Theme = "light" | "dark" | "system";

export const THEMES: Theme[] = ["light", "dark", "system"];
export const THEME_COOKIE = "safespace_theme";

export function isValidTheme(value: unknown): value is Theme {
  return (
    typeof value === "string" &&
    (THEMES as readonly string[]).includes(value)
  );
}

/**
 * Inline script qui résout le thème AVANT le rendu pour éviter le flash.
 * Lit le cookie ; si absent ou "system", consulte prefers-color-scheme.
 */
export const NO_FLASH_THEME_SCRIPT = `
(function () {
  try {
    var name = "${THEME_COOKIE}";
    var match = document.cookie.match(new RegExp('(^|; )' + name + '=([^;]*)'));
    var stored = match ? decodeURIComponent(match[2]) : null;
    var theme = stored;
    if (!theme || theme === "system") {
      theme = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    }
    document.documentElement.setAttribute("data-theme", theme);
  } catch (e) {
    /* no-op */
  }
})();
`.trim();
