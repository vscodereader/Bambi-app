import { useMutation, useQuery } from "@tanstack/react-query";
import { useLocalSearchParams } from "expo-router";
import { Button, Input, Surface, TextField } from "heroui-native";
import { useState } from "react";
import { Text, View } from "react-native";

import {
	BambiHeader,
	BambiScreen,
	ErrorState,
	LoadingState,
	StateCard,
} from "@/src/components/bambi-screen";
import { MemberOnly } from "@/src/components/member-only";
import { getConfirmedScheduleId } from "@/src/lib/bambi-native";
import { orpc } from "@/src/lib/orpc";

function ContactRevealInner() {
	const { id } = useLocalSearchParams<{ id: string }>();
	const [contactValue, setContactValue] = useState("");
	const [message, setMessage] = useState<null | string>(null);
	const chatQuery = useQuery(
		orpc.bambi.chats.getById.queryOptions({ input: { id } })
	);
	const revealMutation = useMutation(
		orpc.bambi.chats.revealContact.mutationOptions({
			onError: (error) => setMessage(error.message),
			onSuccess: () => setMessage("연락처 공개 동의가 저장되었습니다."),
		})
	);

	if (chatQuery.isLoading) {
		return <LoadingState label="면접 일정을 확인하고 있습니다." />;
	}

	if (chatQuery.isError || !chatQuery.data) {
		return <ErrorState onRetry={() => chatQuery.refetch()} />;
	}

	const confirmedScheduleId = getConfirmedScheduleId(chatQuery.data.schedules);

	if (!confirmedScheduleId) {
		return (
			<BambiScreen>
				<StateCard
					description="면접 일정이 확정된 뒤 연락처 공개를 진행할 수 있습니다."
					title="확정된 일정이 없습니다"
				/>
			</BambiScreen>
		);
	}

	return (
		<BambiScreen>
			<BambiHeader
				description="연락처는 확정된 면접 일정에 대해 본인이 동의한 경우에만 공개됩니다."
				title="연락처 공개"
			/>
			<Surface className="gap-4 rounded-lg p-4" variant="secondary">
				<View className="gap-2">
					<Text className="font-semibold text-foreground" selectable>
						휴대폰 번호
					</Text>
					<TextField>
						<Input
							keyboardType="phone-pad"
							onChangeText={setContactValue}
							placeholder="010-0000-0000"
							value={contactValue}
						/>
					</TextField>
				</View>
				{message ? (
					<Text className="text-sm text-warning" selectable>
						{message}
					</Text>
				) : null}
				<Button
					isDisabled={
						revealMutation.isPending || contactValue.trim().length < 3
					}
					onPress={() =>
						revealMutation.mutate({
							contactMethod: "phone",
							contactValue,
							interviewScheduleId: confirmedScheduleId,
						})
					}
				>
					<Button.Label>
						{revealMutation.isPending ? "저장 중" : "연락처 공개 동의"}
					</Button.Label>
				</Button>
			</Surface>
		</BambiScreen>
	);
}

export default function ContactRevealScreen() {
	return (
		<MemberOnly>
			<ContactRevealInner />
		</MemberOnly>
	);
}
