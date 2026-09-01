import { useQuery } from "@tanstack/react-query";
import { Stack } from "expo-router";
import { Button, Skeleton, Surface } from "heroui-native";
import { Text, View } from "react-native";

import {
	BambiHeader,
	BambiScreen,
	Pill,
	StateCard,
} from "@/src/components/bambi-screen";
import {
	contentBoardLabel,
	contentUnavailableLabel,
	formatContentDate,
} from "@/src/lib/me-content";
import { orpc } from "@/src/lib/orpc";

// 웹은 pageSize 10 + PageControls지만, 여기는 한 화면에 목록이 둘이라 각 20건 1페이지 +
// 꼬리 안내로 시작한다(페이지네이션 UI 없음).
const PAGE_SIZE = 20;

const SECTION_COPY = {
	authored: {
		emptyDescription: "수다방에 글을 쓰면 여기에서 관리할 수 있어요.",
		emptyTitle: "작성한 글이 없어요",
		title: "내가 작성한 글",
	},
	liked: {
		emptyDescription:
			"수다방에서 마음에 드는 글에 좋아요를 누르면 여기에 모여요.",
		emptyTitle: "좋아요 누른 글이 없어요",
		title: "좋아요 누른 글",
	},
} as const;

// 두 엔드포인트의 아이템 타입이 다르다(liked: boardLabel string | null·status에 "missing" /
// authored: boardLabel string). 유니온으로 합치면 items.map부터 TS가 시끄러워지므로
// 행에는 원시값만 흘려보낸다 — 대입 시점에 구조적으로 넓혀 받는다.
interface ContentRowItem {
	boardLabel: null | string;
	createdAt: Date | string;
	id: string;
	status: string;
	title: string;
}

// 누를 수 없는 정보 행이다 — native에 커뮤니티 글 상세가 없어 이동 대상이 없다.
// 수다방 상세가 붙으면 CardLink로 바꾸고 boardSlug/id를 넘기면 된다.
function ContentRow({ boardLabel, createdAt, status, title }: ContentRowItem) {
	const board = contentBoardLabel(boardLabel);
	const date = formatContentDate(createdAt);
	const unavailableLabel = contentUnavailableLabel(status);

	return (
		<Surface
			accessibilityLabel={`${board}, ${title}, ${date}${unavailableLabel ? `, ${unavailableLabel}` : ""}`}
			accessible={true}
			className="rounded-lg p-4"
			variant="secondary"
		>
			{/* 행을 스크린리더 단일 노드로 묶는다(CardLink와 같은 관행) — 안 묶으면 Text
			    3~4개가 따로 낭독돼 20행에 60번 스와이프가 된다. */}
			<View className="gap-1" importantForAccessibility="no-hide-descendants">
				<Text className="font-semibold text-foreground" numberOfLines={2}>
					{title}
				</Text>
				<View className="flex-row flex-wrap items-center gap-2">
					<Text className="text-muted text-xs">{board}</Text>
					<Text className="text-muted text-xs">{date}</Text>
					{unavailableLabel ? (
						<Pill tone="danger">{unavailableLabel}</Pill>
					) : null}
				</View>
			</View>
		</Surface>
	);
}

// 섹션마다 독립 쿼리라 로딩·에러도 섹션 안에서 처리한다 — 화면 전체 LoadingState/ErrorState를
// 쓰면 한쪽이 늦거나 실패할 때 멀쩡한 다른 목록까지 사라진다(me.tsx PointsSummaryCard와 같은 방침).
function ContentSection({ kind }: { kind: "authored" | "liked" }) {
	const copy = SECTION_COPY[kind];
	const input = { page: 1, pageSize: PAGE_SIZE };
	const query = useQuery(
		kind === "authored"
			? orpc.bambi.contentHistory.listMineAuthored.queryOptions({ input })
			: orpc.bambi.contentHistory.listMineLiked.queryOptions({ input })
	);
	const items: ContentRowItem[] = query.data?.items ?? [];
	const totalCount = query.data?.totalCount ?? 0;

	return (
		<View className="gap-2">
			<View className="flex-row items-center justify-between gap-2">
				<Text className="font-semibold text-base text-foreground">
					{copy.title}
				</Text>
				{query.isSuccess ? (
					<Pill tone="neutral">{`전체 ${totalCount}개`}</Pill>
				) : null}
			</View>
			{query.isPending ? (
				<View className="gap-2">
					<Skeleton className="h-16 rounded-lg" />
					<Skeleton className="h-16 rounded-lg" />
					<Skeleton className="h-16 rounded-lg" />
				</View>
			) : null}
			{query.isError ? (
				<StateCard
					action={
						<Button
							isDisabled={query.isFetching}
							onPress={() => query.refetch()}
							size="sm"
							variant="secondary"
						>
							<Button.Label>다시 시도</Button.Label>
						</Button>
					}
					description="로그인 상태와 네트워크 연결을 확인한 뒤 다시 시도해 주세요."
					title="글 목록을 불러오지 못했어요"
				/>
			) : null}
			{query.isSuccess && items.length === 0 ? (
				<StateCard
					description={copy.emptyDescription}
					title={copy.emptyTitle}
				/>
			) : null}
			{items.length ? (
				<View className="gap-2">
					{items.map((item) => (
						<ContentRow key={item.id} {...item} />
					))}
				</View>
			) : null}
			{items.length > 0 && totalCount > items.length ? (
				<Text className="text-muted text-xs">
					{`전체 ${totalCount}개 중 최근 ${PAGE_SIZE}개만 표시했어요.`}
				</Text>
			) : null}
		</View>
	);
}

export default function SeekerMyContentScreen() {
	return (
		<BambiScreen>
			{/* _layout.tsx를 건드리지 않고 스택 헤더 제목만 준다(jobs/[id].tsx의 headerRight와 같은 방식).
			    뒤로가기는 SeekerStackHeader가 그리므로 화면에 따로 만들지 않는다. */}
			<Stack.Screen options={{ title: "글 관리" }} />
			<BambiHeader
				description="좋아요 누른 글과 내가 작성한 글을 확인해요."
				title="글 관리"
			/>
			<ContentSection kind="liked" />
			<ContentSection kind="authored" />
		</BambiScreen>
	);
}
