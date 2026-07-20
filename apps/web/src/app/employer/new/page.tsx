"use client";

import {
	Alert,
	AlertDescription,
	AlertTitle,
} from "@bambi-app/ui/components/alert";
import { Button, buttonVariants } from "@bambi-app/ui/components/button";
import { Card, CardContent } from "@bambi-app/ui/components/card";
import { Input } from "@bambi-app/ui/components/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@bambi-app/ui/components/select";
import { Textarea } from "@bambi-app/ui/components/textarea";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Clock, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { useEmployerVerified } from "@/components/bambi/employer-approval-context";
import { EmployerGateBanner } from "@/components/bambi/employer-gate-banner";
import { EmployerListingPreview } from "@/components/bambi/employer-listing-preview";
import { EmptyState } from "@/components/bambi/empty-state";
import {
	FieldError,
	FieldHint,
	FieldLabel,
	FormError,
} from "@/components/bambi/form-message";
import { JobExposureFields } from "@/components/bambi/job-exposure-fields";
import { JobPostBlockEditor } from "@/components/bambi/job-post-block-editor";
import { JobPostMediaUploader } from "@/components/bambi/job-post-media-uploader";
import { PageShell } from "@/components/bambi/page-shell";
import { PayAmountHint } from "@/components/bambi/pay-amount-hint";
import Loader from "@/components/loader";
import { useUnsavedChangesWarning } from "@/hooks/use-unsaved-changes-warning";
import { authClient } from "@/lib/auth-client";
import { JOB_REVIEW_SLA_TEXT } from "@/lib/bambi-job-copy";
import {
	emptyJobForm,
	emptyJobFormMedia,
	type JobDescriptionBlockFormValue,
	type JobForm,
	type JobFormErrors,
	type JobFormMedia,
	type JobPaymentMethod,
	resolveJobPostMediaForSubmit,
	validateJobForm,
} from "@/lib/bambi-job-form";
import {
	industryOptions,
	payUnitOptions,
	regionOptions,
} from "@/lib/bambi-options";
import { orpc } from "@/utils/orpc";

const selectTriggerClassName = "w-full text-sm data-[size=default]:h-9";

const getFieldErrorId = (field: keyof JobForm) => `${field}-error`;
const getErrorCode = (error: Error | null): string | undefined =>
	error && "code" in error && typeof error.code === "string"
		? error.code
		: undefined;

interface PostingScope {
	organizationDisplayName: string;
	organizationId: string;
	scopeType: "organization" | "team";
	teamDisplayName: null | string;
	teamId: null | string;
}

const getPostingScopeValue = (scope: PostingScope) =>
	JSON.stringify([scope.organizationId, scope.teamId]);

const getPostingScopeLabel = (scope: PostingScope) => {
	if (scope.scopeType === "organization") {
		return `${scope.organizationDisplayName} / 전체 조직`;
	}

	return `${scope.organizationDisplayName} / ${scope.teamDisplayName ?? scope.teamId}`;
};

const getPostingScopeDisplayName = (scope?: PostingScope) =>
	scope?.teamDisplayName ?? scope?.organizationDisplayName ?? "검증 업체";

const formatPreviewPay = ({
	payAmount,
	payUnit,
}: Pick<JobForm, "payAmount" | "payUnit">): string => {
	const numericPay = Number(payAmount);

	return Number.isFinite(numericPay) && numericPay > 0
		? `${payUnit} ${numericPay.toLocaleString("ko-KR")}원`
		: "";
};

const focusFirstInvalidField = (form: HTMLFormElement | null) => {
	if (!form) {
		return;
	}

	requestAnimationFrame(() => {
		const firstInvalid = form.querySelector<HTMLElement>(
			'[aria-invalid="true"]'
		);

		if (firstInvalid) {
			firstInvalid.scrollIntoView({ behavior: "smooth", block: "center" });
			firstInvalid.focus({ preventScroll: true });
		}
	});
};

interface NewEmployerJobFormProps {
	postingScopes: PostingScope[];
}

export default function NewEmployerJobPage() {
	const session = authClient.useSession();
	const isSignedIn = Boolean(session.data?.user);
	const mineQuery = useQuery({
		...orpc.bambi.onboarding.getMine.queryOptions(),
		enabled: isSignedIn,
	});
	const profile = mineQuery.data?.bambiProfile ?? null;
	const organizationProfiles =
		mineQuery.data?.employerOrganizationProfiles ?? [];
	const postingScopes = mineQuery.data?.employerJobPostingScopes ?? [];
	const isEmployer = Boolean(profile && profile.role !== "job_seeker");

	if (session.isPending || mineQuery.isLoading) {
		return <Loader />;
	}

	if (!isSignedIn || getErrorCode(mineQuery.error) === "UNAUTHORIZED") {
		return (
			<PageShell
				description="공고 등록은 로그인 후 이용할 수 있습니다."
				title="새 공고 등록"
			>
				<EmptyState
					action={
						<Link className={buttonVariants()} href="/login">
							로그인
						</Link>
					}
					description="구인자 계정으로 로그인한 뒤 공고를 등록할 수 있습니다."
					title="로그인이 필요합니다"
				/>
			</PageShell>
		);
	}

	if (mineQuery.isError) {
		return (
			<PageShell
				description="공고 등록에 필요한 프로필 정보를 불러오지 못했습니다."
				title="새 공고 등록"
			>
				<EmptyState
					action={
						<Button onClick={() => mineQuery.refetch()} type="button">
							다시 시도
						</Button>
					}
					description="로그인 상태와 연결 상태를 확인한 뒤 다시 시도해 주세요."
					title="프로필 정보를 불러올 수 없습니다"
				/>
			</PageShell>
		);
	}

	if (!profile) {
		return (
			<PageShell
				description="공고를 등록하려면 밤비 프로필 설정이 필요합니다."
				title="새 공고 등록"
			>
				<EmptyState
					action={
						<Link className={buttonVariants()} href="/welcome">
							회원가입으로 이동
						</Link>
					}
					description="구인자 프로필을 만든 뒤 공고를 등록할 수 있습니다."
					title="밤비 프로필이 없습니다"
				/>
			</PageShell>
		);
	}

	if (!isEmployer) {
		return (
			<PageShell
				description="현재 계정은 구직자 프로필로 설정되어 있습니다."
				title="새 공고 등록"
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
					title="공고 등록 권한이 없습니다"
				/>
			</PageShell>
		);
	}

	if (organizationProfiles.length === 0 || postingScopes.length === 0) {
		return (
			<PageShell
				description="공고를 등록하려면 등록 가능한 조직 또는 팀 범위가 필요합니다."
				title="새 공고 등록"
			>
				<EmptyState
					action={
						<Link
							className={buttonVariants({ variant: "outline" })}
							href="/employer"
						>
							구인자 관리로 이동
						</Link>
					}
					description="대표 또는 관리자는 전체 조직 공고를, 직원은 소속 팀 공고를 등록할 수 있습니다."
					title="등록 가능한 공고 범위가 없습니다"
				/>
			</PageShell>
		);
	}

	return <NewEmployerJobForm postingScopes={postingScopes} />;
}

function NewEmployerJobForm({ postingScopes }: NewEmployerJobFormProps) {
	const router = useRouter();
	const utils = useQueryClient();
	const verified = useEmployerVerified();
	const [form, setForm] = useState(emptyJobForm);
	const [descriptionBlocks, setDescriptionBlocks] = useState<
		JobDescriptionBlockFormValue[]
	>([]);
	const [media, setMedia] = useState<JobFormMedia>({
		...emptyJobFormMedia,
		detail: [],
	});
	const [fieldErrors, setFieldErrors] = useState<JobFormErrors>({});
	const [formError, setFormError] = useState<null | string>(null);
	const formRef = useRef<HTMLFormElement>(null);
	const [isDirty, setIsDirty] = useState(false);
	const [showCancelConfirm, setShowCancelConfirm] = useState(false);
	useUnsavedChangesWarning(isDirty);
	const createMediaUploadMutation = useMutation(
		orpc.bambi.jobs.createMediaUpload.mutationOptions()
	);

	const createMutation = useMutation(
		orpc.bambi.jobs.create.mutationOptions({
			onError: (error) => {
				const message =
					"공고를 등록하지 못했습니다. 입력값과 공고 등록 권한을 확인해 주세요.";
				setFormError(message);
				toast.error(error.message || message);
			},
			onSuccess: async () => {
				setIsDirty(false);
				toast.success("공고를 등록했습니다. 검수 후 공개됩니다.");
				await utils.invalidateQueries({
					queryKey: orpc.bambi.jobs.listMine.queryKey(),
				});
				router.push("/employer");
			},
		})
	);

	const postingScopeOptions = useMemo(
		() =>
			postingScopes.map((scope) => ({
				label: getPostingScopeLabel(scope),
				scope,
				value: getPostingScopeValue(scope),
			})),
		[postingScopes]
	);
	const selectedPostingScope = postingScopeOptions.find(
		(option) =>
			option.scope.organizationId === form.organizationId &&
			(option.scope.teamId ?? "") === form.teamId
	);
	const teamScopes = useMemo(
		() =>
			postingScopes
				.filter((scope) => scope.scopeType === "team" && scope.teamId)
				.map((scope) => ({
					organizationId: scope.organizationId,
					teamId: scope.teamId ?? "",
				})),
		[postingScopes]
	);

	useEffect(() => {
		const firstScope = postingScopeOptions[0]?.scope;

		if (!selectedPostingScope && firstScope) {
			setForm((currentForm) => ({
				...currentForm,
				organizationId: firstScope.organizationId,
				teamId: firstScope.teamId ?? "",
			}));
		}
	}, [postingScopeOptions, selectedPostingScope]);

	const previewCompanyName = getPostingScopeDisplayName(
		selectedPostingScope?.scope
	);
	const previewPay = formatPreviewPay(form);

	const updatePostingScope = (value: string) => {
		const nextScope = postingScopeOptions.find(
			(option) => option.value === value
		)?.scope;

		if (!nextScope) {
			return;
		}

		setIsDirty(true);
		setForm((currentForm) => ({
			...currentForm,
			organizationId: nextScope.organizationId,
			teamId: nextScope.teamId ?? "",
		}));
		setFieldErrors((currentErrors) => ({
			...currentErrors,
			organizationId: undefined,
			teamId: undefined,
		}));
		setFormError(null);
	};

	const updateFormValue = (field: keyof JobForm, value: string) => {
		setIsDirty(true);
		setForm((currentForm) => ({
			...currentForm,
			[field]: value,
		}));
		setFieldErrors((currentErrors) => ({
			...currentErrors,
			[field]: undefined,
		}));
		setFormError(null);
	};

	const updateExposureFields = (
		patch: Partial<
			Pick<
				JobForm,
				| "adProductId"
				| "exposureAmount"
				| "exposureDurationDays"
				| "exposureType"
				| "paymentMethod"
			>
		>
	) => {
		setIsDirty(true);
		setForm((currentForm) => ({
			...currentForm,
			...patch,
		}));
		setFieldErrors((currentErrors) => ({
			...currentErrors,
			adProductId: undefined,
			exposureDurationDays: undefined,
			exposureType: undefined,
			paymentMethod: undefined,
		}));
		setFormError(null);
	};

	const handleProductChange = (productId: string | null) => {
		updateExposureFields(
			productId
				? {
						adProductId: productId,
						exposureAmount: null,
						exposureDurationDays: null,
					}
				: {
						adProductId: null,
						exposureAmount: null,
						exposureDurationDays: null,
						exposureType: "standard",
						paymentMethod: null,
					}
		);
	};

	const handlePaymentMethodChange = (value: JobPaymentMethod) => {
		updateExposureFields({ paymentMethod: value });
	};

	const handleDurationChange = (days: number | null, amount: number | null) => {
		updateExposureFields({
			exposureAmount: amount,
			exposureDurationDays: days,
		});
	};

	const handleCancel = () => {
		if (isDirty) {
			setShowCancelConfirm(true);
			return;
		}

		router.push("/employer");
	};

	const handleLeaveWithoutSaving = () => {
		setIsDirty(false);
		router.push("/employer");
	};

	const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
		event.preventDefault();

		const validation = validateJobForm(form, {
			descriptionBlocks,
			media,
			teamScopes,
		});

		if (!validation.ok) {
			setFieldErrors(validation.errors);
			setFormError(validation.message);
			toast.error(validation.message);
			focusFirstInvalidField(formRef.current);
			return;
		}

		try {
			const { media: validatedMedia, ...jobInput } = validation.input;
			const mediaPayload = await resolveJobPostMediaForSubmit({
				createUploadIntent: createMediaUploadMutation.mutateAsync,
				media: validatedMedia,
				onMediaResolved: setMedia,
				organizationId: jobInput.organizationId,
				teamId: jobInput.teamId,
			});

			createMutation.mutate({
				...jobInput,
				media: mediaPayload,
			});
		} catch (error) {
			const message =
				error instanceof Error
					? error.message
					: "이미지 업로드 준비 중 문제가 발생했습니다.";
			setFormError(message);
			toast.error(message);
		}
	};

	const listingPreview = (
		<EmployerListingPreview
			companyName={previewCompanyName}
			coverImageUrl={media.cover?.previewUrl}
			location={form.region}
			pay={previewPay}
			title={form.title}
		/>
	);

	return (
		<PageShell
			description="조직과 팀을 선택하고 공개할 공고 정보를 입력합니다."
			title="새 공고 등록"
		>
			<div className="flex flex-col gap-6 xl:flex-row xl:items-start">
				<form
					className="flex min-w-0 flex-1 flex-col gap-6"
					onSubmit={handleSubmit}
					ref={formRef}
				>
					<EmployerGateBanner action="공고를 등록" />
					<FormError message={formError} />
					<section
						aria-labelledby="new-affiliation"
						className="flex flex-col gap-3"
					>
						<div>
							<h2 className="font-semibold text-lg" id="new-affiliation">
								소속 정보
							</h2>
							<p className="mt-1 text-muted-foreground text-sm">
								공고를 등록할 조직·팀 범위를 선택하세요.
							</p>
						</div>
						<Card>
							<CardContent className="grid gap-4 md:grid-cols-2">
								<div className="flex flex-col gap-2 md:col-span-2">
									<FieldLabel htmlFor="postingScope">공고 등록 범위</FieldLabel>
									<Select
										items={postingScopeOptions}
										name="postingScope"
										onValueChange={(value) => updatePostingScope(value ?? "")}
										required
										value={selectedPostingScope?.value ?? ""}
									>
										<SelectTrigger
											aria-describedby={
												fieldErrors.organizationId || fieldErrors.teamId
													? getFieldErrorId("organizationId")
													: undefined
											}
											aria-invalid={Boolean(
												fieldErrors.organizationId || fieldErrors.teamId
											)}
											className={selectTriggerClassName}
											id="postingScope"
										>
											<SelectValue />
										</SelectTrigger>
										<SelectContent>
											{postingScopeOptions.map((option) => (
												<SelectItem key={option.value} value={option.value}>
													{option.label}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
									<FieldError
										id={getFieldErrorId("organizationId")}
										message={fieldErrors.organizationId ?? fieldErrors.teamId}
									/>
								</div>
							</CardContent>
						</Card>
					</section>

					<section
						aria-labelledby="new-conditions"
						className="flex flex-col gap-3"
					>
						<div>
							<h2 className="font-semibold text-lg" id="new-conditions">
								공고 조건
							</h2>
							<p className="mt-1 text-muted-foreground text-sm">
								제목·업종·지역·급여 등 핵심 조건을 입력하세요.
							</p>
						</div>
						<Card>
							<CardContent className="grid gap-4 md:grid-cols-2">
								<div className="flex flex-col gap-2 md:col-span-2">
									<FieldLabel htmlFor="title">공고 제목</FieldLabel>
									<Input
										aria-describedby={
											fieldErrors.title ? getFieldErrorId("title") : undefined
										}
										aria-invalid={Boolean(fieldErrors.title)}
										id="title"
										name="title"
										onChange={(event) =>
											updateFormValue("title", event.target.value)
										}
										placeholder="예: 금요일 라운지 홀 스태프 모집…"
										required
										value={form.title}
									/>
									<FieldError
										id={getFieldErrorId("title")}
										message={fieldErrors.title}
									/>
								</div>
								<div className="flex flex-col gap-2">
									<FieldLabel htmlFor="industryCategory">업종</FieldLabel>
									<Select
										name="industryCategory"
										onValueChange={(value) =>
											updateFormValue("industryCategory", value ?? "")
										}
										required
										value={form.industryCategory}
									>
										<SelectTrigger
											aria-describedby={
												fieldErrors.industryCategory
													? getFieldErrorId("industryCategory")
													: undefined
											}
											aria-invalid={Boolean(fieldErrors.industryCategory)}
											className={selectTriggerClassName}
											id="industryCategory"
										>
											<SelectValue />
										</SelectTrigger>
										<SelectContent>
											{industryOptions.map((option) => (
												<SelectItem key={option} value={option}>
													{option}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
									<FieldError
										id={getFieldErrorId("industryCategory")}
										message={fieldErrors.industryCategory}
									/>
								</div>
								<div className="flex flex-col gap-2">
									<FieldLabel htmlFor="region">지역</FieldLabel>
									<Select
										name="region"
										onValueChange={(value) =>
											updateFormValue("region", value ?? "")
										}
										required
										value={form.region}
									>
										<SelectTrigger
											aria-describedby={
												fieldErrors.region
													? getFieldErrorId("region")
													: undefined
											}
											aria-invalid={Boolean(fieldErrors.region)}
											className={selectTriggerClassName}
											id="region"
										>
											<SelectValue />
										</SelectTrigger>
										<SelectContent>
											{regionOptions.map((option) => (
												<SelectItem key={option} value={option}>
													{option}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
									<FieldError
										id={getFieldErrorId("region")}
										message={fieldErrors.region}
									/>
								</div>
								<div className="flex flex-col gap-2">
									<FieldLabel htmlFor="payAmount">급여 금액</FieldLabel>
									<Input
										aria-describedby={
											fieldErrors.payAmount
												? getFieldErrorId("payAmount")
												: undefined
										}
										aria-invalid={Boolean(fieldErrors.payAmount)}
										id="payAmount"
										inputMode="numeric"
										min="1"
										name="payAmount"
										onChange={(event) =>
											updateFormValue("payAmount", event.target.value)
										}
										placeholder="예: 12000…"
										required
										type="number"
										value={form.payAmount}
									/>
									<PayAmountHint
										payAmount={form.payAmount}
										payUnit={form.payUnit}
									/>
									<FieldError
										id={getFieldErrorId("payAmount")}
										message={fieldErrors.payAmount}
									/>
								</div>
								<div className="flex flex-col gap-2">
									<FieldLabel htmlFor="payUnit">급여 단위</FieldLabel>
									<Select
										name="payUnit"
										onValueChange={(value) =>
											updateFormValue("payUnit", value ?? "")
										}
										required
										value={form.payUnit}
									>
										<SelectTrigger
											aria-describedby={
												fieldErrors.payUnit
													? getFieldErrorId("payUnit")
													: undefined
											}
											aria-invalid={Boolean(fieldErrors.payUnit)}
											className={selectTriggerClassName}
											id="payUnit"
										>
											<SelectValue />
										</SelectTrigger>
										<SelectContent>
											{payUnitOptions.map((option) => (
												<SelectItem key={option} value={option}>
													{option}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
									<FieldError
										id={getFieldErrorId("payUnit")}
										message={fieldErrors.payUnit}
									/>
								</div>
								<div className="flex flex-col gap-2 md:col-span-2">
									<FieldLabel htmlFor="workSchedule">근무 일정</FieldLabel>
									<Input
										aria-describedby={
											fieldErrors.workSchedule
												? getFieldErrorId("workSchedule")
												: undefined
										}
										aria-invalid={Boolean(fieldErrors.workSchedule)}
										id="workSchedule"
										name="workSchedule"
										onChange={(event) =>
											updateFormValue("workSchedule", event.target.value)
										}
										placeholder="예: 금/토 20:00-02:00…"
										required
										value={form.workSchedule}
									/>
									<FieldError
										id={getFieldErrorId("workSchedule")}
										message={fieldErrors.workSchedule}
									/>
								</div>
							</CardContent>
						</Card>
					</section>

					<section
						aria-labelledby="new-details"
						className="flex flex-col gap-3"
					>
						<div>
							<h2 className="font-semibold text-lg" id="new-details">
								상세 내용
							</h2>
							<p className="mt-1 text-muted-foreground text-sm">
								기본 상세 설명은 필수예요. 블록형 상세 설명과 면접 안내는
								선택이며, 블록을 추가하면 기본 설명 대신 공개됩니다.
							</p>
						</div>
						<Card>
							<CardContent className="grid gap-4">
								<div className="flex flex-col gap-2">
									<FieldLabel htmlFor="description">상세 설명</FieldLabel>
									<FieldHint>
										지원자가 가장 먼저 읽는 기본 소개예요. 업무·근무 조건·우대
										사항을 자유롭게 적어 주세요.
									</FieldHint>
									<Textarea
										aria-describedby={
											fieldErrors.description
												? getFieldErrorId("description")
												: undefined
										}
										aria-invalid={Boolean(fieldErrors.description)}
										className="min-h-28"
										id="description"
										maxLength={2000}
										minLength={10}
										name="description"
										onChange={(event) =>
											updateFormValue("description", event.target.value)
										}
										placeholder="업무 내용, 지원 조건, 준비 사항을 입력해 주세요…"
										required
										value={form.description}
									/>
									<FieldError
										id={getFieldErrorId("description")}
										message={fieldErrors.description}
									/>
								</div>
								<JobPostBlockEditor
									blocks={descriptionBlocks}
									error={fieldErrors.descriptionBlocks}
									onChange={(blocks) => {
										setIsDirty(true);
										setDescriptionBlocks(blocks);
										setFieldErrors((currentErrors) => ({
											...currentErrors,
											descriptionBlocks: undefined,
										}));
										setFormError(null);
									}}
								/>
								<div className="flex flex-col gap-2">
									<FieldLabel htmlFor="interviewNotes" optional>
										면접 안내
									</FieldLabel>
									<FieldHint>
										면접 장소·준비물·연락 가능 시간처럼 지원이 확정된 뒤 필요한
										정보를 적어 주세요.
									</FieldHint>
									<Textarea
										aria-describedby={
											fieldErrors.interviewNotes
												? getFieldErrorId("interviewNotes")
												: undefined
										}
										aria-invalid={Boolean(fieldErrors.interviewNotes)}
										className="min-h-28"
										id="interviewNotes"
										maxLength={500}
										name="interviewNotes"
										onChange={(event) =>
											updateFormValue("interviewNotes", event.target.value)
										}
										placeholder="면접 장소, 준비물, 연락 가능 시간을 입력해 주세요…"
										value={form.interviewNotes}
									/>
									<FieldError
										id={getFieldErrorId("interviewNotes")}
										message={fieldErrors.interviewNotes}
									/>
								</div>
							</CardContent>
						</Card>
					</section>

					<JobPostMediaUploader
						error={fieldErrors.media}
						media={media}
						onChange={(nextMedia) => {
							setIsDirty(true);
							setMedia(nextMedia);
							setFieldErrors((currentErrors) => ({
								...currentErrors,
								media: undefined,
							}));
							setFormError(null);
						}}
					/>

					<JobExposureFields
						adProductId={form.adProductId}
						errors={{
							exposureDurationDays: fieldErrors.exposureDurationDays,
							exposureType: fieldErrors.exposureType,
							paymentMethod: fieldErrors.paymentMethod,
						}}
						exposureAmount={form.exposureAmount}
						exposureDurationDays={form.exposureDurationDays}
						onDurationChange={handleDurationChange}
						onPaymentMethodChange={handlePaymentMethodChange}
						onProductChange={handleProductChange}
						paymentMethod={form.paymentMethod}
					/>

					<div className="xl:hidden">{listingPreview}</div>

					<Alert>
						<Clock />
						<AlertTitle>등록하면 검수를 거쳐 공개됩니다</AlertTitle>
						<AlertDescription>
							제출하면 {JOB_REVIEW_SLA_TEXT}에 검수가 완료되며, 검수 중에는 내
							공고 화면에서 진행 상태를 확인할 수 있습니다. 유료 노출 상품은
							운영자 결제 확인 후 검수·결제완료 시 공개됩니다.
						</AlertDescription>
					</Alert>

					{showCancelConfirm ? (
						<div className="flex flex-col gap-3">
							<Alert variant="warning">
								<TriangleAlert />
								<AlertTitle>저장하지 않고 나갈까요?</AlertTitle>
								<AlertDescription>
									작성 중인 내용은 저장되지 않아요.
								</AlertDescription>
							</Alert>
							<div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
								<Button
									onClick={() => setShowCancelConfirm(false)}
									type="button"
									variant="outline"
								>
									계속 작성
								</Button>
								<Button
									onClick={handleLeaveWithoutSaving}
									type="button"
									variant="destructive"
								>
									나가기
								</Button>
							</div>
						</div>
					) : (
						<div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
							<Button onClick={handleCancel} type="button" variant="outline">
								취소
							</Button>
							<Button
								disabled={
									createMutation.isPending ||
									createMediaUploadMutation.isPending ||
									!verified
								}
								type="submit"
							>
								{createMutation.isPending || createMediaUploadMutation.isPending
									? "등록 중…"
									: "공고 등록"}
							</Button>
						</div>
					)}
				</form>
				<aside className="hidden w-80 shrink-0 xl:sticky xl:top-24 xl:block">
					<div className="flex flex-col gap-2">
						<p className="font-medium text-muted-foreground text-xs">
							작성 중 실시간 미리보기
						</p>
						{listingPreview}
					</div>
				</aside>
			</div>
		</PageShell>
	);
}
