import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
	BAMBI_THEME_STORAGE_KEY,
	BAMBI_THEMES,
	isBambiTheme,
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
const notificationBellSource = readFileSync(
	srcPath("components/bambi/notification-bell.tsx"),
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

	it("uses the shared white outline style for chat and notification buttons", () => {
		expect(responsiveShellSource).not.toContain(
			'className="bg-card text-foreground"'
		);
		expect(notificationBellSource).not.toContain(
			'className="bg-card text-foreground"'
		);
		expect(notificationBellSource).toContain('variant="outline"');
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
