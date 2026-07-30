"use client";

import { cn } from "@bambi-app/ui/lib/utils";
import { useQuery } from "@tanstack/react-query";
import Image from "next/image";
import { useAdBannerJobs } from "@/lib/bambi/api-jobs";
import { SEEKER_CONTENT_WIDTH } from "@/lib/bambi/layout";
import { formatMinimumWageLabel } from "@/lib/bambi/minimum-wage";
import type { Job, JobDescriptionBlock } from "@/lib/bambi/types";
import { orpc } from "@/utils/orpc";
import { AdBannerRail, HorizontalAdBannerRail } from "../ad-banner";
import { Badge, Button, Card, InfoTile } from "../ds";
import {
	AlertCircle,
	BriefcaseIcon,
	CheckIcon,
	ClockIcon,
	DollarCircle,
	MapPinIcon,
	Message,
	PhoneIcon,
	ShieldIcon,
	StarIcon,
} from "../icons";
import { JobReviewSection } from "../job-review-section";

interface SeekerJobDetailResponsiveProps {
	// 채팅은 구직자만 시작할 수 있다. 구인자·운영자에게는 CTA 자체를 감춘다 —
	// 눌러도 서버 가드(enforceJobSeekerAccess)가 각자 홈으로 되돌리므로,
	// 버튼을 남겨두면 아무 설명 없이 튕기는 것처럼 보인다.
	canStartChat: boolean;
	job: Job;
	onBack: () => void;
	onReport: () => void;
	onStartChat: () => void;
}

const formatReviewValue = ({
	rating,
	reviews,
}: Pick<Job, "rating" | "reviews">): string =>
	`${reviews}개 · ${reviews > 0 ? rating.toFixed(1) : "신규"}`;
const BULLET_ITEM_SEPARATOR = /\n+/;

function DescriptionBlock({ block }: { block: JobDescriptionBlock }) {
	if (block.type === "heading") {
		return <h3 className="m-0 font-extrabold text-lg">{block.text}</h3>;
	}

	if (block.type === "bullet_list") {
		const items = block.text
			.split(BULLET_ITEM_SEPARATOR)
			.map((item) => item.trim())
			.filter((item) => item.length > 0);

		return (
			<ul className="m-0 list-disc space-y-1 pl-5 text-[15px] leading-relaxed">
				{items.map((item) => (
					<li key={item}>{item}</li>
				))}
			</ul>
		);
	}

	if (block.type === "callout") {
		return (
			<p className="m-0 whitespace-pre-line border border-coral-200 bg-coral-50 p-3 text-[15px] text-coral-800 leading-relaxed">
				{block.text}
			</p>
		);
	}

	return (
		<p className="m-0 whitespace-pre-line text-[15px] text-foreground leading-relaxed">
			{block.text}
		</p>
	);
}

// 구인자 인증번호는 상세에서 자동 노출한다(면접 왕복 없이 바로 전화). 급여·근무시간 등
// 다른 InfoTile과 동일한 룩(secondary 아이콘 타일·muted 라벨·foreground 번호)으로 두고,
// 번호 바로 옆 상담 안내만 primary 색으로 강조한다. 안내가 길어 wrap되므로 값에는
// truncate를 걸지 않고 아이콘을 상단 정렬(items-start)한다.
// 수집 공고 상세(seeker-crawled-job-detail)도 같은 타일을 쓰므로 export한다 — 연락처 안내
// 문구가 두 화면에서 갈라지면 한쪽만 고쳐지는 사고가 난다.
export function EmployerPhoneTile({ phone }: { phone: string }) {
	return (
		<div className="flex min-w-0 items-start gap-3">
			<div className="inline-flex size-12 flex-[0_0_48px] items-center justify-center rounded-md bg-secondary text-foreground">
				<span className="inline-flex size-[22px]">
					<PhoneIcon />
				</span>
			</div>
			<div className="flex min-w-0 flex-col gap-0.5">
				<span className="font-medium text-muted-foreground text-xs">
					구인자 연락처
				</span>
				{/* 모바일은 번호 아래로 안내를 스택(flex-col), md↑는 번호 옆 한 줄(flex-row). */}
				<span className="flex flex-col gap-0.5 md:flex-row md:items-baseline md:gap-1.5">
					<a
						className="font-bold text-base text-foreground underline-offset-2 hover:underline"
						href={`tel:${phone}`}
					>
						{phone}
					</a>
					<span className="font-medium text-primary text-sm">
						('밤비알바 보고 연락드렸다고 하시면 정확한 상담 받으실 수 있어요.')
					</span>
				</span>
			</div>
		</div>
	);
}

export function SeekerJobDetailResponsive({
	canStartChat,
	job,
	onBack,
	onReport,
	onStartChat,
}: SeekerJobDetailResponsiveProps) {
	const adBanners = useAdBannerJobs();
	// 최저시급은 사이트 설정 공개 조회에 실려 있다(광고 슬롯이 같은 쿼리를 이미 쓰므로
	// 추가 요청이 생기지 않는다). 미설정·실패는 헬퍼가 코드 기본값으로 폴백한다.
	const siteSettings = useQuery(
		orpc.bambi.siteSettings.getFooter.queryOptions()
	);
	const minimumWageLabel = formatMinimumWageLabel(siteSettings.data);
	return (
		// 모바일 하단 고정 CTA 자리를 pb-28로 비워 둔다. CTA를 감추는 역할에서는
		// 그 여백이 빈 공간으로 남으므로 기본 여백으로 되돌린다.
		<div
			className={cn(
				"mx-auto flex w-full justify-center gap-5 py-5 md:py-7",
				canStartChat ? "pb-28" : "pb-5"
			)}
		>
			{/* 좌 여백 배너 — 넓은 화면 전용, 스크롤 추종. 빈 슬롯은 rail이 "광고 모집중"
			    자리표시로 채우므로 조건 없이 렌더한다. */}
			<aside className="hidden w-[259px] shrink-0 min-[1720px]:block">
				<div className="sticky top-20">
					<HorizontalAdBannerRail
						isLoading={adBanners.isLoading}
						items={adBanners.leftBanner}
					/>
				</div>
			</aside>
			{/* 중앙 콘텐츠: 본문 + CTA 고정폭 그리드 */}
			<div
				className={cn(
					"w-full min-w-0 px-5 md:px-6 lg:grid lg:grid-cols-[minmax(0,1fr)_320px] lg:gap-6 lg:pb-8",
					SEEKER_CONTENT_WIDTH
				)}
			>
				<main className="min-w-0">
					<div className="mb-4 flex items-center gap-2">
						<button
							className="cursor-pointer rounded-lg border border-border bg-card px-3 py-2 font-bold text-sm"
							onClick={onBack}
							type="button"
						>
							목록으로
						</button>
						{/* 모바일 전용 신고 진입점 — lg+에서는 우측 CTA aside의 "공고 신고"가 담당하므로 lg:hidden으로 중복 노출 방지 */}
						<Button
							className="lg:hidden"
							onClick={onReport}
							size="sm"
							variant="secondary"
						>
							공고 신고
						</Button>
					</div>
					<section className="rounded-lg bg-card p-5 shadow-sm ring-1 ring-border md:p-7">
						<div className="flex flex-col gap-4">
							<div className="flex flex-wrap items-center gap-2">
								<Badge tone="success">
									<span className="inline-flex size-3.5">
										<CheckIcon />
									</span>
									검수 통과한 공고
								</Badge>
								<Badge tone="neutral">
									<span className="inline-flex size-3.5">
										<ShieldIcon />
									</span>
									연락처 보호
								</Badge>
							</div>
							<div>
								<h1 className="m-0 font-extrabold text-[28px] leading-tight md:text-[34px]">
									{job.company} {job.title}
								</h1>
								<p className="mt-2 mb-0 text-muted-foreground">
									{job.location} · {job.type}
								</p>
							</div>
							{/* 대표 이미지는 목록·카드 썸네일 전용이라 상세에서는 노출하지 않는다. */}
							<div className="flex flex-col gap-3">
								<InfoTile
									icon={<DollarCircle />}
									label="급여"
									value={
										// 급여 금액 오른쪽에 비교 기준(최저시급)을 약한 위계로 붙인다.
										// 좁은 화면에서는 wrap으로 아래 줄에 떨어져 금액이 잘리지 않는다.
										<span className="flex flex-wrap items-baseline gap-x-2">
											{job.pay}
											<span className="font-medium text-muted-foreground text-sm">
												{minimumWageLabel}
											</span>
										</span>
									}
								/>
								<InfoTile
									icon={<ClockIcon />}
									label="근무시간"
									value={job.hours}
								/>
								{job.employerVerifiedPhone ? (
									<EmployerPhoneTile phone={job.employerVerifiedPhone} />
								) : null}
								<InfoTile
									icon={<BriefcaseIcon />}
									label="고용형태"
									value={job.type}
								/>
								<InfoTile
									icon={<StarIcon />}
									label="후기"
									value={formatReviewValue(job)}
								/>
							</div>
						</div>
					</section>
					<section className="mt-4 rounded-lg bg-card p-5 shadow-sm ring-1 ring-border md:p-7">
						<h2 className="m-0 font-extrabold text-xl">공고 설명</h2>
						{job.descriptionBlocks?.length ? (
							<div className="mt-4 grid gap-4">
								{job.descriptionBlocks.map((block) => (
									<DescriptionBlock block={block} key={block.id} />
								))}
							</div>
						) : (
							<p className="mt-3 mb-0 whitespace-pre-line text-[15px] text-foreground leading-relaxed">
								{job.desc}
							</p>
						)}
						{job.detailImages?.length ? (
							// 상세 이미지는 업체가 만든 세로로 긴 홍보 이미지가 대부분이라
							// 크롭·타일링 없이 본문 폭에 맞춰 원본 비율 그대로 세로로 이어 붙인다.
							<div className="mt-5 flex flex-col gap-3">
								{job.detailImages.map((image) => (
									<Image
										alt={image.altText || image.fileName}
										className="h-auto w-full rounded-lg border"
										height={1600}
										key={image.storageKey}
										src={image.url}
										unoptimized
										width={1200}
									/>
								))}
							</div>
						) : null}
					</section>
					<section className="mt-4 rounded-lg bg-card p-5 shadow-sm ring-1 ring-border md:p-7">
						<h2 className="m-0 font-extrabold text-xl">안전 확인</h2>
						<div className="mt-4 grid gap-3 md:grid-cols-3">
							<Card className="rounded-lg" pad="md" tone="subtle">
								<span className="inline-flex size-5 text-green-600">
									<ShieldIcon />
								</span>
								<h3 className="my-2 font-extrabold text-base">연락처 비공개</h3>
								<p className="m-0 text-muted-foreground text-sm leading-relaxed">
									면접 확정 전까지 전화번호는 공개되지 않아요.
								</p>
							</Card>
							<Card className="rounded-lg" pad="md" tone="subtle">
								<span className="inline-flex size-5 text-green-600">
									<CheckIcon />
								</span>
								<h3 className="my-2 font-extrabold text-base">공고 검수</h3>
								<p className="m-0 text-muted-foreground text-sm leading-relaxed">
									위험 표현과 업체 상태를 검수한 공고예요.
								</p>
							</Card>
							<Card className="rounded-lg" pad="md" tone="subtle">
								<span className="inline-flex size-5 text-red-600">
									<AlertCircle />
								</span>
								<h3 className="my-2 font-extrabold text-base">신고 가능</h3>
								<p className="m-0 text-muted-foreground text-sm leading-relaxed">
									조건 불일치나 외부 연락 유도는 바로 신고할 수 있어요.
								</p>
							</Card>
						</div>
					</section>
					<JobReviewSection
						jobPostId={job.id}
						ratingAverage={job.rating}
						reviewCount={job.reviews}
					/>
				</main>
				<aside className="hidden lg:block">
					<div className="sticky top-20 rounded-lg bg-card p-5 shadow-sm ring-1 ring-border">
						<Badge tone="success">검증 완료</Badge>
						<div className="mt-3 mb-2 flex flex-wrap items-baseline gap-x-2">
							<h2 className="m-0 font-extrabold text-xl">{job.pay}</h2>
							<span className="font-medium text-muted-foreground text-sm">
								{minimumWageLabel}
							</span>
						</div>
						<div className="grid gap-3 text-sm">
							<div className="flex items-center gap-2 font-bold">
								<span className="inline-flex size-4 text-coral-600">
									<MapPinIcon />
								</span>
								{job.location}
							</div>
							<div className="flex items-center gap-2 font-bold">
								<span className="inline-flex size-4 text-coral-600">
									<ClockIcon />
								</span>
								{job.hours}
							</div>
						</div>
						{canStartChat ? (
							<>
								<div className="mt-5 rounded-lg bg-coral-50 p-3 text-coral-700">
									<div className="flex items-center gap-2 font-extrabold text-sm">
										<span className="inline-flex size-4">
											<ShieldIcon />
										</span>
										안전하게 채팅 시작
									</div>
									<p className="mt-1 mb-0 text-xs leading-relaxed">
										플랫폼 안에서 먼저 대화하고, 면접 확정 뒤 구인자가 연락처를
										공개해요.
									</p>
								</div>
								<Button
									block
									className="mt-5 shadow-none"
									onClick={onStartChat}
									rightIcon={<Message />}
								>
									1:1 채팅 시작
								</Button>
							</>
						) : null}
						<Button
							block
							className={cn(canStartChat ? "mt-2" : "mt-5")}
							onClick={onReport}
							size="md"
							variant="secondary"
						>
							공고 신고
						</Button>
					</div>
				</aside>
			</div>
			{/* 우 여백 배너 — 넓은 화면 전용, 스크롤 추종. 빈 슬롯은 rail이 "광고 모집중"
			    자리표시로 채우므로 조건 없이 렌더한다. */}
			<aside className="hidden w-[259px] shrink-0 min-[1720px]:block">
				<div className="sticky top-20">
					<AdBannerRail
						isLoading={adBanners.isLoading}
						items={adBanners.rightBanner}
					/>
				</div>
			</aside>
			{canStartChat ? (
				<div className="fixed right-0 bottom-0 left-0 z-30 border-border border-t bg-background p-4 lg:hidden">
					<Button
						block
						className="shadow-none"
						onClick={onStartChat}
						rightIcon={<Message />}
					>
						1:1 채팅 시작
					</Button>
				</div>
			) : null}
		</div>
	);
}
