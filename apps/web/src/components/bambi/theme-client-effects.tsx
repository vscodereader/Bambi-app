"use client";

import { useTheme } from "next-themes";
import { useEffect } from "react";

import { isBambiTheme, THEME_COLORS } from "@/lib/bambi/theme";

const THEME_COLOR_SELECTOR = 'meta[name="theme-color"]';

export function ThemeClientEffects() {
	const { resolvedTheme } = useTheme();

	useEffect(() => {
		if (!isBambiTheme(resolvedTheme)) {
			return;
		}

		document.documentElement.style.colorScheme = resolvedTheme;
		document
			.querySelector<HTMLMetaElement>(THEME_COLOR_SELECTOR)
			?.setAttribute("content", THEME_COLORS[resolvedTheme]);
	}, [resolvedTheme]);

	return null;
}
