import {
	type JobDescriptionBlock,
	normalizeJobDescriptionBlocks,
} from "@bambi-app/api/services/bambi-job-description-blocks";
import { useQuery } from "@tanstack/react-query";
import { useFocusEffect, useNavigation } from "expo-router";
import {
	Alert,
	Button,
	Description,
	FieldError,
	Input,
	Label,
	Surface,
	Switch,
	TextArea,
	TextField,
} from "heroui-native";
import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert as RNAlert, Text, View } from "react-native";
import type { KeyboardAwareScrollViewRef } from "react-native-keyboard-controller";

import { BambiScreen } from "@/src/components/bambi-screen";
import { FieldSelect } from "@/src/components/field-select";
import { JobDescriptionBlockEditor } from "@/src/components/job-description-block-editor";
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
import type { AdPreviewTemplateValue } from "@/src/lib/employer/ad-exposure";
import { jobDescriptionBlocksError } from "@/src/lib/employer/job-description-blocks";
import {
	formatPayAmountInput,
	getFirstErrorField,
	shouldWarnOnLeave,
} from "@/src/lib/employer/job-form-ux";
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
	// 노출·결제를 2단계로 넘길지. 새 공고(등록) 화면만 켠다 — 켜면 CTA가 "다음"이 되고, 검증
	// 통과 시 onSubmit 대신 onNext로 조립된 입력을 부모에 넘겨 노출 화면(스택 push)으로 보낸다.
	// 수정 화면은 서버가 광고 변경을 다루지 않아(배너 패스스루) 끈 채로 단일 저장한다.
	exposureEnabled?: boolean;
	// 하단 목록 미리보기 카드에 입힐 노출 영역 스타일. 노출 화면에서 고른 상품이 초안에 남아
	// 돌아오면 부모가 그 값을 넘겨 카드가 실제 노출 위치로 보이게 한다(없으면 기본 카드).
	exposurePreviewTemplate?: AdPreviewTemplateValue;
	// 폼 본문 뒤(미리보기 앞)에 끼울 화면별 섹션. 수정 화면의 상세 디자인 신청처럼 폼의
	// 관심사가 아닌 것을 폼에 prop으로 들이지 않으려고 슬롯으로 받는다.
	extraSections?: ReactNode;
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
	// exposureEnabled일 때 "다음"에서 호출 — 검증·조립된 입력을 노출 화면으로 넘긴다.
	onNext?: (input: NativeJobPostInput) => void;
	// exposureEnabled가 꺼진 화면(수정)의 단일 저장 콜백. 켜진 화면은 onNext만 쓴다.
	onSubmit?: (input: NativeJobPostInput) => void;
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

// 그룹 제목. Surface마다 위에 올려 어느 묶음인지 알려준다.
function SectionHeading({ children }: { children: string }) {
	return (
		<Text className="font-semibold text-base text-foreground" selectable>
			{children}
		</Text>
	);
}

export function NativeJobFormScreen({
	exposureEnabled = false,
	exposurePreviewTemplate,
	extraSections,
	initialBeginnerFriendly,
	initialBlocks,
	initialCover,
	initialDetail,
	initialInstantInterview,
	initialPreviews,
	initialValue,
	isSubmitting,
	notice,
	onNext,
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
	// 이미지 픽·업로드 진행 중. 이 동안 "다음"을 잠근다(JobImagePickerSection.onBusyChange 참고).
	const [isMediaBusy, setIsMediaBusy] = useState(false);

	// 사용자가 필드를 한 번이라도 바꿨는지. 초기 시딩(setForm/useState 초기값)은 dirty가 아니다
	// — 사용자 핸들러(markDirty)에서만 세워, 빈 폼·프리필만 있는 화면에서 이탈 경고가 뜨지 않게 한다.
	const [isDirty, setIsDirty] = useState(false);
	// 제출로 화면을 떠날 때 이탈 가드를 통과시키는 표식. 저장 성공 시점에 isSubmitting이 이미
	// 꺼져 있을 수 있어(React Query onSuccess는 isPending=false 이후 실행) prop만으로는 못 막는다.
	// 다시 편집하면(markDirty) 되돌려 가드를 재무장한다.
	const submittedRef = useRef(false);
	const markDirty = () => {
		setIsDirty(true);
		submittedRef.current = false;
	};
	// 노출 화면에서 등록을 마치면 dismissTo가 이 화면까지 한꺼번에 걷어 가는데, 그때 이 화면은
	// isDirty=true·submittedRef=false라 "작성 중인 내용이 있어요"가 떴다(등록은 이미 끝난 뒤).
	// "다음"으로 넘길 때 통과 표식을 세우고, 노출 화면에서 뒤로 돌아와 이 화면이 다시 포커스를
	// 받으면 되돌려 가드를 재무장한다(dismissTo로 걷힐 땐 포커스가 돌아오지 않아 표식이 남는다).
	useFocusEffect(
		useCallback(() => {
			submittedRef.current = false;
		}, [])
	);

	// 노출 상품·결제 선택·배너는 더 이상 이 폼이 들지 않는다 — 노출 화면(스택 push)이 초안
	// 스토어로 들고 있어 왕복해도 살아남는다. 폼은 작성 + 미리보기만 책임진다.
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

	// 첫 오류로 스크롤하기 위한 핸들. scrollViewRef는 스프레드로는 KeyboardAwareScrollView에
	// 닿지 않아 Container가 전용 prop으로 받아 ref로 건다.
	const scrollRef = useRef<KeyboardAwareScrollViewRef>(null);
	// 필드 래퍼 View의 참조 모음. 오류가 난 필드로 스크롤할 때 스크롤 콘텐츠 기준 y를 측정한다.
	const fieldRefs = useRef<Record<string, View | null>>({});
	const setFieldRef = (field: string) => (node: View | null) => {
		fieldRefs.current[field] = node;
	};
	const scrollToFirstError = (fieldErrors: NativeJobFormErrors) => {
		const field = getFirstErrorField(fieldErrors);
		const target = field ? fieldRefs.current[field] : null;
		const scroll = scrollRef.current;

		if (!(target && scroll)) {
			return;
		}

		// Fabric(RN 0.85)의 measureLayout은 숫자 핸들(findNodeHandle)이 아니라 호스트 컴포넌트
		// 참조를 요구한다 — 숫자를 넘기면 "must be called with a ref to a native component"
		// 경고만 내고 스크롤하지 않는다. ScrollView 인스턴스의 getNativeScrollRef()가 그 참조다.
		const scrollHost = scroll.getNativeScrollRef?.();

		if (!scrollHost) {
			return;
		}

		target.measureLayout(
			scrollHost,
			(_x, y) => scroll.scrollTo({ animated: true, y: Math.max(y - 16, 0) }),
			// 측정 실패 시엔 스크롤하지 않는다 — 좌표 없이 scrollTo하면 맨 위로 튄다.
			() => {
				// noop
			}
		);
	};

	const navigation = useNavigation();
	// 작성 중 이탈 가드. Android 하드웨어 back·헤더 back·스와이프가 모두 beforeRemove로 들어온다.
	// 작성한 내용이 있고 제출 중이 아닐 때만 막는다(shouldWarnOnLeave). "나가기"면 원래 이동을
	// 그대로 dispatch한다. isDirty·isSubmitting은 훅 값이라 리스너 클로저가 최신값을 보도록 재구독한다.
	useEffect(() => {
		const unsubscribe = navigation.addListener("beforeRemove", (event) => {
			if (
				!shouldWarnOnLeave({
					isDirty,
					isSubmitting: isSubmitting || submittedRef.current,
				})
			) {
				return;
			}

			event.preventDefault();
			RNAlert.alert(
				"작성 중인 내용이 있어요",
				"이 화면을 나가면 작성한 내용이 사라져요.",
				[
					{ style: "cancel", text: "계속 작성" },
					{
						onPress: () => navigation.dispatch(event.data.action),
						style: "destructive",
						text: "나가기",
					},
				]
			);
		});

		return unsubscribe;
	}, [navigation, isDirty, isSubmitting]);

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
		markDirty();
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
		// (배너는 이 폼이 더 이상 들지 않는다 — 노출 화면이 조직 단위 key로 리마운트해 비운다.)
		if (selected.scope.organizationId !== form.organizationId) {
			setCover(null);
			setDetail([]);
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
	// 1단계 검증만 — 필드·설명 블록. 통과하면 서버 입력을, 실패하면 사유를 state에 담고 필드
	// 오류 맵을 돌려준다(handlePrimary가 첫 오류로 스크롤한다). 필수 배너 게이트는 여기서 보지
	// 않는다(2단계 CTA가 판정한다).
	const buildValidInput = ():
		| { fieldErrors: NativeJobFormErrors }
		| { input: NativeJobPostInput } => {
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
			return { fieldErrors: validation.errors };
		}

		const blockError = jobDescriptionBlocksError(blocks);

		if (blockError) {
			setBlocksError(blockError);
			setFormMessage(blockError);
			// 블록 오류는 스크롤 대상 필드가 없다 — 빈 맵으로 돌려 스크롤을 건너뛴다.
			return { fieldErrors: {} };
		}

		setErrors({});
		setBlocksError(null);
		setFormMessage(null);
		return { input: validation.input };
	};

	// 검증된 입력에 초보환영·즉시면접·설명블록·미디어(cover/detail)를 병합해 조립한다. 노출·결제
	// 필드는 여기 없다 — 노출 화면이 초안 스토어의 선택을 붙여 최종 제출을 만든다(무료면 이대로 등록).
	const buildBase = (input: NativeJobPostInput): NativeJobPostInput => ({
		...input,
		beginnerFriendly,
		descriptionBlocks: normalizeJobDescriptionBlocks(blocks),
		instantInterview,
		media: { cover: cover ?? undefined, detail },
	});

	// 고정 바 버튼. 검증을 돌리고, 실패하면 첫 오류로 스크롤한다. 통과하면 등록 화면은 조립된
	// 입력을 노출 화면으로 넘기고(onNext, push라 이 화면은 남는다), 노출 단계가 없는 수정 화면은
	// 그대로 저장한다(onSubmit). 두 경로 모두 submittedRef로 이탈 가드를 통과시킨다 — onNext는
	// 초안에 담긴 뒤 노출 화면의 등록 성공이 이 화면까지 걷어 가고, 되돌아오면 포커스가 재무장한다.
	const handlePrimary = () => {
		const result = buildValidInput();

		if ("fieldErrors" in result) {
			scrollToFirstError(result.fieldErrors);
			return;
		}

		const base = buildBase(result.input);

		submittedRef.current = true;

		if (exposureEnabled) {
			onNext?.(base);
			return;
		}

		onSubmit?.(base);
	};

	// 고정 바 라벨. 등록 화면은 다음 단계로 넘기고, 수정 화면은 그대로 저장한다.
	const primaryLabel = exposureEnabled ? "다음" : submitLabel;

	return (
		// 화면 껍데기를 폼이 직접 두른다 — 제출 CTA를 스크롤 밖 고정 바에 두려면 stickyFooter를
		// 폼이 잡고 있어야 한다. 첫 오류로 스크롤할 핸들은 BambiScreen이 Container로 넘겨 준다.
		<BambiScreen
			scrollViewRef={scrollRef}
			stickyFooter={
				<View className="gap-2">
					{/* 검증 실패 요약은 버튼과 같은 고정 바에 둔다. 폼 본문에 두면 화면 서너 개
					    아래라, 고정 바에서 제출한 사용자에게는 보이지 않는 곳에서 뜬다. */}
					{formMessage ? (
						<Text className="text-danger text-sm" selectable>
							{formMessage}
						</Text>
					) : null}
					<Button
						isDisabled={isSubmitting || isMediaBusy}
						onPress={handlePrimary}
					>
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

			{/* 기본 정보 — 등록 범위 · 제목 · 업종 · 지역 · 세부지역 */}
			<Surface className="gap-4 rounded-lg p-4" variant="secondary">
				<SectionHeading>기본 정보</SectionHeading>
				<View ref={setFieldRef("organizationId")}>
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
				</View>

				<View ref={setFieldRef("title")}>
					<TextField isInvalid={Boolean(errors.title)} isRequired>
						<Label>공고 제목</Label>
						<Input
							onChangeText={(title) => updateForm({ title })}
							placeholder="예: 강남 라운지 홀 스태프 모집"
							value={form.title}
						/>
						<FieldError>{errors.title}</FieldError>
					</TextField>
				</View>

				<View ref={setFieldRef("industryCategory")}>
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
				</View>

				<View ref={setFieldRef("regionCode")}>
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
				</View>

				{/* 세부지역은 선택 항목이다 — 비우면 시/도 전체다. 고른 시/도에 세부지역이 있을
					    때만 그린다(없으면 빈 Select가 뜰 이유가 없다). */}
				{districtChoices.length > 0 ? (
					<View ref={setFieldRef("districtCode")}>
						<FieldSelect
							errorMessage={errors.districtCode}
							label="세부지역"
							onChange={(districtCode) => updateForm({ districtCode })}
							options={districtChoices}
							placeholder="지역 전체"
							snapPoints={["75%"]}
							value={form.districtCode}
						/>
					</View>
				) : null}
			</Surface>

			{/* 근무 조건 — 급여 · 급여 단위 · 근무 일정 · 초보 환영 · 당일/즉시 면접 · 면접 안내 */}
			<Surface className="gap-4 rounded-lg p-4" variant="secondary">
				<SectionHeading>근무 조건</SectionHeading>
				{/* 금액과 단위는 이제 둘 다 라벨 달린 같은 형태의 컨트롤이라 기준선이 맞는다 — 한 줄로 붙인다. */}
				<View className="flex-row gap-3">
					<View className="flex-1" ref={setFieldRef("payAmount")}>
						<TextField
							isDisabled={isPayNegotiable}
							isInvalid={Boolean(errors.payAmount)}
							isRequired={!isPayNegotiable}
						>
							<Label>급여 (원)</Label>
							<Input
								keyboardType="number-pad"
								// state에는 숫자만 유지한다 — 표시용 콤마가 state로 새면 서버로 콤마가 간다.
								onChangeText={(payAmount) =>
									updateForm({ payAmount: payAmount.replace(/[^0-9]/gu, "") })
								}
								placeholder="예: 15000"
								value={formatPayAmountInput(form.payAmount)}
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
					<View className="w-36" ref={setFieldRef("payUnit")}>
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

				<View ref={setFieldRef("workSchedule")}>
					<TextField isInvalid={Boolean(errors.workSchedule)} isRequired>
						<Label>근무 일정</Label>
						<Input
							onChangeText={(workSchedule) => updateForm({ workSchedule })}
							placeholder="예: 주 3일, 오후 7시~새벽 2시"
							value={form.workSchedule}
						/>
						<FieldError>{errors.workSchedule}</FieldError>
					</TextField>
				</View>

				<View className="flex-row items-center justify-between gap-3">
					<Label>초보 환영</Label>
					<Switch
						isSelected={beginnerFriendly}
						onSelectedChange={(value) => {
							markDirty();
							setBeginnerFriendly(value);
						}}
					/>
				</View>
				<View className="flex-row items-center justify-between gap-3">
					<Label>당일/즉시 면접</Label>
					<Switch
						isSelected={instantInterview}
						onSelectedChange={(value) => {
							markDirty();
							setInstantInterview(value);
						}}
					/>
				</View>

				<View ref={setFieldRef("interviewNotes")}>
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
				</View>
			</Surface>

			{/* 상세 소개 — 상세 설명 · 설명 블록 편집기 */}
			<Surface className="gap-4 rounded-lg p-4" variant="secondary">
				<SectionHeading>상세 소개</SectionHeading>
				<View ref={setFieldRef("description")}>
					<TextField isInvalid={Boolean(errors.description)} isRequired>
						<Label>상세 설명</Label>
						<TextArea
							onChangeText={(description) => updateForm({ description })}
							placeholder="예: 하는 일, 근무 조건, 우대 사항을 적어 주세요."
							value={form.description}
						/>
						<FieldError>{errors.description}</FieldError>
					</TextField>
				</View>

				<JobDescriptionBlockEditor
					blocks={blocks}
					error={blocksError}
					onChange={(next) => {
						markDirty();
						setBlocks(next);
					}}
				/>
			</Surface>

			{/* 이미지 — 대표·상세 이미지 */}
			<Surface className="gap-4 rounded-lg p-4" variant="secondary">
				<SectionHeading>이미지</SectionHeading>
				{form.organizationId ? (
					<JobImagePickerSection
						cover={cover}
						detail={detail}
						initialPreviews={initialPreviews}
						key={form.organizationId}
						onBusyChange={setIsMediaBusy}
						onChange={(next) => {
							markDirty();
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
			</Surface>

			{/* 화면별 추가 섹션. 수정 화면이 상세 디자인 신청처럼 폼의 관심사가 아닌 것을
			    여기 끼운다 — 폼에 광고 개념을 들이지 않으려고 슬롯으로 받는다. */}
			{extraSections}

			{/* 노출 섹션을 앱에서 그리면 이 안내는 모순이라 뺀다 — 꺼진 화면(수정)에서만 남긴다. */}
			{exposureEnabled ? null : (
				<Text className="text-muted text-xs leading-5" selectable>
					광고 노출 상품·결제는 밤비알바 웹사이트에서 진행할 수 있어요.
				</Text>
			)}

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
				{/* 노출 화면에서 고른 상품이 초안에 남아 돌아오면 그 노출 위치로 카드를 그린다
						    (미선택·수정 화면이면 undefined라 기본 카드). */}
				<JobListCard
					job={previewJob}
					sectionKey={adPreviewTemplateToSectionKey(exposurePreviewTemplate)}
				/>
			</View>
		</BambiScreen>
	);
}
