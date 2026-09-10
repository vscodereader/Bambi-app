import {
	inquiryStatusLabel,
	supportCategoryLabel,
} from "@bambi-app/api/services/bambi-support-labels";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Stack, useLocalSearchParams } from "expo-router";
import { Button, Input, Surface, TextField } from "heroui-native";
import { useState } from "react";
import { Alert, Text, View } from "react-native";

import {
	BambiScreen,
	ErrorState,
	LoadingState,
	Pill,
} from "@/src/components/bambi-screen";
import { MemberOnly } from "@/src/components/member-only";
import { MessageBody } from "@/src/components/message-body";
import { orpc, queryClient } from "@/src/lib/orpc";

function InquiryThread() {
	const { id } = useLocalSearchParams<{ id: string }>();
	const [reply, setReply] = useState("");
	const query = useQuery(
		orpc.bambi.support.getInquiry.queryOptions({ input: { inquiryId: id } })
	);
	const replyMutation = useMutation(
		orpc.bambi.support.createInquiryMessage.mutationOptions({
			onError: (error) =>
				Alert.alert("메시지를 보내지 못했어요", error.message),
			onSuccess: async () => {
				setReply("");
				await queryClient.invalidateQueries({
					queryKey: orpc.bambi.support.key(),
				});
			},
		})
	);
	if (query.isPending) {
		return <LoadingState label="문의를 불러오고 있어요." />;
	}
	if (query.isError || !query.data) {
		return <ErrorState onRetry={() => query.refetch()} />;
	}
	const { inquiry, messages } = query.data;
	const isClosed = inquiry.inquiryStatus === "closed";
	return (
		<BambiScreen>
			<Stack.Screen options={{ title: "문의 상세" }} />
			<View className="gap-2">
				<View className="flex-row flex-wrap gap-2">
					<Pill>{supportCategoryLabel(inquiry.category)}</Pill>
					<Pill
						tone={inquiry.inquiryStatus === "answered" ? "success" : "neutral"}
					>
						{inquiryStatusLabel(inquiry.inquiryStatus)}
					</Pill>
				</View>
				<Text className="font-bold text-2xl text-foreground">
					{inquiry.title}
				</Text>
				<Text className="font-semibold text-foreground">
					{inquiry.authorName}
				</Text>
				<Text className="text-muted text-xs">
					{new Date(inquiry.createdAt).toLocaleString("ko-KR")}
				</Text>
			</View>
			<Surface className="rounded-lg p-4" variant="secondary">
				<MessageBody body={inquiry.body} />
			</Surface>
			{messages.map((message) => (
				<Surface
					className="gap-2 rounded-lg p-4"
					key={message.id}
					variant="secondary"
				>
					<View className="flex-row items-center gap-2">
						<Text className="font-semibold text-foreground">
							{message.authorName}
						</Text>
						<Pill tone={message.isStaff ? "accent" : "neutral"}>
							{message.isStaff ? "운영자" : "나"}
						</Pill>
					</View>
					<Text className="text-foreground text-sm" selectable>
						{message.body}
					</Text>
					<Text className="text-muted text-xs">
						{new Date(message.createdAt).toLocaleString("ko-KR")}
					</Text>
				</Surface>
			))}
			{isClosed ? (
				<Text className="text-muted text-sm">
					종료된 문의예요. 추가 문의는 새로 등록해 주세요.
				</Text>
			) : (
				<View className="gap-2">
					<TextField>
						<Input
							maxLength={5000}
							onChangeText={setReply}
							placeholder="추가로 남길 내용을 적어 주세요"
							value={reply}
						/>
					</TextField>
					<Button
						isDisabled={!reply.trim() || replyMutation.isPending}
						onPress={() =>
							replyMutation.mutate({ body: reply.trim(), inquiryId: id })
						}
					>
						<Button.Label>보내기</Button.Label>
					</Button>
				</View>
			)}
		</BambiScreen>
	);
}

export default function InquiryThreadScreen() {
	return (
		<MemberOnly>
			<InquiryThread />
		</MemberOnly>
	);
}
