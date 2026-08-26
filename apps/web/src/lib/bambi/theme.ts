export const BAMBI_THEME_STORAGE_KEY = "bambi-theme";
export const BAMBI_THEMES = ["light", "dark"] as const;

export type BambiTheme = (typeof BAMBI_THEMES)[number];

export const THEME_COLORS: Record<BambiTheme, string> = {
	dark: "#0b1018",
	light: "#ffffff",
};

// 로그아웃은 라이트 outline을 유지한다. 공통 outline의 다크 전환보다 호출부 class가
// 뒤에 합쳐져야 하므로, 로그아웃 버튼 세 곳이 이 상수를 공유한다.
export const LIGHT_OUTLINE_BUTTON_CLASS =
	"dark:bg-[var(--theme-light-background)] dark:text-[var(--theme-light-foreground)] dark:hover:bg-[var(--theme-light-muted)] dark:hover:text-[var(--theme-light-foreground)]";

export const isBambiTheme = (value: string | undefined): value is BambiTheme =>
	BAMBI_THEMES.some((theme) => theme === value);
