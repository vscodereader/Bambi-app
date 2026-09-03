import { useMutation, useQuery } from "@tanstack/react-query";
import { Button, Input, Surface, TextField } from "heroui-native";
import { useEffect, useState } from "react";
import { Alert, Text, View } from "react-native";

import {
	BambiScreen,
	LoadingState,
	Pill,
	StateCard,
} from "@/src/components/bambi-screen";
import { verificationStatusLabels } from "@/src/lib/bambi-native";
import { businessErrorMessage } from "@/src/lib/employer/business";
import { orpc, queryClient } from "@/src/lib/orpc";

export default function EmployerOrganizationScreen() {
	const mineQuery = useQuery(orpc.bambi.onboarding.getMine.queryOptions());
	const organizationProfile = mineQuery.data?.employerOrganizationProfiles[0];
	const currentName = organizationProfile?.displayName ?? "";
	const [displayName, setDisplayName] = useState(currentName);

	useEffect(() => {
		if (currentName) {
			setDisplayName(currentName);
		}
	}, [currentName]);

	const updateMutation = useMutation(
		orpc.bambi.onboarding.upsertEmployerOrganizationProfile.mutationOptions({
			onError: (error) => {
				Alert.alert("저장하지 못했어요", businessErrorMessage(error));
			},
			onSuccess: async () => {
				Alert.alert("저장했어요", "업체명을 변경했어요.");
				await queryClient.invalidateQueries({
					queryKey: orpc.bambi.onboarding.getMine.queryKey(),
				});
			},
		})
	);

	if (mineQuery.isLoading) {
		return <LoadingState label="업체 정보를 불러오고 있어요." />;
	}

	if (!organizationProfile) {
		return (
			<BambiScreen>
				<StateCard
					description="사업자 인증에서 업체 정보를 먼저 제출하면 여기서 수정할 수 있어요."
					title="등록된 업체가 없어요"
				/>
			</BambiScreen>
		);
	}

	const status = organizationProfile.verificationStatus;
	const canEdit = status === "verified";
	const trimmed = displayName.trim();
	const nameError = trimmed.length === 0 ? "업체명을 입력해 주세요." : null;

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

			<Surface className="gap-4 rounded-lg p-4" variant="secondary">
				<View className="gap-1">
					<Text className="font-semibold text-base text-foreground">
						업체명
					</Text>
					<Text className="text-muted text-sm">
						공고와 채팅에 노출되는 업체 이름이에요.
					</Text>
				</View>
				<TextField>
					<Input
						accessibilityLabel="업체명"
						editable={canEdit}
						onChangeText={setDisplayName}
						placeholder="공고에 노출되는 업체명"
						value={displayName}
					/>
				</TextField>
				{canEdit ? null : (
					<Text className="text-muted text-xs">
						업체명 수정은 인증 완료 후에 할 수 있어요. 사업자 인증을 먼저 마쳐
						주세요.
					</Text>
				)}
				{nameError && canEdit ? (
					<Text className="text-danger text-sm">{nameError}</Text>
				) : null}
				<Button
					isDisabled={
						!canEdit ||
						nameError !== null ||
						trimmed === currentName.trim() ||
						updateMutation.isPending
					}
					onPress={() =>
						updateMutation.mutate({
							displayName: trimmed,
							organizationId: organizationProfile.organizationId,
						})
					}
				>
					<Button.Label>
						{updateMutation.isPending ? "저장 중" : "저장"}
					</Button.Label>
				</Button>
			</Surface>
		</BambiScreen>
	);
}
