"use client";

import {
	Alert,
	AlertDescription,
	AlertTitle,
} from "@bambi-app/ui/components/alert";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@bambi-app/ui/components/alert-dialog";
import { Avatar, AvatarFallback } from "@bambi-app/ui/components/avatar";
import { Badge } from "@bambi-app/ui/components/badge";
import { Button, buttonVariants } from "@bambi-app/ui/components/button";
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "@bambi-app/ui/components/card";
import { Input } from "@bambi-app/ui/components/input";
import { Label } from "@bambi-app/ui/components/label";
import { Separator } from "@bambi-app/ui/components/separator";
import { Skeleton } from "@bambi-app/ui/components/skeleton";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Route } from "next";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
	type BusinessDocument,
	BusinessDocumentUploader,
	type BusinessDocumentUploaderHandle,
} from "@/components/bambi/business-document-uploader";
import { EmptyState } from "@/components/bambi/empty-state";
import { FieldError } from "@/components/bambi/form-message";
import { PageShell } from "@/components/bambi/page-shell";
import { StatusBadge } from "@/components/bambi/status-badge";
import { authClient } from "@/lib/auth-client";
import { signOutToHome } from "@/lib/bambi/auth-actions";
import {
	formatBusinessStartDate,
	formatDateTime,
	formatNullable,
	formatPhone,
} from "@/lib/bambi-format";
import {
	getBiznumStatusLabel,
	verificationStatusLabels,
} from "@/lib/bambi-options";
import { orpc } from "@/utils/orpc";

// 미등록 역할도 enum 원값 대신 중립 라벨로 떨어뜨린다(원값 노출 금지).
const roleLabels: Record<string, string> = {
	admin: "관리자",
	employer: "구인자",
	job_seeker: "구직자",
	legal_advisor: "법률자문가",
};

const accountStatusLabels: Record<string, string> = {
	active: "정상",
	suspended: "정지",
	warned: "주의",
};

const membershipRoleLabels: Record<string, string> = {
	admin: "관리자",
	member: "멤버",
	owner: "대표",
};

const getRoleLabel = (role: string): string => roleLabels[role] ?? "회원";

const getMembershipRoleLabel = (role: null | string): string => {
	if (!role) {
		return "멤버";
	}

	return membershipRoleLabels[role] ?? role;
};

const getAccountStatusLabel = (status: string): string =>
	accountStatusLabels[status] ?? status;

const getAccountStatusTone = (
	status: string
): React.ComponentProps<typeof StatusBadge>["tone"] => {
	if (status === "active") {
		return "good";
	}

	if (status === "warned") {
		return "warning";
	}

	if (status === "suspended") {
		return "danger";
	}

	return "default";
};

const getVerificationStatusLabel = (status: string): string =>
	verificationStatusLabels[status as keyof typeof verificationStatusLabels] ??
	status;

const getVerificationStatusTone = (
	status: string
): React.ComponentProps<typeof StatusBadge>["tone"] => {
	if (status === "verified") {
		return "good";
	}

	if (status === "pending") {
		return "warning";
	}

	if (status === "rejected") {
		return "danger";
	}

	return "default";
};

// biznumCheckedAt이 있으면 제출 때 국세청 대조를 통과한 것이고, null이면 판정하지
// 못한 채(국세청 장애) 접수된 것이라 운영자 수동 확인이 남아 있다. 진위확인 자체가 아직
// 준비 전(서비스키 미설정)이면 "미확인"은 오해를 부르므로 준비 중임을 그대로 알린다.
const getBiznumCheckText = (
	checkedAt: Date | null,
	statusCode: null | string,
	checkEnabled: boolean
): string => {
	if (!checkedAt) {
		return checkEnabled ? "미확인" : "곧 준비될 기능입니다";
	}

	return `확인 완료(${getBiznumStatusLabel(statusCode)}) · ${formatDateTime(checkedAt)}`;
};

const getErrorCode = (error: Error | null): string | undefined =>
	error && "code" in error && typeof error.code === "string"
		? error.code
		: undefined;

const getInitials = (name: null | string): string => {
	const trimmed = name?.trim();

	if (!trimmed) {
		return "구인";
	}

	return trimmed.slice(0, 2);
};

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: This page coordinates independent profile, verification, document, and team workflows.
export default function EmployerMePage() {
	const router = useRouter();
	const session = authClient.useSession();
	const isSignedIn = Boolean(session.data?.user);
	const mineQuery = useQuery({
		...orpc.bambi.onboarding.getMine.queryOptions(),
		enabled: isSignedIn,
	});
	const profile = mineQuery.data?.bambiProfile ?? null;
	const organizationProfiles =
		mineQuery.data?.employerOrganizationProfiles ?? [];
	// 값을 못 받은 순간(로딩·에러)에는 기존 표기를 유지한다 — 준비 중 안내는 서버가
	// 미설정이라고 알려준 경우에만 띄운다.
	const biznumCheckEnabled = mineQuery.data?.biznumCheckEnabled ?? true;

	const handleSignOut = async () => {
		await signOutToHome(router);
	};

	if (session.isPending || mineQuery.isLoading) {
		return (
			<PageShell title="업체 정보">
				<Skeleton className="h-28 w-full rounded-lg" />
				<div className="grid gap-3 md:grid-cols-2">
					<Skeleton className="h-40 w-full rounded-lg" />
					<Skeleton className="h-40 w-full rounded-lg" />
				</div>
			</PageShell>
		);
	}

	if (!isSignedIn || getErrorCode(mineQuery.error) === "UNAUTHORIZED") {
		return (
			<PageShell
				description="업체 정보는 로그인 후 이용할 수 있습니다."
				title="업체 정보"
			>
				<EmptyState
					action={
						<Link className={buttonVariants()} href="/seeker?auth=login">
							로그인
						</Link>
					}
					description="구인자 계정으로 로그인하면 계정과 사업자 인증 상태를 확인할 수 있습니다."
					title="로그인이 필요합니다"
				/>
			</PageShell>
		);
	}

	if (mineQuery.isError) {
		return (
			<PageShell
				description="업체 정보를 불러오지 못했습니다."
				title="업체 정보"
			>
				<EmptyState
					action={
						<Button onClick={() => mineQuery.refetch()} type="button">
							다시 시도
						</Button>
					}
					description="로그인 상태와 연결 상태를 확인한 뒤 다시 시도해 주세요."
					title="업체 정보를 불러올 수 없습니다"
				/>
			</PageShell>
		);
	}

	if (!profile) {
		return (
			<PageShell
				description="업체 정보를 보려면 밤비알바 프로필 설정이 필요합니다."
				title="업체 정보"
			>
				<EmptyState
					action={
						<Link className={buttonVariants()} href="/seeker?auth=signup">
							회원가입으로 이동
						</Link>
					}
					description="구인자 프로필을 만든 뒤 계정과 사업자 정보를 확인할 수 있습니다."
					title="밤비알바 프로필이 없습니다"
				/>
			</PageShell>
		);
	}

	if (profile.role === "job_seeker") {
		return (
			<PageShell
				description="현재 계정은 구직자 프로필로 설정되어 있습니다."
				title="업체 정보"
			>
				<EmptyState
					action={
						<Link
							className={buttonVariants({ variant: "outline" })}
							href="/seeker"
						>
							공고 탐색으로 이동
						</Link>
					}
					description="구직자 계정은 공개 공고를 탐색하고 지원 대화를 시작할 수 있습니다."
					title="업체 정보 권한이 없습니다"
				/>
			</PageShell>
		);
	}

	return (
		<PageShell
			description="계정과 사업자 인증 상태를 확인하고 설정을 관리합니다."
			title="업체 정보"
		>
			<section aria-labelledby="account" className="flex flex-col gap-3">
				<h2 className="sr-only" id="account">
					계정 정보
				</h2>
				<Card>
					<CardContent className="flex flex-wrap items-center gap-4">
						<Avatar size="lg">
							<AvatarFallback>
								{getInitials(session.data?.user?.name ?? null)}
							</AvatarFallback>
						</Avatar>
						<div className="flex min-w-0 flex-col gap-1">
							<div className="flex flex-wrap items-center gap-2">
								<span className="break-words font-semibold text-lg">
									{/* 표시명(닉네임)의 정본은 user.name(세션) — bambi_profile.display_name 제거됨 */}
									{session.data?.user?.name ?? "구인자 회원"}
								</span>
								<Badge className="rounded-full" variant="secondary">
									{getRoleLabel(profile.role)}
								</Badge>
								<StatusBadge tone={getAccountStatusTone(profile.status)}>
									{getAccountStatusLabel(profile.status)}
								</StatusBadge>
							</div>
							<p className="text-muted-foreground text-sm">
								{profile.isPhoneVerified ? "전화 인증 완료" : "전화 미인증"} ·
								연락처{" "}
								{formatNullable(
									profile.phoneNumber ? formatPhone(profile.phoneNumber) : null
								)}
							</p>
							<p className="text-muted-foreground text-xs">
								가입 {formatDateTime(profile.createdAt)}
							</p>
						</div>
					</CardContent>
				</Card>
			</section>

			<Separator />

			<section aria-labelledby="businesses" className="flex flex-col gap-3">
				<div>
					<h2 className="font-semibold text-lg" id="businesses">
						사업자 인증
					</h2>
					<p className="mt-1 text-muted-foreground text-sm">
						인증 상태는 공고 공개 여부에 영향을 줄 수 있습니다.
					</p>
				</div>
				<BusinessInfoForm
					biznumCheckEnabled={biznumCheckEnabled}
					businessDocuments={organizationProfiles[0]?.businessDocuments ?? []}
					defaultBusinessRegistrationNumber={
						organizationProfiles[0]?.draftBusinessRegistrationNumber ??
						organizationProfiles[0]?.businessRegistrationNumber ??
						""
					}
					defaultBusinessStartDate={formatBusinessStartDate(
						organizationProfiles[0]?.draftBusinessStartDate ??
							organizationProfiles[0]?.businessStartDate
					)}
					defaultDisplayName={
						organizationProfiles[0]?.draftDisplayName ??
						organizationProfiles[0]?.displayName ??
						""
					}
					defaultRepresentativeName={
						organizationProfiles[0]?.draftRepresentativeName ??
						organizationProfiles[0]?.representativeName ??
						""
					}
					isRejected={
						organizationProfiles[0]?.verificationStatus === "rejected"
					}
					organizationId={organizationProfiles[0]?.organizationId ?? null}
					verificationStatus={
						organizationProfiles[0]?.verificationStatus ?? "none"
					}
				/>
				{organizationProfiles.length > 0 ? (
					<div className="grid gap-3 md:grid-cols-2">
						{organizationProfiles.map((organizationProfile) => (
							<Card key={organizationProfile.id}>
								<CardHeader>
									<CardTitle className="flex flex-wrap items-center gap-2">
										<span className="break-words font-medium text-base">
											{organizationProfile.displayName}
										</span>
										<StatusBadge
											tone={getVerificationStatusTone(
												organizationProfile.verificationStatus
											)}
										>
											{getVerificationStatusLabel(
												organizationProfile.verificationStatus
											)}
										</StatusBadge>
									</CardTitle>
								</CardHeader>
								<CardContent>
									<dl className="grid gap-2 text-sm">
										<div>
											<dt className="text-muted-foreground text-xs">
												사업자 등록 번호
											</dt>
											<dd className="mt-1 break-words">
												{formatNullable(
													organizationProfile.businessRegistrationNumber
												)}
											</dd>
										</div>
										<div>
											<dt className="text-muted-foreground text-xs">대표자</dt>
											<dd className="mt-1 break-words">
												{formatNullable(organizationProfile.representativeName)}
											</dd>
										</div>
										<div>
											<dt className="text-muted-foreground text-xs">
												개업일자
											</dt>
											<dd className="mt-1 break-words">
												{formatNullable(
													formatBusinessStartDate(
														organizationProfile.businessStartDate
													)
												)}
											</dd>
										</div>
										<div>
											<dt className="text-muted-foreground text-xs">
												국세청 확인
											</dt>
											<dd className="mt-1 break-words">
												{getBiznumCheckText(
													organizationProfile.biznumCheckedAt,
													organizationProfile.biznumStatusCode,
													biznumCheckEnabled
												)}
											</dd>
										</div>
										<div>
											<dt className="text-muted-foreground text-xs">내 권한</dt>
											<dd className="mt-1 break-words">
												{getMembershipRoleLabel(organizationProfile.role)}
											</dd>
										</div>
										<div>
											<dt className="text-muted-foreground text-xs">
												검수 메모
											</dt>
											<dd className="mt-1 break-words">
												{formatNullable(organizationProfile.verificationNote)}
											</dd>
										</div>
									</dl>
								</CardContent>
							</Card>
						))}
					</div>
				) : (
					<EmptyState
						action={
							<Link
								className={buttonVariants({ variant: "outline" })}
								href={"/employer/settings" as Route}
							>
								조직 설정으로 이동
							</Link>
						}
						className="min-h-0 py-8"
						description="위 양식으로 업체 정보를 제출하면 사업자 인증을 신청할 수 있습니다."
						title="등록된 사업자 정보가 없습니다"
					/>
				)}
			</section>

			<Separator />

			<section aria-labelledby="activities" className="flex flex-col gap-3">
				<h2 className="font-semibold text-lg" id="activities">
					내 활동
				</h2>
				<div className="flex flex-wrap gap-2">
					<Link
						className={buttonVariants({ variant: "outline" })}
						href={"/seeker/me/reports" as Route}
					>
						내 신고 내역
					</Link>
					<Link
						className={buttonVariants({ variant: "outline" })}
						href={"/seeker/me/interviews" as Route}
					>
						예정된 면접
					</Link>
					<Link
						className={buttonVariants({ variant: "outline" })}
						href={"/seeker/me/blocks" as Route}
					>
						차단한 상대
					</Link>
				</div>
			</section>

			<Separator />

			<section aria-labelledby="shortcuts" className="flex flex-col gap-3">
				<h2 className="font-semibold text-lg" id="shortcuts">
					설정 바로가기
				</h2>
				<div className="flex flex-wrap gap-2">
					<Link
						className={buttonVariants({ variant: "outline" })}
						href={"/employer/settings" as Route}
					>
						조직 설정
					</Link>
					<Link
						className={buttonVariants({ variant: "outline" })}
						href={"/employer/settings/teams" as Route}
					>
						팀 관리
					</Link>
					<Link
						className={buttonVariants({ variant: "outline" })}
						href="/employer"
					>
						공고 관리
					</Link>
				</div>
			</section>

			<Separator />

			<Button
				className="w-full sm:w-auto"
				onClick={handleSignOut}
				type="button"
				variant="secondary"
			>
				로그아웃
			</Button>
		</PageShell>
	);
}

const BRN_PATTERN = /^\d{3}-\d{2}-\d{5}$/;

function BusinessInfoForm({
	biznumCheckEnabled,
	businessDocuments,
	defaultDisplayName,
	defaultBusinessRegistrationNumber,
	defaultRepresentativeName,
	defaultBusinessStartDate,
	isRejected,
	organizationId,
	verificationStatus,
}: {
	biznumCheckEnabled: boolean;
	businessDocuments: BusinessDocument[];
	defaultDisplayName: string;
	defaultBusinessRegistrationNumber: string;
	defaultRepresentativeName: string;
	// date input 값과 같은 YYYY-MM-DD 문자열(빈 문자열이면 미입력).
	defaultBusinessStartDate: string;
	isRejected: boolean;
	organizationId: null | string;
	verificationStatus: string;
}) {
	const queryClient = useQueryClient();
	const [displayName, setDisplayName] = useState(defaultDisplayName);
	const [brn, setBrn] = useState(defaultBusinessRegistrationNumber);
	const [representativeName, setRepresentativeName] = useState(
		defaultRepresentativeName
	);
	const [startDate, setStartDate] = useState(defaultBusinessStartDate);
	const [showValidation, setShowValidation] = useState(false);
	const [showChangeConfirm, setShowChangeConfirm] = useState(false);
	const [showLeaveBlocked, setShowLeaveBlocked] = useState(false);
	const [isSubmitHighlighted, setIsSubmitHighlighted] = useState(false);
	const [hasPendingDocuments, setHasPendingDocuments] = useState(false);
	const submitButtonRef = useRef<HTMLButtonElement>(null);
	const documentUploaderRef = useRef<BusinessDocumentUploaderHandle>(null);
	const isPending = verificationStatus === "pending";
	const isChangesUnsubmitted = verificationStatus === "changes_unsubmitted";
	const draftMutation = useMutation(
		orpc.bambi.onboarding.saveEmployerBusinessDraft.mutationOptions({
			onSuccess: async () => {
				await queryClient.invalidateQueries({
					queryKey: orpc.bambi.onboarding.getMine.queryKey(),
				});
			},
		})
	);

	useEffect(() => {
		if (
			!(
				organizationId &&
				(verificationStatus === "verified" || isChangesUnsubmitted)
			)
		) {
			return;
		}
		const changed =
			displayName.trim() !== defaultDisplayName.trim() ||
			brn.trim() !== defaultBusinessRegistrationNumber.trim() ||
			representativeName.trim() !== defaultRepresentativeName.trim() ||
			startDate !== defaultBusinessStartDate;
		if (!changed) {
			return;
		}
		const timer = window.setTimeout(() => {
			draftMutation.mutate({
				organizationId,
				displayName: displayName.trim(),
				businessRegistrationNumber: brn.trim(),
				representativeName: representativeName.trim(),
				businessStartDate: startDate,
			});
		}, 500);
		return () => window.clearTimeout(timer);
	}, [
		brn,
		defaultBusinessRegistrationNumber,
		defaultBusinessStartDate,
		defaultDisplayName,
		defaultRepresentativeName,
		displayName,
		draftMutation.mutate,
		isChangesUnsubmitted,
		organizationId,
		representativeName,
		startDate,
		verificationStatus,
	]);

	useEffect(() => {
		if (!isChangesUnsubmitted) {
			return;
		}
		const beforeUnload = (event: BeforeUnloadEvent) => event.preventDefault();
		const click = (event: MouseEvent) => {
			const link = (event.target as HTMLElement).closest<HTMLAnchorElement>(
				"a[href]"
			);
			if (!link) {
				return;
			}
			const destination = new URL(link.href, window.location.href);
			if (destination.origin !== window.location.origin) {
				return;
			}
			event.preventDefault();
			setShowLeaveBlocked(true);
		};
		const popState = () => {
			window.history.pushState(null, "", window.location.href);
			setShowLeaveBlocked(true);
		};
		window.history.pushState(null, "", window.location.href);
		window.addEventListener("beforeunload", beforeUnload);
		window.addEventListener("popstate", popState);
		document.addEventListener("click", click, true);
		return () => {
			window.removeEventListener("beforeunload", beforeUnload);
			window.removeEventListener("popstate", popState);
			document.removeEventListener("click", click, true);
		};
	}, [isChangesUnsubmitted]);

	const submitMutation = useMutation(
		orpc.bambi.onboarding.submitEmployerBusinessInfo.mutationOptions({
			onError: (error) => {
				toast.error(error.message || "업체 정보를 제출하지 못했습니다.");
			},
			onSuccess: async () => {
				setShowChangeConfirm(false);
				toast.success("업체 정보를 제출했습니다. 운영자 승인을 기다려 주세요.");
				await queryClient.invalidateQueries({
					queryKey: orpc.bambi.onboarding.getMine.queryKey(),
				});
			},
		})
	);
	const prepareDocumentsMutation = useMutation(
		orpc.bambi.onboarding.prepareEmployerBusinessDocuments.mutationOptions({
			onError: (error) => {
				toast.error(error.message || "업체 정보 제출을 준비하지 못했습니다.");
			},
		})
	);

	const nameError =
		displayName.trim().length === 0 ? "업체명을 입력해 주세요." : "";
	const brnError = BRN_PATTERN.test(brn.trim())
		? ""
		: "사업자등록번호는 000-00-00000 형식으로 입력해 주세요.";
	const representativeNameError =
		representativeName.trim().length === 0
			? "대표자 성명을 입력해 주세요."
			: "";
	const startDateError = startDate ? "" : "개업일자를 입력해 주세요.";
	const ensureOrganizationId = async (): Promise<null | string> => {
		if (organizationId) {
			return organizationId;
		}
		if (nameError || brnError || representativeNameError || startDateError) {
			setShowValidation(true);
			throw new Error("업체 정보를 먼저 모두 입력해 주세요.");
		}
		const prepared = await prepareDocumentsMutation.mutateAsync({
			displayName: displayName.trim(),
			businessRegistrationNumber: brn.trim(),
			representativeName: representativeName.trim(),
			businessStartDate: startDate,
		});
		await queryClient.invalidateQueries({
			queryKey: orpc.bambi.onboarding.getMine.queryKey(),
		});
		return prepared.organizationId;
	};

	// 기존 값에서 바뀐 게 없으면 제출을 막는다(불필요한 재심사 요청 방지).
	// 단, 반려된 경우엔 동일 정보라도 재제출(재심사 신청)을 허용한다.
	const isUnchanged =
		displayName.trim() === defaultDisplayName.trim() &&
		brn.trim() === defaultBusinessRegistrationNumber.trim() &&
		representativeName.trim() === defaultRepresentativeName.trim() &&
		startDate === defaultBusinessStartDate;
	const blockUnchanged =
		verificationStatus !== "none" &&
		isUnchanged &&
		!hasPendingDocuments &&
		!isRejected &&
		!isChangesUnsubmitted;

	const submitBusinessInfo = async () => {
		if (submitMutation.isPending) {
			return;
		}
		try {
			let targetOrganizationId = organizationId;
			if (documentUploaderRef.current?.hasPendingFiles()) {
				targetOrganizationId = await ensureOrganizationId();
				if (!targetOrganizationId) {
					return;
				}
				await documentUploaderRef.current.uploadPendingFiles(
					targetOrganizationId
				);
			}
			await submitMutation.mutateAsync({
				displayName: displayName.trim(),
				businessRegistrationNumber: brn.trim(),
				representativeName: representativeName.trim(),
				businessStartDate: startDate,
			});
		} catch {
			return;
		}
	};

	const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		if (nameError || brnError || representativeNameError || startDateError) {
			setShowValidation(true);
			return;
		}
		if (verificationStatus === "verified" || isChangesUnsubmitted) {
			setShowChangeConfirm(true);
			return;
		}
		submitBusinessInfo().catch(() => undefined);
	};

	const focusSubmit = () => {
		setShowLeaveBlocked(false);
		// AlertDialog가 닫혀 포커스 트랩이 해제된 다음 제출 버튼으로 이동한다.
		window.setTimeout(() => {
			submitButtonRef.current?.scrollIntoView({
				behavior: "smooth",
				block: "center",
			});
			submitButtonRef.current?.focus();
			setIsSubmitHighlighted(true);
			window.setTimeout(() => setIsSubmitHighlighted(false), 2200);
		}, 0);
	};

	return (
		<>
			<form onSubmit={handleSubmit}>
				{verificationStatus === "verified" ? (
					<Alert className="mb-4 border-primary/40 bg-primary/5">
						<AlertTitle>인증 정보 변경 전 확인해 주세요</AlertTitle>
						<AlertDescription>
							인증 완료 후 업체 정보나 인증 서류를 변경하면 변경사항 미제출
							상태로 전환됩니다. 기존 공고와 광고는 비공개 처리되며, 재승인
							전까지 공고·광고 등록과 채팅 송수신을 이용할 수 없습니다.
						</AlertDescription>
					</Alert>
				) : null}
				{isChangesUnsubmitted ? (
					<Alert className="mb-4 border-primary bg-primary/10">
						<AlertTitle>변경사항 미제출</AlertTitle>
						<AlertDescription>
							변경사항이 아직 제출되지 않았습니다. 기존 공고와 광고가 비공개
							처리되었으며 채팅 송수신이 제한됩니다. 업체 정보 제출 후 운영자
							승인을 받아야 다시 이용할 수 있습니다.
						</AlertDescription>
					</Alert>
				) : null}
				<Card>
					<CardContent className="flex flex-col gap-4">
						<div className="grid gap-4 sm:grid-cols-2">
							<div className="flex flex-col gap-1.5">
								<Label htmlFor="business-name">업체명</Label>
								<Input
									aria-invalid={showValidation && Boolean(nameError)}
									disabled={isPending}
									id="business-name"
									onChange={(event) => setDisplayName(event.target.value)}
									placeholder="예: 밤비 라운지"
									value={displayName}
								/>
								<FieldError
									id="business-name-error"
									message={showValidation ? nameError : ""}
								/>
							</div>
							<div className="flex flex-col gap-1.5">
								<Label htmlFor="business-brn">사업자 등록 번호</Label>
								<Input
									aria-invalid={showValidation && Boolean(brnError)}
									disabled={isPending}
									id="business-brn"
									onChange={(event) => setBrn(event.target.value)}
									placeholder="000-00-00000"
									value={brn}
								/>
								<FieldError
									id="business-brn-error"
									message={showValidation ? brnError : ""}
								/>
							</div>
							<div className="flex flex-col gap-1.5">
								<Label htmlFor="business-representative">대표자 성명</Label>
								<Input
									aria-invalid={
										showValidation && Boolean(representativeNameError)
									}
									disabled={isPending}
									id="business-representative"
									onChange={(event) =>
										setRepresentativeName(event.target.value)
									}
									placeholder="예: 홍길동"
									value={representativeName}
								/>
								<FieldError
									id="business-representative-error"
									message={showValidation ? representativeNameError : ""}
								/>
							</div>
							<div className="flex flex-col gap-1.5">
								<Label htmlFor="business-start-date">개업일자</Label>
								<Input
									aria-invalid={showValidation && Boolean(startDateError)}
									disabled={isPending}
									id="business-start-date"
									onChange={(event) => setStartDate(event.target.value)}
									type="date"
									value={startDate}
								/>
								<FieldError
									id="business-start-date-error"
									message={showValidation ? startDateError : ""}
								/>
							</div>
						</div>
						<p className="text-muted-foreground text-xs">
							{biznumCheckEnabled
								? "대표자 성명과 개업일자는 사업자등록증에 적힌 그대로 입력해야 국세청 진위확인을 통과합니다."
								: "국세청 사업자등록정보 진위확인은 곧 준비될 기능이에요. 지금은 제출하신 정보를 운영자가 사업자등록증과 직접 대조해 승인하니, 대표자 성명과 개업일자를 사업자등록증에 적힌 그대로 입력해 주세요."}
						</p>
						<BusinessDocumentUploader
							documents={businessDocuments}
							onPendingFilesChange={setHasPendingDocuments}
							organizationId={organizationId}
							ref={documentUploaderRef}
							verificationStatus={verificationStatus}
						/>
						<div className="flex justify-end">
							<Button
								className={`w-full sm:w-auto ${isSubmitHighlighted ? "animate-pulse ring-2 ring-primary ring-offset-4" : ""}`}
								disabled={
									submitMutation.isPending ||
									prepareDocumentsMutation.isPending ||
									blockUnchanged
								}
								ref={submitButtonRef}
								type="submit"
							>
								{isRejected ? "업체 정보 재제출" : "업체 정보 제출"}
							</Button>
						</div>
					</CardContent>
				</Card>
			</form>
			<AlertDialog onOpenChange={setShowChangeConfirm} open={showChangeConfirm}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>업체 정보를 변경하시겠습니까?</AlertDialogTitle>
						<AlertDialogDescription>
							업체 정보를 제출하면 인증 대기 상태로 전환되며, 운영자 승인 전까지
							기존 공고와 광고가 비공개 처리되고 채팅 송수신이 제한됩니다.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>취소</AlertDialogCancel>
						<AlertDialogAction
							disabled={submitMutation.isPending}
							onClick={submitBusinessInfo}
						>
							변경사항 제출
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
			<AlertDialog onOpenChange={setShowLeaveBlocked} open={showLeaveBlocked}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>업체 정보를 먼저 제출해 주세요</AlertDialogTitle>
						<AlertDialogDescription>
							사업자 인증 서류가 변경되었기에 업체 정보 제출을 누르기 전까지
							뒤로가기가 불가합니다.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogAction onClick={focusSubmit}>확인</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</>
	);
}
