import type { AppRouterClient } from "@bambi-app/api/routers/index";
import { useQuery } from "@tanstack/react-query";
import { useLocalSearchParams } from "expo-router";
import { Surface } from "heroui-native";
import { Text, View } from "react-native";

import {
	BambiScreen,
	ErrorState,
	formatMinimumWageLabel,
	formatPayUnitFirst,
	InfoTile,
	LoadingState,
	Pill,
} from "@/src/components/bambi-screen";
import { CrawledJobDetailImages } from "@/src/components/crawled-job-detail-images";
import { CrawledJobReviews } from "@/src/components/crawled-job-reviews";
import { orpc } from "@/src/lib/orpc";

// native는 @orpc/server(InferRouterOutputs)를 의존하지 않으므로 클라이언트 호출 반환형에서
// 상세 응답 타입을 끌어온다.
type CrawledJob = Awaited<
	ReturnType<AppRouterClient["bambi"]["crawledJobs"]["getById"]>
>;

// 급여는 금액이 파싱된 경우에만 단위와 조립하고, 아니면 원문("일 15만원"·"면접 후 협의")을
// 그대로 보여준다.
function formatCrawledPay(job: CrawledJob): string {
	if (job.payAmount !== null) {
		return formatPayUnitFirst(job.payAmount, job.payUnit);
	}

	return job.payRaw ?? "급여 협의";
}

// 수집 공고 상세. 제목 + 배지/정보 타일 Surface + 상세 이미지 + 후기 구성이되, 채팅 CTA
// 하단 고정 바는 두지 않는다 — 수집 공고는 조직·채팅 상대가 없다. 대신 웹 크롤 상세와 같은
// 자기방어 안내를 스크롤 끝에 남긴다. 검수·인증 배지도 달지 않는다(우리가 확인한 적 없는
// 공고라 거짓 신호가 된다 — 웹과 동일 판단).
export default function SeekerCrawledJobDetailScreen() {
	const { id } = useLocalSearchParams<{ id: string }>();
	const jobQuery = useQuery(
		orpc.bambi.crawledJobs.getById.queryOptions({ input: { id } })
	);
	// 최저시급 부기는 우리 공고 상세와 같은 공개 설정 조회에서 가져온다(웹과 동일 프로시저).
	const siteSettings = useQuery(
		orpc.bambi.siteSettings.getFooter.queryOptions()
	);

	if (jobQuery.isLoading) {
		return <LoadingState label="공고 상세를 불러오고 있습니다." />;
	}

	if (jobQuery.isError || !jobQuery.data) {
		return <ErrorState onRetry={() => jobQuery.refetch()} />;
	}

	const job = jobQuery.data;
	const minimumWageLabel = formatMinimumWageLabel(siteSettings.data);
	// 고용형태 자리에는 원문(industryRaw)이 우선이고, 없으면 우리 업종 라벨로 떨어진다(웹과 동일).
	const employmentType = job.industryRaw ?? job.industryCategory;

	return (
		<BambiScreen>
			{/* BambiHeader 대신 제목만 그린다 — BambiHeader의 py-2가 얹히면 제목-정보 섹션
			    간격이 섹션끼리 간격(BambiScreen gap-4)보다 넓어진다. */}
			<Text className="font-bold text-3xl text-foreground" selectable>
				{job.shopName ? `${job.shopName} ${job.title}` : job.title}
			</Text>
			<Surface className="gap-4 rounded-lg p-4" variant="secondary">
				{/* 지역 · 세부지역 · 고용형태 배지(값이 있을 때만) — 웹의 region/district/고용형태 축. */}
				<View className="flex-row flex-wrap gap-2">
					{job.region ? <Pill>{job.region}</Pill> : null}
					{job.district ? <Pill>{job.district}</Pill> : null}
					{employmentType ? <Pill tone="accent">{employmentType}</Pill> : null}
				</View>
				{/* 웹 수집 상세와 같은 정보 타일 스택(급여/근무시간/구인자 연락처/후기). */}
				<InfoTile
					icon="cash-outline"
					label="급여"
					sub={
						<Text className="text-muted text-sm" selectable>
							{minimumWageLabel}
						</Text>
					}
					value={formatCrawledPay(job)}
				/>
				{job.workSchedule ? (
					<InfoTile
						icon="time-outline"
						label="근무시간"
						value={job.workSchedule}
					/>
				) : null}
				{/* 원본 사이트에서도 구직자에게 공개돼 있던 번호다(웹 크롤 상세와 동일 취급).
				    채팅 상대가 없어 이 번호가 유일한 연락 경로라 상세에 노출한다. */}
				{job.contactPhone ? (
					<InfoTile
						icon="call-outline"
						label="구인자 연락처"
						sub={
							<Text
								className="text-accent-soft-foreground text-sm leading-5 dark:text-accent"
								selectable
							>
								('밤비알바 보고 연락드렸다고 하시면 정확한 상담 받으실 수
								있어요.')
							</Text>
						}
						value={job.contactPhone}
					/>
				) : null}
				{/* 후기 값은 웹과 동일하게 정적 표기다. 수집 공고는 job_post 행이 없어 언제나
				    0개다(웹도 하드코딩 "0개 · 신규").
				    ponytail: 실제 집계가 필요해지면 그때 후기 개수 프로시저를 붙인다. */}
				<InfoTile icon="star-outline" label="후기" value="0개 · 신규" />
				{job.body ? (
					<Text className="text-foreground leading-6" selectable>
						{job.body}
					</Text>
				) : null}
			</Surface>
			<CrawledJobDetailImages
				document={job.detailImageDocument}
				title={job.title}
			/>
			<CrawledJobReviews crawledJobPostId={job.id} />
			<Surface className="gap-2 rounded-lg p-4" variant="tertiary">
				<Text className="font-semibold text-foreground text-sm" selectable>
					안전 확인
				</Text>
				<Text className="text-muted text-sm leading-5" selectable>
					급여·근무 조건은 반드시 원본 게시자에게 직접 확인하고, 선입금·보증금
					요구는 거절하세요.
				</Text>
			</Surface>
		</BambiScreen>
	);
}
