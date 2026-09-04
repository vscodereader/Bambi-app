import {
	type JobDescriptionBlock,
	normalizeJobDescriptionBlocks,
} from "@bambi-app/api/services/bambi-job-description-blocks";
import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import {
	Alert,
	Button,
	Description,
	FieldError,
	Input,
	Label,
	Surface,
	Switch,
	TextField,
	useThemeColor,
} from "heroui-native";
import {
	type Dispatch,
	type ReactNode,
	type SetStateAction,
	useEffect,
	useMemo,
	useState,
} from "react";
import { Modal, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { BambiScreen } from "@/src/components/bambi-screen";
import { FieldSelect } from "@/src/components/field-select";
import { JobBannerPickerSection } from "@/src/components/job-banner-picker-section";
import { JobDescriptionBlockEditor } from "@/src/components/job-description-block-editor";
import {
	JobExposureSection,
	type NativeExposureState,
} from "@/src/components/job-exposure-section";
import { JobImagePickerSection } from "@/src/components/job-image-picker-section";
import { JobListCard } from "@/src/components/job-list-card";
import {
	adPreviewTemplateToSectionKey,
	describeJobForScreenReader,
	emptyNativeJobForm,
	industryOptions,
	type NativeJobForm,
	type NativeJobFormErrors,
	type NativeJobPostInput,
	type NativeSeekerJob,
	NEGOTIABLE_PAY_UNIT,
	payUnitOptions,
	validateNativeJobForm,
} from "@/src/lib/bambi-native";
import {
	getMissingBannerUsages,
	getRequiredBannerUsages,
	type JobAdBannerUsage,
	REQUIRED_BANNER_ERROR,
} from "@/src/lib/employer/ad-exposure";
import { jobDescriptionBlocksError } from "@/src/lib/employer/job-description-blocks";
import type { JobMediaUploadItem } from "@/src/lib/employer/job-media";
import { orpc } from "@/src/lib/orpc";

interface PostingScope {
	organizationDisplayName: string;
	organizationId: string;
	scopeType: "organization" | "team";
	teamDisplayName: null | string;
	teamId: null | string;
}

interface NativeJobFormProps {
	// 노출 상품·결제·필수 배너 게이트를 그릴지. 새 공고(등록) 화면만 켠다 — 수정 화면은 서버가
	// 광고 변경을 다루지 않아 기존 배너를 그대로 패스스루하므로 노출 섹션을 띄우지 않는다.
	exposureEnabled?: boolean;
	initialBeginnerFriendly?: boolean;
	initialBlocks?: JobDescriptionBlock[];
	initialCover?: JobMediaUploadItem | null;
	initialDetail?: JobMediaUploadItem[];
	initialInstantInterview?: boolean;
	// 원격(수정 프리필) 미디어의 storageKey→미리보기 URL. 없으면 파일명으로 폴백한다.
	initialPreviews?: Record<string, string>;
	initialValue?: NativeJobForm;
	isSubmitting: boolean;
	// 폼 위에 붙는 한 줄 안내(검수 규칙 등). 화면 제목은 네이티브 헤더가 이미 달고 있어
	// 여기서 다시 제목을 그리지 않는다.
	notice?: string;
	onSubmit: (input: NativeJobPostInput) => void;
	postingScopes: PostingScope[];
	// 수정 화면은 등록 범위(조직·팀) 변경을 막는다 — 서버 update가 조직 변경을 FORBIDDEN으로
	// 거절하고, web도 수정 시 범위를 읽기 전용으로 보여준다.
	scopeLocked?: boolean;
	submitLabel: string;
}

interface Choice<TValue extends string> {
	label: string;
	value: TValue;
}

// 라벨과 값이 같은 고정 목록(업종·급여 단위)용. 지역만 서버 마스터라 코드≠라벨이다.
const toChoices = <TValue extends string>(
	values: readonly TValue[]
): Choice<TValue>[] => values.map((value) => ({ label: value, value }));

const getPostingScopeValue = (scope: PostingScope): string =>
	JSON.stringify([scope.organizationId, scope.teamId]);

const getPostingScopeLabel = (scope: PostingScope): string => {
	if (scope.scopeType === "organization") {
		return `${scope.organizationDisplayName} / 전체 조직`;
	}

	return `${scope.organizationDisplayName} / ${scope.teamDisplayName ?? scope.teamId}`;
};

const toInitialForm = (value?: NativeJobForm): NativeJobForm => ({
	...emptyNativeJobForm,
	...value,
});

// 미리보기 카드 지역 표기. 세부지역까지 골랐으면 "서울 · 강남구"로, 아니면 시/도만.
const formatRegionDisplay = (
	regionLabel: string,
	districtLabel: string | undefined
): string =>
	districtLabel ? `${regionLabel} · ${districtLabel}` : regionLabel;

// 노출 선택에 따른 제출 조각(미디어 배너 + 결제·노출 필드)을 만든다. 유료면 배너를 media에
// 병합하고 결제 필드를 싣고, 무료면 미디어만 그대로 둔다. 본문 handleSubmit의 분기를 줄인다.
const buildExposureSubmission = (
	exposure: NativeExposureState,
	banners: JobBannerMedia,
	baseMedia: { cover?: JobMediaUploadItem; detail: JobMediaUploadItem[] }
): Partial<NativeJobPostInput> => {
	const { selection } = exposure;

	if (!selection) {
		return { media: baseMedia };
	}

	return {
		adProductId: selection.adProductId,
		exposureAmount: selection.amount,
		exposureDurationDays: selection.durationDays,
		// media는 서버에서 전량 교체다 — 배너를 함께 실어야 서버가 배너 행을 지우지 않는다.
		media: {
			...baseMedia,
			adHorizontal: banners.adHorizontal,
			adVertical: banners.adVertical,
		},
		paymentMethod: "bank_transfer",
		pointsToUse: exposure.pointsToUse,
	};
};

// 유료 상품을 골랐는데 필수 배너가 비어 있는지. 무료·리스팅 상품은 requiredUsages가 비어
// 언제나 false다 — 제출 게이트가 이 값으로 배너 미충족 등록을 막는다.
const hasMissingRequiredBanners = (
	exposure: NativeExposureState,
	banners: JobBannerMedia,
	requiredUsages: readonly JobAdBannerUsage[]
): boolean =>
	Boolean(exposure.selection) &&
	getMissingBannerUsages(banners, requiredUsages).length > 0;

interface JobBannerMedia {
	adHorizontal?: JobMediaUploadItem;
	adVertical?: JobMediaUploadItem;
}

// 노출 상품·결제 섹션. 본체 폼에서 떼어 내 렌더 분기를 폼 본문 밖으로 옮겼다(본체 인지
// 복잡도 상한). 배너 픽커는 노출 섹션 안(bannerSlot)에 끼워, 상품을 고른 뒤 그 상품이
// 요구하는 배너만 이어서 올리게 한다. 이미지 섹션과 같은 규칙으로 organizationId가 있어야만
// 배너 슬롯을 넘긴다(업로드 키가 조직 단위라서다).
function ExposureFields({
	bannerError,
	banners,
	exposure,
	organizationId,
	requiredUsages,
	setBannerError,
	setBanners,
	setExposure,
	teamId,
}: {
	bannerError: null | string;
	banners: JobBannerMedia;
	exposure: NativeExposureState;
	organizationId: string;
	requiredUsages: readonly JobAdBannerUsage[];
	setBannerError: Dispatch<SetStateAction<null | string>>;
	setBanners: Dispatch<SetStateAction<JobBannerMedia>>;
	setExposure: Dispatch<SetStateAction<NativeExposureState>>;
	teamId: null | string;
}) {
	return (
		<JobExposureSection
			bannerSlot={
				organizationId ? (
					<JobBannerPickerSection
						key={organizationId}
						media={banners}
						onChange={(next) => {
							setBanners(next);
							setBannerError(null);
						}}
						organizationId={organizationId}
						requiredUsages={requiredUsages}
						teamId={teamId}
					/>
				) : undefined
			}
			errorMessage={bannerError ?? undefined}
			onChange={(next) => {
				setExposure(next);
				// 상품을 바꾸면 이전 게이트 메시지는 더 이상 유효하지 않다.
				setBannerError(null);
			}}
			value={exposure}
		/>
	);
}

// 2단계 화면 — 노출 상품·결제. 전체화면 Modal이라 1단계(BambiScreen)는 그 뒤에 그대로 마운트돼
// 있어 "이전"으로 돌아오면 스크롤·입력이 손대지지 않은 채 남는다. 여기서만 실제 등록이 일어난다.
// 폼 본문에서 이 JSX를 떼어 내 본체 인지 복잡도를 상한 아래로 낮춘다.
function ExposureStep({
	exposureFields,
	formMessage,
	isSubmitting,
	onBack,
	onRegister,
	visible,
}: {
	exposureFields: ReactNode;
	formMessage: null | string;
	isSubmitting: boolean;
	onBack: () => void;
	onRegister: () => void;
	visible: boolean;
}) {
	const insets = useSafeAreaInsets();
	const foregroundColor = useThemeColor("foreground");

	return (
		<Modal
			animationType="slide"
			onRequestClose={onBack}
			presentationStyle="fullScreen"
			visible={visible}
		>
			<View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
				<View className="h-14 flex-row items-center gap-2 border-border border-b px-4">
					<Pressable
						accessibilityLabel="이전 단계로"
						accessibilityRole="button"
						className="h-11 flex-row items-center gap-1 rounded-2xl pr-2 active:opacity-75"
						hitSlop={8}
						onPress={onBack}
					>
						<Ionicons color={foregroundColor} name="chevron-back" size={24} />
						<Text className="text-base text-foreground">이전</Text>
					</Pressable>
					<Text className="font-bold text-foreground text-lg">
						노출 상품·결제
					</Text>
				</View>

				<ScrollView
					className="flex-1"
					contentContainerClassName="gap-5 p-4"
					contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
					keyboardShouldPersistTaps="handled"
				>
					{exposureFields}
				</ScrollView>

				<View
					className="gap-2 border-border border-t px-4 pt-3"
					style={{ paddingBottom: insets.bottom + 12 }}
				>
					{/* 필수 배너 누락 등 등록 차단 사유는 CTA 바로 위에 둔다 — 배너 슬롯은 스크롤
					    위쪽이라 여기서 다시 짚어야 눌러도 안 되는 이유가 보인다. */}
					{formMessage ? (
						<Text className="text-danger text-sm" selectable>
							{formMessage}
						</Text>
					) : null}
					<Button isDisabled={isSubmitting} onPress={onRegister}>
						<Button.Label>
							{isSubmitting ? "저장 중" : "공고 등록하기"}
						</Button.Label>
					</Button>
				</View>
			</View>
		</Modal>
	);
}

export function NativeJobFormScreen({
	exposureEnabled = false,
	initialBeginnerFriendly,
	initialBlocks,
	initialCover,
	initialDetail,
	initialInstantInterview,
	initialPreviews,
	initialValue,
	isSubmitting,
	notice,
	onSubmit,
	postingScopes,
	scopeLocked = false,
	submitLabel,
}: NativeJobFormProps) {
	const [form, setForm] = useState<NativeJobForm>(() =>
		toInitialForm(initialValue)
	);
	const [errors, setErrors] = useState<NativeJobFormErrors>({});
	const [formMessage, setFormMessage] = useState<null | string>(null);
	const [beginnerFriendly, setBeginnerFriendly] = useState(
		initialBeginnerFriendly ?? false
	);
	const [instantInterview, setInstantInterview] = useState(
		initialInstantInterview ?? false
	);
	const [blocks, setBlocks] = useState<JobDescriptionBlock[]>(
		initialBlocks ?? []
	);
	const [blocksError, setBlocksError] = useState<null | string>(null);
	const [cover, setCover] = useState<JobMediaUploadItem | null>(
		initialCover ?? null
	);
	// 표시 전용 대표 이미지 uri. 수정 화면은 원격 프리필 맵에서, 새 픽은 picker가 넘겨준다.
	const [coverPreviewUri, setCoverPreviewUri] = useState<null | string>(
		() =>
			(initialCover?.storageKey
				? initialPreviews?.[initialCover.storageKey]
				: null) ?? null
	);
	const [detail, setDetail] = useState<JobMediaUploadItem[]>(
		initialDetail ?? []
	);
	// 노출 상품·결제 선택. 무료(selection null)가 기본이고 결제는 무통장입금만 가능하다.
	const [exposure, setExposure] = useState<NativeExposureState>({
		paymentMethod: "bank_transfer",
		pointsToUse: 0,
		selection: null,
	});
	// 프리미엄·사이드 상품이 요구하는 광고 배너 이미지. 새 픽만 담기므로 조직 변경 시 비운다.
	const [banners, setBanners] = useState<JobBannerMedia>({});
	// 필수 배너 미충족 게이트 메시지. 노출 섹션과 폼 하단 고정 바에 함께 띄운다.
	const [bannerError, setBannerError] = useState<null | string>(null);
	// 2단계(노출 상품·결제) 화면 열림 여부. exposureEnabled인 등록 화면에서만 "다음"으로 연다.
	// 전체화면 Modal이라 1단계(BambiScreen)는 그 뒤에 그대로 마운트돼 있어 되돌아오면 스크롤·
	// 입력값이 손대지 않은 채 살아 있다(값 자체는 어차피 이 컴포넌트 state라 항상 보존된다).
	const [exposureOpen, setExposureOpen] = useState(false);
	// 선택 상품이 요구하는 배너 슬롯. 리스팅·무료면 빈 배열이라 배너 픽커가 스스로 숨는다.
	const requiredBannerUsages = useMemo(
		() => getRequiredBannerUsages(exposure.selection?.previewTemplate),
		[exposure.selection?.previewTemplate]
	);
	// 지역은 서버 마스터가 유일한 출처다 — 코드를 그대로 제출해야 저장 직전 정합 검사를 통과한다.
	const regionsQuery = useQuery(orpc.bambi.regions.list.queryOptions());
	const regionChoices = useMemo(
		() =>
			(regionsQuery.data ?? []).map((node) => ({
				label: node.label,
				value: node.code,
			})),
		[regionsQuery.data]
	);
	// 세부지역 옵션은 고른 시/도의 districts에서만 나온다 — 다른 시/도의 코드가 섞이면 서버
	// 정합 검사에서 터지므로, 지역을 바꿀 때 districtCode를 함께 비운다(handleRegionChange).
	const districtChoices = useMemo(() => {
		const node = (regionsQuery.data ?? []).find(
			(candidate) => candidate.code === form.regionCode
		);

		return (node?.districts ?? []).map((district) => ({
			label: district.name,
			value: district.code,
		}));
	}, [regionsQuery.data, form.regionCode]);
	const selectedDistrictLabel = districtChoices.find(
		(choice) => choice.value === form.districtCode
	)?.label;
	const postingScopeOptions = useMemo(
		() =>
			postingScopes.map((scope) => ({
				label: getPostingScopeLabel(scope),
				scope,
				value: getPostingScopeValue(scope),
			})),
		[postingScopes]
	);
	const selectedScopeValue = getPostingScopeValue({
		organizationDisplayName: "",
		organizationId: form.organizationId,
		scopeType: form.teamId ? "team" : "organization",
		teamDisplayName: null,
		teamId: form.teamId || null,
	});
	const selectedScopeOption = postingScopeOptions.find(
		(option) => option.value === selectedScopeValue
	);
	// 고를 것이 하나뿐인 범위. 이 경우 선택을 강요하면 그 아래 이미지 섹션이 계속 잠겨 있다.
	const onlyScope = useMemo(
		() => (postingScopes.length === 1 ? (postingScopes[0] ?? null) : null),
		[postingScopes]
	);
	// 협의는 서버가 금액을 저장하지 않는다(validateNativeJobForm이 payAmount를 null로 만든다).
	const isPayNegotiable = form.payUnit === NEGOTIABLE_PAY_UNIT;

	// 목록 노출 미리보기용 가짜 공고 한 줄. 구직자 목록이 쓰는 JobListCard를 그대로 먹여야
	// "실제로 이렇게 보인다"가 성립하므로, 아직 없는 값만 자리표시 문구로 채운다. 커버는
	// 아직 업로드 전이라 storageKey가 없다 — 고른 파일의 로컬 uri를 coverImageUrl 자리에
	// 넣으면 카드가 그대로 그린다(수집 공고와 같은 경로).
	const previewJob = useMemo<NativeSeekerJob>(() => {
		const payAmount = Number.parseInt(
			form.payAmount.replace(/[^0-9]/gu, ""),
			10
		);

		return {
			adPeriod: null,
			coverImageUrl: coverPreviewUri,
			employerDisplayName:
				postingScopes.find(
					(scope) => scope.organizationId === form.organizationId
				)?.organizationDisplayName ?? "내 업소",
			employerVerificationStatus: null,
			id: "preview",
			industryCategory: form.industryCategory,
			instantInterview,
			payAmount: isPayNegotiable || Number.isNaN(payAmount) ? null : payAmount,
			payUnit: isPayNegotiable ? null : form.payUnit || null,
			promotionLabel: null,
			// 세부지역을 골랐으면 "서울 · 강남구"처럼 함께 보여 실제 목록 표기에 가깝게 한다.
			region: formatRegionDisplay(
				regionChoices.find((choice) => choice.value === form.regionCode)
					?.label ?? "지역",
				selectedDistrictLabel
			),
			source: "original",
			title: form.title.trim() || "공고 제목",
			workSchedule: form.workSchedule.trim() || null,
		};
	}, [
		coverPreviewUri,
		form.industryCategory,
		form.organizationId,
		form.payAmount,
		form.payUnit,
		form.regionCode,
		form.title,
		form.workSchedule,
		instantInterview,
		isPayNegotiable,
		postingScopes,
		regionChoices,
		selectedDistrictLabel,
	]);

	// 범위가 하나면 마운트 직후 자동 선택한다. 이미 값이 있거나 수정 화면(scopeLocked)이면 건드리지 않는다.
	useEffect(() => {
		if (scopeLocked || form.organizationId || !onlyScope) {
			return;
		}

		setForm((current) => ({
			...current,
			organizationId: onlyScope.organizationId,
			teamId: onlyScope.teamId ?? "",
		}));
	}, [form.organizationId, onlyScope, scopeLocked]);

	const updateForm = (patch: Partial<NativeJobForm>) => {
		setForm((current) => ({ ...current, ...patch }));
	};
	const handleScopeChange = (value: string) => {
		const selected = postingScopeOptions.find(
			(option) => option.value === value
		);

		if (!selected) {
			return;
		}

		// 조직이 바뀌면 이전 조직에서 발급받은 업로드 키를 그대로 보내면 서버가 FORBIDDEN이다
		// — 미디어를 비운다. 미리보기 state는 picker의 key(organizationId) 리마운트로 함께 초기화.
		if (selected.scope.organizationId !== form.organizationId) {
			setCover(null);
			setDetail([]);
			// 배너도 이전 조직 키라 그대로 보내면 서버 FORBIDDEN이다 — 함께 비운다.
			setBanners({});
			setBannerError(null);
		}

		updateForm({
			organizationId: selected.scope.organizationId,
			teamId: selected.scope.teamId ?? "",
		});
	};
	const handlePayUnitChange = (payUnit: string) => {
		// 협의로 바꾸면 적어 둔 금액은 어차피 버려진다 — 화면에서도 함께 비워 오해를 없앤다.
		updateForm(
			payUnit === NEGOTIABLE_PAY_UNIT ? { payAmount: "", payUnit } : { payUnit }
		);
	};
	// 1단계 검증만 — 필드·설명 블록. 통과하면 서버 입력을 돌려주고, 실패하면 사유를 띄우고
	// null을 준다. 필수 배너 게이트는 여기서 보지 않는다(2단계 CTA가 판정한다).
	const buildValidInput = (): NativeJobPostInput | null => {
		const validation = validateNativeJobForm(form, {
			teamScopes: postingScopes
				.filter((scope) => scope.teamId)
				.map((scope) => ({
					organizationId: scope.organizationId,
					teamId: scope.teamId ?? "",
				})),
		});

		if (!validation.ok) {
			setErrors(validation.errors);
			setFormMessage(validation.message);
			return null;
		}

		const blockError = jobDescriptionBlocksError(blocks);

		if (blockError) {
			setBlocksError(blockError);
			setFormMessage(blockError);
			return null;
		}

		setErrors({});
		setBlocksError(null);
		setFormMessage(null);
		return validation.input;
	};

	// 검증된 입력으로 실제 제출한다 — 노출 선택에 따라 미디어·결제 필드를 조립한다(무료면 미디어만).
	const submit = (input: NativeJobPostInput) => {
		setBannerError(null);
		onSubmit({
			...input,
			beginnerFriendly,
			descriptionBlocks: normalizeJobDescriptionBlocks(blocks),
			instantInterview,
			...buildExposureSubmission(exposure, banners, {
				cover: cover ?? undefined,
				detail,
			}),
		});
	};

	// 1단계 고정 바 버튼("다음"). 검증을 돌리고, 통과하면 노출·결제 화면(2단계)을 연다. 노출
	// 섹션이 꺼진 수정 화면은 2단계가 없으므로 그대로 저장한다(단일 제출, 회귀 방지).
	const handlePrimary = () => {
		const input = buildValidInput();

		if (!input) {
			return;
		}

		if (exposureEnabled) {
			setExposureOpen(true);
			return;
		}

		submit(input);
	};

	// 2단계 CTA("공고 등록하기"). 1단계는 이 화면 뒤에 잠겨 값이 바뀔 수 없지만, 검증을 다시
	// 돌려 입력을 얻는다(순수 함수라 부담 없다). 유료인데 필수 배너가 비면 등록을 막고 사유를 띄운다.
	const handleRegister = () => {
		const input = buildValidInput();

		if (!input) {
			// 1단계가 다시 실패할 일은 없지만, 그렇다면 사유가 안 보이는 2단계 대신 1단계로 되돌린다.
			setExposureOpen(false);
			return;
		}

		if (hasMissingRequiredBanners(exposure, banners, requiredBannerUsages)) {
			setBannerError(REQUIRED_BANNER_ERROR);
			setFormMessage(REQUIRED_BANNER_ERROR);
			return;
		}

		submit(input);
	};

	// 2단계 → 1단계. 값·노출 선택은 그대로 두고(state라 보존), 2단계에서 뜬 게이트 메시지만 지운다.
	const handleBackToForm = () => {
		setExposureOpen(false);
		setFormMessage(null);
		setBannerError(null);
	};

	// 1단계 고정 바 라벨. 등록 화면은 다음 단계로 넘기고, 수정 화면은 그대로 저장한다.
	const primaryLabel = exposureEnabled ? "다음" : submitLabel;

	return (
		<>
			{/* 화면 껍데기를 폼이 직접 두른다 — 제출 CTA를 스크롤 밖 고정 바에 두려면 BambiScreen의
		    stickyFooter를 폼이 잡고 있어야 한다(호출 화면은 안내 문구만 넘긴다). */}
			<BambiScreen
				stickyFooter={
					<View className="gap-2">
						{/* 검증 실패 요약은 버튼과 같은 고정 바에 둔다. 폼 본문에 두면 화면 서너 개
					    아래라, 고정 바에서 제출한 사용자에게는 보이지 않는 곳에서 뜬다. */}
						{formMessage ? (
							<Text className="text-danger text-sm" selectable>
								{formMessage}
							</Text>
						) : null}
						<Button isDisabled={isSubmitting} onPress={handlePrimary}>
							<Button.Label>
								{isSubmitting ? "저장 중" : primaryLabel}
							</Button.Label>
						</Button>
					</View>
				}
			>
				{/* 한 줄짜리 안내라 Description 없이 Title만 둔다(문서의 title-only 구성) — 그래서
			    아이콘을 첫 줄에 맞추는 items-center·pt-0 조합이 함께 온다. status는 default로
			    남긴다: accent를 주면 코럴이 화면에 두 번(안내와 하단 등록 CTA) 나와 위계가 흐려진다. */}
				{notice ? (
					<Alert className="items-center">
						<Alert.Indicator className="pt-0" />
						<Alert.Content>
							<Alert.Title>{notice}</Alert.Title>
						</Alert.Content>
					</Alert>
				) : null}
				<Surface className="gap-4 rounded-lg p-4" variant="secondary">
					{scopeLocked ? (
						// 수정 화면은 조직 변경 자체가 막혀 있어(서버 FORBIDDEN) 고를 수 없는 컨트롤 대신
						// 평문으로 보여준다.
						<View className="gap-2">
							<Label>등록 범위</Label>
							<Text className="text-foreground" selectable>
								{selectedScopeOption?.label ?? "등록 범위"}
							</Text>
						</View>
					) : (
						<FieldSelect
							errorMessage={errors.organizationId}
							isRequired
							label="등록 범위"
							onChange={handleScopeChange}
							options={postingScopeOptions.map((option) => ({
								label: option.label,
								value: option.value,
							}))}
							placeholder="공고를 올릴 조직·팀을 골라 주세요"
							snapPoints={["40%"]}
							value={selectedScopeValue}
						/>
					)}

					<TextField isInvalid={Boolean(errors.title)} isRequired>
						<Label>공고 제목</Label>
						<Input
							onChangeText={(title) => updateForm({ title })}
							placeholder="예: 강남 라운지 홀 스태프 모집"
							value={form.title}
						/>
						<FieldError>{errors.title}</FieldError>
					</TextField>

					<FieldSelect
						errorMessage={errors.industryCategory}
						isRequired
						label="업종"
						onChange={(industryCategory) => updateForm({ industryCategory })}
						options={toChoices(industryOptions)}
						placeholder="업종을 골라 주세요"
						snapPoints={["55%"]}
						value={form.industryCategory}
					/>

					<FieldSelect
						errorMessage={errors.regionCode}
						isRequired
						label="지역"
						// 시/도를 바꾸면 이전 시/도의 세부지역 코드가 남지 않도록 반드시 함께 비운다.
						onChange={(regionCode) =>
							updateForm({ districtCode: "", regionCode })
						}
						options={regionChoices}
						placeholder="근무 지역을 골라 주세요"
						snapPoints={["75%"]}
						value={form.regionCode}
					/>

					{/* 세부지역은 선택 항목이다 — 비우면 시/도 전체다. 고른 시/도에 세부지역이 있을
				    때만 그린다(없으면 빈 Select가 뜰 이유가 없다). */}
					{districtChoices.length > 0 ? (
						<FieldSelect
							errorMessage={errors.districtCode}
							label="세부지역"
							onChange={(districtCode) => updateForm({ districtCode })}
							options={districtChoices}
							placeholder="지역 전체"
							snapPoints={["75%"]}
							value={form.districtCode}
						/>
					) : null}

					{/* 금액과 단위는 이제 둘 다 라벨 달린 같은 형태의 컨트롤이라 기준선이 맞는다 — 한 줄로 붙인다. */}
					<View className="flex-row gap-3">
						<View className="flex-1">
							<TextField
								isDisabled={isPayNegotiable}
								isInvalid={Boolean(errors.payAmount)}
								isRequired={!isPayNegotiable}
							>
								<Label>급여</Label>
								<Input
									keyboardType="number-pad"
									onChangeText={(payAmount) => updateForm({ payAmount })}
									placeholder="예: 15000"
									value={form.payAmount}
								/>
								{isPayNegotiable ? (
									// 잠긴 필드라도 안내는 읽혀야 하므로 흐림 처리를 끈다.
									<Description isDisabled={false}>
										금액 없이 ‘급여 협의’로 등록됩니다.
									</Description>
								) : null}
								<FieldError>{errors.payAmount}</FieldError>
							</TextField>
						</View>
						{/* w-36: 라벨 "급여 단위"와 가장 긴 값+셰브론이 잘리지 않는 최소 폭. */}
						<View className="w-36">
							<FieldSelect
								errorMessage={errors.payUnit}
								isRequired
								label="급여 단위"
								onChange={handlePayUnitChange}
								options={toChoices(payUnitOptions)}
								placeholder="단위 선택"
								snapPoints={["45%"]}
								value={form.payUnit}
							/>
						</View>
					</View>

					<TextField isInvalid={Boolean(errors.workSchedule)} isRequired>
						<Label>근무 일정</Label>
						<Input
							onChangeText={(workSchedule) => updateForm({ workSchedule })}
							placeholder="예: 주 3일, 오후 7시~새벽 2시"
							value={form.workSchedule}
						/>
						<FieldError>{errors.workSchedule}</FieldError>
					</TextField>

					<TextField isInvalid={Boolean(errors.description)} isRequired>
						<Label>상세 설명</Label>
						<Input
							multiline
							onChangeText={(description) => updateForm({ description })}
							placeholder="예: 하는 일, 근무 조건, 우대 사항을 적어 주세요."
							value={form.description}
						/>
						<FieldError>{errors.description}</FieldError>
					</TextField>

					<JobDescriptionBlockEditor
						blocks={blocks}
						error={blocksError}
						onChange={setBlocks}
					/>

					{form.organizationId ? (
						<JobImagePickerSection
							cover={cover}
							detail={detail}
							initialPreviews={initialPreviews}
							key={form.organizationId}
							onChange={(next) => {
								setCover(next.cover);
								setDetail(next.detail);
							}}
							onCoverPreviewChange={setCoverPreviewUri}
							organizationId={form.organizationId}
							teamId={form.teamId || null}
						/>
					) : (
						<Text className="text-muted text-xs">
							등록 범위를 먼저 선택하면 이미지를 올릴 수 있어요.
						</Text>
					)}

					<View className="flex-row items-center justify-between gap-3">
						<Label>초보 환영</Label>
						<Switch
							isSelected={beginnerFriendly}
							onSelectedChange={setBeginnerFriendly}
						/>
					</View>
					<View className="flex-row items-center justify-between gap-3">
						<Label>당일/즉시 면접</Label>
						<Switch
							isSelected={instantInterview}
							onSelectedChange={setInstantInterview}
						/>
					</View>

					<TextField isInvalid={Boolean(errors.interviewNotes)}>
						<Label>면접 안내</Label>
						<Input
							multiline
							onChangeText={(interviewNotes) => updateForm({ interviewNotes })}
							placeholder="예: 평일 오후 2시~6시 매장 방문 면접"
							value={form.interviewNotes}
						/>
						<FieldError>{errors.interviewNotes}</FieldError>
					</TextField>

					{/* 노출 섹션을 앱에서 그리면 이 안내는 모순이라 뺀다 — 꺼진 화면(수정)에서만 남긴다. */}
					{exposureEnabled ? null : (
						<Text className="text-muted text-xs leading-5" selectable>
							광고 노출 상품·결제는 밤비알바 웹사이트에서 진행할 수 있어요.
						</Text>
					)}
				</Surface>

				{/* 구직자 목록에 실제로 나가는 카드를 그대로 그린다 — 폼 값이 바뀔 때마다 갱신되니
			    제목 길이·썸네일 잘림·급여 표기를 등록 전에 확인할 수 있다. 카드 안의 Text는
			    접근성 트리에서 숨겨져 있어(JobListCard) 낭독은 이 그룹 라벨이 대신한다. */}
				<View
					accessibilityLabel={`목록 노출 미리보기: ${describeJobForScreenReader(previewJob, [])}`}
					accessible
					className="gap-2"
				>
					<Label>목록 노출 미리보기</Label>
					<Text className="text-muted text-xs leading-5">
						구직자 공고 목록에서 이렇게 보여요. 썸네일은 가로로 잘리니 중요한
						내용은 가운데에 두세요.
					</Text>
					<JobListCard
						job={previewJob}
						sectionKey={adPreviewTemplateToSectionKey(
							exposure.selection?.previewTemplate
						)}
					/>
				</View>
			</BambiScreen>

			{/* 2단계 — 노출 상품·결제. 등록 화면에서만, "다음"을 눌러 검증을 통과한 뒤 열린다. */}
			{exposureEnabled ? (
				<ExposureStep
					exposureFields={
						<ExposureFields
							bannerError={bannerError}
							banners={banners}
							exposure={exposure}
							organizationId={form.organizationId}
							requiredUsages={requiredBannerUsages}
							setBannerError={setBannerError}
							setBanners={setBanners}
							setExposure={setExposure}
							teamId={form.teamId || null}
						/>
					}
					formMessage={formMessage}
					isSubmitting={isSubmitting}
					onBack={handleBackToForm}
					onRegister={handleRegister}
					visible={exposureOpen}
				/>
			) : null}
		</>
	);
}
