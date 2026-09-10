// biome-ignore-all lint/style/noNestedTernary: query 상태를 화면 순서대로 표현한다
import { useQuery } from "@tanstack/react-query";
import { type Href, router, Stack } from "expo-router";
import { Button, Skeleton, Surface } from "heroui-native";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";

import {
	BambiScreen,
	ErrorState,
	StateCard,
} from "@/src/components/bambi-screen";
import { MessageBody } from "@/src/components/message-body";
import { useVisitor } from "@/src/lib/guest-store";
import { orpc } from "@/src/lib/orpc";

export default function SupportHomeScreen() {
	const visitor = useVisitor();
	const [openFaqId, setOpenFaqId] = useState<string | null>(null);
	const query = useQuery(orpc.bambi.supportChat.getWidgetHome.queryOptions());
	const faqQuery = useQuery({
		...orpc.bambi.support.listFaq.queryOptions({ input: {} }),
		enabled: visitor.state === "member",
	});
	const faqAnswers = new Map(
		(faqQuery.data?.items ?? []).map((faq) => [faq.id, faq.answer] as const)
	);

	return (
		<BambiScreen>
			<Stack.Screen options={{ title: "고객센터" }} />
			<View className="gap-1">
				<Text className="font-bold text-3xl text-foreground">고객센터</Text>
				<Text className="text-muted text-sm">
					자주 묻는 질문을 확인하거나 운영팀에 문의하세요.
				</Text>
			</View>
			{query.isPending ? (
				<Skeleton className="h-40 rounded-lg" />
			) : query.isError ? (
				<ErrorState onRetry={() => query.refetch()} />
			) : (
				<>
					{query.data.notice ? (
						<Surface className="rounded-lg p-4" variant="tertiary">
							<Text className="text-foreground text-sm">
								{query.data.notice}
							</Text>
						</Surface>
					) : null}
					<View className="gap-2">
						<Text className="font-bold text-foreground text-xl">
							자주 묻는 질문
						</Text>
						{query.data.faqs.length === 0 ? (
							<StateCard
								description="운영자가 FAQ를 등록하면 이곳에 표시됩니다."
								title="등록된 FAQ가 없어요"
							/>
						) : (
							query.data.faqs.map((faq) => (
								<Surface
									className="rounded-lg"
									key={faq.id}
									variant="secondary"
								>
									<Pressable
										accessibilityRole="button"
										className="min-h-11 justify-center p-4 active:opacity-75"
										onPress={() => {
											if (!faqAnswers.has(faq.id)) {
												router.push("/login" as Href);
												return;
											}
											setOpenFaqId(openFaqId === faq.id ? null : faq.id);
										}}
									>
										<Text className="font-semibold text-foreground">
											{faq.question}
										</Text>
									</Pressable>
									{openFaqId === faq.id && faqAnswers.get(faq.id) ? (
										<View className="border-border border-t p-4">
											<MessageBody body={faqAnswers.get(faq.id) ?? ""} />
										</View>
									) : null}
								</Surface>
							))
						)}
					</View>
				</>
			)}
			<View className="gap-2">
				{visitor.state === "member" ? (
					<>
						<Button
							onPress={() => router.push("/(seeker)/support/inquiries" as Href)}
						>
							<Button.Label>내 문의 내역</Button.Label>
						</Button>
						<Button
							onPress={() =>
								router.push("/(seeker)/support/inquiries/new" as Href)
							}
							variant="secondary"
						>
							<Button.Label>문의 글 등록하기</Button.Label>
						</Button>
					</>
				) : null}
				<Button
					onPress={() => router.push("/(seeker)/support/chat" as Href)}
					variant="secondary"
				>
					<Button.Label>1:1 상담</Button.Label>
				</Button>
				<Button
					onPress={() => router.push("/(seeker)/support/manual" as Href)}
					variant="tertiary"
				>
					<Button.Label>이용 가이드</Button.Label>
				</Button>
			</View>
		</BambiScreen>
	);
}
