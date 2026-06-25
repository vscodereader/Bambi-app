"use client";

import type { Job } from "@/lib/bambi/types";
import { Badge, Button, Card, InfoTile } from "../ds";
import {
	AlertCircle,
	BriefcaseIcon,
	CheckIcon,
	ClockIcon,
	DollarCircle,
	MapPinIcon,
	Message,
	ShieldIcon,
	StarIcon,
} from "../icons";

interface SeekerJobDetailResponsiveProps {
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

export function SeekerJobDetailResponsive({
	job,
	onBack,
	onReport,
	onStartChat,
}: SeekerJobDetailResponsiveProps) {
	return (
		<div className="mx-auto w-full max-w-[1120px] px-4 py-5 pb-28 md:px-6 md:py-7 lg:grid lg:grid-cols-[minmax(0,1fr)_320px] lg:gap-6 lg:pb-8">
			<main className="min-w-0">
				<button
					className="mb-4 cursor-pointer rounded-lg border border-border bg-card px-3 py-2 font-bold text-sm"
					onClick={onBack}
					type="button"
				>
					목록으로
				</button>
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
						<div className="grid gap-3 sm:grid-cols-2">
							<InfoTile icon={<DollarCircle />} label="급여" value={job.pay} />
							<InfoTile
								icon={<ClockIcon />}
								label="근무시간"
								value={job.hours}
							/>
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
					<p className="mt-3 mb-0 text-[15px] text-foreground leading-relaxed">
						{job.desc}
					</p>
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
			</main>
			<aside className="hidden lg:block">
				<div className="sticky top-20 rounded-lg bg-card p-5 shadow-sm ring-1 ring-border">
					<Badge tone="success">검증 완료</Badge>
					<h2 className="mt-3 mb-2 font-extrabold text-xl">{job.pay}</h2>
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
					<div className="mt-5 rounded-lg bg-coral-50 p-3 text-coral-700">
						<div className="flex items-center gap-2 font-extrabold text-sm">
							<span className="inline-flex size-4">
								<ShieldIcon />
							</span>
							안전하게 채팅 시작
						</div>
						<p className="mt-1 mb-0 text-xs leading-relaxed">
							플랫폼 안에서 먼저 대화하고, 면접 확정 뒤 연락처 공개를 선택해요.
						</p>
					</div>
					<Button
						block
						className="mt-5"
						onClick={onStartChat}
						rightIcon={<Message />}
					>
						1:1 채팅 시작
					</Button>
					<Button
						block
						className="mt-2"
						onClick={onReport}
						size="md"
						variant="secondary"
					>
						공고 신고
					</Button>
				</div>
			</aside>
			<div className="fixed right-0 bottom-0 left-0 z-30 border-border border-t bg-background p-4 lg:hidden">
				<Button block onClick={onStartChat} rightIcon={<Message />}>
					1:1 채팅 시작
				</Button>
			</div>
		</div>
	);
}
