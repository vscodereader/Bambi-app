"use client";

import { sumJobPaymentAmount } from "@bambi-app/api/services/bambi-job-detail-design";

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

import { AdPriceChangeDialog } from "@/components/bambi/ad-price-change-dialog";
import { EmployerListingPreview } from "@/components/bambi/employer-listing-preview";
import { EmptyState } from "@/components/bambi/empty-state";
import {
	FieldError,
	FieldHint,
	FieldLabel,
	FormError,
} from "@/components/bambi/form-message";
import {
	getBoostPurchaseStates,
	getNewBoostOptionTypes,
	type JobBoostPurchaseSummary,
	JobExposureFields,
	sumBoostOptionPrices,
} from "@/components/bambi/job-exposure-fields";
import { JobPayFields } from "@/components/bambi/job-pay-fields";
import { JobPostBlockEditor } from "@/components/bambi/job-post-block-editor";
import { JobPostMediaUploader } from "@/components/bambi/job-post-media-uploader";
import { JobRegionFields } from "@/components/bambi/job-region-fields";
import { PageShell } from "@/components/bambi/page-shell";
import Loader from "@/components/loader";
import { useRequiredBannerGate } from "@/hooks/use-required-banner-gate";
import { useUnsavedChangesWarning } from "@/hooks/use-unsaved-changes-warning";
import { authClient } from "@/lib/auth-client";
import { jobMediaPublicUrl } from "@/lib/bambi/api-job-mapper";
import type { JobBoostOptionTypeKey } from "@/lib/bambi/boost-options";
import { regionLabel, useRegions } from "@/lib/bambi/regions";
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
import {
	industryOptions,
	NEGOTIABLE_PAY_TEXT,
	NEGOTIABLE_PAY_UNIT,
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
	if (payUnit === NEGOTIABLE_PAY_UNIT) {
		return NEGOTIABLE_PAY_TEXT;
	}

	const numericPay = Number(payAmount);

	return Number.isFinite(numericPay) && numericPay > 0
		? `${payUnit} ${numericPay.toLocaleString("ko-KR")}원`
		: "";
};

// 검수 축 안내. 반려 사유는 이 화면이 유일한 표시 자리이고(목록은 요약만 보여준다), 게시 중인
// 공고는 저장하면 서버가 무조건 pending_review로 되돌리므로(getUpdatedJobPostStatus) 제출 전에
// 노출이 끊긴다는 사실을 알려야 한다.
function ReviewStatusNotice({
	job,
}: {
	// 로딩 중에는 undefined다. 호출부에서 풀면 페이지 함수의 분기만 늘어난다.
	job?: { rejectionReason: null | string; status: string };
}) {
	const rejectionReason = job?.rejectionReason;

	if (job?.status === "rejected") {
		return (
			<Alert variant="destructive">
				<TriangleAlert />
				<AlertTitle>검수에서 반려된 공고입니다</AlertTitle>
				<AlertDescription className="text-pretty">
					{rejectionReason
						? `반려 사유: ${rejectionReason}`
						: "운영자가 사유를 남기지 않았습니다."}{" "}
					수정 후 제출하면 재검수를 거쳐 다시 게시됩니다.
				</AlertDescription>
			</Alert>
		);
	}

	if (job?.status === "published") {
		return (
			<Alert variant="warning">
				<TriangleAlert />
				<AlertTitle>수정하면 재검수 동안 노출이 중단됩니다</AlertTitle>
				<AlertDescription className="text-pretty">
					게시 중인 공고를 수정하면 검수 대기 상태로 돌아가, 운영자가 다시
					승인할 때까지 공고와 광고가 노출되지 않습니다.
				</AlertDescription>
			</Alert>
		);
	}

	return null;
}

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
// width/height는 배너 비율 검증에 쓰이며, 컬럼 추가 전에 저장된 행에는 없을 수 있다.
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

// 무통장입금을 골랐는데 운영자 입금 계좌가 0개면 저장을 막는다(card와 대칭).
function isBankTransferBlocked(
	paymentMethod: string | null | undefined,
	accountCount: number | undefined
): boolean {
	return paymentMethod === "bank_transfer" && (accountCount ?? 0) === 0;
}

// 실제 결제가 걸리는 결제수단: 유료 공고면 공고 결제수단, 무료 공고면 새로 결제되는
// 끌어올리기 옵션이 있을 때의 옵션 결제수단(서버 syncBoostPurchases·validateJobForm과 같은 축).
// 결제할 게 없으면 null.
function resolveActivePaymentMethod(
	form: JobForm,
	newBoostOptionTypes: JobBoostOptionTypeKey[]
): JobPaymentMethod | null {
	if (form.adProductId) {
		return form.paymentMethod;
	}

	return newBoostOptionTypes.length > 0
		? (form.boostOptionPaymentMethod ?? null)
		: null;
}

// 수정 폼이 체크 상태로 되돌릴 옵션 유형 = 기존 구매가 있는 유형(입금 대기 또는 적용 중).
// 만료된 기간제·소진된 횟수권은 상태 맵에 안 들어와 언체크로 시작한다 — 체크로 남기면
// 저장할 때 서버가 재구매로 보고 새 유료 구매를 만든다.
const toCheckedBoostOptionTypes = (
	purchases: JobBoostPurchaseSummary[] | undefined,
	now: Date
): JobBoostOptionTypeKey[] =>
	Array.from(getBoostPurchaseStates(purchases, now).keys());

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: 기존 공고 편집 폼의 상태 전이와 결제 검증을 한 제출 경계에서 관리한다.
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
	const [priceConflictMessage, setPriceConflictMessage] = useState<
		null | string
	>(null);
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
			onError: async (error) => {
				if (getErrorCode(error) === "CONFLICT") {
					await utils.invalidateQueries({
						queryKey: orpc.bambi.adProducts.getCatalog.queryKey(),
					});
					await utils.refetchQueries({
						queryKey: orpc.bambi.adProducts.getCatalog.queryKey(),
					});
					setPriceConflictMessage(error.message);
					return;
				}

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
	// 훅은 조건부 early-return보다 위에서 호출해야 하므로 계좌 쿼리는 여기 둔다(플래그는 아래에서 계산).
	const paymentAccountsQuery = useQuery(
		orpc.bambi.siteSettings.getPaymentAccounts.queryOptions()
	);
	// 프리미엄 광고는 가로형·세로형 배너 이미지가 모두 있어야 저장할 수 있다.
	const { bannerImagesMissing, requiredBannerUsages } = useRequiredBannerGate({
		adProductId: form.adProductId,
		layout: form.adBannerLayout,
		media,
	});
	const job = jobQuery.data;
	const boostOptionsQuery = useQuery(
		orpc.bambi.boostOptions.listOptions.queryOptions()
	);
	const existingRegistrationBoostAmount = (job?.boostPurchases ?? [])
		.filter((purchase) => purchase.purchaseSource === "job_registration")
		.reduce((sum, purchase) => sum + purchase.amount, 0);
	const existingTypes = new Set(
		(job?.boostPurchases ?? []).map((purchase) => purchase.optionType)
	);
	const addedBoostTypes = (form.boostOptionTypes ?? []).filter(
		(type) => !existingTypes.has(type)
	);
	const editedGrossAmount =
		(sumJobPaymentAmount(form.exposureAmount, form.detailDesignAmount) ?? 0) +
		existingRegistrationBoostAmount +
		sumBoostOptionPrices(boostOptionsQuery.data, addedBoostTypes);
	const pointsExceedEditedTotal = (job?.pointsUsed ?? 0) > editedGrossAmount;
	const postingScopes = mineQuery.data?.employerJobPostingScopes ?? [];
	const selectedPostingScope = findPostingScope(postingScopes, form);
	const previewCompanyName = getPostingScopeDisplayName(selectedPostingScope);
	const previewPay = formatPreviewPay(form);
	// 폼은 지역 코드를 들고 있어 미리보기에 그대로 쓸 수 없다. 마스터에서 표시 라벨을 되짚는다.
	const { regions } = useRegions();
	const previewRegionLabel = regionLabel(regions, form.regionCode);

	useEffect(() => {
		if (!job) {
			return;
		}

		setForm({
			// 저장은 입력 전체를 교체하므로 배너 레이아웃도 반드시 되돌려 보내야 한다.
			// 프리필을 빠뜨리면 구인자가 다른 항목만 고쳐도 배너 편집물이 지워진다.
			...toJobAdBannerLayoutForm(job),
			adProductId: job.adProductId ?? null,
			beginnerFriendly: job.beginnerFriendly ?? false,
			// 기존 구매의 결제수단은 조회에 없다. 새 옵션을 추가할 때만 다시 고르면 된다
			// (유지만 하는 저장은 새 결제가 없어 검증도 요구하지 않는다).
			boostOptionPaymentMethod: null,
			boostOptionTypes: toCheckedBoostOptionTypes(
				job.boostPurchases,
				new Date()
			),
			description: job.description,
			// 애드온도 프리필해야 한다 — 빠뜨리면 기본값(신청 안 함)이 저장되어 구인자가
			// 신청해 둔 디자인 제작이 다른 항목만 고쳐도 조용히 해제된다.
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
				| "boostOptionPaymentMethod"
				| "boostOptionTypes"
				| "detailDesignAmount"
				| "detailDesignRequested"
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
			boostOptionPaymentMethod: undefined,
			exposureDurationDays: undefined,
			exposureType: undefined,
			paymentMethod: undefined,
		}));
		setFormError(null);
	};

	const handleProductChange = (productId: string | null) => {
		// 옵션 가격은 상품마다 다르므로 상품을 바꾸면 애드온 상태도 같이 내려놓는다
		// (유지하면 낡은 가격 스냅샷이 남아 서버가 CONFLICT를 던진다).
		updateExposureFields(
			productId
				? {
						adProductId: productId,
						detailDesignAmount: null,
						detailDesignRequested: false,
						exposureAmount: null,
						exposureDurationDays: null,
					}
				: {
						adProductId: null,
						detailDesignAmount: null,
						detailDesignRequested: false,
						exposureAmount: null,
						exposureDurationDays: null,
						exposureType: "standard",
						paymentMethod: null,
					}
		);
	};

	const handleDetailDesignChange = (
		requested: boolean,
		amount: number | null
	) => {
		updateExposureFields({
			detailDesignAmount: amount,
			detailDesignRequested: requested,
		});
	};

	const handlePaymentMethodChange = (value: JobPaymentMethod) => {
		updateExposureFields({ paymentMethod: value });
	};

	const handleBoostOptionTypesChange = (types: JobBoostOptionTypeKey[]) => {
		updateExposureFields({ boostOptionTypes: types });
	};

	const handleBoostOptionPaymentMethodChange = (value: JobPaymentMethod) => {
		updateExposureFields({ boostOptionPaymentMethod: value });
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
			// 이미 입금 대기·적용 중인 유형은 다시 결제되지 않는다 — 유지만 하는 저장에서
			// 옵션 결제수단을 다시 고르라고 막지 않게 알려 준다.
			existingBoostOptionTypes: toCheckedBoostOptionTypes(
				job?.boostPurchases,
				new Date()
			),
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
				createUploadIntent: createMediaUploadMutation.mutateAsync,
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
						<Link className={buttonVariants()} href="/seeker?auth=login">
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

	// 신용카드(미지원)를 고른 상태면 수정 저장을 막는다. 사유는 결제 섹션 안내가 알린다.
	const activePaymentMethod = resolveActivePaymentMethod(
		form,
		getNewBoostOptionTypes(
			form.boostOptionTypes,
			job.boostPurchases,
			new Date()
		)
	);
	const cardPaymentBlocked = activePaymentMethod === "card";
	const bankTransferBlocked = isBankTransferBlocked(
		activePaymentMethod,
		paymentAccountsQuery.data?.length
	);

	const listingPreview = (
		<EmployerListingPreview
			companyName={previewCompanyName}
			coverImageUrl={media.cover?.previewUrl}
			location={previewRegionLabel}
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
					noValidate
					onSubmit={handleSubmit}
					ref={formRef}
				>
					<FormError message={formError} />
					<ReviewStatusNotice job={job} />
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
						adBannerLayout={form.adBannerLayout}
						adProductId={form.adProductId}
						error={fieldErrors.media}
						media={media}
						onAdBannerChange={({ layout, media: nextMedia }) => {
							setIsDirty(true);
							setForm((currentForm) => ({
								...currentForm,
								adBannerLayout: layout,
							}));
							// 배너 이미지도 함께 돌아온다. 폼 media에 반영해야 필수 배너 검증과
							// 제출 시 업로드가 기존 경로 그대로 동작한다.
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

					<JobExposureFields
						adProductId={form.adProductId}
						boostOptionPaymentMethod={form.boostOptionPaymentMethod}
						boostOptionTypes={form.boostOptionTypes}
						boostPurchases={job.boostPurchases}
						detailDesignAmount={form.detailDesignAmount}
						detailDesignRequested={form.detailDesignRequested}
						detailDesignStatus={job.detailDesignStatus}
						errors={{
							boostOptionPaymentMethod: fieldErrors.boostOptionPaymentMethod,
							exposureDurationDays: fieldErrors.exposureDurationDays,
							exposureType: fieldErrors.exposureType,
							paymentMethod: fieldErrors.paymentMethod,
						}}
						exposureAmount={form.exposureAmount}
						exposureDurationDays={form.exposureDurationDays}
						onBoostOptionPaymentMethodChange={
							handleBoostOptionPaymentMethodChange
						}
						onBoostOptionTypesChange={handleBoostOptionTypesChange}
						onDetailDesignChange={handleDetailDesignChange}
						onDurationChange={handleDurationChange}
						onPaymentMethodChange={handlePaymentMethodChange}
						onProductChange={handleProductChange}
						paymentMethod={form.paymentMethod}
					/>
					{pointsExceedEditedTotal ? (
						<Alert variant="destructive">
							<TriangleAlert />
							<AlertTitle>결제금액보다 사용 포인트가 큽니다</AlertTitle>
							<AlertDescription>
								변경된 결제금액이 이미 사용한 포인트보다 적습니다. 공고를
								취소하여 포인트를 환급받은 뒤 다시 등록해 주세요.
							</AlertDescription>
						</Alert>
					) : null}
					{(job?.pointsUsed ?? 0) > 0 && !pointsExceedEditedTotal ? (
						<Alert>
							<AlertTitle>등록 시 사용한 포인트는 유지됩니다</AlertTitle>
							<AlertDescription>
								사용 포인트 {(job?.pointsUsed ?? 0).toLocaleString("ko-KR")}P ·
								변경 후 최종 입금액{" "}
								{Math.max(
									0,
									editedGrossAmount - (job?.pointsUsed ?? 0)
								).toLocaleString("ko-KR")}
								원입니다. 수정 화면에서는 포인트를 추가로 사용할 수 없습니다.
							</AlertDescription>
						</Alert>
					) : null}

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
						<div className="flex flex-col gap-3">
							{bannerImagesMissing ? (
								<Alert variant="warning">
									<TriangleAlert />
									<AlertTitle>배너 이미지를 모두 등록해 주세요</AlertTitle>
									<AlertDescription>
										프리미엄 광고는 가로형·세로형 광고 배너 이미지를 모두
										등록해야 저장할 수 있습니다.
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
										createMediaUploadMutation.isPending ||
										cardPaymentBlocked ||
										bankTransferBlocked ||
										bannerImagesMissing ||
										pointsExceedEditedTotal
									}
									type="submit"
								>
									{updateMutation.isPending ||
									createMediaUploadMutation.isPending
										? "수정 중…"
										: "공고 수정"}
								</Button>
							</div>
						</div>
					)}
				</form>
				<aside className="hidden w-80 shrink-0 xl:sticky xl:top-24 xl:block">
					<div className="flex flex-col gap-2">
						<p className="font-medium text-muted-foreground text-xs">
							수정 중 실시간 미리보기
						</p>
						{listingPreview}
					</div>
				</aside>
			</div>
			<AdPriceChangeDialog
				message={priceConflictMessage}
				onCancel={() => setPriceConflictMessage(null)}
				onConfirm={() => {
					setPriceConflictMessage(null);
					formRef.current?.requestSubmit();
				}}
			/>
		</PageShell>
	);
}
