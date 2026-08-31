import type { AppRouterClient } from "@bambi-app/api/routers/index";
import { useQuery } from "@tanstack/react-query";
import { useLocalSearchParams } from "expo-router";
import { Surface } from "heroui-native";
import { Image, Text, View } from "react-native";

import {
	BambiHeader,
	BambiScreen,
	ErrorState,
	formatPay,
	LoadingState,
	Pill,
} from "@/src/components/bambi-screen";
import { orpc } from "@/src/lib/orpc";

// native는 @orpc/server(InferRouterOutputs)를 의존하지 않으므로 클라이언트 호출 반환형에서
// 상세 응답 타입을 끌어온다.
type CrawledJob = Awaited<
	ReturnType<AppRouterClient["bambi"]["crawledJobs"]["getById"]>
>;

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

	if (jobQuery.isLoading) {
		return <LoadingState label="공고 상세를 불러오고 있습니다." />;
	}

	if (jobQuery.isError || !jobQuery.data) {
		return <ErrorState onRetry={() => jobQuery.refetch()} />;
	}

	const job = jobQuery.data;
	// 고용형태 자리에는 원문(industryRaw)이 우선이고, 없으면 우리 업종 라벨로 떨어진다(웹과 동일).
	const employmentType = job.industryRaw ?? job.industryCategory;
	const meta = [job.region, job.district, employmentType]
		.filter(Boolean)
		.join(" · ");
	const assetsById = new Map(
		job.detailImageDocument.assets.map((asset) => [asset.id, asset])
	);

	return (
		<BambiScreen>
			<BambiHeader
				description={meta || undefined}
				title={job.shopName ? `${job.shopName} ${job.title}` : job.title}
			/>
			<Surface className="gap-4 rounded-lg p-4" variant="secondary">
				<View className="flex-row flex-wrap gap-2">
					{job.region ? <Pill>{job.region}</Pill> : null}
					{employmentType ? <Pill tone="accent">{employmentType}</Pill> : null}
				</View>
				<Text className="font-bold text-foreground text-xl" selectable>
					{formatCrawledPay(job)}
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
			{/* 유흥 공고는 조건 대부분을 이미지로만 적어두는 경우가 많다(본문이 거의 비어 있고
			    이미지 한 장이 공고 전부인 경우도 있다). 본문 폭에 맞춰 원본 비율로 세로로 잇는다.
			    ponytail: 웹 에디터의 offset·개별 크기 미세조정은 옮기지 않고 asset 원본 비율만
			    쓴다 — native에서 그 정밀 배치가 필요해지면 그때 item.widthPx/offset을 반영한다. */}
			{job.detailImageDocument.items.map((item, index) => {
				const asset = assetsById.get(item.assetId);
				if (!asset) {
					return null;
				}

				return (
					<Image
						accessibilityLabel={`${job.title} 상세 이미지 ${index + 1}`}
						className="w-full rounded-lg border border-border"
						key={item.id}
						resizeMode="contain"
						source={{ uri: asset.src }}
						style={{ aspectRatio: asset.width / asset.height }}
					/>
				);
			})}
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
