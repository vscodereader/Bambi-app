import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { type Href, Link, Stack } from "expo-router";
import { Button, Skeleton, Surface } from "heroui-native";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";

import {
	BambiHeader,
	BambiScreen,
	ErrorState,
	formatDateTime,
	formatPayUnitFirst,
	Pill,
	StateCard,
} from "@/src/components/bambi-screen";
import {
	type ReportTargetSummary,
	reportReasonLabel,
	statusLabel,
	statusTone,
	summarizeReportTarget,
	targetTypeLabel,
} from "@/src/lib/me-reports";
import { orpc } from "@/src/lib/orpc";

// 서버 상한은 50이지만 카드가 길어 20으로 끊는다(웹은 10 + PageControls).
const PAGE_SIZE = 20;

// (seeker)/_layout.tsx를 건드리지 않으려고 화면이 스스로 헤더 타이틀을 주입한다.
// 뒤로가기는 SeekerStackHeader가 자동으로 그린다.
const SCREEN_OPTIONS = { title: "내 신고 내역" };

// 서버는 report 행 전부를 내려주지만 화면이 읽는 필드만 적는다.
interface ReportItem {
	createdAt: Date | string;
	details: null | string;
	id: string;
	reason: string;
	resolutionReason: null | string;
	status: string;
	targetContext: unknown;
	targetType: string;
	targetUnavailable: boolean;
}

function ReportTarget({ target }: { target: ReportTargetSummary }) {
	if (target.kind === "unavailable") {
		return (
			<Text className="text-muted text-sm">
				삭제되었거나 확인할 수 없는 대상입니다.
			</Text>
		);
	}

	if (target.kind === "jobPost") {
		return (
			<Link
				asChild
				href={
					{
						pathname: "/(seeker)/jobs/[id]",
						params: { id: target.id },
					} as unknown as Href
				}
			>
				<Pressable
					accessibilityLabel={`${target.title} 공고 상세 열기`}
					accessibilityRole="button"
					accessible
					className="gap-1 rounded-lg bg-muted/10 p-3 active:opacity-75"
				>
					<View
						className="gap-1"
						importantForAccessibility="no-hide-descendants"
					>
						<Text className="font-semibold text-foreground text-sm">
							{target.title}
						</Text>
						<Text className="text-muted text-xs">
							{target.organizationDisplayName}
						</Text>
						<Text className="text-muted text-xs">
							{formatPayUnitFirst(target.payAmount, target.payUnit)}
						</Text>
					</View>
				</Pressable>
			</Link>
		);
	}

	// 채팅방은 웹과 같이 링크하지 않는다(방 하드삭제·미참여 케이스).
	if (target.kind === "box") {
		return (
			<View className="gap-1 rounded-lg bg-muted/10 p-3">
				<Text className="font-semibold text-foreground text-sm" selectable>
					{target.title}
				</Text>
				<Text className="text-muted text-xs" selectable>
					{target.subtitle}
				</Text>
			</View>
		);
	}

	if (target.kind === "line") {
		return (
			<Text className="text-foreground text-sm" selectable>
				{target.text}
			</Text>
		);
	}

	return null;
}

function ReportCard({ item }: { item: ReportItem }) {
	const hasResolution =
		(item.status === "resolved" || item.status === "dismissed") &&
		Boolean(item.resolutionReason);

	return (
		<Surface className="gap-3 rounded-lg p-4" variant="secondary">
			<View className="flex-row items-start justify-between gap-3">
				<View className="min-w-0 flex-1 gap-1">
					<Text className="font-semibold text-base text-foreground" selectable>
						{reportReasonLabel(item.reason)}
					</Text>
					<Text className="text-muted text-xs">
						{`${targetTypeLabel(item.targetType)} · ${formatDateTime(item.createdAt)}`}
					</Text>
				</View>
				<Pill tone={statusTone(item.status)}>{statusLabel(item.status)}</Pill>
			</View>
			<ReportTarget target={summarizeReportTarget(item)} />
			{item.details ? (
				<Text className="text-muted text-sm leading-5" selectable>
					{item.details}
				</Text>
			) : null}
			{hasResolution ? (
				<View className="gap-1 rounded-lg bg-muted/10 p-3">
					<Text className="font-semibold text-foreground text-sm">
						{item.status === "dismissed" ? "기각 사유" : "조치"}
					</Text>
					<Text className="text-muted text-sm leading-5" selectable>
						{item.resolutionReason}
					</Text>
				</View>
			) : null}
		</Surface>
	);
}

export default function SeekerMyReportsScreen() {
	const [page, setPage] = useState(1);
	const query = useQuery({
		...orpc.bambi.moderation.listMyReports.queryOptions({
			input: { page, pageSize: PAGE_SIZE },
		}),
		// 페이지 이동 시 이전 목록·total을 유지해 푸터가 언마운트되지 않게 한다.
		placeholderData: keepPreviousData,
	});
	const items: ReportItem[] = query.data?.items ?? [];
	const total = query.data?.total ?? 0;
	const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

	if (query.isError) {
		return (
			<>
				<Stack.Screen options={SCREEN_OPTIONS} />
				<ErrorState
					onRetry={() => query.refetch()}
					title="신고 내역을 불러오지 못했습니다"
				/>
			</>
		);
	}

	return (
		<>
			<Stack.Screen options={SCREEN_OPTIONS} />
			<BambiScreen>
				<BambiHeader
					description="접수한 신고의 처리 상태를 확인하실 수 있어요."
					title="내 신고 내역"
				/>
				{/* 첫 로드만 스켈레톤 — 페이지 이동(isFetching)에는 목록을 유지하고 버튼만 잠근다. */}
				{query.isLoading ? (
					<View className="gap-3">
						<Skeleton className="h-24 rounded-lg" />
						<Skeleton className="h-24 rounded-lg" />
						<Skeleton className="h-24 rounded-lg" />
					</View>
				) : null}
				{query.isLoading || items.length > 0 ? null : (
					<StateCard
						description="접수한 신고가 여기에 표시됩니다."
						title="신고 내역이 없어요"
					/>
				)}
				{items.length > 0 ? (
					<View className="gap-3">
						{items.map((item) => (
							<ReportCard item={item} key={item.id} />
						))}
					</View>
				) : null}
				{pageCount > 1 ? (
					<View className="flex-row items-center justify-between gap-3">
						<Text className="text-muted text-sm">
							{`전체 ${total}건 · ${page} / ${pageCount} 페이지`}
						</Text>
						<View className="flex-row gap-2">
							<Button
								accessibilityLabel="이전 페이지"
								isDisabled={page <= 1 || query.isFetching}
								onPress={() => setPage((current) => current - 1)}
								size="sm"
								variant="tertiary"
							>
								<Button.Label>이전</Button.Label>
							</Button>
							<Button
								accessibilityLabel="다음 페이지"
								isDisabled={page >= pageCount || query.isFetching}
								onPress={() => setPage((current) => current + 1)}
								size="sm"
								variant="tertiary"
							>
								<Button.Label>다음</Button.Label>
							</Button>
						</View>
					</View>
				) : null}
			</BambiScreen>
		</>
	);
}
