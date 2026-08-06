"use client";

import type { AppRouter } from "@bambi-app/api/routers/index";
import {
	Alert,
	AlertDescription,
	AlertTitle,
} from "@bambi-app/ui/components/alert";
import { cn } from "@bambi-app/ui/lib/utils";
import type { InferRouterOutputs } from "@orpc/server";
import { useQuery } from "@tanstack/react-query";
import { InfoIcon } from "lucide-react";
import Image from "next/image";
import { formatMarketplacePay } from "@/lib/bambi/api-job-mapper";
import { useAdBannerJobs } from "@/lib/bambi/api-jobs";
import { SEEKER_CONTENT_WIDTH } from "@/lib/bambi/layout";
import { formatMinimumWageLabel } from "@/lib/bambi/minimum-wage";
import { NEGOTIABLE_PAY_TEXT } from "@/lib/bambi-options";
import { orpc } from "@/utils/orpc";
import { AdBannerRail, HorizontalAdBannerRail } from "../ad-banner";
import { Badge, Button, Card, InfoTile } from "../ds";
import { EmptyState } from "../empty-state";
import {
	AlertCircle,
	BriefcaseIcon,
	CheckIcon,
	ClockIcon,
	DollarCircle,
	MapPinIcon,
	ShieldIcon,
	StarIcon,
} from "../icons";
import { EmployerPhoneTile } from "./seeker-job-detail-responsive";

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

// 외부 사이트에서 수집한 공고 상세. 구성(좌우 광고 레일 · 본문 + 320px sticky 요약 카드 ·
// InfoTile 목록)은 우리 공고 상세(SeekerJobDetailResponsive)를 그대로 미러링하되, 컴포넌트는
// 재사용하지 않는다 — 그 화면의 검수·인증 배지와 안전 확인 문구가 하드코딩이라, 우리가 확인한
// 적 없는 공고에 그대로 붙으면 거짓 신호가 된다. 채팅·후기 본문·신고도 없다(담당자가 우리
// 서비스 이용자가 아니라 응대할 사람이 없고, 후기·신고는 서버가 job_post 행을 요구한다).
export function SeekerCrawledJobDetail({
	job,
	onBack,
}: SeekerCrawledJobDetailProps) {
	const adBanners = useAdBannerJobs();
	// 최저시급 부기는 우리 공고 상세와 같은 공개 설정 조회에서 가져온다(광고 슬롯이 이미
	// 같은 쿼리를 쓰므로 추가 요청이 생기지 않는다).
	const siteSettings = useQuery(
		orpc.bambi.siteSettings.getFooter.queryOptions()
	);
	const minimumWageLabel = formatMinimumWageLabel(siteSettings.data);
	// 수집 원본에서 고용형태 자리에 오는 값은 업무내용 원문(industryRaw)이다. 원문이 없으면
	// 우리 8종 업종 라벨로 떨어지고, 둘 다 없으면 항목 자체를 생략한다.
	const employmentType = job.industryRaw ?? job.industryCategory;
	// 시/도 · 세부지역 · 고용형태를 한 줄로(우리 공고 상세의 "지역 · 고용형태" 부제와 같은 자리).
	const meta = [job.region, job.district, employmentType]
		.filter(Boolean)
		.join(" · ");
	const location = [job.region, job.district].filter(Boolean).join(" ");
	const detailImageAssets = new Map(
		job.detailImageDocument.assets.map((asset) => [asset.id, asset])
	);

	return (
		<div className="mx-auto flex w-full justify-center gap-5 py-5 pb-5 md:py-7">
			{/* 좌·우 여백 배너는 우리 공고 상세와 같은 배치다(넓은 화면 전용, 스크롤 추종). */}
			<aside className="hidden w-[259px] shrink-0 min-[1720px]:block">
				<div className="sticky top-20">
					<HorizontalAdBannerRail
						isLoading={adBanners.isLoading}
						items={adBanners.leftBanner}
						promotionSurface="crawled_detail_left"
					/>
				</div>
			</aside>
			<div
				className={cn(
					"w-full min-w-0 px-5 md:px-6 lg:grid lg:grid-cols-[minmax(0,1fr)_320px] lg:gap-6 lg:pb-8",
					SEEKER_CONTENT_WIDTH
				)}
			>
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
							내용을 그대로 옮긴 것이에요. 채팅·지원은 제공되지 않으니, 조건은
							반드시 원본 게시자에게 직접 확인해 주세요.
						</AlertDescription>
					</Alert>
					<section className="rounded-lg bg-card p-5 shadow-sm ring-1 ring-border md:p-7">
						<div className="flex flex-col gap-4">
							<div className="flex flex-wrap items-center gap-2">
								{/* 우리 공고 상세가 검수·연락처보호 배지를 다는 자리. 수집분에는 둘 다
								    사실이 아니라 출처만 밝히는 중립 배지로 대체한다. */}
								<Badge tone="neutral">외부 수집 공고</Badge>
							</div>
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
									value={
										// 우리 공고 상세와 같이 금액 오른쪽에 비교 기준(최저시급)을 약한
										// 위계로 붙인다. 좁은 화면에서는 wrap으로 아래 줄에 떨어진다.
										<span className="flex flex-wrap items-baseline gap-x-2">
											{formatCrawledPay(job)}
											<span className="font-medium text-muted-foreground text-sm">
												{minimumWageLabel}
											</span>
										</span>
									}
								/>
								{job.workSchedule ? (
									<InfoTile
										icon={<ClockIcon />}
										label="근무시간"
										value={job.workSchedule}
									/>
								) : null}
								{/* 수집 원본에 연락처가 적혀 있을 때만 노출한다(상세 재수집 전 데이터는
								    null이다). 타일 룩·안내 문구는 우리 공고 상세와 공유한다. */}
								{job.contactPhone ? (
									<EmployerPhoneTile phone={job.contactPhone} />
								) : null}
								{employmentType ? (
									<InfoTile
										icon={<BriefcaseIcon />}
										label="고용형태"
										value={employmentType}
									/>
								) : null}
								{/* 아래 후기 섹션과 같은 이유로 값은 언제나 0개다. 요약 타일 표기만
								    우리 공고와 같은 형식으로 "신규"로 적는다. */}
								<InfoTile icon={<StarIcon />} label="후기" value="0개 · 신규" />
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
						{job.detailImageDocument.items.length > 0 ? (
							<div className="mt-5 flex flex-col gap-3">
								{job.detailImageDocument.items.map((item, index) => {
									const asset = detailImageAssets.get(item.assetId);
									if (!asset) {
										return null;
									}
									return (
										<div
											className="mx-auto max-w-full"
											key={item.id}
											style={{
												aspectRatio:
													item.heightPx === null
														? undefined
														: `${item.widthPx ?? asset.width} / ${item.heightPx}`,
												marginBottom: item.offsetY,
												transform: `translate(${item.offsetX}px, ${item.offsetY}px)`,
												width: item.widthPx ?? "100%",
											}}
										>
											<Image
												alt={`${job.title} 상세 이미지 ${index + 1}`}
												className={`${item.heightPx === null ? "h-auto" : "h-full"} w-full rounded-lg border`}
												height={asset.height}
												src={asset.src}
												unoptimized
												width={asset.width}
											/>
										</div>
									);
								})}
							</div>
						) : null}
						{/* 목록 썸네일(thumbnailUrl)은 상세에 폴백으로 넣지 않는다 — 상세 내용이
						    썸네일로 대체돼 버린다. 상세 이미지가 비면 수집 파서 문제이므로
						    화면에서 대체물을 만들지 말고 파서를 고친다. */}
					</section>
					{/* 우리 공고 상세와 같은 자리·같은 3칸 카드 구성의 안전 확인. 문구만 바꿨다 —
					    우리 공고의 세 항목(연락처 비공개·공고 검수·신고 가능)은 수집분에선 셋 다
					    사실이 아니라, 출처 고지와 자기 방어 수칙으로 대체한다. */}
					<section className="mt-4 rounded-lg bg-card p-5 shadow-sm ring-1 ring-border md:p-7">
						<h2 className="m-0 font-extrabold text-xl">안전 확인</h2>
						<div className="mt-4 grid gap-3 md:grid-cols-3">
							<Card className="rounded-lg" pad="md" tone="subtle">
								<span className="inline-flex size-5 text-green-600">
									<ShieldIcon />
								</span>
								<h3 className="my-2 font-extrabold text-base">
									외부 수집 공고
								</h3>
								<p className="m-0 text-muted-foreground text-sm leading-relaxed">
									다른 채용 사이트의 공고를 그대로 옮겨온 것으로, 밤비알바의
									검수·인증을 거치지 않았어요.
								</p>
							</Card>
							<Card className="rounded-lg" pad="md" tone="subtle">
								<span className="inline-flex size-5 text-red-600">
									<AlertCircle />
								</span>
								<h3 className="my-2 font-extrabold text-base">
									조건 직접 확인
								</h3>
								<p className="m-0 text-muted-foreground text-sm leading-relaxed">
									급여·근무 조건은 반드시 원본 게시자에게 직접 확인하고,
									선입금·보증금 요구는 거절하세요.
								</p>
							</Card>
							<Card className="rounded-lg" pad="md" tone="subtle">
								<span className="inline-flex size-5 text-green-600">
									<CheckIcon />
								</span>
								<h3 className="my-2 font-extrabold text-base">
									안전 이용 수칙
								</h3>
								<p className="m-0 text-muted-foreground text-sm leading-relaxed">
									면접은 공개된 장소에서 진행하고, 신분증 사본 등 개인정보
									전달은 신중하게 결정하세요.
								</p>
							</Card>
						</div>
					</section>
					{/* 후기 섹션은 우리 공고 상세의 후기 컴포넌트 마크업(제목 + 빈 상태)을 미러링한
					    정적 블록이다. 그 컴포넌트를 재사용하지 않는 이유: 후기 조회가 회원 전용이라
					    비로그인 방문자에게 에러가 뜨고, review.jobPostId는 우리 job_post를 가리켜
					    수집 공고 id로는 언제나 빈 결과다. 그래서 쿼리 없이 0개 상태만 그린다. */}
					<section className="mt-4 rounded-lg bg-card p-5 shadow-sm ring-1 ring-border md:p-7">
						<div className="flex flex-wrap items-center gap-3">
							<h2 className="m-0 font-extrabold text-xl">후기</h2>
						</div>
						<EmptyState
							className="mt-2"
							description="외부 수집 공고는 밤비알바 채팅·면접을 거치지 않아 후기가 쌓이지 않아요."
							title="아직 등록된 후기가 없어요"
						/>
					</section>
				</main>
				{/* 우리 공고 상세와 같은 위치의 요약 카드. 채팅 CTA는 없고(담당자가 우리 이용자가
				    아니다), 신고 버튼도 없다 — moderation.createReport가 job_post 행을 확인하므로
				    수집 공고 id로는 접수 자체가 실패한다. */}
				<aside className="hidden lg:block">
					<div className="sticky top-20 rounded-lg bg-card p-5 shadow-sm ring-1 ring-border">
						<Badge tone="neutral">외부 수집</Badge>
						<div className="mt-3 mb-2 flex flex-wrap items-baseline gap-x-2">
							<h2 className="m-0 font-extrabold text-xl">
								{formatCrawledPay(job)}
							</h2>
							<span className="font-medium text-muted-foreground text-sm">
								{minimumWageLabel}
							</span>
						</div>
						<div className="grid gap-3 text-sm">
							{location ? (
								<div className="flex items-center gap-2 font-bold">
									<span className="inline-flex size-4 text-coral-600">
										<MapPinIcon />
									</span>
									{location}
								</div>
							) : null}
							{job.workSchedule ? (
								<div className="flex items-center gap-2 font-bold">
									<span className="inline-flex size-4 text-coral-600">
										<ClockIcon />
									</span>
									{job.workSchedule}
								</div>
							) : null}
						</div>
						<p className="mt-5 mb-0 text-muted-foreground text-xs leading-relaxed">
							밤비알바가 검수한 공고가 아니어서 신고 접수 대상이 아니에요.
							조건은 원본 게시자에게 직접 확인해 주세요.
						</p>
					</div>
				</aside>
			</div>
			<aside className="hidden w-[259px] shrink-0 min-[1720px]:block">
				<div className="sticky top-20">
					<AdBannerRail
						isLoading={adBanners.isLoading}
						items={adBanners.rightBanner}
						promotionSurface="crawled_detail_right"
					/>
				</div>
			</aside>
		</div>
	);
}
