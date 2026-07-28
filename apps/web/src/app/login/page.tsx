"use client";

import { Suspense } from "react";
import { AuthPanel } from "@/components/bambi/auth/auth-panel";

export default function LoginPage() {
	return (
		<Suspense
			fallback={
				<div className="min-h-dvh bg-secondary px-4 py-10 text-center font-bold text-muted-foreground">
					로그인 화면을 준비하고 있어요.
				</div>
			}
		>
			{/* AuthPanel은 배경·여백을 갖지 않으므로(오버레이 안에서도 쓰인다) 독립
			    페이지에서는 여기서 풀높이 배경과 센터링을 얹는다. */}
			<div className="flex min-h-dvh flex-col justify-center bg-secondary px-4 py-6">
				<AuthPanel />
			</div>
		</Suspense>
	);
}
