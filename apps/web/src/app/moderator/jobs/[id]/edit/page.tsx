"use client";

// 밤비 — 운영자 전용 공고 편집. 구인자 편집 폼(apps/web/src/app/employer/jobs/[id]/edit)을
// 그대로 재사용하되, 제출을 jobs.update → moderation.adminUpdateJobPost로 바꿔 조직 멤버십
// 없이 임의 공고를 수정한다. 프리필은 moderation.getJobPostForAdmin(admin 게이트, 멤버십 불요).
// 이미지 신규 업로드는 인텐트가 조직 스코프라 운영자가 못 올린다 → 미디어 업로더는
// allowUpload=false로 기존 이미지 삭제·설명 수정만 허용(신규 업로드는 후속 과제).

import {
	Alert,
	AlertDescription,
	AlertTitle,
} from "@bambi-app/ui/components/alert";
import { Button, buttonVariants } from "@bambi-app/ui/components/button";
import { Card, CardContent } from "@bambi-app/ui/components/card";
import { Checkbox } from "@bambi-app/ui/components/checkbox";
import { Input } from "@bambi-app/ui/components/input";
import { Label } from "@bambi-app/ui/components/label";
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

import { EmptyState } from "@/components/bambi/empty-state";
import {
	FieldError,
	FieldHint,
	FieldLabel,
	FormError,
} from "@/components/bambi/form-message";
import { JobExposureFields } from "@/components/bambi/job-exposure-fields";
import { JobPayFields } from "@/components/bambi/job-pay-fields";
import { JobPostBlockEditor } from "@/components/bambi/job-post-block-editor";
import { JobPostMediaUploader } from "@/components/bambi/job-post-media-uploader";
import { JobRegionFields } from "@/components/bambi/job-region-fields";
import { PageShell } from "@/components/bambi/page-shell";
import Loader from "@/components/loader";
import { useRequiredBannerGate } from "@/hooks/use-required-banner-gate";
import { jobMediaPublicUrl } from "@/lib/bambi/api-job-mapper";
import {
	emptyJobForm,
	emptyJobFormMedia,
	type JobDescriptionBlockFormValue,
	type JobForm,
	type JobFormErrors,
	type JobFormMedia,
	type JobFormMediaItem,
	type JobPaymentMethod,
	resolveJobPostMediaForSubmit,
	toJobAdBannerLayoutForm,
	validateJobForm,
} from "@/lib/bambi-job-form";
import { industryOptions } from "@/lib/bambi-options";
import { orpc } from "@/utils/orpc";

const selectTriggerClassName = "w-full text-sm data-[size=default]:h-9";

const getErrorCode = (error: Error | null): string | undefined =>
	error && "code" in error && typeof error.code === "string"
		? error.code
		: undefined;

const getFieldErrorId = (field: keyof JobForm) => `${field}-error`;

// 운영자는 새 이미지 업로드 인텐트를 못 받는다(조직 멤버십 필수). 미디어 업로더가
// allowUpload=false라 새 파일은 애초에 못 고르지만, 만약 파일 항목이 남아 있으면
// 조용히 실패하지 않도록 여기서 명시적으로 막는다.
const rejectAdminUpload = (): Promise<never> =>
	Promise.reject(new Error("운영자 편집에서는 새 이미지를 올릴 수 없습니다."));

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

// 이미 저장된 이미지의 미리보기는 공개 버킷 URL을 그대로 쓴다(마켓플레이스 표시 경로와 동일).
const toJobFormMediaItem = (item: {
	altText: string;
	byteSize: number;
	fileName: string;
	height?: null | number;
	mimeType: string;
	storageKey: string;
	width?: null | number;
}): JobFormMediaItem => ({
	altText: item.altText,
	byteSize: item.byteSize,
	fileName: item.fileName,
	height: item.height ?? undefined,
	mimeType: item.mimeType,
	previewUrl: jobMediaPublicUrl(item.storageKey),
	storageKey: item.storageKey,
	width: item.width ?? undefined,
});

export default function ModeratorEditJobPage({
	params,
}: {
	params: Promise<{ id: string }>;
}) {
	const { id } = use(params);
	const router = useRouter();
	const utils = useQueryClient();
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
	const jobQuery = useQuery(
		orpc.bambi.moderation.getJobPostForAdmin.queryOptions({
			input: { jobPostId: id },
		})
	);
	const updateMutation = useMutation(
		orpc.bambi.moderation.adminUpdateJobPost.mutationOptions({
			onError: (error) => {
				const fallback = "공고를 수정하지 못했습니다. 입력값을 확인해 주세요.";
				setFormError(error.message || fallback);
				toast.error(error.message || fallback);
			},
			onSuccess: async () => {
				setIsDirty(false);
				toast.success("공고가 수정되었습니다.");
				// 목록(모든 상태 필터)과 이 공고 프리필 캐시를 무효화한다.
				await utils.invalidateQueries({
					queryKey: orpc.bambi.moderation.listJobPosts.queryKey({
						input: { limit: 100 },
					}),
				});
				await utils.invalidateQueries({
					queryKey: orpc.bambi.moderation.getJobPostForAdmin.queryKey({
						input: { jobPostId: id },
					}),
				});
				router.push("/moderator/jobs");
			},
		})
	);
	// 프리미엄 광고는 가로형·세로형 배너 이미지가 모두 있어야 저장할 수 있다.
	const { bannerImagesMissing, requiredBannerUsages } = useRequiredBannerGate({
		adProductId: form.adProductId,
		layout: form.adBannerLayout,
		media,
	});
	const job = jobQuery.data;

	useEffect(() => {
		if (!job) {
			return;
		}

		setForm({
			// 운영자 편집도 입력 전체 교체다. 여기서 프리필을 빠뜨리면 운영자가 공고를
			// 한 번 손대는 것만으로 구인자가 만든 배너 편집물이 통째로 지워진다.
			...toJobAdBannerLayoutForm(job),
			adProductId: job.adProductId ?? null,
			beginnerFriendly: job.beginnerFriendly ?? false,
			description: job.description,
			// 서버가 운영자 편집 경로에서 애드온을 동결하지만, 프리필은 그대로 둔다 —
			// 결제 예정 총액이 구인자 화면과 같은 값으로 보이고, 동결이 풀려도 안전하다.
			detailDesignAmount: job.detailDesignAmount,
			detailDesignRequested: job.detailDesignStatus !== null,
			districtCode: job.districtCode ?? "",
			exposureAmount: job.exposureAmount ?? null,
			exposureDurationDays: job.exposureDurationDays ?? null,
			exposureType: job.exposureType,
			industryCategory: job.industryCategory,
			instantInterview: job.instantInterview ?? false,
			interviewNotes: job.interviewNotes ?? "",
			organizationId: job.organizationId,
			payAmount: String(job.payAmount),
			paymentMethod: job.paymentMethod ?? null,
			payUnit: job.payUnit,
			regionCode: job.regionCode ?? "",
			teamId: job.teamId ?? "",
			title: job.title,
			workSchedule: job.workSchedule,
		});
		setDescriptionBlocks(job.descriptionBlocks ?? []);
		setMedia({
			adHorizontal: job.media.adHorizontal
				? toJobFormMediaItem(job.media.adHorizontal)
				: null,
			adVertical: job.media.adVertical
				? toJobFormMediaItem(job.media.adVertical)
				: null,
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

	const updateFormFlag =
		(field: "beginnerFriendly" | "instantInterview") => (checked: boolean) => {
			setIsDirty(true);
			setForm((currentForm) => ({
				...currentForm,
				[field]: checked,
			}));
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

		router.push("/moderator/jobs");
	};

	const handleLeaveWithoutSaving = () => {
		setIsDirty(false);
		router.push("/moderator/jobs");
	};

	const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
		event.preventDefault();

		const validation = validateJobForm(form, {
			descriptionBlocks,
			media,
			requiredBannerUsages,
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
				createUploadIntent: rejectAdminUpload,
				media: validatedMedia,
				onMediaResolved: setMedia,
				organizationId: jobInput.organizationId,
				teamId: jobInput.teamId,
			});

			updateMutation.mutate({
				data: {
					...jobInput,
					media: mediaPayload,
				},
				jobPostId: id,
			});
		} catch (error) {
			const message =
				error instanceof Error
					? error.message
					: "이미지 처리 중 문제가 발생했습니다.";
			setFormError(message);
			toast.error(message);
		}
	};

	if (jobQuery.isLoading) {
		return <Loader />;
	}

	if (jobQuery.isError && getErrorCode(jobQuery.error) === "NOT_FOUND") {
		return (
			<PageShell
				description="삭제되었거나 존재하지 않는 공고입니다."
				title="공고 수정"
			>
				<EmptyState
					action={
						<Link
							className={buttonVariants({ variant: "outline" })}
							href="/moderator/jobs"
						>
							공고 관리로 이동
						</Link>
					}
					description="공고 관리 목록에서 다시 선택해 주세요."
					title="공고를 찾을 수 없습니다"
				/>
			</PageShell>
		);
	}

	if (jobQuery.isError || !job) {
		return (
			<PageShell
				description="공고 정보를 불러오지 못했습니다."
				title="공고 수정"
			>
				<EmptyState
					action={
						<Button onClick={() => jobQuery.refetch()} type="button">
							다시 시도
						</Button>
					}
					description="연결 상태를 확인한 뒤 다시 시도해 주세요."
					title="공고 정보를 불러올 수 없습니다"
				/>
			</PageShell>
		);
	}

	// 유료 상품에 신용카드(미지원)를 고른 상태면 수정 저장을 막는다. 사유는 결제 섹션 안내가 알린다.
	const cardPaymentBlocked =
		Boolean(form.adProductId) && form.paymentMethod === "card";

	return (
		<PageShell
			description="운영자 권한으로 이 공고의 본문·조건·기존 이미지를 직접 수정합니다. 저장하면 검수를 다시 거치지 않고 바로 반영되며, 소속 조직·팀과 검수 상태·결제 상태·광고 종료일은 그대로 유지됩니다."
			title="공고 수정 (운영자)"
		>
			<form
				className="flex min-w-0 flex-1 flex-col gap-6"
				onSubmit={handleSubmit}
				ref={formRef}
			>
				<FormError message={formError} />

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
							<JobRegionFields
								districtCode={form.districtCode}
								errors={fieldErrors}
								onChange={updateFormValue}
								regionCode={form.regionCode}
							/>
							<JobPayFields
								errors={fieldErrors}
								onChange={updateFormValue}
								payAmount={form.payAmount}
								payUnit={form.payUnit}
							/>
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
							<div className="flex flex-col gap-3 md:col-span-2">
								<Label
									className="flex items-center gap-2 font-medium text-sm"
									htmlFor="beginnerFriendly"
								>
									<Checkbox
										checked={form.beginnerFriendly}
										id="beginnerFriendly"
										onCheckedChange={updateFormFlag("beginnerFriendly")}
									/>
									초보 가능
								</Label>
								<Label
									className="flex items-center gap-2 font-medium text-sm"
									htmlFor="instantInterview"
								>
									<Checkbox
										checked={form.instantInterview}
										id="instantInterview"
										onCheckedChange={updateFormFlag("instantInterview")}
									/>
									당일면접 가능
								</Label>
							</div>
						</CardContent>
					</Card>
				</section>

				<section aria-labelledby="edit-details" className="flex flex-col gap-3">
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
					adBannerLayout={form.adBannerLayout}
					adProductId={form.adProductId}
					allowUpload={false}
					error={fieldErrors.media}
					media={media}
					onAdBannerChange={({ layout, media: nextMedia }) => {
						setIsDirty(true);
						setForm((currentForm) => ({
							...currentForm,
							adBannerLayout: layout,
						}));
						// 운영자 편집은 편집기 진입이 없지만(구인자 게이트) 배선은 세 화면이 같아야
						// 한다 — 입력 전체를 교체하는 저장이라 한 곳만 빠져도 배너가 사라진다.
						setMedia(nextMedia);
						setFieldErrors((currentErrors) => ({
							...currentErrors,
							media: undefined,
						}));
						setFormError(null);
					}}
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

				{/* onDetailDesignChange를 넘기지 않아 애드온이 읽기 전용이다 — 운영자 편집은
				    서버가 애드온을 동결하므로, 켜고 끄는 컨트롤을 내주면 저장해도 아무 일이
				    없는 거짓 UI가 된다. 신청 상태 변경은 결제·디자인 관리 화면의 몫. */}
				<JobExposureFields
					adProductId={form.adProductId}
					detailDesignAmount={form.detailDesignAmount}
					detailDesignRequested={form.detailDesignRequested}
					detailDesignStatus={job.detailDesignStatus}
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
					<div className="flex flex-col gap-3">
						{bannerImagesMissing ? (
							<Alert variant="warning">
								<TriangleAlert />
								<AlertTitle>배너 이미지를 모두 등록해 주세요</AlertTitle>
								<AlertDescription>
									프리미엄 광고는 가로형·세로형 광고 배너 이미지를 모두 등록해야
									저장할 수 있습니다. 운영자 편집에서는 새 배너를 올릴 수
									없으니, 배너 교체가 필요하면 구인자에게 요청해 주세요.
								</AlertDescription>
							</Alert>
						) : null}
						<div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
							<Button onClick={handleCancel} type="button" variant="outline">
								취소
							</Button>
							<Button
								disabled={
									updateMutation.isPending ||
									cardPaymentBlocked ||
									bannerImagesMissing
								}
								type="submit"
							>
								{updateMutation.isPending ? "수정 중…" : "공고 수정"}
							</Button>
						</div>
					</div>
				)}
			</form>
		</PageShell>
	);
}
