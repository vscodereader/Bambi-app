"use client";

import { Toaster } from "@bambi-app/ui/components/sonner";
import { QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { queryClient } from "@/utils/orpc";
import { AuthClientProvider } from "./bambi/auth-client-provider";

interface ProvidersProps {
	children: ReactNode;
}

export function Providers({ children }: ProvidersProps) {
	return (
		<QueryClientProvider client={queryClient}>
			<AuthClientProvider>{children}</AuthClientProvider>
			<Toaster position="top-center" richColors />
		</QueryClientProvider>
	);
}
