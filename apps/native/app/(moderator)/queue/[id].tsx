import {
	QUEUE_RISK_LABELS,
	QUEUE_VERDICTS,
	type QueueVerdict,
	resolveQueueRiskLevel,
	riskFlagLabel,
} from "@bambi-app/api/services/bambi-moderation-labels";
import { env } from "@bambi-app/env/native";
import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQuery } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import {
	Alert,
	Button,
	Chip,
	Dialog,
	Skeleton,
	Surface,
	useThemeColor,
	useToast,
} from "heroui-native";
import { useState } from "react";
import { Image, Pressable, Text, View } from "react-native";

import {
	BambiScreen,
	formatDateTime,
	formatPay,
	LoadingState,
	Pill,
	StateCard,
} from "@/src/components/bambi-screen";
import { JobDescriptionSection } from "@/src/components/job-description-section";
import { ReasonDialog } from "@/src/components/moderation/reason-dialog";
import { publicObjectUri } from "@/src/lib/bambi-native";
import {
	queueListOptions,
	useInvalidateModeration,
} from "@/src/lib/moderation/queries";
import { orpc } from "@/src/lib/orpc";
import { formatRelativeTime } from "@/src/lib/support/support";

const GCS_PUBLIC_BASE_URL = env.EXPO_PUBLIC_GCS_PUBLIC_BASE_URL;

// 승인이 주 액션이라 하단 바에서 가장 넓은 자리(flex-2)와 primary를 가져간다. 보류는 중립
// 대안이라 tertiary, 반려는 파괴적이지만 되돌릴 수 있어 danger 원색 대신 danger-soft로
// 낮춘다 — 나열 순서(반려·보류·승인)는 오른쪽 엄지 자리에 주 액션을 두기 위한 것이다.
const VERDICT_BUTTON_VARIANTS = {
	approve: "primary",
	hold: "tertiary",
	reject: "danger-soft",
} as const;

// 대표 이미지. 목록 카드와 같은 publicObjectUri를 지나므로 dev의 web 로컬 라우트도 흐른다.
function CoverImage({
	altText,
	height,
	storageKey,
	width,
}: {
	altText: string;
	height: null | number;
	storageKey: string;
	width: null | number;
}) {
	const [isZoomOpen, setIsZoomOpen] = useState(false);
	const uri = publicObjectUri(storageKey, GCS_PUBLIC_BASE_URL);

	if (!uri) {
		return null;
	}

	const aspectRatio = width && height ? width / height : undefined;

	return (
		<View className="gap-2">
			<Text className="font-bold text-foreground text-xl">대표 이미지</Text>
			<Pressable
				accessibilityLabel={`${altText || "대표 이미지"} 크게 보기`}
				accessibilityRole="button"
				className="active:opacity-75"
				onPress={() => setIsZoomOpen(true)}
			>
				<Image
					className="w-full rounded-lg border border-border"
					resizeMode="cover"
					source={{ uri }}
					style={{ aspectRatio: aspectRatio ?? 16 / 9 }}
				/>
			</Pressable>
			<Dialog isOpen={isZoomOpen} onOpenChange={setIsZoomOpen}>
				<Dialog.Portal>
					<Dialog.Overlay />
					<Dialog.Content>
						<View className="gap-3">
							<Image
								className="h-96 w-full"
								resizeMode="contain"
								source={{ uri }}
							/>
							<Button onPress={() => setIsZoomOpen(false)} variant="tertiary">
								<Button.Label>닫기</Button.Label>
							</Button>
						</View>
					</Dialog.Content>
				</Dialog.Portal>
			</Dialog>
		</View>
	);
}

export default function ModeratorQueueDetailScreen() {
	const { id } = useLocalSearchParams<{ id: string }>();
	const { toast } = useToast();
	const invalidate = useInvalidateModeration();
	const mutedColor = useThemeColor("muted");
	const [verdict, setVerdict] = useState<null | QueueVerdict>(null);

	const queueQuery = useQuery(queueListOptions());
	const item = queueQuery.data?.find((job) => job.id === id);
	// 본문 블록·미디어는 목록 selection에 없어 상세에서만 따로 읽는다.
	const detailQuery = useQuery({
		...orpc.bambi.moderation.getJobPostForAdmin.queryOptions({
			input: { jobPostId: id },
		}),
		enabled: Boolean(item),
	});
	const setStatusMutation = useMutation(
		orpc.bambi.moderation.setJobPostStatus.mutationOptions()
	);

	if (queueQuery.isLoading) {
		return <LoadingState label="검수 공고를 불러오고 있습니다." />;
	}

	if (!item) {
		return (
			<BambiScreen>
				<StateCard
					action={
						<Button onPress={() => router.back()} size="sm">
							<Button.Label>목록으로</Button.Label>
						</Button>
					}
					description="이미 처리됐거나 목록에서 사라진 공고입니다."
					title="검수 공고를 찾을 수 없어요"
				/>
			</BambiScreen>
		);
	}

	const risk = resolveQueueRiskLevel(item.detectedTerms);
	const config = verdict ? QUEUE_VERDICTS[verdict] : null;
	const detail = detailQuery.data;
	// 자동 검토 요약 — 0건인 축은 빼고 잇는다. 빈 문자열이면 감지가 하나도 없다는 뜻.
	const findingSummary = [
		item.detectedTerms.length > 0
			? `감지된 표현 ${item.detectedTerms.length}건`
			: "",
		item.riskFlags.length > 0 ? `위험 플래그 ${item.riskFlags.length}건` : "",
	]
		.filter((part) => part !== "")
		.join(" · ");

	// 실패는 던진 채로 둔다 — ReasonDialog가 서버 메시지를 다이얼로그 안에 그대로 보인다.
	const handleConfirm = async (reason: string) => {
		if (!(verdict && config)) {
			return false;
		}
		await setStatusMutation.mutateAsync({
			jobPostId: item.id,
			reason,
			status: config.status,
		});
		await invalidate.queue();
		toast.show({ label: config.toast });
		router.back();
		return true;
	};

	return (
		<>
			<BambiScreen
				stickyFooter={
					<View className="flex-row gap-2">
						{(["reject", "hold", "approve"] as const).map((key) => (
							<View
								className={key === "approve" ? "flex-2" : "flex-1"}
								key={key}
							>
								<Button
									onPress={() => setVerdict(key)}
									variant={VERDICT_BUTTON_VARIANTS[key]}
								>
									<Button.Label>{QUEUE_VERDICTS[key].label}</Button.Label>
								</Button>
							</View>
						))}
					</View>
				}
			>
				{/* 목록 카드와 같은 왼쪽 띠. 두께(border-l-4)는 항상 두고 색만 바꾼다 —
				    overflow-hidden Surface에서 두께를 0↔4로 토글하면 Android가 자식을 잘라먹는다. */}
				<Surface
					className={`gap-2 rounded-lg border-l-4 p-4 ${risk === "mid" ? "border-warning" : "border-transparent"}`}
					variant="secondary"
				>
					<View className="flex-row items-center justify-between gap-2">
						<Text className="flex-1 text-muted text-xs" numberOfLines={1}>
							{item.organizationDisplayName} · {item.region}
						</Text>
						<Pill tone={risk === "mid" ? "warning" : "neutral"}>
							{QUEUE_RISK_LABELS[risk]}
						</Pill>
					</View>
					<Text className="font-bold text-2xl text-foreground" selectable>
						{item.title}
					</Text>
					<View className="flex-row flex-wrap items-center gap-1">
						<Text className="text-foreground text-sm">
							{formatPay(item.payAmount, item.payUnit)}
						</Text>
						<Text className="text-muted text-sm">·</Text>
						<Ionicons color={mutedColor} name="time-outline" size={12} />
						{/* 화면에는 상대시간만 두고 절대 시각은 접근성 라벨로 남긴다. */}
						<Text
							accessibilityLabel={`${formatDateTime(item.createdAt)} 접수`}
							className="text-muted text-sm"
						>
							{formatRelativeTime(item.createdAt)} 접수
						</Text>
					</View>
					<Text className="text-muted text-xs" selectable>
						#{item.id.slice(0, 8)}
					</Text>
				</Surface>

				{/* 감지 표현과 위험 플래그는 같은 자동 검토 결과라 Surface 둘로 나누지 않고
				    Alert 하나로 합친다 — 감지가 없다는 사실도 판정 근거라 success로 보인다.
				    Chip은 내부가 Pressable이라 pointerEvents로 터치를 죽여 표식으로만 둔다. */}
				{findingSummary ? (
					<Alert status="warning">
						<Alert.Indicator />
						<Alert.Content className="gap-2">
							<Alert.Title>자동 검토</Alert.Title>
							<Alert.Description>{findingSummary}</Alert.Description>
							{item.detectedTerms.length > 0 ? (
								<View className="flex-row flex-wrap gap-1.5">
									{item.detectedTerms.map((term) => (
										<Chip
											color="warning"
											key={term}
											pointerEvents="none"
											size="sm"
											variant="soft"
										>
											{term}
										</Chip>
									))}
								</View>
							) : null}
							{item.riskFlags.length > 0 ? (
								<View className="flex-row flex-wrap gap-2">
									{item.riskFlags.map((flag) => (
										<Pill key={flag} tone="danger">
											{riskFlagLabel(flag)}
										</Pill>
									))}
								</View>
							) : null}
						</Alert.Content>
					</Alert>
				) : (
					<Alert status="success">
						<Alert.Indicator />
						<Alert.Content>
							<Alert.Title>자동 검토</Alert.Title>
							<Alert.Description>
								감지된 표현·위험 플래그가 없어요.
							</Alert.Description>
						</Alert.Content>
					</Alert>
				)}

				{/* 본문·상세 이미지는 상세 조회가 끝나야 그린다. 여기서 LoadingState/ErrorState를
				    쓰면 화면 껍데기(ScrollView)가 한 번 더 중첩되므로 인라인으로 둔다.
				    검수자는 대표 이미지에서 판단을 시작하므로 설명보다 위에 둔다. */}
				{detail?.media.cover ? (
					<CoverImage
						altText={detail.media.cover.altText}
						height={detail.media.cover.height}
						storageKey={detail.media.cover.storageKey}
						width={detail.media.cover.width}
					/>
				) : null}
				{detailQuery.isLoading ? (
					<View
						accessibilityLabel="공고 본문을 불러오고 있습니다"
						accessible
						className="gap-2"
					>
						<Skeleton className="h-4 w-full rounded-md" />
						<Skeleton className="h-4 w-5/6 rounded-md" />
						<Skeleton className="h-4 w-2/3 rounded-md" />
					</View>
				) : null}
				{detailQuery.isError ? (
					<StateCard
						action={
							<Button onPress={() => detailQuery.refetch()} size="sm">
								<Button.Label>다시 시도</Button.Label>
							</Button>
						}
						description="본문 없이도 판정은 할 수 있지만, 확인 후 처리하는 것을 권합니다."
						title="공고 본문을 불러오지 못했어요"
					/>
				) : null}
				{detail ? (
					<JobDescriptionSection
						description={detail.description}
						descriptionBlocks={detail.descriptionBlocks}
						detail={detail.media.detail}
						gcsPublicBaseUrl={GCS_PUBLIC_BASE_URL}
						title={detail.title}
					/>
				) : null}
			</BambiScreen>
			{config ? (
				<ReasonDialog
					confirmLabel={config.confirmLabel}
					danger={config.danger}
					defaultReason={config.defaultReason}
					description={config.description}
					isOpen={verdict !== null}
					onConfirm={handleConfirm}
					onOpenChange={(open) => {
						if (!open) {
							setVerdict(null);
						}
					}}
					presets={config.reasons}
					title={config.title}
				/>
			) : null}
		</>
	);
}
