"use client";

import { useParams, useRouter } from "next/navigation";
import { UserDetail } from "@/components/bambi/screens/moderator";
import { useMod } from "@/components/bambi/screens/moderator-context";

export default function ModeratorUserDetailPage() {
	const router = useRouter();
	const { id } = useParams<{ id: string }>();
	const { isLoading, sanction, users } = useMod();
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
					onClick={() => router.push("/moderator/users")}
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
			onBack={() => router.push("/moderator/users")}
			// 적용이 성공했을 때만 목록으로 돌아간다(실패하면 상세에 남아 에러를 확인할 수 있게).
			onSanction={async (uid, status, label) => {
				if (await sanction(uid, status, label)) {
					router.push("/moderator/users");
				}
			}}
		/>
	);
}
