// biome-ignore-all lint/style/noNestedTernary: query 상태를 화면 순서대로 표현한다
import { useQuery } from "@tanstack/react-query";
import { type Href, router, Stack } from "expo-router";
import { Button, Skeleton } from "heroui-native";
import { useState } from "react";
import { Text, View } from "react-native";

import {
	BambiScreen,
	ErrorState,
	StateCard,
} from "@/src/components/bambi-screen";
import { FaqAccordionItem } from "@/src/components/support/faq-accordion-item";
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
		<BambiScreen
			stickyFooter={
				visitor.state === "member" ? (
					<View className="gap-2">
						<Button
							onPress={() =>
								router.push("/(seeker)/support/inquiries/new" as Href)
							}
						>
							<Button.Label>문의 글 등록하기</Button.Label>
						</Button>
						<Button
							onPress={() => router.push("/(seeker)/support/inquiries" as Href)}
							variant="secondary"
						>
							<Button.Label>내 문의 내역</Button.Label>
						</Button>
					</View>
				) : (
					<Button onPress={() => router.push("/(seeker)/support/chat" as Href)}>
						<Button.Label>1:1 상담</Button.Label>
					</Button>
				)
			}
		>
			<Stack.Screen options={{ title: "고객센터" }} />
			{query.isPending ? (
				<Skeleton className="h-40 rounded-lg" />
			) : query.isError ? (
				<ErrorState onRetry={() => query.refetch()} />
			) : (
				<View className="gap-2">
					<View className="gap-1">
						<Text className="font-bold text-foreground text-xl">
							자주 묻는 질문
						</Text>
						<Text className="text-muted text-sm">
							궁금한 항목을 누르면 답변이 펼쳐져요.
						</Text>
					</View>
					{query.data.faqs.length === 0 ? (
						<StateCard
							description="운영자가 FAQ를 등록하면 이곳에 표시됩니다."
							title="등록된 FAQ가 없어요"
						/>
					) : (
						query.data.faqs.map((faq) => (
							<FaqAccordionItem
								answer={faqAnswers.get(faq.id)}
								isOpen={openFaqId === faq.id}
								key={faq.id}
								onPress={() => {
									if (!faqAnswers.has(faq.id)) {
										router.push("/login" as Href);
										return;
									}
									setOpenFaqId(openFaqId === faq.id ? null : faq.id);
								}}
								question={faq.question}
							/>
						))
					)}
				</View>
			)}
		</BambiScreen>
	);
}
