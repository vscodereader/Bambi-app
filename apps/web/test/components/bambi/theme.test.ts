import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
	BAMBI_THEME_STORAGE_KEY,
	BAMBI_THEMES,
	isBambiTheme,
	LIGHT_OUTLINE_BUTTON_CLASS,
} from "@/lib/bambi/theme";
import { srcPath } from "../../src-path";

const DARK_TOKEN_BLOCK_RE = /\.dark \{([\s\S]*?)\n\}/;

const providersSource = readFileSync(
	srcPath("components/providers.tsx"),
	"utf8"
);
const toggleSource = readFileSync(
	srcPath("components/bambi/theme-toggle.tsx"),
	"utf8"
);
const globalCssSource = readFileSync(srcPath("index.css"), "utf8");
const mainPopupSource = readFileSync(
	srcPath("components/bambi/main-popup/main-popup-layer.tsx"),
	"utf8"
);
const popupPageSource = readFileSync(
	srcPath("app/moderator/popups/page.tsx"),
	"utf8"
);
const responsiveShellSource = readFileSync(
	srcPath("components/bambi/responsive-shell.tsx"),
	"utf8"
);
const chatRoomSource = readFileSync(
	srcPath("components/bambi/screens/seeker-chat-room-responsive.tsx"),
	"utf8"
);
const buttonSource = readFileSync(
	srcPath("../../../packages/ui/src/components/button.tsx"),
	"utf8"
);
const inputSource = readFileSync(
	srcPath("../../../packages/ui/src/components/input.tsx"),
	"utf8"
);
const myPageSource = readFileSync(
	srcPath("components/bambi/my-page-shell.tsx"),
	"utf8"
);
const accountSettingsSource = readFileSync(
	srcPath("components/bambi/screens/account-settings-screen.tsx"),
	"utf8"
);
const employerScreenSource = readFileSync(
	srcPath("components/bambi/screens/employer.tsx"),
	"utf8"
);

describe("web theme policy", () => {
	it("supports only persisted manual light and dark themes", () => {
		expect(BAMBI_THEMES).toEqual(["light", "dark"]);
		expect(BAMBI_THEME_STORAGE_KEY).toBe("bambi-theme");
		expect(isBambiTheme("light")).toBe(true);
		expect(isBambiTheme("dark")).toBe(true);
		expect(isBambiTheme("system")).toBe(false);
	});

	it("defaults to light without following the operating system", () => {
		expect(providersSource).toContain('attribute="class"');
		expect(providersSource).toContain('defaultTheme="light"');
		expect(providersSource).toContain("enableSystem={false}");
		expect(providersSource).toContain("storageKey={BAMBI_THEME_STORAGE_KEY}");
		expect(providersSource).not.toContain('theme="light"');
	});

	it("provides an accessible shared toggle after hydration", () => {
		expect(toggleSource).toContain('"라이트모드로 전환"');
		expect(toggleSource).toContain('"다크모드로 전환"');
		expect(toggleSource).toContain("disabled={!mounted}");
		expect(toggleSource).toContain('setTheme(isDark ? "light" : "dark")');
	});

	it("changes surfaces and text without changing border tokens", () => {
		const darkBlock = globalCssSource.match(DARK_TOKEN_BLOCK_RE)?.[1];
		expect(darkBlock).toContain("--background: var(--ink-950)");
		expect(darkBlock).toContain("--card: var(--ink-900)");
		expect(darkBlock).toContain("--foreground: var(--white)");
		expect(darkBlock).not.toContain("--border:");
		expect(darkBlock).not.toContain("--input:");
		expect(darkBlock).not.toContain("--primary:");
	});

	it("exports every dark coral text token used by status messages", () => {
		expect(globalCssSource).toContain("--color-coral-800: var(--coral-800)");
		expect(globalCssSource).toContain("--color-coral-900: var(--coral-900)");
	});

	it("uses an available dark coral color for chat system messages", () => {
		expect(chatRoomSource).not.toContain("text-coral-800");
		expect(chatRoomSource.match(/font-semibold text-coral-700/g)).toHaveLength(
			5
		);
	});

	it("keeps only the user-facing popup in the named light scope", () => {
		expect(globalCssSource).toContain(".theme-light-scope");
		expect(mainPopupSource).toContain("<ThemeLightScope>");
		expect(mainPopupSource).toContain(
			"border bg-background text-foreground shadow-2xl"
		);
		expect(popupPageSource).not.toContain("ThemeLightDocumentScope");
		expect(popupPageSource).toContain("<PopupManagement />");
	});

	it("changes every outline action to a dark card surface in dark mode", () => {
		expect(buttonSource).toContain("dark:bg-card dark:text-foreground");
		expect(buttonSource).toContain(
			"dark:hover:bg-muted dark:hover:text-foreground"
		);
		expect(buttonSource).toContain("disabled:opacity-70");
		expect(buttonSource).toContain(
			"dark:disabled:text-muted-foreground dark:disabled:opacity-100"
		);
		expect(inputSource).toContain("dark:disabled:opacity-100");
		expect(inputSource).toContain(
			"dark:disabled:placeholder:text-muted-foreground"
		);
	});

	it("keeps every logout button on the light outline exception", () => {
		expect(LIGHT_OUTLINE_BUTTON_CLASS).toContain(
			"dark:bg-[var(--theme-light-background)]"
		);
		expect(myPageSource).toContain("LIGHT_OUTLINE_BUTTON_CLASS");
		expect(accountSettingsSource).toContain("LIGHT_OUTLINE_BUTTON_CLASS");
		expect(employerScreenSource).toContain("LIGHT_OUTLINE_BUTTON_CLASS");
	});

	it("adds the moderator mode badge border only in dark mode", () => {
		expect(responsiveShellSource).toContain(
			'className="h-9 gap-1.5 px-3 font-bold dark:border-border"'
		);
	});

	it("paints outline button backgrounds beneath their rounded borders", () => {
		expect(buttonSource).toContain("bg-clip-border");
	});
});
