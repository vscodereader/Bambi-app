"use client";

// 계정 설정 — 표시 이름(프로필) 수정, 휴대폰 본인인증(목), 로그아웃. 본인인증은 게스트용
// MockPhoneVerifyDialog를 재사용한 목 단계이며, 성공 시 verifyMyPhoneMock로 번호·인증여부
// (+미설정 시 성별)를 프로필에 저장한다. 실인증 API 도입 시 다이얼로그·뮤테이션을 교체한다.

import { Skeleton } from "@bambi-app/ui/components/skeleton";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { signOutToHome } from "@/lib/bambi/auth-actions";
import type { MockPhoneVerifyInput } from "@/lib/bambi/guest";
import { orpc } from "@/utils/orpc";
import { Badge, Button, Input } from "../ds";
import { MockPhoneVerifyDialog } from "../mock-phone-verify-dialog";

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

	const verifyMutation = useMutation(
		orpc.bambi.onboarding.verifyMyPhoneMock.mutationOptions({
			onSuccess: async () => {
				toast.success("휴대폰 인증을 완료했어요.");
				await queryClient.invalidateQueries();
			},
		})
	);

	// 목 다이얼로그 입력 중 계정설정에서 저장하는 값은 번호·성별뿐(실명·생년월일은 목 표시용).
	// 실패 시 mutateAsync가 throw → 다이얼로그가 에러 메시지를 인라인으로 노출한다.
	const handleVerified = async (input: MockPhoneVerifyInput) => {
		await verifyMutation.mutateAsync({
			phoneNumber: input.phone,
			gender: input.gender,
		});
	};

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

				<section className="flex flex-col gap-4 rounded-2xl border border-border p-5">
					<div className="flex items-center gap-3">
						<div className="min-w-0 flex-1">
							<div className="font-bold text-foreground text-sm">본인인증</div>
							<p className="m-0 mt-1 text-muted-foreground text-xs">
								{isPhoneVerified
									? "휴대폰 본인인증이 완료됐어요."
									: "휴대폰 본인인증을 완료하면 안심 서비스를 이용할 수 있어요."}
							</p>
						</div>
						<Badge tone={isPhoneVerified ? "primary" : "neutral"}>
							{isPhoneVerified ? "인증완료" : "인증 필요"}
						</Badge>
					</div>
					{isPhoneVerified && profile?.phoneNumber ? (
						<div className="flex items-center justify-between gap-3 rounded-xl bg-muted/40 px-4 py-3">
							<span className="text-muted-foreground text-xs">인증된 번호</span>
							<span className="font-semibold text-foreground text-sm">
								{profile.phoneNumber}
							</span>
						</div>
					) : null}
					<MockPhoneVerifyDialog
						defaultGender={profile?.gender ?? null}
						description="계정에 휴대폰 번호를 등록해요. (지금은 목 인증 단계예요)"
						onVerified={handleVerified}
						title={isPhoneVerified ? "휴대폰 재인증" : "휴대폰 본인인증"}
						triggerLabel={isPhoneVerified ? "휴대폰 재인증" : "휴대폰 인증하기"}
					/>
				</section>

				<Button className="w-full" onClick={handleSignOut} variant="secondary">
					로그아웃
				</Button>
			</div>
		</div>
	);
}
