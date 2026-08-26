export const BAMBI_THEME_STORAGE_KEY = "bambi-theme";
export const BAMBI_THEMES = ["light", "dark"] as const;

export type BambiTheme = (typeof BAMBI_THEMES)[number];

export const THEME_COLORS: Record<BambiTheme, string> = {
	dark: "#0b1018",
	light: "#ffffff",
};

export const isBambiTheme = (value: string | undefined): value is BambiTheme =>
	BAMBI_THEMES.some((theme) => theme === value);
