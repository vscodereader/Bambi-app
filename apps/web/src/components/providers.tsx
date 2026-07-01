"use client";

import { Toaster } from "@bambi-app/ui/components/sonner";
import { QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { queryClient } from "@/utils/orpc";

interface ProvidersProps {
	children: ReactNode;
}

export function Providers({ children }: ProvidersProps) {
	return (
		<QueryClientProvider client={queryClient}>
			{children}
			<Toaster richColors />
		</QueryClientProvider>
	);
}
