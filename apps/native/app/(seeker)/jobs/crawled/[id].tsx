import type { AppRouterClient } from "@bambi-app/api/routers/index";
import { DEFAULT_MINIMUM_WAGE } from "@bambi-app/api/services/bambi-policy";
import { useQuery } from "@tanstack/react-query";
import { useLocalSearchParams } from "expo-router";
import { Surface } from "heroui-native";
import { Text, View } from "react-native";

import {
	BambiHeader,
	BambiScreen,
	ErrorState,
	formatPay,
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

interface MinimumWageSettings {
	minimumWageHourly?: null | number;
	minimumWageYear?: null | number;
}

// 급여 옆 보조 표기("2026년 최저시급 10,320원") — 웹 lib/bambi/minimum-wage의
// formatMinimumWageLabel과 같은 규칙. 미설정(null)·조회 실패·로딩 중(undefined)에는 코드
// 기본값으로 떨어져 표기가 깜빡이며 사라지지 않게 한다. 연도는 저장값을 그대로 쓴다.
function formatMinimumWageLabel(settings?: MinimumWageSettings | null): string {
	const year = settings?.minimumWageYear ?? DEFAULT_MINIMUM_WAGE.year;
	const hourly = settings?.minimumWageHourly ?? DEFAULT_MINIMUM_WAGE.hourly;
	return `${year}년 최저시급 ${hourly.toLocaleString("ko-KR")}원`;
}

// 급여는 금액이 파싱된 경우에만 단위와 조립하고, 아니면 원문("일 15만원"·"면접 후 협의")을
// 그대로 보여준다 — 웹 seeker-crawled-job-detail의 formatCrawledPay와 같은 규칙.
function formatCrawledPay(job: CrawledJob): string {
	if (job.payAmount !== null) {
		return formatPay(job.payAmount, job.payUnit);
	}

	return job.payRaw ?? "급여 협의";
}

// 수집 공고 상세. 우리 공고 상세(jobs/[id])와 같은 구성(BambiHeader + Surface + Pill + 급여 +
// 설명)을 재사용하되, 채팅 CTA 하단 고정 바는 두지 않는다 — 수집 공고는 조직·채팅 상대가
// 없다. 대신 웹 크롤 상세와 같은 자기방어 안내를 스크롤 끝에 남긴다. 검수·인증 배지도 달지
// 않는다(우리가 확인한 적 없는 공고라 거짓 신호가 된다 — 웹과 동일 판단).
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
			<BambiHeader
				title={job.shopName ? `${job.shopName} ${job.title}` : job.title}
			/>
			<Surface className="gap-4 rounded-lg p-4" variant="secondary">
				{/* 지역 · 세부지역 · 고용형태 배지(값이 있을 때만) — 웹의 region/district/고용형태 축. */}
				<View className="flex-row flex-wrap gap-2">
					{job.region ? <Pill>{job.region}</Pill> : null}
					{job.district ? <Pill>{job.district}</Pill> : null}
					{employmentType ? <Pill tone="accent">{employmentType}</Pill> : null}
				</View>
				{/* 급여 오른쪽에 비교 기준(최저시급)을 약한 위계로 붙인다 — 웹과 동일. */}
				<View className="flex-row flex-wrap items-baseline gap-x-2 gap-y-1">
					<Text className="font-bold text-foreground text-xl" selectable>
						{formatCrawledPay(job)}
					</Text>
					<Text className="text-muted text-sm" selectable>
						{minimumWageLabel}
					</Text>
				</View>
				{/* 후기 축은 웹 요약 타일과 같은 형식으로 표기한다. 수집 공고는 job_post 행이 없어
				    후기 값이 언제나 0개다(웹도 하드코딩 "0개 · 신규").
				    ponytail: 실제 집계가 필요해지면 그때 후기 개수 프로시저를 붙인다. */}
				<Text className="text-muted text-sm" selectable>
					후기 0개 · 신규
				</Text>
				{job.workSchedule ? (
					<Text className="text-muted text-sm leading-5" selectable>
						근무시간: {job.workSchedule}
					</Text>
				) : null}
				{/* 원본 사이트에서도 구직자에게 공개돼 있던 번호다(웹 크롤 상세와 동일 취급).
				    채팅 상대가 없어 이 번호가 유일한 연락 경로라 상세에 노출한다. */}
				{job.contactPhone ? (
					<Text className="text-foreground leading-6" selectable>
						연락처: {job.contactPhone}
					</Text>
				) : null}
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
