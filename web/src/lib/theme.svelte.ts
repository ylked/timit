// Three-state color scheme (system / light / dark), reflected in <meta name="color-scheme">.
// The FOUC-preventing part lives inline in index.html.

export type Scheme = "system" | "light" | "dark";
const KEY = "color-scheme";
const meta = document.querySelector<HTMLMetaElement>('meta[name="color-scheme"]')!;
const media = matchMedia("(prefers-color-scheme: dark)");

function read(): Scheme {
  try {
    const v = localStorage.getItem(KEY);
    return v === "light" || v === "dark" ? v : "system";
  } catch {
    return "system";
  }
}

export const theme = $state({ scheme: read(), systemDark: media.matches });

media.addEventListener("change", (e) => (theme.systemDark = e.matches));

export function setScheme(scheme: Scheme) {
  theme.scheme = scheme;
  meta.content = scheme === "system" ? "light dark" : scheme;
  try {
    if (scheme === "system") localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, scheme);
  } catch {
    // Storage blocked: the theme still applies for this visit.
  }
}

// Stay in sync with other tabs.
window.addEventListener("storage", (e) => {
  if (e.key === KEY) setScheme(read());
});
