import { useMutation, useQuery } from "@tanstack/react-query";
import { Button, Dialog, Input, Surface, TextField } from "heroui-native";
import { useEffect, useRef, useState } from "react";
import { Alert, Text, View } from "react-native";

import {
	BambiScreen,
	ErrorState,
	LoadingState,
	Pill,
} from "@/src/components/bambi-screen";
import {
	type BusinessDocumentItem,
	BusinessDocumentSection,
} from "@/src/components/business-document-section";
import { verificationStatusLabels } from "@/src/lib/bambi-native";
import {
	businessErrorMessage,
	getBiznumCheckText,
	resolveBusinessScreenState,
	validateBusinessForm,
} from "@/src/lib/employer/business";
import { orpc, queryClient } from "@/src/lib/orpc";

const COMPACT_DATE_PATTERN = /^\d{8}$/;

// 서버는 개업일자를 YYYY-MM-DD 문자열로 받는다. getMine의 businessStartDate가 8자리면
// 하이픈을 넣어 초기값으로 쓴다.
const toDateInput = (value: null | string | undefined): string => {
	if (!value) {
		return "";
	}
	if (COMPACT_DATE_PATTERN.test(value)) {
		return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
	}
	return value.slice(0, 10);
};

export default function EmployerBusinessScreen() {
	const mineQuery = useQuery(orpc.bambi.onboarding.getMine.queryOptions());
	const organizationProfile = mineQuery.data?.employerOrganizationProfiles[0];
	const biznumCheckEnabled = mineQuery.data?.biznumCheckEnabled ?? true;

	const [displayName, setDisplayName] = useState("");
	const [brn, setBrn] = useState("");
	const [representativeName, setRepresentativeName] = useState("");
	const [startDate, setStartDate] = useState("");
	const [confirmOpen, setConfirmOpen] = useState(false);

	// 폼은 프로필당 한 번만 초기화한다. 서류 추가/삭제 → invalidate로 organizationProfile
	// 객체가 새로 와도(값은 동일) 사용자가 입력 중인 값을 덮어쓰지 않게 한다.
	const didInitFormRef = useRef(false);

	useEffect(() => {
		if (!organizationProfile || didInitFormRef.current) {
			return;
		}
		didInitFormRef.current = true;
		setDisplayName(
			organizationProfile.draftDisplayName ??
				organizationProfile.displayName ??
				""
		);
		setBrn(
			organizationProfile.draftBusinessRegistrationNumber ??
				organizationProfile.businessRegistrationNumber ??
				""
		);
		setRepresentativeName(
			organizationProfile.draftRepresentativeName ??
				organizationProfile.representativeName ??
				""
		);
		setStartDate(
			toDateInput(
				organizationProfile.draftBusinessStartDate ??
					organizationProfile.businessStartDate
			)
		);
	}, [organizationProfile]);

	const invalidateMine = () =>
		queryClient.invalidateQueries({
			queryKey: orpc.bambi.onboarding.getMine.queryKey(),
		});

	const prepareMutation = useMutation(
		orpc.bambi.onboarding.prepareEmployerBusinessDocuments.mutationOptions()
	);
	const submitMutation = useMutation(
		orpc.bambi.onboarding.submitEmployerBusinessInfo.mutationOptions({
			onError: (error) => {
				Alert.alert("제출하지 못했어요", businessErrorMessage(error));
			},
			onSuccess: async (data) => {
				await invalidateMine();
				// 인증 완료 상태에서 변경 없이 재제출하면 서버가 verified를 그대로 유지한다.
				Alert.alert(
					"제출했어요",
					data.verificationStatus === "verified"
						? "변경 사항이 없어 인증 상태를 유지해요."
						: "업체 정보를 제출했어요. 운영자 승인을 기다려 주세요."
				);
			},
		})
	);

	if (mineQuery.isLoading) {
		return <LoadingState label="사업자 인증 정보를 불러오고 있어요." />;
	}

	if (mineQuery.isError) {
		return <ErrorState onRetry={() => mineQuery.refetch()} />;
	}

	const status = organizationProfile?.verificationStatus ?? "none";
	const screenState = resolveBusinessScreenState(status);
	const documents = (organizationProfile?.businessDocuments ??
		[]) as BusinessDocumentItem[];

	const ensureOrganizationId = async (): Promise<string> => {
		if (organizationProfile?.organizationId) {
			return organizationProfile.organizationId;
		}

		const validation = validateBusinessForm({
			businessRegistrationNumber: brn,
			businessStartDate: startDate,
			displayName,
			representativeName,
		});

		if (!validation.ok) {
			throw new Error("업체 정보를 먼저 모두 입력해 주세요.");
		}

		const { organizationId } = await prepareMutation.mutateAsync(
			validation.input
		);
		await invalidateMine();

		return organizationId;
	};

	const submit = () => {
		const validation = validateBusinessForm({
			businessRegistrationNumber: brn,
			businessStartDate: startDate,
			displayName,
			representativeName,
		});

		if (!validation.ok) {
			Alert.alert("입력을 확인해 주세요", validation.message);
			return;
		}

		submitMutation.mutate(validation.input);
	};

	const handleSubmitPress = () => {
		if (screenState.requiresConfirmation) {
			setConfirmOpen(true);
			return;
		}
		submit();
	};

	return (
		<BambiScreen>
			<Surface
				className="flex-row items-center justify-between gap-2 rounded-lg p-4"
				variant="secondary"
			>
				<Text className="font-semibold text-foreground" selectable>
					인증 상태
				</Text>
				<Pill tone={status === "verified" ? "success" : "neutral"}>
					{verificationStatusLabels[
						status as keyof typeof verificationStatusLabels
					] ?? status}
				</Pill>
			</Surface>

			{screenState.statusNotice ? (
				<Surface className="rounded-lg p-4" variant="secondary">
					<Text className="text-muted text-sm leading-5" selectable>
						{screenState.statusNotice}
					</Text>
				</Surface>
			) : null}

			{organizationProfile?.verificationNote ? (
				<Surface className="rounded-lg p-4" variant="secondary">
					<Text className="text-muted text-xs">검수 메모</Text>
					<Text className="text-foreground text-sm leading-5" selectable>
						{organizationProfile.verificationNote}
					</Text>
				</Surface>
			) : null}

			<Surface className="gap-4 rounded-lg p-4" variant="secondary">
				<TextField>
					<Input
						accessibilityLabel="업체명"
						editable={!screenState.inputsLocked}
						onChangeText={setDisplayName}
						placeholder="업체명 (예: 밤비 라운지)"
						value={displayName}
					/>
				</TextField>
				<TextField>
					<Input
						accessibilityLabel="사업자 등록 번호"
						editable={!screenState.inputsLocked}
						keyboardType="numbers-and-punctuation"
						onChangeText={setBrn}
						placeholder="000-00-00000"
						value={brn}
					/>
				</TextField>
				<TextField>
					<Input
						accessibilityLabel="대표자 성명"
						editable={!screenState.inputsLocked}
						onChangeText={setRepresentativeName}
						placeholder="대표자 성명 (예: 홍길동)"
						value={representativeName}
					/>
				</TextField>
				<TextField>
					<Input
						accessibilityLabel="개업일자"
						editable={!screenState.inputsLocked}
						onChangeText={setStartDate}
						placeholder="개업일자 YYYY-MM-DD"
						value={startDate}
					/>
				</TextField>
				<Text className="text-muted text-xs leading-5">
					{biznumCheckEnabled
						? "대표자 성명과 개업일자는 사업자등록증에 적힌 그대로 입력해야 국세청 진위확인을 통과합니다."
						: "국세청 진위확인은 곧 준비될 기능이에요. 지금은 운영자가 사업자등록증과 직접 대조해 승인하니, 사업자등록증 그대로 입력해 주세요."}
				</Text>
				<Text className="text-muted text-xs">
					{`국세청 확인 · ${getBiznumCheckText({
						biznumCheckEnabled,
						biznumCheckedAt: organizationProfile?.biznumCheckedAt ?? null,
						biznumStatusCode: organizationProfile?.biznumStatusCode ?? null,
					})}`}
				</Text>
			</Surface>

			<Surface className="gap-3 rounded-lg p-4" variant="secondary">
				<BusinessDocumentSection
					canDelete={screenState.canDeleteDocuments}
					documents={documents}
					onChanged={invalidateMine}
					onEnsureOrganizationId={ensureOrganizationId}
					organizationId={organizationProfile?.organizationId ?? null}
					requiresConfirmation={screenState.requiresConfirmation}
				/>
			</Surface>

			<Button
				isDisabled={screenState.inputsLocked || submitMutation.isPending}
				onPress={handleSubmitPress}
			>
				<Button.Label>
					{submitMutation.isPending ? "제출 중" : screenState.submitLabel}
				</Button.Label>
			</Button>

			<Dialog isOpen={confirmOpen} onOpenChange={setConfirmOpen}>
				<Dialog.Portal>
					<Dialog.Overlay />
					<Dialog.Content>
						<Dialog.Title>업체 정보를 변경하시겠습니까?</Dialog.Title>
						<Dialog.Description>
							업체 정보를 제출하면 인증 대기 상태로 전환되며, 운영자 승인 전까지
							기존 공고와 광고가 비공개 처리되고 채팅 송수신이 제한됩니다.
						</Dialog.Description>
						<View className="flex-row justify-end gap-2 pt-2">
							<Button onPress={() => setConfirmOpen(false)} variant="tertiary">
								<Button.Label>취소</Button.Label>
							</Button>
							<Button
								onPress={() => {
									setConfirmOpen(false);
									submit();
								}}
							>
								<Button.Label>변경사항 제출</Button.Label>
							</Button>
						</View>
					</Dialog.Content>
				</Dialog.Portal>
			</Dialog>
		</BambiScreen>
	);
}
