"use client";

import type { Route } from "next";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { UserDetail } from "@/components/bambi/screens/moderator";
import { useMod } from "@/components/bambi/screens/moderator-context";

export default function ModeratorUserDetailPage() {
	const router = useRouter();
	const searchParams = useSearchParams();
	const { id } = useParams<{ id: string }>();
	const requestedReturnTo = searchParams.get("returnTo");
	const returnTo = requestedReturnTo?.startsWith("/moderator/users")
		? requestedReturnTo
		: "/moderator/users";
	const { isLoading, restoreAccount, revertLatestWarning, sanction, users } =
		useMod();
	const item = users.find((u) => u.id === id);

	if (isLoading) {
		return null;
	}

	if (!item) {
		return (
			<div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
				<p className="m-0 font-bold text-[15px] text-foreground">
					사용자를 찾을 수 없어요.
				</p>
				<button
					className="h-10 rounded-xl border border-border bg-card px-4 font-bold text-[13px] text-foreground"
					onClick={() => router.push(returnTo as Route)}
					type="button"
				>
					목록으로
				</button>
			</div>
		);
	}

	return (
		<UserDetail
			item={item}
			onBack={() => router.push(returnTo as Route)}
			// 복구는 목록으로 돌아가지 않고 상세에 머문다 — 되살린 계정의 상태·제재 이력을
			// 이어서 확인하는 흐름이 자연스럽다(실패 사유도 토스트로 그대로 보인다).
			onRestore={async (uid, reason) => {
				await restoreAccount(uid, reason);
			}}
			onRevertWarning={revertLatestWarning}
			// 적용이 성공했을 때만 목록으로 돌아간다(실패하면 상세에 남아 에러를 확인할 수 있게).
			onSanction={async (uid, status, label) => {
				if (await sanction(uid, status, label)) {
					router.push(returnTo as Route);
				}
			}}
		/>
	);
}
