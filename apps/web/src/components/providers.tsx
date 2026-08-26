"use client";

import { Toaster } from "@bambi-app/ui/components/sonner";
import { QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import type { ReactNode } from "react";
import { BAMBI_THEME_STORAGE_KEY, BAMBI_THEMES } from "@/lib/bambi/theme";
import { queryClient } from "@/utils/orpc";
import { AuthClientProvider } from "./bambi/auth-client-provider";
import { ThemeClientEffects } from "./bambi/theme-client-effects";

interface ProvidersProps {
	children: ReactNode;
}

export function Providers({ children }: ProvidersProps) {
	return (
		<ThemeProvider
			attribute="class"
			defaultTheme="light"
			disableTransitionOnChange
			enableSystem={false}
			storageKey={BAMBI_THEME_STORAGE_KEY}
			themes={[...BAMBI_THEMES]}
		>
			<ThemeClientEffects />
			<QueryClientProvider client={queryClient}>
				<AuthClientProvider>{children}</AuthClientProvider>
				<Toaster position="top-center" richColors />
			</QueryClientProvider>
		</ThemeProvider>
	);
}
