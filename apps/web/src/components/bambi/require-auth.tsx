"use client";

import { Skeleton } from "@bambi-app/ui/components/skeleton";
import { useRouter } from "next/navigation";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { authClient } from "@/lib/auth-client";
import { clearSigningOut, isSigningOut } from "@/lib/bambi/auth-actions";

export function RequireAuth({ children }: { children: ReactNode }) {
	const router = useRouter();
	const session = authClient.useSession();
	const redirected = useRef(false);
	// authClient.useSession()은 클라이언트 전용 상태라 서버 렌더(pending)와 첫 클라이언트
	// 렌더가 어긋나 하이드레이션 불일치가 난다. 마운트 후에만 세션 판정을 렌더해 서버·첫
	// 클라이언트 렌더를 동일한 로딩 스켈레톤으로 맞춘다.
	const [mounted, setMounted] = useState(false);
	const isSignedIn = Boolean(session.data?.user);

	useEffect(() => {
		setMounted(true);
	}, []);

	useEffect(() => {
		if (!mounted || session.isPending || isSignedIn || redirected.current) {
			return;
		}
		if (isSigningOut()) {
			clearSigningOut();
			return;
		}
		redirected.current = true;
		toast("로그인이 필요해요");
		router.replace("/login");
	}, [mounted, session.isPending, isSignedIn, router]);

	if (!mounted || session.isPending) {
		return (
			<div className="mx-auto w-full max-w-[860px] px-4 py-6 md:px-6">
				<Skeleton className="h-24 w-full rounded-2xl" />
			</div>
		);
	}
	if (!isSignedIn) {
		return null;
	}
	return <>{children}</>;
}
