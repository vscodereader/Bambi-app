"use client";

// 계정 설정 — 표시 이름(프로필) 수정, 기본 정보(성별·생년월일) 표시, 휴대폰 본인인증,
// 로그아웃. 본인인증은 포트원 인증창(PhoneVerifyDialog)으로 진행하고, 성공 시
// verifyMyPhone이 포트원 조회 결과(번호·성별·생년월일·CI 해시)를 프로필에 저장한다.
// 포트원 미구성 개발 환경에서는 목 폼으로 폴백해 verifyMyPhoneMock을 호출한다.

import { Skeleton } from "@bambi-app/ui/components/skeleton";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { authClient } from "@/lib/auth-client";
import { signOutToHome } from "@/lib/bambi/auth-actions";
import type { MockPhoneVerifyInput } from "@/lib/bambi/guest";
import { orpc } from "@/utils/orpc";
import { Badge, Button, Input } from "../ds";
import { PhoneVerifyDialog } from "../phone-verify-dialog";
import { WithdrawAccountSection } from "../withdraw-account-section";

const BIRTH_PATTERN = /^\d{8}$/;

const formatGender = (gender: string | null | undefined): string => {
	if (gender === "male") {
		return "남성";
	}
	if (gender === "female") {
		return "여성";
	}
	return "미설정";
};

// 8자리 YYYYMMDD 문자열을 YYYY.MM.DD로 표시. 인증 전이거나 형식이 어긋나면 미입력 처리.
const formatBirthDate = (birth: string | null | undefined): string => {
	if (!(birth && BIRTH_PATTERN.test(birth))) {
		return "미입력";
	}
	return `${birth.slice(0, 4)}.${birth.slice(4, 6)}.${birth.slice(6, 8)}`;
};

export function AccountSettingsScreen() {
	const router = useRouter();
	const queryClient = useQueryClient();
	const session = authClient.useSession();
	const mineQuery = useQuery(orpc.bambi.onboarding.getMine.queryOptions());
	const profile = mineQuery.data?.bambiProfile ?? null;
	const isPhoneVerified = Boolean(profile?.isPhoneVerified);

	// 표시 이름(닉네임)의 정본은 user.name(세션)이다. bambi_profile.display_name은 제거됐다.
	const currentName = session.data?.user?.name ?? "";
	const [displayName, setDisplayName] = useState("");
	useEffect(() => {
		if (currentName) {
			setDisplayName(currentName);
		}
	}, [currentName]);

	const updateMutation = useMutation(
		orpc.bambi.onboarding.updateMyProfile.mutationOptions({
			onError: (error) => {
				toast.error(error.message || "저장하지 못했어요.");
			},
			onSuccess: async () => {
				toast.success("저장했어요.");
				// updateMyProfile이 user.name을 갱신하므로 세션도 다시 불러와 표시명을 동기화한다.
				await Promise.all([queryClient.invalidateQueries(), session.refetch()]);
			},
		})
	);

	const verifyMutation = useMutation(
		orpc.bambi.onboarding.verifyMyPhone.mutationOptions({
			onSuccess: async () => {
				toast.success("휴대폰 인증을 완료했어요.");
				await queryClient.invalidateQueries();
			},
		})
	);

	const mockVerifyMutation = useMutation(
		orpc.bambi.onboarding.verifyMyPhoneMock.mutationOptions({
			onSuccess: async () => {
				toast.success("휴대폰 인증을 완료했어요.");
				await queryClient.invalidateQueries();
			},
		})
	);

	// 실인증: 인증창이 끝나면 identityVerificationId만 넘긴다 — 번호·성별·생년월일은
	// 서버가 포트원 조회로 직접 확인해 저장한다. 실패(미성년·중복 CI 등) 시 mutateAsync가
	// throw → 다이얼로그가 토스트로 사유를 노출한다.
	const handleVerified = async (identityVerificationId: string) => {
		await verifyMutation.mutateAsync({ identityVerificationId });
	};

	// 목 폴백(포트원 미구성 개발 환경): 폼 입력을 그대로 저장한다.
	const handleMockVerified = async (input: MockPhoneVerifyInput) => {
		await mockVerifyMutation.mutateAsync({
			phoneNumber: input.phone,
			gender: input.gender,
			birthDate: input.birth,
		});
	};

	const trimmedName = displayName.trim();
	const canSave =
		trimmedName.length >= 2 &&
		trimmedName !== currentName &&
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
				{mineQuery.isLoading || session.isPending ? (
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

				<section className="flex flex-col gap-3 rounded-2xl border border-border p-5">
					<span className="font-bold text-foreground text-sm">기본 정보</span>
					<dl className="m-0 flex flex-col gap-2">
						<div className="flex items-center justify-between gap-3">
							<dt className="text-muted-foreground text-xs">성별</dt>
							<dd className="m-0 font-semibold text-foreground text-sm">
								{formatGender(profile?.gender)}
							</dd>
						</div>
						<div className="flex items-center justify-between gap-3">
							<dt className="text-muted-foreground text-xs">생년월일</dt>
							<dd className="m-0 font-semibold text-foreground text-sm">
								{formatBirthDate(profile?.birthDate)}
							</dd>
						</div>
					</dl>
					<p className="m-0 text-muted-foreground text-xs">
						성별·생년월일은 휴대폰 본인인증으로 확인돼요.
					</p>
				</section>

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
					<PhoneVerifyDialog
						defaultGender={profile?.gender ?? null}
						description="본인인증으로 계정에 휴대폰 번호를 등록해요."
						onMockVerified={handleMockVerified}
						onVerified={handleVerified}
						title={isPhoneVerified ? "휴대폰 재인증" : "휴대폰 본인인증"}
						triggerLabel={isPhoneVerified ? "휴대폰 재인증" : "휴대폰 인증하기"}
					/>
				</section>

				<Button className="w-full" onClick={handleSignOut} variant="secondary">
					로그아웃
				</Button>
				<WithdrawAccountSection />
			</div>
		</div>
	);
}
