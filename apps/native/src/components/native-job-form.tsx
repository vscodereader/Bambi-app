import {
	type JobDescriptionBlock,
	normalizeJobDescriptionBlocks,
} from "@bambi-app/api/services/bambi-job-description-blocks";
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
} from "heroui-native";
import { useEffect, useMemo, useState } from "react";
import { Text, View } from "react-native";

import { BambiScreen } from "@/src/components/bambi-screen";
import { FieldSelect } from "@/src/components/field-select";
import { JobDescriptionBlockEditor } from "@/src/components/job-description-block-editor";
import { JobImagePickerSection } from "@/src/components/job-image-picker-section";
import {
	emptyNativeJobForm,
	industryOptions,
	type NativeJobForm,
	type NativeJobFormErrors,
	type NativeJobPostInput,
	NEGOTIABLE_PAY_UNIT,
	payUnitOptions,
	validateNativeJobForm,
} from "@/src/lib/bambi-native";
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

export function NativeJobFormScreen({
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
	const [detail, setDetail] = useState<JobMediaUploadItem[]>(
		initialDetail ?? []
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
	const handleSubmit = () => {
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
			return;
		}

		const blockError = jobDescriptionBlocksError(blocks);

		if (blockError) {
			setBlocksError(blockError);
			setFormMessage(blockError);
			return;
		}

		setErrors({});
		setBlocksError(null);
		setFormMessage(null);
		onSubmit({
			...validation.input,
			beginnerFriendly,
			descriptionBlocks: normalizeJobDescriptionBlocks(blocks),
			instantInterview,
			media: { cover: cover ?? undefined, detail },
		});
	};

	return (
		// 화면 껍데기를 폼이 직접 두른다 — 제출 CTA를 스크롤 밖 고정 바에 두려면 BambiScreen의
		// stickyFooter를 폼이 잡고 있어야 한다(호출 화면은 안내 문구만 넘긴다).
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
					<Button isDisabled={isSubmitting} onPress={handleSubmit}>
						<Button.Label>
							{isSubmitting ? "저장 중" : submitLabel}
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
					onChange={(regionCode) => updateForm({ regionCode })}
					options={regionChoices}
					placeholder="근무 지역을 골라 주세요"
					snapPoints={["75%"]}
					value={form.regionCode}
				/>

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

				<Text className="text-muted text-xs leading-5" selectable>
					광고 노출 상품·결제는 밤비알바 웹사이트에서 진행할 수 있어요.
				</Text>
			</Surface>
		</BambiScreen>
	);
}
