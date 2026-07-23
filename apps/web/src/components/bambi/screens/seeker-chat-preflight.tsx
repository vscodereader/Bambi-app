"use client";

import { cn } from "@bambi-app/ui/lib/utils";
import { SEEKER_CONTENT_WIDTH } from "@/lib/bambi/layout";
import type { Job } from "@/lib/bambi/types";
import { Badge, Button, Card, InfoTile } from "../ds";
import {
	BriefcaseIcon,
	CheckIcon,
	ClockIcon,
	DollarCircle,
	MapPinIcon,
	Message,
	ShieldIcon,
	UserIcon,
} from "../icons";

type ChatPreflightEntry = "public" | "seeker";

export interface ChatPreflightStep {
	description: string;
	label: string;
	state: string;
}

interface SeekerChatPreflightProps {
	continueDisabled?: boolean;
	continueLabel?: string;
	entry?: ChatPreflightEntry;
	feedback?: string | null;
	isContinuing?: boolean;
	job: Job;
	onBack: () => void;
	onContinue: () => void;
	steps?: readonly ChatPreflightStep[];
}

const SEEKER_STEPS = [
	{
		description: "구직자 계정으로 공고 기반 채팅을 시작해요.",
		label: "로그인 상태",
		state: "확인됨",
	},
	{
		description: "상대에게 노출되는 정보는 밤비 프로필 기준으로 제한돼요.",
		label: "구직자 프로필",
		state: "확인됨",
	},
	{
		description: "채팅 시작 전 필요한 인증 상태를 확인해요.",
		label: "휴대폰 인증",
		state: "확인 필요",
	},
	{
		description: "검수 상태와 신고 가능 여부를 다시 확인했어요.",
		label: "공고 안전 상태",
		state: "확인됨",
	},
] as const satisfies readonly ChatPreflightStep[];

const PUBLIC_STEPS = [
	{
		description: "공고 지원과 채팅은 로그인 후 이어갈 수 있어요.",
		label: "로그인 상태",
		state: "필요",
	},
	{
		description: "기본 프로필을 만든 뒤 업체와 대화할 수 있어요.",
		label: "구직자 프로필",
		state: "필요",
	},
	{
		description: "연락처 보호와 신고 대응을 위해 인증을 확인해요.",
		label: "휴대폰 인증",
		state: "확인 필요",
	},
	{
		description: "검수 상태와 신고 가능 여부를 먼저 보여드려요.",
		label: "공고 안전 상태",
		state: "확인됨",
	},
] as const satisfies readonly ChatPreflightStep[];

export function SeekerChatPreflight({
	continueDisabled = false,
	continueLabel,
	entry = "seeker",
	feedback,
	isContinuing = false,
	job,
	onBack,
	onContinue,
	steps: overrideSteps,
}: SeekerChatPreflightProps) {
	const steps =
		overrideSteps ?? (entry === "public" ? PUBLIC_STEPS : SEEKER_STEPS);
	const buttonLabel =
		continueLabel ?? (isContinuing ? "채팅방 만드는 중" : "밤비 채팅으로 이동");
	return (
		<div
			className={cn(
				// 채팅 프리플라이트 본문도 다른 seeker 페이지·헤더와 동일한 고정폭
				// (SEEKER_CONTENT_WIDTH = md:max-w-[min(92%,1120px)])을 써 헤더와 넓이·여백을 맞춘다.
				// 기존 뷰포트 80% 단독 폭은 폭 통일 마이그레이션에서 누락돼 헤더와 어긋나던 원인이었다.
				"mx-auto w-full px-5 py-5 pb-28 md:px-6 md:py-7 lg:grid lg:grid-cols-[minmax(0,1fr)_320px] lg:gap-6 lg:pb-8",
				SEEKER_CONTENT_WIDTH
			)}
		>
			<main className="min-w-0">
				<button
					className="mb-4 cursor-pointer rounded-lg border border-border bg-card px-3 py-2 font-bold text-sm"
					onClick={onBack}
					type="button"
				>
					공고로 돌아가기
				</button>
				<section className="rounded-lg bg-card p-5 shadow-sm ring-1 ring-border md:p-7">
					<Badge tone="success">
						<span className="inline-flex size-3.5">
							<ShieldIcon />
						</span>
						연락처 보호 확인
					</Badge>
					<h1 className="mt-4 mb-3 font-extrabold text-[28px] leading-tight md:text-[34px]">
						채팅 전에 안전 상태를 확인해요
					</h1>
					<p className="m-0 max-w-[620px] text-muted-foreground leading-relaxed">
						면접 일정이 확정되기 전까지 전화번호와 외부 연락처는 공개되지
						않아요. 대화는 밤비 채팅방에서 먼저 시작됩니다.
					</p>
					<div className="mt-5 grid gap-3 sm:grid-cols-2">
						<InfoTile icon={<DollarCircle />} label="급여" value={job.pay} />
						<InfoTile icon={<MapPinIcon />} label="지역" value={job.location} />
						<InfoTile icon={<ClockIcon />} label="시간" value={job.hours} />
						<InfoTile icon={<BriefcaseIcon />} label="업종" value={job.type} />
					</div>
				</section>
				<section className="mt-4 rounded-lg bg-card p-5 shadow-sm ring-1 ring-border md:p-7">
					<h2 className="m-0 font-extrabold text-xl">보호 체크</h2>
					<div className="mt-4 grid gap-3">
						{steps.map((step) => (
							<Card
								className="rounded-lg border-border"
								key={step.label}
								pad="md"
								tone="outline"
							>
								<div className="flex items-start gap-3">
									<span className="mt-0.5 inline-flex size-9 shrink-0 items-center justify-center rounded-lg border border-coral-100 bg-coral-50 text-coral-700">
										<span className="inline-flex size-4">
											{step.state === "확인됨" ? <CheckIcon /> : <UserIcon />}
										</span>
									</span>
									<div className="min-w-0 flex-1">
										<div className="flex flex-wrap items-center gap-2">
											<h3 className="m-0 font-extrabold text-base">
												{step.label}
											</h3>
											<Badge
												tone={step.state === "확인됨" ? "success" : "pending"}
											>
												{step.state}
											</Badge>
										</div>
										<p className="mt-1 mb-0 text-muted-foreground text-sm leading-relaxed">
											{step.description}
										</p>
									</div>
								</div>
							</Card>
						))}
					</div>
				</section>
				{feedback ? (
					<div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 font-semibold text-amber-800 text-sm">
						{feedback}
					</div>
				) : null}
			</main>
			<aside className="hidden lg:block">
				<div className="sticky top-20 rounded-lg bg-card p-5 shadow-sm ring-1 ring-border">
					<Badge tone="success">검수 통과</Badge>
					<h2 className="mt-3 mb-2 font-extrabold text-xl leading-snug">
						{job.company} {job.title}
					</h2>
					<p className="m-0 text-muted-foreground text-sm leading-relaxed">
						채팅은 공고 기준으로 생성되고, 신고와 차단은 대화방 안에서 바로
						진입할 수 있어요.
					</p>
					<div className="mt-5 rounded-lg border border-coral-100 bg-coral-50 p-3 text-coral-700">
						<div className="flex items-center gap-2 font-extrabold text-sm">
							<span className="inline-flex size-4">
								<ShieldIcon />
							</span>
							면접 전 연락처 비공개
						</div>
						<p className="mt-1 mb-0 text-xs leading-relaxed">
							연락처는 면접 일정이 확정된 뒤 구인자가 공개해요.
						</p>
					</div>
					<Button
						block
						className="mt-5 shadow-none"
						disabled={continueDisabled || isContinuing}
						onClick={onContinue}
						rightIcon={<Message />}
					>
						{buttonLabel}
					</Button>
				</div>
			</aside>
			<div className="fixed right-0 bottom-0 left-0 z-30 border-border border-t bg-background p-4 lg:hidden">
				<Button
					block
					className="shadow-none"
					disabled={continueDisabled || isContinuing}
					onClick={onContinue}
					rightIcon={<Message />}
				>
					{buttonLabel}
				</Button>
			</div>
		</div>
	);
}
