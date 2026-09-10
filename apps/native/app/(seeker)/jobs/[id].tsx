import { env } from "@bambi-app/env/native";
import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { type Href, router, Stack, useLocalSearchParams } from "expo-router";
import { Button, Surface, useThemeColor } from "heroui-native";
import { useState } from "react";
import { Linking, Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
	BambiScreen,
	ErrorState,
	formatMinimumWageLabel,
	formatPayUnitFirst,
	InfoTile,
	LoadingState,
	Pill,
} from "@/src/components/bambi-screen";
import { JobDescriptionSection } from "@/src/components/job-description-section";
import { MemberOnly } from "@/src/components/member-only";
import { JobReportDialog } from "@/src/components/report-dialog";
import { JobReviewSection } from "@/src/components/seeker/job-review-section";
import { orpc } from "@/src/lib/orpc";

// 상세 이미지는 storageKey만 내려오므로 공개 버킷 base와 합쳐 URL을 만든다(목록 커버와 동일).
const GCS_PUBLIC_BASE_URL = env.EXPO_PUBLIC_GCS_PUBLIC_BASE_URL;

function SeekerJobDetailInner() {
	const insets = useSafeAreaInsets();
	const foreground = useThemeColor("foreground");
	const { id } = useLocalSearchParams<{ id: string }>();
	const [isReportOpen, setIsReportOpen] = useState(false);
	const jobQuery = useQuery(
		orpc.bambi.jobs.getById.queryOptions({ input: { id } })
	);
	// 급여 타일의 최저시급 부기 — 수집 상세와 같은 공개 설정 조회(웹과 동일 프로시저).
	const siteSettings = useQuery(
		orpc.bambi.siteSettings.getFooter.queryOptions()
	);
	const blocks = useQuery(orpc.bambi.blocks.listMine.queryOptions());

	if (jobQuery.isLoading) {
		return <LoadingState label="공고 상세를 불러오고 있습니다." />;
	}

	if (jobQuery.isError || !jobQuery.data) {
		return <ErrorState onRetry={() => jobQuery.refetch()} />;
	}

	const job = jobQuery.data;
	const isBlocked = blocks.data?.some(
		(item) => item.blockedUserId === job.createdByUserId
	);

	// 채팅 CTA는 스크롤 밖 하단 고정 바로 뺀다 — BambiScreen(=Container)의 footer/children은
	// 모두 스크롤 뷰포트 안이라 스크롤과 함께 밀려나기 때문이다. 스크롤 영역(BambiScreen)과
	// 고정 바를 flex-1 래퍼의 형제로 두면 스크롤 영역이 남는 높이만 차지하고 바는 항상 보이며,
	// 콘텐츠가 바에 가려지지도 않는다(별도 하단 스페이서 불필요). 홈 인디케이터 인셋은
	// 이 화면이 탭바 없는 Stack 상세라 탭바가 소화하지 않으므로 바가 직접 흡수한다.
	return (
		<View className="flex-1 bg-background">
			{/* 헤더 우측 신고 버튼 — SeekerStackHeader가 options.headerRight를 렌더한다. */}
			<Stack.Screen
				options={{
					headerRight: () => (
						<Pressable
							accessibilityLabel="이 공고 신고"
							accessibilityRole="button"
							className="h-11 w-11 items-center justify-center rounded-2xl border border-border bg-surface active:opacity-75"
							hitSlop={8}
							onPress={() => setIsReportOpen(true)}
						>
							<Ionicons color={foreground} name="flag-outline" size={22} />
						</Pressable>
					),
				}}
			/>
			<JobReportDialog
				isOpen={isReportOpen}
				onOpenChange={setIsReportOpen}
				targetId={job.id}
			/>
			<BambiScreen>
				{/* BambiHeader 대신 제목만 그린다 — 수집 상세와 동일하게 py-2 초과 여백 없이
				    섹션 간격(BambiScreen gap-4)을 유지한다. 업소명·근무시간은 아래 타일로 내려간다. */}
				<Text className="font-bold text-3xl text-foreground" selectable>
					{job.title}
				</Text>
				<Surface className="gap-4 rounded-lg p-4" variant="secondary">
					<View className="flex-row flex-wrap gap-2">
						<Pill tone="success">
							{job.employerVerificationStatus === "verified" ? "인증" : "검수"}
						</Pill>
						<Pill>{job.region}</Pill>
						<Pill>{job.industryCategory}</Pill>
					</View>
					{/* 수집 상세와 같은 정보 타일 스택(급여/구인 업소/근무시간). */}
					<InfoTile
						icon="cash-outline"
						label="급여"
						sub={
							<Text className="text-muted text-sm" selectable>
								{formatMinimumWageLabel(siteSettings.data)}
							</Text>
						}
						value={formatPayUnitFirst(job.payAmount, job.payUnit)}
					/>
					<InfoTile
						icon="business-outline"
						label="구인 업소"
						value={job.employerDisplayName ?? "밤비알바 구인자"}
					/>
					{job.createdByDisplayName ? (
						<InfoTile
							icon="person-outline"
							label="등록자"
							value={job.createdByDisplayName}
						/>
					) : null}
					<InfoTile
						icon="time-outline"
						label="근무시간"
						value={job.workSchedule}
					/>
					{job.interviewNotes ? (
						<Text className="text-muted text-sm leading-5" selectable>
							면접 안내: {job.interviewNotes}
						</Text>
					) : null}
					<InfoTile
						icon="star-outline"
						label="후기"
						value={
							job.ratingCount > 0
								? `${job.ratingCount}개 · ${job.ratingAverage.toFixed(1)}점`
								: "0개 · 신규"
						}
					/>
					{job.employerVerifiedPhone ? (
						<Pressable
							accessibilityLabel={`구인자 인증 연락처 ${job.employerVerifiedPhone}, 전화 걸기`}
							accessibilityRole="link"
							className="active:opacity-75"
							onPress={() =>
								Linking.openURL(`tel:${job.employerVerifiedPhone}`)
							}
						>
							<InfoTile
								icon="call-outline"
								label="구인자 연락처"
								value={job.employerVerifiedPhone}
							/>
						</Pressable>
					) : null}
				</Surface>
				<JobDescriptionSection
					description={job.description}
					descriptionBlocks={job.descriptionBlocks}
					detail={job.media.detail}
					gcsPublicBaseUrl={GCS_PUBLIC_BASE_URL}
					title={job.title}
				/>
				<JobReviewSection jobPostId={job.id} />
				<Surface className="gap-3 rounded-lg p-4" variant="tertiary">
					<Text className="font-bold text-foreground text-xl">안전 확인</Text>
					<Text className="font-semibold text-foreground">연락처 비공개</Text>
					<Text className="text-muted text-sm leading-5">
						면접 일정이 확정되기 전까지 전화번호와 외부 연락처는 공개되지
						않아요.
					</Text>
					<Text className="font-semibold text-foreground">
						검수 통과한 공고
					</Text>
					<Text className="text-muted text-sm leading-5">
						운영팀의 검수와 결제 확인을 마친 공고예요.
					</Text>
					<Text className="font-semibold text-foreground">신고 가능</Text>
					<Text className="text-muted text-sm leading-5">
						조건 불일치나 외부 연락 유도는 바로 신고할 수 있어요.
					</Text>
				</Surface>
			</BambiScreen>
			<View
				className="gap-2 border-border border-t bg-background px-4 pt-3"
				style={{ paddingBottom: insets.bottom + 12 }}
			>
				{isBlocked ? (
					<View className="gap-2">
						<Text className="text-danger text-sm">
							차단을 해제하면 다시 채팅할 수 있어요.
						</Text>
						<Button
							onPress={() => router.push("/(seeker)/me/blocks" as Href)}
							variant="secondary"
						>
							<Button.Label>차단한 상대 보기</Button.Label>
						</Button>
					</View>
				) : (
					<Button
						accessibilityLabel="안전 확인 후 1:1 채팅 시작"
						onPress={() =>
							router.push({
								pathname: "/(seeker)/jobs/[id]/chat",
								params: { id: job.id },
							} as unknown as Href)
						}
					>
						<Button.Label>1:1 채팅 시작</Button.Label>
					</Button>
				)}
			</View>
		</View>
	);
}

export default function SeekerJobDetailScreen() {
	return (
		<MemberOnly>
			<SeekerJobDetailInner />
		</MemberOnly>
	);
}
