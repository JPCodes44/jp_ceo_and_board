export const PREFERRED_THEME_ORDER = [
  "green",
  "purple",
  "cyan",
  "orange",
  "black",
  "default",
  "white",
] as const;

export function getPreferredThemeNames(themeNames: string[]): string[] {
  return PREFERRED_THEME_ORDER.filter((themeName) => themeNames.includes(themeName));
}

export function getNextThemeName(themeNames: string[], currentThemeName?: string): string | undefined {
  const preferredThemeNames = getPreferredThemeNames(themeNames);
  if (preferredThemeNames.length === 0) {
    return undefined;
  }

  if (!currentThemeName) {
    return preferredThemeNames[0];
  }

  const currentIndex = preferredThemeNames.indexOf(currentThemeName);
  if (currentIndex === -1) {
    return preferredThemeNames[0];
  }

  return preferredThemeNames[(currentIndex + 1) % preferredThemeNames.length];
}
