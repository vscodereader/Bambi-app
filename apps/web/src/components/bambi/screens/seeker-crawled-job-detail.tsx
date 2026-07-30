"use client";

import type { AppRouter } from "@bambi-app/api/routers/index";
import {
	Alert,
	AlertDescription,
	AlertTitle,
} from "@bambi-app/ui/components/alert";
import { cn } from "@bambi-app/ui/lib/utils";
import type { InferRouterOutputs } from "@orpc/server";
import { InfoIcon } from "lucide-react";
import Image from "next/image";
import { formatMarketplacePay } from "@/lib/bambi/api-job-mapper";
import { useAdBannerJobs } from "@/lib/bambi/api-jobs";
import { SEEKER_CONTENT_WIDTH } from "@/lib/bambi/layout";
import { NEGOTIABLE_PAY_TEXT } from "@/lib/bambi-options";
import { AdBannerRail, HorizontalAdBannerRail } from "../ad-banner";
import { Button, InfoTile } from "../ds";
import { ClockIcon, DollarCircle } from "../icons";

type CrawledJobDetail =
	InferRouterOutputs<AppRouter>["bambi"]["crawledJobs"]["getById"];

interface SeekerCrawledJobDetailProps {
	job: CrawledJobDetail;
	onBack: () => void;
}

// 급여는 금액이 파싱된 경우에만 단위와 함께 조립한다. 파싱이 안 됐으면 원문("일 15만원",
// "면접 후 협의")을 그대로 보여준다 — 모르는 금액을 지어내는 것보다 원문이 정확하다.
const formatCrawledPay = (job: CrawledJobDetail): string => {
	if (job.payAmount !== null) {
		return formatMarketplacePay(job);
	}

	return job.payRaw ?? NEGOTIABLE_PAY_TEXT;
};

// 외부 사이트에서 수집한 공고 상세. 우리 공고 상세(SeekerJobDetailResponsive)를 재사용하지
// 않는다 — 그 화면의 검수·인증 배지 문구가 하드코딩이라, 우리가 확인한 적 없는 공고에
// 그대로 붙으면 거짓 신호가 된다. 채팅·후기·신고·연락처도 없다(그 공고의 담당자는
// 우리 서비스 이용자가 아니라 응대할 사람이 없고, 연락처는 애초에 서버가 내려주지 않는다).
export function SeekerCrawledJobDetail({
	job,
	onBack,
}: SeekerCrawledJobDetailProps) {
	const adBanners = useAdBannerJobs();
	// 시/도 · 세부지역 · 업종을 한 줄로. 업종은 값 자체가 우리 8종 한국어 라벨이다.
	const meta = [job.region, job.district, job.industryCategory]
		.filter(Boolean)
		.join(" · ");

	return (
		<div className="mx-auto flex w-full justify-center gap-5 py-5 pb-5 md:py-7">
			{/* 좌·우 여백 배너는 우리 공고 상세와 같은 배치다(넓은 화면 전용, 스크롤 추종). */}
			<aside className="hidden w-[259px] shrink-0 min-[1720px]:block">
				<div className="sticky top-20">
					<HorizontalAdBannerRail items={adBanners.leftBanner} />
				</div>
			</aside>
			<div className={cn("w-full min-w-0 px-5 md:px-6", SEEKER_CONTENT_WIDTH)}>
				<main className="min-w-0">
					<div className="mb-4 flex items-center gap-2">
						<Button onClick={onBack} size="sm" variant="secondary">
							목록으로
						</Button>
					</div>
					<Alert className="mb-4" variant="warning">
						<InfoIcon />
						<AlertTitle>외부에서 수집된 공고예요</AlertTitle>
						<AlertDescription>
							밤비알바가 검수·인증한 공고가 아니라 다른 채용 사이트에 올라온
							내용을 그대로 옮긴 것이에요. 채팅·지원·연락처 공개는 제공되지
							않고, 조건은 반드시 원본 게시자에게 직접 확인해 주세요.
						</AlertDescription>
					</Alert>
					<section className="rounded-lg bg-card p-5 shadow-sm ring-1 ring-border md:p-7">
						<div className="flex flex-col gap-4">
							<div>
								<h1 className="m-0 font-extrabold text-[28px] leading-tight md:text-[34px]">
									{job.shopName ? `${job.shopName} ` : ""}
									{job.title}
								</h1>
								{meta ? (
									<p className="mt-2 mb-0 text-muted-foreground">{meta}</p>
								) : null}
							</div>
							<div className="flex flex-col gap-3">
								<InfoTile
									icon={<DollarCircle />}
									label="급여"
									value={formatCrawledPay(job)}
								/>
								{job.workSchedule ? (
									<InfoTile
										icon={<ClockIcon />}
										label="근무시간"
										value={job.workSchedule}
									/>
								) : null}
							</div>
						</div>
					</section>
					<section className="mt-4 rounded-lg bg-card p-5 shadow-sm ring-1 ring-border md:p-7">
						<h2 className="m-0 font-extrabold text-xl">공고 설명</h2>
						<p className="mt-3 mb-0 whitespace-pre-line text-[15px] text-foreground leading-relaxed">
							{job.body}
						</p>
						{/* 유흥 공고는 조건 대부분을 이미지로만 적어두는 경우가 많다(본문이 거의
						    비어 있고 이미지 한 장이 공고 전부인 경우도 있다). 크롭 없이 본문 폭에
						    맞춰 원본 비율로 세로로 이어 붙인다. */}
						{job.detailImageUrls.length > 0 ? (
							<div className="mt-5 flex flex-col gap-3">
								{job.detailImageUrls.map((url, index) => (
									<Image
										alt={`${job.title} 상세 이미지 ${index + 1}`}
										className="h-auto w-full rounded-lg border"
										height={1600}
										key={url}
										src={url}
										unoptimized
										width={1200}
									/>
								))}
							</div>
						) : null}
						{/* 상세 이미지가 없으면 목록 썸네일이 유일한 시각 정보다 — 본문이 짧은
						    공고에서 화면이 텅 비는 것을 막는다. */}
						{job.detailImageUrls.length === 0 && job.thumbnailUrl ? (
							<Image
								alt={`${job.title} 대표 이미지`}
								className="mt-5 h-auto w-full rounded-lg border"
								height={600}
								src={job.thumbnailUrl}
								unoptimized
								width={800}
							/>
						) : null}
					</section>
				</main>
			</div>
			<aside className="hidden w-[259px] shrink-0 min-[1720px]:block">
				<div className="sticky top-20">
					<AdBannerRail items={adBanners.rightBanner} />
				</div>
			</aside>
		</div>
	);
}
