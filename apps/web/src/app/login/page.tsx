"use client";

import { Suspense } from "react";
import { AuthScreen } from "@/components/bambi/screens/auth-screen";

export default function LoginPage() {
	return (
		<Suspense
			fallback={
				<div className="min-h-[100dvh] bg-secondary px-4 py-10 text-center font-bold text-muted-foreground">
					로그인 화면을 준비하고 있어요.
				</div>
			}
		>
			<AuthScreen />
		</Suspense>
	);
}
