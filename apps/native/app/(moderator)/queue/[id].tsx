import {
	QUEUE_RISK_LABELS,
	QUEUE_VERDICTS,
	type QueueVerdict,
	resolveQueueRiskLevel,
	riskFlagLabel,
} from "@bambi-app/api/services/bambi-moderation-labels";
import { env } from "@bambi-app/env/native";
import { useMutation, useQuery } from "@tanstack/react-query";
import { type Href, useLocalSearchParams } from "expo-router";
import { Button, Dialog, Spinner, Surface, useToast } from "heroui-native";
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
import { returnToModeratorList } from "@/src/lib/moderation/navigation";
import {
	queueListOptions,
	useInvalidateModeration,
} from "@/src/lib/moderation/queries";
import { orpc } from "@/src/lib/orpc";

const GCS_PUBLIC_BASE_URL = env.EXPO_PUBLIC_GCS_PUBLIC_BASE_URL;

// 승인이 주 액션, 보류는 대안, 반려만 파괴적 — 하단 바의 위계를 한자리에서 정한다.
const VERDICT_BUTTON_VARIANTS = {
	approve: "primary",
	hold: "secondary",
	reject: "danger",
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
						<Button
							onPress={() =>
								returnToModeratorList("/(moderator)/(tabs)" as Href)
							}
							size="sm"
						>
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
		returnToModeratorList("/(moderator)/(tabs)" as Href);
		return true;
	};

	return (
		<>
			<BambiScreen
				stickyFooter={
					<View className="flex-row gap-2">
						{(["approve", "hold", "reject"] as const).map((key) => (
							<View className="flex-1" key={key}>
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
				<Surface className="gap-2 rounded-lg p-4" variant="secondary">
					<Text className="text-muted text-sm" selectable>
						{item.organizationDisplayName}
					</Text>
					<Text className="font-bold text-2xl text-foreground" selectable>
						{item.title}
					</Text>
					<View className="flex-row flex-wrap gap-2">
						<Pill tone={risk === "mid" ? "warning" : "neutral"}>
							{QUEUE_RISK_LABELS[risk]}
						</Pill>
						<Pill>{item.region}</Pill>
					</View>
					<Text className="text-foreground text-sm" selectable>
						{formatPay(item.payAmount, item.payUnit)}
					</Text>
					<Text className="text-muted text-xs">
						{formatDateTime(item.createdAt)} · #{item.id.slice(0, 8)}
					</Text>
				</Surface>

				{item.riskFlags.length > 0 ? (
					<Surface className="gap-2 rounded-lg p-4" variant="secondary">
						<Text className="font-bold text-base text-foreground">
							위험 플래그
						</Text>
						<View className="flex-row flex-wrap gap-2">
							{item.riskFlags.map((flag) => (
								<Pill key={flag} tone="danger">
									{riskFlagLabel(flag)}
								</Pill>
							))}
						</View>
					</Surface>
				) : null}

				{item.detectedTerms.length > 0 ? (
					<Surface className="gap-2 rounded-lg p-4" variant="secondary">
						<Text className="font-bold text-base text-foreground">
							감지된 표현
						</Text>
						<View className="flex-row flex-wrap gap-2">
							{item.detectedTerms.map((term) => (
								<Pill key={term} tone="warning">
									{term}
								</Pill>
							))}
						</View>
					</Surface>
				) : null}

				{/* 본문·상세 이미지는 상세 조회가 끝나야 그린다. 여기서 LoadingState/ErrorState를
				    쓰면 화면 껍데기(ScrollView)가 한 번 더 중첩되므로 인라인으로 둔다. */}
				{detail ? (
					<JobDescriptionSection
						description={detail.description}
						descriptionBlocks={detail.descriptionBlocks}
						detail={detail.media.detail}
						gcsPublicBaseUrl={GCS_PUBLIC_BASE_URL}
						highlightTerms={item.detectedTerms}
						title={detail.title}
					/>
				) : null}
				{detailQuery.isLoading ? (
					<View className="flex-row items-center gap-3">
						<Spinner size="sm" />
						<Text className="text-muted text-sm">
							공고 본문을 불러오고 있습니다.
						</Text>
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
				{detail?.media.cover ? (
					<CoverImage
						altText={detail.media.cover.altText}
						height={detail.media.cover.height}
						storageKey={detail.media.cover.storageKey}
						width={detail.media.cover.width}
					/>
				) : null}

				<Text className="text-muted text-sm leading-5">
					판정은 처리 기록에 남아요.
				</Text>
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
