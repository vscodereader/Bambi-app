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
import { TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { use, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { EmployerListingPreview } from "@/components/bambi/employer-listing-preview";
import { EmptyState } from "@/components/bambi/empty-state";
import {
	FieldError,
	FieldHint,
	FieldLabel,
	FormError,
} from "@/components/bambi/form-message";
import { JobPostBlockEditor } from "@/components/bambi/job-post-block-editor";
import { JobPostMediaUploader } from "@/components/bambi/job-post-media-uploader";
import { PageShell } from "@/components/bambi/page-shell";
import { PayAmountHint } from "@/components/bambi/pay-amount-hint";
import Loader from "@/components/loader";
import { useUnsavedChangesWarning } from "@/hooks/use-unsaved-changes-warning";
import { authClient } from "@/lib/auth-client";
import {
	emptyJobForm,
	emptyJobFormMedia,
	type JobDescriptionBlockFormValue,
	type JobForm,
	type JobFormErrors,
	type JobFormMedia,
	type JobFormMediaItem,
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

const readOnlyValueClassName =
	"min-h-9 break-words rounded-md border bg-muted/30 px-3 py-2 text-muted-foreground text-sm";

const getErrorCode = (error: Error | null): string | undefined =>
	error && "code" in error && typeof error.code === "string"
		? error.code
		: undefined;

const isEditJobLoading = (sessionPending: boolean, jobLoading: boolean) =>
	sessionPending || jobLoading;

const needsLogin = ({
	error,
	isSignedIn,
}: {
	error: Error | null;
	isSignedIn: boolean;
}) => !isSignedIn || getErrorCode(error) === "UNAUTHORIZED";

const getFieldErrorId = (field: keyof JobForm) => `${field}-error`;

interface PostingScope {
	organizationDisplayName: string;
	organizationId: string;
	scopeType: "organization" | "team";
	teamDisplayName: null | string;
	teamId: null | string;
}

const getPostingScopeDisplayName = (scope?: PostingScope) =>
	scope?.teamDisplayName ?? scope?.organizationDisplayName ?? "검증 업체";

const findPostingScope = (postingScopes: PostingScope[], form: JobForm) =>
	postingScopes.find(
		(scope) =>
			scope.organizationId === form.organizationId &&
			(scope.teamId ?? "") === form.teamId
	);

const getScopeOrganizationLabel = (
	scope: PostingScope | undefined,
	organizationId: string
) => scope?.organizationDisplayName ?? organizationId;

const getScopeTeamLabel = (scope: PostingScope | undefined, teamId: string) =>
	scope?.teamDisplayName ?? (teamId || "전체 조직");

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

const getLocalJobMediaPreviewUrl = (item: {
	fileName: string;
	storageKey: string;
	usage: "cover" | "detail";
}): string => {
	const params = new URLSearchParams({
		fileName: item.fileName,
		key: item.storageKey,
		usage: item.usage,
	});

	return `/bambi/local-job-media?${params.toString()}`;
};

const toJobFormMediaItem = (item: {
	altText: string;
	byteSize: number;
	fileName: string;
	mimeType: string;
	storageKey: string;
	usage: "cover" | "detail";
}): JobFormMediaItem => ({
	altText: item.altText,
	byteSize: item.byteSize,
	fileName: item.fileName,
	mimeType: item.mimeType,
	previewUrl: getLocalJobMediaPreviewUrl(item),
	storageKey: item.storageKey,
});

export default function EditEmployerJobPage({
	params,
}: {
	params: Promise<{ id: string }>;
}) {
	const { id } = use(params);
	const router = useRouter();
	const utils = useQueryClient();
	const session = authClient.useSession();
	const isSignedIn = Boolean(session.data?.user);
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
	const jobQuery = useQuery({
		...orpc.bambi.jobs.getEditableById.queryOptions({ input: { id } }),
		enabled: isSignedIn,
	});
	const mineQuery = useQuery({
		...orpc.bambi.onboarding.getMine.queryOptions(),
		enabled: isSignedIn,
	});
	const updateMutation = useMutation(
		orpc.bambi.jobs.update.mutationOptions({
			onError: (error) => {
				const message =
					"공고를 수정하지 못했습니다. 입력값과 공고 수정 권한을 확인해 주세요.";
				setFormError(message);
				toast.error(error.message || message);
			},
			onSuccess: async () => {
				setIsDirty(false);
				toast.success("공고가 수정되었습니다.");
				await utils.invalidateQueries({
					queryKey: orpc.bambi.jobs.listMine.queryKey(),
				});
				await utils.invalidateQueries({
					queryKey: orpc.bambi.jobs.getEditableById.queryKey({ input: { id } }),
				});
				router.push("/employer");
			},
		})
	);
	const createMediaUploadMutation = useMutation(
		orpc.bambi.jobs.createMediaUpload.mutationOptions()
	);
	const job = jobQuery.data;
	const postingScopes = mineQuery.data?.employerJobPostingScopes ?? [];
	const selectedPostingScope = findPostingScope(postingScopes, form);
	const previewCompanyName = getPostingScopeDisplayName(selectedPostingScope);
	const previewPay = formatPreviewPay(form);

	useEffect(() => {
		if (!job) {
			return;
		}

		setForm({
			description: job.description,
			industryCategory: job.industryCategory,
			interviewNotes: job.interviewNotes ?? "",
			organizationId: job.organizationId,
			payAmount: String(job.payAmount),
			payUnit: job.payUnit,
			region: job.region,
			teamId: job.teamId ?? "",
			title: job.title,
			workSchedule: job.workSchedule,
		});
		setDescriptionBlocks(job.descriptionBlocks ?? []);
		setMedia({
			cover: job.media.cover ? toJobFormMediaItem(job.media.cover) : null,
			detail: job.media.detail.map(toJobFormMediaItem),
		});
	}, [job]);

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
			teamScopes: form.teamId
				? [{ organizationId: form.organizationId, teamId: form.teamId }]
				: [],
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
				organizationId: jobInput.organizationId,
				teamId: jobInput.teamId,
			});

			updateMutation.mutate({
				data: {
					...jobInput,
					media: mediaPayload,
				},
				id,
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

	if (isEditJobLoading(session.isPending, jobQuery.isLoading)) {
		return <Loader />;
	}

	if (needsLogin({ error: jobQuery.error, isSignedIn })) {
		return (
			<PageShell
				description="공고 수정은 로그인 후 이용할 수 있습니다."
				title="공고 수정"
			>
				<EmptyState
					action={
						<Link className={buttonVariants()} href="/login">
							로그인
						</Link>
					}
					description="공고를 등록한 구인자 계정으로 로그인해 주세요."
					title="로그인이 필요합니다"
				/>
			</PageShell>
		);
	}

	if (jobQuery.isError && getErrorCode(jobQuery.error) === "NOT_FOUND") {
		return (
			<PageShell
				description="삭제되었거나 수정 권한이 없는 공고입니다."
				title="공고 수정"
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
					description="관리 가능한 공고만 수정할 수 있습니다."
					title="공고를 찾을 수 없습니다"
				/>
			</PageShell>
		);
	}

	if (jobQuery.isError) {
		return (
			<PageShell
				description="공고 수정 정보를 불러오지 못했습니다."
				title="공고 수정"
			>
				<EmptyState
					action={
						<Button onClick={() => jobQuery.refetch()} type="button">
							다시 시도
						</Button>
					}
					description="로그인 상태와 연결 상태를 확인한 뒤 다시 시도해 주세요."
					title="공고 정보를 불러올 수 없습니다"
				/>
			</PageShell>
		);
	}

	if (!job) {
		return (
			<PageShell
				description="삭제되었거나 수정 권한이 없는 공고입니다."
				title="공고 수정"
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
					description="관리 가능한 공고만 수정할 수 있습니다."
					title="공고를 찾을 수 없습니다"
				/>
			</PageShell>
		);
	}

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
			description="소속 조직과 팀은 유지한 채 공개 공고 내용을 수정합니다."
			title="공고 수정"
		>
			<div className="flex flex-col gap-6 xl:flex-row xl:items-start">
				<form
					className="flex min-w-0 flex-1 flex-col gap-6"
					onSubmit={handleSubmit}
					ref={formRef}
				>
					<FormError message={formError} />
					<section
						aria-labelledby="edit-affiliation"
						className="flex flex-col gap-3"
					>
						<div>
							<h2 className="font-semibold text-lg" id="edit-affiliation">
								소속 정보
							</h2>
							<p className="mt-1 text-muted-foreground text-sm">
								이 공고의 소속 조직·팀은 변경할 수 없습니다.
							</p>
						</div>
						<Card>
							<CardContent className="grid gap-4 md:grid-cols-2">
								<div className="flex flex-col gap-2">
									<span className="font-medium text-sm">소속 조직</span>
									<p className={readOnlyValueClassName}>
										{getScopeOrganizationLabel(
											selectedPostingScope,
											form.organizationId
										)}
									</p>
								</div>
								<div className="flex flex-col gap-2">
									<span className="font-medium text-sm">소속 팀</span>
									<p className={readOnlyValueClassName}>
										{getScopeTeamLabel(selectedPostingScope, form.teamId)}
									</p>
								</div>
							</CardContent>
						</Card>
					</section>

					<section
						aria-labelledby="edit-conditions"
						className="flex flex-col gap-3"
					>
						<div>
							<h2 className="font-semibold text-lg" id="edit-conditions">
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
						aria-labelledby="edit-details"
						className="flex flex-col gap-3"
					>
						<div>
							<h2 className="font-semibold text-lg" id="edit-details">
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

					<div className="xl:hidden">{listingPreview}</div>

					{showCancelConfirm ? (
						<div className="flex flex-col gap-3">
							<Alert variant="warning">
								<TriangleAlert />
								<AlertTitle>저장하지 않고 나갈까요?</AlertTitle>
								<AlertDescription>
									수정 중인 내용은 저장되지 않아요.
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
									updateMutation.isPending ||
									createMediaUploadMutation.isPending
								}
								type="submit"
							>
								{updateMutation.isPending || createMediaUploadMutation.isPending
									? "수정 중…"
									: "공고 수정"}
							</Button>
						</div>
					)}
				</form>
				<aside className="hidden w-80 shrink-0 xl:block">
					<div className="sticky top-6 flex flex-col gap-2">
						<p className="font-medium text-muted-foreground text-xs">
							수정 중 실시간 미리보기
						</p>
						{listingPreview}
					</div>
				</aside>
			</div>
		</PageShell>
	);
}
