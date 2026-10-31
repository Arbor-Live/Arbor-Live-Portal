/**
 * Browser-chrome colors (status bar, address bar) for each theme. They match
 * `--background` in globals.css so the bar blends into the page top.
 */
export const THEME_COLORS = {
  light: "#ffffff",
  dark: "#0c0c09",
} as const;

const META_ID = "app-theme-color";

/**
 * Inline version of `syncThemeColorMeta` for the pre-paint theme script, which
 * runs before any bundle loads. Expects `d` (is dark) in scope.
 */
export const THEME_COLOR_INIT_SNIPPET = `var m=document.getElementById("${META_ID}");if(!m){m=document.createElement("meta");m.id="${META_ID}";m.name="theme-color";document.head.prepend(m);}m.content=d?"${THEME_COLORS.dark}":"${THEME_COLORS.light}";`;

/**
 * The theme is a class on <html>, not the OS setting, so the per-scheme
 * `theme-color` tags from the root layout's `viewport` are wrong whenever the
 * user overrides the OS. Browsers use the first matching `theme-color`, so an
 * unconditional tag at the top of <head> wins. It's ours rather than one of
 * Next's: Next re-renders its metadata tags on navigation and would reset any
 * edit made to them.
 */
export function syncThemeColorMeta(dark: boolean) {
  let meta = document.getElementById(META_ID) as HTMLMetaElement | null;
  if (!meta) {
    meta = document.createElement("meta");
    meta.id = META_ID;
    meta.name = "theme-color";
    document.head.prepend(meta);
  }
  meta.content = dark ? THEME_COLORS.dark : THEME_COLORS.light;
}
