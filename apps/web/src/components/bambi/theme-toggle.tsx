"use client";

import { Button } from "@bambi-app/ui/components/button";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

import { isBambiTheme } from "@/lib/bambi/theme";

export function ThemeToggle() {
	const [mounted, setMounted] = useState(false);
	const { resolvedTheme, setTheme } = useTheme();

	useEffect(() => {
		setMounted(true);
	}, []);

	const isDark =
		mounted && isBambiTheme(resolvedTheme) && resolvedTheme === "dark";
	const label = isDark ? "라이트모드로 전환" : "다크모드로 전환";

	return (
		<Button
			aria-label={label}
			className="dark:bg-card dark:text-foreground"
			disabled={!mounted}
			onClick={() => setTheme(isDark ? "light" : "dark")}
			size="icon-lg"
			title={label}
			type="button"
			variant="outline"
		>
			{isDark ? (
				<Sun aria-hidden="true" className="size-4" />
			) : (
				<Moon aria-hidden="true" className="size-4" />
			)}
		</Button>
	);
}
