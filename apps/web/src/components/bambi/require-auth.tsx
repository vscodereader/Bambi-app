"use client";

import { Skeleton } from "@bambi-app/ui/components/skeleton";
import { useRouter } from "next/navigation";
import { type ReactNode, useEffect, useRef } from "react";
import { toast } from "sonner";
import { authClient } from "@/lib/auth-client";
import { clearSigningOut, isSigningOut } from "@/lib/bambi/auth-actions";

export function RequireAuth({ children }: { children: ReactNode }) {
	const router = useRouter();
	const session = authClient.useSession();
	const redirected = useRef(false);
	const isSignedIn = Boolean(session.data?.user);

	useEffect(() => {
		if (session.isPending || isSignedIn || redirected.current) {
			return;
		}
		if (isSigningOut()) {
			clearSigningOut();
			return;
		}
		redirected.current = true;
		toast("로그인이 필요해요");
		router.replace("/login");
	}, [session.isPending, isSignedIn, router]);

	if (session.isPending) {
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
