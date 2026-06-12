"use client";

import { Button, buttonVariants } from "@bambi-app/ui/components/button";
import { Input } from "@bambi-app/ui/components/input";
import { Label } from "@bambi-app/ui/components/label";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { PageShell } from "@/components/bambi/page-shell";
import { StatusBadge } from "@/components/bambi/status-badge";
import Loader from "@/components/loader";
import { authClient } from "@/lib/auth-client";
import { formatNullable } from "@/lib/bambi-format";
import { orpc } from "@/utils/orpc";

const roleLabels = {
	admin: "관리자",
	employer: "구인자",
	job_seeker: "구직자",
} as const;

const getRoleLabel = (role: string): string =>
	roleLabels[role as keyof typeof roleLabels] ?? role;

const getProfileInput = ({
	displayName,
	phoneNumber,
}: {
	displayName: string;
	phoneNumber: string;
}) => ({
	displayName: displayName.trim() || undefined,
	phoneNumber: phoneNumber.trim() || undefined,
});

export default function OnboardingPage() {
	const router = useRouter();
	const utils = useQueryClient();
	const session = authClient.useSession();
	const [displayName, setDisplayName] = useState("");
	const [phoneNumber, setPhoneNumber] = useState("");

	const mineQuery = useQuery({
		...orpc.bambi.onboarding.getMine.queryOptions(),
		enabled: Boolean(session.data?.user),
	});

	const createJobSeekerMutation = useMutation(
		orpc.bambi.onboarding.createJobSeekerProfile.mutationOptions({
			onSuccess: async () => {
				toast.success("프로필이 저장되었습니다.");
				await utils.invalidateQueries({
					queryKey: orpc.bambi.onboarding.getMine.queryKey(),
				});
				router.push("/jobs");
			},
		})
	);

	const createEmployerMutation = useMutation(
		orpc.bambi.onboarding.createEmployerProfile.mutationOptions({
			onSuccess: async () => {
				toast.success("프로필이 저장되었습니다.");
				await utils.invalidateQueries({
					queryKey: orpc.bambi.onboarding.getMine.queryKey(),
				});
				router.push("/employer");
			},
		})
	);

	const updateMyProfileMutation = useMutation(
		orpc.bambi.onboarding.updateMyProfile.mutationOptions({
			onSuccess: async () => {
				toast.success("프로필이 저장되었습니다.");
				await utils.invalidateQueries({
					queryKey: orpc.bambi.onboarding.getMine.queryKey(),
				});
			},
		})
	);

	const profile = mineQuery.data?.bambiProfile ?? null;
	const isBusy =
		createJobSeekerMutation.isPending ||
		createEmployerMutation.isPending ||
		updateMyProfileMutation.isPending;

	useEffect(() => {
		if (!profile) {
			setDisplayName(session.data?.user.name ?? "");
			setPhoneNumber("");
			return;
		}

		setDisplayName(profile.displayName ?? "");
		setPhoneNumber(profile.phoneNumber ?? "");
	}, [profile, session.data?.user.name]);

	const handleCreateJobSeeker = () => {
		createJobSeekerMutation.mutate(
			getProfileInput({ displayName, phoneNumber })
		);
	};

	const handleCreateEmployer = () => {
		createEmployerMutation.mutate(
			getProfileInput({ displayName, phoneNumber })
		);
	};

	const handleUpdateProfile = () => {
		if (!profile) {
			return;
		}

		updateMyProfileMutation.mutate(
			getProfileInput({ displayName, phoneNumber })
		);
	};

	if (session.isPending || (session.data?.user && mineQuery.isLoading)) {
		return <Loader />;
	}

	if (!session.data?.user) {
		return (
			<PageShell
				description="프로필을 만들려면 먼저 계정으로 로그인해 주세요."
				title="온보딩"
			>
				<section className="grid gap-4 border p-4 sm:grid-cols-[1fr_auto] sm:items-center">
					<div className="space-y-1">
						<h2 className="font-medium text-base">로그인이 필요합니다</h2>
						<p className="text-muted-foreground text-sm">
							로그인 후 구직자 또는 구인자 프로필을 선택할 수 있습니다.
						</p>
					</div>
					<div className="flex flex-col gap-2 sm:flex-row">
						<Link className={buttonVariants()} href="/login">
							로그인
						</Link>
						<Link
							className={buttonVariants({ variant: "outline" })}
							href="/login?mode=sign-up"
						>
							회원가입
						</Link>
					</div>
				</section>
			</PageShell>
		);
	}

	return (
		<PageShell
			description="밤비에서 사용할 프로필 정보를 관리합니다."
			title="온보딩"
		>
			<section className="grid gap-5 border p-4 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,24rem)]">
				<div className="space-y-4">
					<div className="grid gap-3 sm:grid-cols-2">
						<div className="space-y-2">
							<Label htmlFor="displayName">표시명</Label>
							<Input
								id="displayName"
								name="displayName"
								onChange={(event) => setDisplayName(event.target.value)}
								placeholder="예: 밤비 매니저"
								value={displayName}
							/>
						</div>
						<div className="space-y-2">
							<Label htmlFor="phoneNumber">휴대폰 번호</Label>
							<Input
								id="phoneNumber"
								inputMode="tel"
								name="phoneNumber"
								onChange={(event) => setPhoneNumber(event.target.value)}
								placeholder="010-0000-0000"
								type="tel"
								value={phoneNumber}
							/>
						</div>
					</div>

					{profile ? (
						<Button disabled={isBusy} onClick={handleUpdateProfile}>
							{updateMyProfileMutation.isPending ? "저장 중" : "프로필 저장"}
						</Button>
					) : (
						<div className="flex flex-col gap-2 sm:flex-row">
							<Button disabled={isBusy} onClick={handleCreateJobSeeker}>
								{createJobSeekerMutation.isPending
									? "저장 중"
									: "구직자로 시작"}
							</Button>
							<Button
								disabled={isBusy}
								onClick={handleCreateEmployer}
								variant="outline"
							>
								{createEmployerMutation.isPending ? "저장 중" : "구인자로 시작"}
							</Button>
						</div>
					)}
				</div>

				<aside className="border p-4">
					<div className="flex flex-wrap items-center gap-2">
						<h2 className="font-medium text-base">현재 프로필</h2>
						{profile ? (
							<StatusBadge tone="good">
								{getRoleLabel(profile.role)}
							</StatusBadge>
						) : (
							<StatusBadge tone="warning">미설정</StatusBadge>
						)}
					</div>
					<dl className="mt-4 grid gap-3 text-sm">
						<div>
							<dt className="text-muted-foreground text-xs">표시명</dt>
							<dd className="mt-1">{formatNullable(profile?.displayName)}</dd>
						</div>
						<div>
							<dt className="text-muted-foreground text-xs">휴대폰 번호</dt>
							<dd className="mt-1">{formatNullable(profile?.phoneNumber)}</dd>
						</div>
					</dl>
				</aside>
			</section>
		</PageShell>
	);
}
