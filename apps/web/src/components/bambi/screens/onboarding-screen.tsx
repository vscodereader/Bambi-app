"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { authClient } from "@/lib/auth-client";
import { getOnboardingNextRoute } from "@/lib/bambi/onboarding-routes";
import { orpc } from "@/utils/orpc";
import { Badge, Button, Card, Input, Logo } from "../ds";
import { BriefcaseIcon, Search2, ShieldIcon } from "../icons";

const roleLabels = {
	admin: "관리자",
	employer: "구인자",
	job_seeker: "구직자",
} as const;

const getRoleLabel = (role: string): string =>
	roleLabels[role as keyof typeof roleLabels] ?? role;

export function OnboardingScreen() {
	const router = useRouter();
	const queryClient = useQueryClient();
	const session = authClient.useSession();
	const [displayName, setDisplayName] = useState("");
	const [phoneNumber, setPhoneNumber] = useState("");
	const [message, setMessage] = useState<null | string>(null);
	const mineQuery = useQuery({
		...orpc.bambi.onboarding.getMine.queryOptions(),
		enabled: Boolean(session.data?.user),
	});
	const profile = mineQuery.data?.bambiProfile ?? null;
	const isBusy = mineQuery.isLoading || session.isPending;
	const profileInput = {
		displayName: displayName.trim() || undefined,
		phoneNumber: phoneNumber.trim() || undefined,
	};
	const invalidateProfile = async () => {
		await queryClient.invalidateQueries({
			queryKey: orpc.bambi.onboarding.getMine.queryKey(),
		});
	};
	const createJobSeekerMutation = useMutation(
		orpc.bambi.onboarding.createJobSeekerProfile.mutationOptions({
			onError: (error) => setMessage(error.message),
			onSuccess: async () => {
				await invalidateProfile();
				router.push("/seeker");
			},
		})
	);
	const createEmployerMutation = useMutation(
		orpc.bambi.onboarding.createEmployerProfile.mutationOptions({
			onError: (error) => setMessage(error.message),
			onSuccess: async () => {
				await invalidateProfile();
				router.push("/employer");
			},
		})
	);
	const updateProfileMutation = useMutation(
		orpc.bambi.onboarding.updateMyProfile.mutationOptions({
			onError: (error) => setMessage(error.message),
			onSuccess: async () => {
				setMessage("프로필을 저장했어요.");
				await invalidateProfile();
			},
		})
	);

	useEffect(() => {
		if (!session.data?.user) {
			return;
		}

		setDisplayName(profile?.displayName ?? session.data.user.name ?? "");
		setPhoneNumber(profile?.phoneNumber ?? "");
	}, [profile, session.data?.user]);

	const handleCreate = (role: "employer" | "job_seeker") => {
		setMessage(null);

		if (role === "employer") {
			createEmployerMutation.mutate(profileInput);
			return;
		}

		createJobSeekerMutation.mutate(profileInput);
	};
	const handleUpdate = () => {
		setMessage(null);
		updateProfileMutation.mutate(profileInput);
	};

	if (isBusy) {
		return (
			<div className="min-h-[100dvh] bg-secondary px-4 py-10 text-center font-bold text-muted-foreground">
				프로필 정보를 확인하고 있어요.
			</div>
		);
	}

	if (!session.data?.user) {
		return (
			<div className="min-h-[100dvh] bg-secondary px-4 py-10">
				<Card
					className="mx-auto max-w-[520px] rounded-lg text-center"
					pad="lg"
					tone="outline"
				>
					<Logo className="mx-auto" lang="ko" size="md" />
					<h1 className="mt-5 mb-2 font-extrabold text-2xl">
						로그인이 필요해요
					</h1>
					<p className="m-0 text-muted-foreground text-sm">
						프로필을 만들고 채팅을 시작하려면 먼저 로그인해 주세요.
					</p>
					<Button
						block
						className="mt-5"
						onClick={() => router.push("/login" as Route)}
					>
						로그인하기
					</Button>
				</Card>
			</div>
		);
	}

	return (
		<div className="min-h-[100dvh] bg-secondary px-4 py-6 text-foreground">
			<div className="mx-auto w-full max-w-[980px]">
				<Logo lang="ko" size="md" />
				<div className="mt-6 grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
					<Card className="rounded-lg" pad="lg" tone="outline">
						<Badge tone="success">
							<span className="inline-flex size-3.5">
								<ShieldIcon />
							</span>
							프로필 보호 설정
						</Badge>
						<h1 className="mt-4 mb-2 font-extrabold text-2xl">
							밤비에서 사용할 프로필을 설정해요
						</h1>
						<p className="m-0 text-muted-foreground text-sm leading-relaxed">
							표시명과 연락처는 플랫폼 정책에 따라 보호되고, 외부 공개는 면접
							확정 뒤 본인이 선택해요.
						</p>
						<div className="mt-5 grid gap-4 sm:grid-cols-2">
							<label className="grid gap-2" htmlFor="onboarding-display-name">
								<span className="font-bold text-sm">표시명</span>
								<Input
									autoComplete="name"
									id="onboarding-display-name"
									onChange={(event) => setDisplayName(event.target.value)}
									placeholder="예: 밤비 구직자"
									value={displayName}
								/>
							</label>
							<label className="grid gap-2" htmlFor="onboarding-phone-number">
								<span className="font-bold text-sm">휴대폰 번호</span>
								<Input
									autoComplete="tel"
									id="onboarding-phone-number"
									inputMode="tel"
									onChange={(event) => setPhoneNumber(event.target.value)}
									placeholder="010-0000-0000"
									type="tel"
									value={phoneNumber}
								/>
							</label>
						</div>
						{message ? (
							<div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 font-semibold text-amber-800 text-sm">
								{message}
							</div>
						) : null}
						{profile ? (
							<div className="mt-5 flex flex-col gap-2 sm:flex-row">
								<Button
									disabled={updateProfileMutation.isPending}
									onClick={handleUpdate}
								>
									프로필 저장
								</Button>
								<Button
									onClick={() =>
										router.push(getOnboardingNextRoute(profile.role) as Route)
									}
									variant="secondary"
								>
									{getRoleLabel(profile.role)} 화면으로 이동
								</Button>
							</div>
						) : (
							<div className="mt-5 grid gap-3 sm:grid-cols-2">
								<Button
									disabled={createJobSeekerMutation.isPending}
									leftIcon={<Search2 />}
									onClick={() => handleCreate("job_seeker")}
								>
									구직자로 시작
								</Button>
								<Button
									disabled={createEmployerMutation.isPending}
									leftIcon={<BriefcaseIcon />}
									onClick={() => handleCreate("employer")}
									variant="secondary"
								>
									구인자로 시작
								</Button>
							</div>
						)}
					</Card>
					<Card className="rounded-lg" pad="lg" tone="outline">
						<h2 className="m-0 font-extrabold text-lg">현재 계정</h2>
						<div className="mt-4 grid gap-3 text-sm">
							<div>
								<span className="font-bold text-muted-foreground text-xs">
									이메일
								</span>
								<p className="mt-1 mb-0 font-bold">{session.data.user.email}</p>
							</div>
							<div>
								<span className="font-bold text-muted-foreground text-xs">
									프로필 상태
								</span>
								<p className="mt-1 mb-0">
									{profile ? getRoleLabel(profile.role) : "프로필 없음"}
								</p>
							</div>
							<div>
								<span className="font-bold text-muted-foreground text-xs">
									휴대폰 인증
								</span>
								<p className="mt-1 mb-0">
									{profile?.isPhoneVerified ? "인증 완료" : "확인 필요"}
								</p>
							</div>
						</div>
					</Card>
				</div>
			</div>
		</div>
	);
}
