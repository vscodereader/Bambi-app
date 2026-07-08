"use client";

// 계정 설정 — 표시 이름 수정, 본인인증 상태, 로그아웃. 휴대폰 본인인증으로 실명·생년월일·
// 성별·번호를 DB에 저장하는 기능은 후속(배치 2, gender 컬럼·인증 다이얼로그 의존)에서 이 화면에 붙는다.

import { Skeleton } from "@bambi-app/ui/components/skeleton";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { signOutToHome } from "@/lib/bambi/auth-actions";
import { orpc } from "@/utils/orpc";
import { Badge, Button, Input } from "../ds";

export function AccountSettingsScreen() {
	const router = useRouter();
	const queryClient = useQueryClient();
	const mineQuery = useQuery(orpc.bambi.onboarding.getMine.queryOptions());
	const profile = mineQuery.data?.bambiProfile ?? null;
	const isPhoneVerified = Boolean(profile?.isPhoneVerified);

	const [displayName, setDisplayName] = useState("");
	useEffect(() => {
		if (profile?.displayName) {
			setDisplayName(profile.displayName);
		}
	}, [profile?.displayName]);

	const updateMutation = useMutation(
		orpc.bambi.onboarding.updateMyProfile.mutationOptions({
			onError: (error) => {
				toast.error(error.message || "저장하지 못했어요.");
			},
			onSuccess: async () => {
				toast.success("저장했어요.");
				await queryClient.invalidateQueries();
			},
		})
	);

	const trimmedName = displayName.trim();
	const canSave =
		trimmedName.length >= 2 &&
		trimmedName !== (profile?.displayName ?? "") &&
		!updateMutation.isPending;

	const handleSignOut = async () => {
		await signOutToHome(router);
	};

	return (
		<div className="flex min-h-0 flex-1 flex-col py-5">
			<div className="mx-auto w-full max-w-[860px] px-4 pt-2 pb-1 md:px-6">
				<h1 className="m-0 font-extrabold text-2xl text-foreground [font-family:var(--font-display)]">
					계정 설정
				</h1>
			</div>
			<div className="mx-auto flex min-h-0 w-full max-w-[860px] flex-1 flex-col gap-[18px] overflow-y-auto px-4 py-4 md:px-6">
				{mineQuery.isLoading ? (
					<Skeleton className="h-40 w-full rounded-2xl" />
				) : (
					<section className="flex flex-col gap-4 rounded-2xl border border-border p-5">
						<div className="flex flex-col gap-2">
							<span className="font-bold text-foreground text-sm">
								표시 이름
							</span>
							<Input
								id="settings-display-name"
								onChange={(event) => setDisplayName(event.target.value)}
								placeholder="공고·채팅에 표시되는 이름"
								value={displayName}
							/>
							<p className="m-0 text-muted-foreground text-xs">
								2자 이상 입력해 주세요.
							</p>
						</div>
						<Button
							disabled={!canSave}
							onClick={() =>
								updateMutation.mutate({ displayName: trimmedName })
							}
						>
							{updateMutation.isPending ? "저장 중" : "저장"}
						</Button>
					</section>
				)}

				<section className="flex items-center gap-3 rounded-2xl border border-border p-5">
					<div className="min-w-0 flex-1">
						<div className="font-bold text-foreground text-sm">본인인증</div>
						<p className="m-0 mt-1 text-muted-foreground text-xs">
							휴대폰 본인인증으로 실명·생년월일·성별을 저장하는 기능은 곧 제공될
							예정이에요.
						</p>
					</div>
					<Badge tone={isPhoneVerified ? "primary" : "neutral"}>
						{isPhoneVerified ? "인증완료" : "인증 필요"}
					</Badge>
				</section>

				<Button className="w-full" onClick={handleSignOut} variant="secondary">
					로그아웃
				</Button>
			</div>
		</div>
	);
}
