"use client";

// 밤비 — 구직자(Seeker) 화면: 탐색 → 상세 → 채팅 → 신고.

import {
	Card,
	CardAction,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@bambi-app/ui/components/card";
import { cn } from "@bambi-app/ui/lib/utils";
import type { Route } from "next";
import Link from "next/link";
import { type ReactNode, useEffect, useRef, useState } from "react";
import type { Job, ReportMode, VisualTone } from "@/lib/bambi/types";
import { useBambiAuth } from "../auth-client-provider";
import {
	AppBar,
	Avatar,
	Badge,
	BottomNav,
	Button,
	ChatBubble,
	IconButton,
	InfoTile,
	Logo,
	ScheduleCard,
	SearchField,
	SegmentedTabs,
	Tag,
} from "../ds";
import {
	AlertCircle,
	BellIcon,
	BookmarkIcon,
	BriefcaseIcon,
	CheckIcon,
	ChevronDownIcon,
	ChevronLeftIcon,
	ChevronRightIcon,
	ClipboardListIcon,
	ClockIcon,
	DollarCircle,
	DotsVertical,
	Flash,
	LockIcon,
	Message,
	PlusIcon,
	Search2,
	SettingsIcon,
	ShieldIcon,
	StoreIcon,
	UserIcon,
} from "../icons";
import {
	ATTENDANCE_HREF,
	isMyPageItemVisible,
	MyPageShell,
} from "../my-page-shell";
import { PhoneFrame } from "../phone-frame";
import { ReportDone, ReportForm, SafetyNotice } from "../safety-kit";
import { ContactReveal } from "./contact-reveal";

function SeekerCategory() {
	const [sel, setSel] = useState("전체");
	const cats = [
		"전체",
		"룸싸롱",
		"텐프로/쩜오",
		"노래주점",
		"단란주점",
		"다방",
		"BAR",
		"마사지",
		"요정",
	];
	return (
		<div className="flex gap-2 overflow-x-auto px-6 [scrollbar-width:none]">
			{cats.map((c) => (
				<Tag key={c} onClick={() => setSel(c)} selected={sel === c}>
					{c}
				</Tag>
			))}
			<button
				aria-label="카테고리 더보기"
				className="inline-flex size-9 flex-[0_0_auto] items-center justify-center rounded-full border border-[color:var(--border-default)] bg-card text-muted-foreground"
				type="button"
			>
				<span className="inline-flex size-4">
					<ChevronDownIcon />
				</span>
			</button>
		</div>
	);
}

function TrustStrip({ tone }: { tone: VisualTone }) {
	const dark = tone === "bold";
	return (
		<div
			className={cn(
				"flex items-center gap-2.5 rounded-[14px] px-[14px] py-[13px]",
				dark ? "bg-ink-800 text-white" : "bg-coral-50 text-coral-700"
			)}
		>
			<span
				className={cn(
					"inline-flex size-5 flex-[0_0_20px]",
					dark ? "text-coral-300" : "text-coral-600"
				)}
			>
				<ShieldIcon />
			</span>
			<span className="flex-1 font-bold text-[12.5px] leading-[1.4]">
				연락처는 면접 확정 전까지 비공개로 보호돼요
			</span>
			<span
				aria-hidden="true"
				className="inline-flex size-[18px] flex-[0_0_18px] opacity-70"
			>
				<ChevronRightIcon />
			</span>
		</div>
	);
}

export function SeekerHome({ tone = "calm" }: { tone?: VisualTone }) {
	return (
		<div className="flex min-h-0 flex-1 flex-col">
			<div className="flex items-center justify-between px-5 pt-1.5 pb-2.5">
				<Logo lang="ko" size="md" />
				<div className="flex items-center gap-2">
					<span className="inline-flex h-[30px] items-center gap-[5px] whitespace-nowrap rounded-full bg-secondary px-[11px] font-bold text-foreground text-xs">
						<span className="inline-flex size-[14px] text-green-600">
							<ShieldIcon />
						</span>
						익명 보호 중
					</span>
					<IconButton badge variant="subtle">
						<BellIcon />
					</IconButton>
				</div>
			</div>
			<div className="flex min-h-0 flex-1 flex-col gap-[18px] overflow-y-auto pb-4">
				<div className="px-6 pt-1">
					<h1 className="m-0 font-extrabold text-2xl text-foreground leading-[1.32] tracking-[-0.01em] [font-family:var(--font-display)]">
						하늘님, 좋은 자리를 확인해요
					</h1>
				</div>
				<div className="px-6">
					<SearchField
						filterLabel="필터"
						placeholder="업종, 지역, 공고 제목 검색"
					/>
				</div>
				<div className="px-6">
					<TrustStrip tone={tone} />
				</div>
				<SeekerCategory />
			</div>
		</div>
	);
}

export function SeekerDetail({
	job,
	onBack,
	onStartChat,
	onReport,
}: {
	job: Job;
	onBack: () => void;
	onStartChat: () => void;
	onReport: () => void;
}) {
	const [tab, setTab] = useState("desc");
	const [saved, setSaved] = useState(false);
	const [menu, setMenu] = useState(false);
	return (
		<div className="relative flex min-h-0 flex-1 flex-col">
			<AppBar
				actions={
					<>
						<IconButton
							active={saved}
							onClick={() => setSaved((s) => !s)}
							variant="subtle"
						>
							<BookmarkIcon />
						</IconButton>
						<IconButton onClick={() => setMenu((m) => !m)} variant="subtle">
							<DotsVertical />
						</IconButton>
					</>
				}
				onBack={onBack}
			/>
			{menu ? (
				<>
					<button
						aria-label="메뉴 닫기"
						className="absolute inset-0 z-[5] cursor-default border-none bg-transparent"
						onClick={() => setMenu(false)}
						type="button"
					/>
					<div className="absolute top-[50px] right-3 z-[6] min-w-[180px] overflow-hidden rounded-[14px] border border-[color:var(--border-default)] bg-card shadow-lg">
						<button
							className="flex w-full cursor-pointer items-center gap-2.5 border-none bg-transparent px-4 py-[13px] font-semibold text-red-600 text-sm"
							onClick={() => {
								setMenu(false);
								onReport();
							}}
							type="button"
						>
							<span className="inline-flex size-[18px]">
								<AlertCircle />
							</span>
							이 공고 신고하기
						</button>
					</div>
				</>
			) : null}
			<div className="min-h-0 flex-1 overflow-y-auto pb-5">
				<div className="flex flex-col items-center gap-3 px-6 pt-3 pb-[18px]">
					<Avatar
						className="size-20 flex-[0_0_80px] rounded-[22px] shadow-md"
						name={job.company}
						size="xl"
						square
					/>
					<div className="text-center">
						<h1 className="mt-0 mr-0 mb-1.5 ml-0 font-extrabold text-2xl text-foreground [font-family:var(--font-display)]">
							{job.title}
						</h1>
						<span className="font-medium text-[15px] text-muted-foreground">
							{job.company} · {job.location}
						</span>
					</div>
					<div className="flex items-center gap-1.5 rounded-full bg-green-50 px-3 py-[5px] text-green-600">
						<span className="inline-flex size-[14px]">
							<CheckIcon />
						</span>
						<span className="font-bold text-xs">검수 통과한 공고</span>
					</div>
				</div>
				<div className="px-6">
					<SegmentedTabs
						items={[
							{ value: "desc", label: "공고 설명" },
							{ value: "company", label: "회사 정보" },
							{ value: "reviews", label: "후기" },
						]}
						onChange={setTab}
						value={tab}
						variant="solid"
					/>
				</div>
				<p className="mx-6 my-5 text-[15px] text-foreground leading-[1.6]">
					{job.desc}
				</p>
				<div className="grid grid-cols-2 gap-[18px] px-6 pb-[22px]">
					<InfoTile
						icon={<BriefcaseIcon />}
						label="고용형태"
						value={job.type}
					/>
					<InfoTile icon={<DollarCircle />} label="급여" value={job.pay} />
					<InfoTile icon={<ClockIcon />} label="근무시간" value={job.hours} />
					<InfoTile icon={<Flash />} label="우대사항" value={job.pref} />
				</div>
			</div>
			<div className="flex gap-2.5 border-border border-t px-6 pt-3 pb-1.5">
				<Button block onClick={onStartChat} size="lg" variant="primary">
					1:1 채팅 시작
				</Button>
			</div>
		</div>
	);
}

type ReportStep = "closed" | "form" | "done";

function ReportOverlay({
	mode,
	step,
	company,
	tone,
	onCancel,
	onSubmit,
	onClose,
}: {
	mode: ReportMode;
	step: ReportStep;
	company: string;
	tone: VisualTone;
	onCancel: () => void;
	onSubmit: () => void;
	onClose: () => void;
}) {
	const fullscreen = mode === "fullscreen";
	return (
		<div
			className={cn(
				"absolute inset-0 z-20 flex flex-col",
				fullscreen ? "justify-start" : "justify-end"
			)}
		>
			<button
				aria-label="닫기"
				className={cn(
					"absolute inset-0 cursor-pointer border-none bg-[var(--overlay-scrim)] transition-opacity [transition-duration:var(--dur-base)]",
					fullscreen ? "opacity-0" : "opacity-100"
				)}
				onClick={step === "form" ? onCancel : undefined}
				type="button"
			/>
			<div
				className={cn(
					"relative flex flex-col bg-background shadow-[0_-8px_40px_rgba(0,0,0,0.18)] [animation:bambiSheetUp_var(--dur-base)_var(--ease-out)]",
					fullscreen
						? "h-full max-h-full rounded-none"
						: "h-auto max-h-[86%] rounded-t-3xl"
				)}
			>
				{fullscreen ? (
					<div className="flex items-center gap-2 border-border border-b p-2">
						<button
							aria-label="닫기"
							className="inline-flex size-10 cursor-pointer items-center justify-center rounded-xl border-none bg-secondary text-foreground"
							onClick={step === "form" ? onCancel : onClose}
							type="button"
						>
							<span className="inline-flex size-[22px]">
								<ChevronLeftIcon />
							</span>
						</button>
						<span className="font-bold text-base text-foreground">
							{company} 신고
						</span>
					</div>
				) : (
					<div className="flex justify-center pt-2.5 pb-0.5">
						<div className="h-1 w-10 rounded-sm bg-[var(--border-strong)]" />
					</div>
				)}
				<div
					className={cn(
						"flex min-h-0 flex-1 flex-col overflow-y-auto",
						fullscreen ? "px-6 pt-5 pb-6" : "px-6 pt-3 pb-6",
						fullscreen && step === "done" ? "justify-center" : "justify-start"
					)}
				>
					{step === "form" ? (
						<ReportForm onCancel={onCancel} onSubmit={onSubmit} tone={tone} />
					) : (
						<ReportDone isChat onClose={onClose} />
					)}
				</div>
			</div>
		</div>
	);
}

export function SeekerChat({
	job,
	onBack,
	onReveal,
	reportMode = "sheet",
	tone = "calm",
}: {
	job?: Job;
	onBack: () => void;
	onReveal: () => void;
	reportMode?: ReportMode;
	tone?: VisualTone;
}) {
	const [sched, setSched] = useState<"none" | "proposed" | "confirmed">("none");
	const [report, setReport] = useState<ReportStep>("closed");
	const [hidden, setHidden] = useState(false);
	const scrollRef = useRef<HTMLDivElement>(null);
	useEffect(() => {
		const el = scrollRef.current;
		if (el) {
			el.scrollTop = el.scrollHeight;
		}
	}, []);
	const company = job ? job.company : "달밤 라운지";

	const openReport = () => setReport("form");
	const submitReport = () => setReport("done");
	const closeReport = () => {
		if (report === "done") {
			setHidden(true);
		}
		setReport("closed");
	};

	return (
		<div className="relative flex min-h-0 flex-1 flex-col bg-secondary">
			<div className="border-border border-b bg-background">
				<AppBar
					actions={
						<IconButton onClick={openReport} variant="subtle">
							<DotsVertical />
						</IconButton>
					}
					center
					onBack={onBack}
					subtitle="응답 보통 10분 이내"
					title={company}
				/>
			</div>
			<SafetyNotice onReport={openReport} tone={tone} />

			<div
				className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto px-[18px] py-4"
				ref={scrollRef}
			>
				{hidden ? (
					<div className="m-auto p-6 text-center">
						<div className="mx-auto mt-0 mb-3 flex size-14 items-center justify-center rounded-[18px] bg-muted text-muted-foreground">
							<span className="inline-flex size-[26px]">
								<LockIcon />
							</span>
						</div>
						<div className="font-bold text-foreground text-sm">
							신고 후 이 채팅을 숨겼어요
						</div>
						<p className="mx-auto mt-1.5 max-w-[240px] text-[12.5px] text-muted-foreground leading-[1.5]">
							운영팀이 검토 중이에요. 조치가 끝나면 알림으로 알려드려요.
						</p>
					</div>
				) : (
					<>
						<div className="self-center rounded-full bg-muted px-3 py-[5px] font-semibold text-[11px] text-muted-foreground">
							오늘
						</div>
						<div className="flex items-end gap-2">
							<Avatar name={company} size="sm" square />
							<ChatBubble>
								안녕하세요! 공고 보고 연락드려요 😊 혹시 주말 근무 가능하실까요?
							</ChatBubble>
						</div>
						<ChatBubble mine read time="오후 2:14">
							네 안녕하세요, 가능합니다! 면접은 언제쯤 볼 수 있을까요?
						</ChatBubble>
						<div className="flex items-end gap-2">
							<Avatar name={company} size="sm" square />
							<ChatBubble>
								좋아요. 이번 주 수요일 저녁 가능하시면 일정 잡아드릴게요.
							</ChatBubble>
						</div>
						{sched !== "none" && (
							<div className="my-1 self-stretch">
								<ScheduleCard
									date="6월 18일 (수)"
									onConfirm={() => setSched("confirmed")}
									onDecline={() => {
										// 변경 요청 — 데모에서는 동작 없음
									}}
									place="강남 본점"
									status={sched === "confirmed" ? "confirmed" : "proposed"}
									time="오후 8:00"
								/>
							</div>
						)}
						{sched === "confirmed" && (
							<div className="mx-0 mt-0.5 mb-1 max-w-[280px] self-center px-[14px] py-2.5 text-center">
								<Badge dot tone="success">
									면접 일정 확정
								</Badge>
								<p className="mt-2 mr-0 mb-0 ml-0 text-muted-foreground text-xs leading-[1.5]">
									구인자가 공개하면 연락처를 볼 수 있어요.
								</p>
							</div>
						)}
						{report === "form" && reportMode === "inline" ? (
							<div className="my-1 self-stretch rounded-2xl border border-red-500 bg-card p-4 shadow-md">
								<div className="mb-3 flex items-center gap-2">
									<span className="inline-flex size-[18px] text-red-600">
										<AlertCircle />
									</span>
									<span className="font-extrabold text-foreground text-sm">
										{company} 신고
									</span>
								</div>
								<ReportForm
									compact
									onCancel={() => setReport("closed")}
									onSubmit={submitReport}
									tone={tone}
								/>
							</div>
						) : null}
						{report === "done" && reportMode === "inline" ? (
							<div className="my-1 self-stretch rounded-2xl border border-border bg-card p-[18px] shadow-md">
								<ReportDone compact isChat onClose={closeReport} />
							</div>
						) : null}
					</>
				)}
			</div>

			{!hidden && (
				<div className="border-border border-t bg-background px-4 pt-2.5 pb-1.5">
					{sched === "confirmed" ? (
						<Button block onClick={onReveal} size="lg" variant="primary">
							연락처 보기
						</Button>
					) : (
						<div className="flex items-center gap-2.5">
							<button
								aria-label="일정 제안"
								className="inline-flex size-11 flex-[0_0_44px] cursor-pointer items-center justify-center rounded-[14px] border-none bg-coral-50 text-coral-700"
								onClick={() => setSched("proposed")}
								type="button"
							>
								<span className="inline-flex size-[22px]">
									<PlusIcon />
								</span>
							</button>
							<div className="flex h-11 flex-1 items-center rounded-full bg-secondary px-4">
								<input
									aria-label="메시지를 입력하세요"
									className="flex-1 border-none bg-transparent text-foreground text-sm outline-none"
									placeholder="메시지를 입력하세요"
								/>
							</div>
							<button
								className="h-[38px] cursor-pointer whitespace-nowrap rounded-full border-none bg-primary px-4 font-bold text-[13px] text-white shadow-lg"
								onClick={() => setSched("proposed")}
								type="button"
							>
								일정 제안
							</button>
						</div>
					)}
				</div>
			)}

			{report !== "closed" && reportMode !== "inline" ? (
				<ReportOverlay
					company={company}
					mode={reportMode}
					onCancel={() => setReport("closed")}
					onClose={closeReport}
					onSubmit={submitReport}
					step={report}
					tone={tone}
				/>
			) : null}
		</div>
	);
}

// 데스크톱 허브 본문 — 사이드바가 이미 프로필·내비를 들고 있어 링크 리스트를 반복하지
// 않고, 하위 구역이 무엇인지 알려주는 안내 카드만 둔다(모바일에서는 셸이 그리는 허브
// 리스트가 이 역할을 하므로 md 미만에서는 감춘다).
const seekerMeSections: {
	description: string;
	href: Route;
	icon: ReactNode;
	label: string;
}[] = [
	{
		href: "/seeker/me/reports" as Route,
		icon: <ClipboardListIcon />,
		label: "내 신고 내역",
		description: "접수한 신고의 처리 상태를 확인해요.",
	},
	{
		href: "/seeker/me/interviews" as Route,
		icon: <ClockIcon />,
		label: "예정된 면접",
		description: "확정·제안된 면접 일정을 한눈에 봐요.",
	},
	{
		href: "/seeker/me/blocks" as Route,
		icon: <LockIcon />,
		label: "차단한 상대",
		description: "차단한 상대를 확인하고 해제해요.",
	},
	{
		href: "/seeker/me/point-orders" as Route,
		icon: <StoreIcon />,
		label: "포인트 구매 내역",
		description: "포인트로 구매한 아이템의 처리 상태를 확인해요.",
	},
	{
		href: ATTENDANCE_HREF,
		icon: <ClockIcon />,
		label: "출석체크",
		description: "하루 한 번 출석하고 연속 기록을 확인해요.",
	},
	{
		href: "/seeker/me/settings" as Route,
		icon: <SettingsIcon />,
		label: "계정 설정",
		description: "표시 이름·본인인증을 관리해요.",
	},
];

export function SeekerMe() {
	// 사이드바 내비와 같은 표로 역할별 항목을 감춘다(구인자·운영자에게 안 보이는 메뉴가
	// 허브 카드로 되살아나지 않도록). 출석 카드의 역할 제한도 같은 함수가 담당한다.
	const { role } = useBambiAuth();
	const sections = seekerMeSections.filter((section) =>
		isMyPageItemVisible(section.href, role)
	);
	return (
		<MyPageShell title="내 정보">
			<div className="hidden gap-4 md:grid md:grid-cols-2">
				{sections.map((section) => (
					<Link
						className="block rounded-lg"
						href={section.href}
						key={section.label}
					>
						<Card className="h-full transition-shadow hover:ring-primary">
							<CardHeader>
								<CardTitle className="flex items-center gap-2 text-base">
									<span className="inline-flex size-5 text-muted-foreground">
										{section.icon}
									</span>
									{section.label}
								</CardTitle>
								<CardDescription>{section.description}</CardDescription>
								<CardAction>
									<span className="inline-flex size-4 text-muted-foreground">
										<ChevronRightIcon />
									</span>
								</CardAction>
							</CardHeader>
						</Card>
					</Link>
				))}
			</div>
		</MyPageShell>
	);
}

// 목(프로토타입) 채팅 목록 폴백. 실데이터는 SeekerChatListResponsive가 API로 렌더하며,
// 이 폴백은 연결된 데이터 소스가 없어 빈 상태만 보여준다.
export function SeekerChats(_props: { onOpen: (jobId: string) => void }) {
	return (
		<div className="flex min-h-0 flex-1 flex-col">
			<div className="px-6 pt-2 pb-1">
				<h1 className="m-0 font-extrabold text-2xl text-foreground [font-family:var(--font-display)]">
					채팅
				</h1>
			</div>
			<div className="flex min-h-0 flex-1 flex-col items-center justify-center px-6 text-center">
				<p className="m-0 text-[13px] text-muted-foreground">
					아직 진행 중인 채팅이 없어요.
				</p>
			</div>
		</div>
	);
}

interface Frame {
	name: string;
	params?: { job?: Job };
}

export function SeekerPersona({
	tone = "calm",
	reportMode = "sheet",
}: {
	tone?: VisualTone;
	reportMode?: ReportMode;
}) {
	const [stack, setStack] = useState<Frame[]>([{ name: "home" }]);
	const cur = stack.at(-1) ?? { name: "home" };
	const p = cur.params || {};
	const push = (name: string, params?: Frame["params"]) =>
		setStack((s) => [...s, { name, params: params || {} }]);
	const pop = () => setStack((s) => (s.length > 1 ? s.slice(0, -1) : s));
	const setRoot = (name: string) => setStack([{ name, params: {} }]);

	let screen: React.ReactNode = null;
	if (cur.name === "home") {
		screen = <SeekerHome tone={tone} />;
	} else if (cur.name === "detail") {
		screen = (
			<SeekerDetail
				job={p.job as Job}
				onBack={pop}
				onReport={() => push("chat", { job: p.job })}
				onStartChat={() => push("chat", { job: p.job })}
			/>
		);
	} else if (cur.name === "chat") {
		screen = (
			<SeekerChat
				job={p.job}
				onBack={() => (stack.length > 1 ? pop() : setRoot("home"))}
				onReveal={() => push("reveal", { job: p.job })}
				reportMode={reportMode}
				tone={tone}
			/>
		);
	} else if (cur.name === "reveal") {
		screen = (
			<ContactReveal job={p.job} onBack={pop} onDone={() => setRoot("home")} />
		);
	} else if (cur.name === "me") {
		screen = <SeekerMe />;
	}

	const showNav = ["home", "me"].includes(cur.name);
	const navItems = [
		{ value: "home", label: "탐색", icon: Search2 },
		{ value: "chat", label: "채팅", icon: Message },
		{ value: "me", label: "내 정보", icon: UserIcon },
	];
	const navValue = cur.name === "me" ? "me" : "home";
	return (
		<PhoneFrame indicatorTone="dark" statusTone="dark">
			<div className="flex min-h-0 flex-1 flex-col">{screen}</div>
			{showNav && (
				<div className="border-border border-t bg-background">
					<BottomNav
						items={navItems}
						onChange={(v) => {
							if (v === "chat") {
								push("chat");
							} else {
								setRoot(v);
							}
						}}
						value={navValue}
					/>
				</div>
			)}
		</PhoneFrame>
	);
}
