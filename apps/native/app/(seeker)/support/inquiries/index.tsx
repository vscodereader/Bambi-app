// biome-ignore-all lint/style/noNestedTernary: query 상태를 화면 순서대로 표현한다

import {
	inquiryStatusLabel,
	supportCategoryLabel,
} from "@bambi-app/api/services/bambi-support-labels";
import { useQuery } from "@tanstack/react-query";
import { type Href, router, Stack, useLocalSearchParams } from "expo-router";
import { Button, Skeleton, Surface } from "heroui-native";
import { Pressable, Text, View } from "react-native";

import {
	BambiScreen,
	ErrorState,
	Pill,
	StateCard,
} from "@/src/components/bambi-screen";
import { MemberOnly } from "@/src/components/member-only";
import { orpc } from "@/src/lib/orpc";
import { supportInquiryHref } from "@/src/lib/support/support";

function InquiryList() {
	const params = useLocalSearchParams<{ page?: string }>();
	const parsed = Number(params.page);
	const page = Number.isInteger(parsed) && parsed > 0 ? parsed : 1;
	const query = useQuery(
		orpc.bambi.support.listMyInquiries.queryOptions({ input: { page } })
	);
	const pageCount = Math.max(
		1,
		Math.ceil((query.data?.totalCount ?? 0) / (query.data?.pageSize ?? 1))
	);
	return (
		<BambiScreen>
			<Stack.Screen options={{ title: "내 문의 내역" }} />
			<View className="flex-row items-center justify-between">
				<Text className="font-bold text-3xl text-foreground">내 문의 내역</Text>
				<Button
					onPress={() => router.push("/(seeker)/support/inquiries/new" as Href)}
					size="sm"
				>
					<Button.Label>문의하기</Button.Label>
				</Button>
			</View>
			{query.isError ? (
				<ErrorState onRetry={() => query.refetch()} />
			) : query.isPending ? (
				<Skeleton className="h-32 rounded-lg" />
			) : query.data.items.length === 0 ? (
				<StateCard
					description="궁금한 내용을 문의하면 처리 상태를 확인할 수 있어요."
					title="등록한 문의가 없어요"
				/>
			) : (
				query.data.items.map((item) => (
					<Pressable
						className="active:opacity-75"
						key={item.id}
						onPress={() => router.push(supportInquiryHref(item.id) as Href)}
					>
						<Surface className="gap-2 rounded-lg p-4" variant="secondary">
							<View className="flex-row flex-wrap gap-2">
								<Pill>{supportCategoryLabel(item.category)}</Pill>
								<Pill
									tone={
										item.inquiryStatus === "answered" ? "success" : "neutral"
									}
								>
									{inquiryStatusLabel(item.inquiryStatus)}
								</Pill>
							</View>
							<Text className="font-semibold text-foreground">
								{item.title}
							</Text>
						</Surface>
					</Pressable>
				))
			)}
			<View className="flex-row justify-between">
				<Button
					isDisabled={page <= 1}
					onPress={() => router.setParams({ page: String(page - 1) })}
					variant="secondary"
				>
					<Button.Label>이전</Button.Label>
				</Button>
				<Text className="text-muted text-sm">
					{page} / {pageCount}
				</Text>
				<Button
					isDisabled={page >= pageCount}
					onPress={() => router.setParams({ page: String(page + 1) })}
					variant="secondary"
				>
					<Button.Label>다음</Button.Label>
				</Button>
			</View>
		</BambiScreen>
	);
}

export default function InquiryListScreen() {
	return (
		<MemberOnly>
			<InquiryList />
		</MemberOnly>
	);
}
