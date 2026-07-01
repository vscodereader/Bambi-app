"use client";

// 밤비 — 구인자(Employer) 화면: 실시간 콘텐츠 가드가 붙은 공고 등록 + 내 공고.

import { cn } from "@bambi-app/ui/lib/utils";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useState } from "react";
import { authClient } from "@/lib/auth-client";
import { scan, verdict } from "@/lib/bambi/scanner";
import type { ModerationModel, VisualTone } from "@/lib/bambi/types";
import {
	AppBar,
	Avatar,
	Badge,
	BottomNav,
	Button,
	IconButton,
	Input,
	Logo,
	SegmentedTabs,
	StatGroup,
	Tag,
} from "../ds";
import {
	AlertCircle,
	BellIcon,
	CheckIcon,
	ChevronDownIcon,
	ChevronRightIcon,
	ClipboardListIcon,
	ClockIcon,
	Flash,
	PlusIcon,
	SettingsIcon,
	ShieldIcon,
	UserIcon,
} from "../icons";
import { PhoneFrame } from "../phone-frame";
import { GuardedTextarea, GuardSummary } from "../safety-kit";

function FieldE({
	label,
	hint,
	children,
}: {
	label: string;
	hint?: string;
	children: ReactNode;
}) {
	return (
		<div className="flex flex-col gap-[9px]">
			<div className="flex items-baseline justify-between">
				<span className="font-bold text-[13px] text-foreground">{label}</span>
				{hint ? (
					<span className="text-[11px] text-[color:var(--text-subtle)]">
						{hint}
					</span>
				) : null}
			</div>
			{children}
		</div>
	);
}

function GuardIntro({ tone }: { tone: VisualTone }) {
	const dark = tone === "bold";
	return (
		<div
			className={cn(
				"flex gap-3 rounded-2xl p-[14px]",
				dark ? "bg-ink-800 text-white" : "bg-secondary text-foreground"
			)}
		>
			<span
				className={cn(
					"inline-flex size-[22px] flex-[0_0_22px]",
					dark ? "text-coral-300" : "text-coral-500"
				)}
			>
				<AlertCircle />
			</span>
			<div className="text-[12.5px] leading-normal">
				<b className="font-extrabold">
					밤비는 합법적인 유흥·접객 채용만 다뤄요.
				</b>
				<br />
				불법 성매매·강요·미성년 관련 표현은 등록할 수 없고, 우회·암시 표현은
				운영자 검수를 거쳐요.
			</div>
		</div>
	);
}

export function EmployerPost({
	onBack,
	onDone,
	tone = "calm",
	model = "hybrid",
}: {
	onBack: () => void;
	onDone: (state: string) => void;
	tone?: VisualTone;
	model?: ModerationModel;
}) {
	const roles = ["서빙", "매니저", "바텐더", "가드", "주방", "발렛"];
	const [sel, setSel] = useState<string[]>(["서빙"]);
	const [desc, setDesc] = useState(
		"강남 신규 라운지에서 주말 야간 홀 서빙을 함께할 분을 찾습니다. 초보도 환영하며 충분히 안내해 드려요. 궁금한 점은 카톡으로 편하게 문의 주세요."
	);
	const [title, setTitle] = useState("홀 서빙 · 주말 야간");
	const toggle = (r: string) =>
		setSel((s) => (s.includes(r) ? s.filter((x) => x !== r) : [...s, r]));

	const findings = scan(`${title}\n${desc}`);
	const v = verdict(findings, model);
	const blocked = v.state === "block";
	let submitLabel = "공고 등록하기";
	if (blocked) {
		submitLabel = "수정해야 등록할 수 있어요";
	} else if (v.state === "review") {
		submitLabel = "검수 요청하고 등록";
	}

	return (
		<div className="flex min-h-0 flex-1 flex-col">
			<AppBar onBack={onBack} title="공고 등록" />
			<div className="flex min-h-0 flex-1 flex-col gap-[18px] overflow-y-auto px-6 pt-1.5 pb-5">
				<GuardIntro tone={tone} />
				<FieldE label="공고 제목">
					<Input
						onChange={(e) => setTitle(e.target.value)}
						placeholder="예) 주말 야간 홀 서빙"
						value={title}
					/>
				</FieldE>
				<FieldE label="직무">
					<div className="flex flex-wrap gap-2">
						{roles.map((r) => (
							<Tag key={r} onClick={() => toggle(r)} selected={sel.includes(r)}>
								{r}
							</Tag>
						))}
					</div>
				</FieldE>
				<FieldE label="급여">
					<Input defaultValue="시급 18,000원" placeholder="예) 시급 18,000원" />
				</FieldE>
				<FieldE label="근무지">
					<Input
						defaultValue="서울 강남구 역삼동"
						placeholder="예) 서울 강남구"
					/>
				</FieldE>
				<FieldE hint="실시간 검사 중" label="상세 설명">
					<GuardedTextarea
						onChange={setDesc}
						placeholder="근무 조건과 분위기를 자유롭게 적어주세요"
						tone={tone}
						value={desc}
					/>
				</FieldE>
				<GuardSummary findings={findings} state={v.state} tone={tone} />
			</div>
			<div className="border-border border-t px-6 pt-3 pb-1.5">
				<Button
					block
					disabled={blocked}
					onClick={() => onDone(v.state)}
					size="lg"
					variant={blocked ? "danger" : "primary"}
				>
					{submitLabel}
				</Button>
			</div>
		</div>
	);
}

export function EmployerPostResult({
	state,
	onDone,
}: {
	state: string;
	onDone: () => void;
}) {
	const review = state === "review";
	const conf = review
		? {
				bg: "bg-amber-50",
				fg: "text-amber-500",
				icon: <ClockIcon />,
				title: "검수 요청이 접수됐어요",
				body: "공고에서 확인이 필요한 표현이 있어 운영자가 먼저 검토해요. 보통 10분 이내에 게시 여부를 알려드려요.",
				badge: "검수 대기",
			}
		: {
				bg: "bg-green-50",
				fg: "text-green-600",
				icon: <CheckIcon />,
				title: "공고가 게시됐어요",
				body: "금지 표현 없이 통과했어요. 지금부터 구직자에게 노출되고, 채팅 문의를 받을 수 있어요.",
				badge: "게시됨",
			};
	return (
		<div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-[18px] px-8 text-center">
			<div
				className={cn(
					"flex size-[76px] items-center justify-center rounded-[24px]",
					conf.bg,
					conf.fg
				)}
			>
				<span className="inline-flex size-[38px]">{conf.icon}</span>
			</div>
			<Badge dot tone={review ? "pending" : "success"}>
				{conf.badge}
			</Badge>
			<div>
				<h1 className="mb-2 font-extrabold text-[22px] text-foreground">
					{conf.title}
				</h1>
				<p className="m-0 max-w-[300px] text-muted-foreground text-sm leading-relaxed">
					{conf.body}
				</p>
			</div>
			<div className="mt-1.5 w-full max-w-[320px]">
				<Button block onClick={onDone} size="lg" variant="primary">
					내 공고로 가기
				</Button>
			</div>
		</div>
	);
}

interface Posting {
	applicants: number;
	area: string;
	dateLabel: string;
	guide?: string;
	id: string;
	pay: string;
	reason?: string;
	state: "published" | "review" | "rejected";
	tier?: "premium" | "recommended";
	title: string;
	views: number;
}

const STORE_NAME = "달밤 라운지";

const MY_POSTINGS: Posting[] = [
	{
		id: "p1",
		title: "홀 서빙 · 주말 야간",
		state: "published",
		tier: "premium",
		area: "강남 · 청담",
		pay: "시급 18,000원",
		views: 128,
		applicants: 5,
		dateLabel: "게시일 2025.09.20",
	},
	{
		id: "p2",
		title: "바텐더 · 평일",
		state: "review",
		area: "강남 · 청담",
		pay: "시급 16,000원",
		views: 64,
		applicants: 2,
		dateLabel: "검수 예상 6시간",
	},
	{
		id: "p3",
		title: "전일제 매니저",
		state: "rejected",
		area: "강남 · 청담",
		pay: "급여 협의",
		views: 31,
		applicants: 1,
		dateLabel: "반려일 2025.09.19",
		reason: "근무 조건이 정보 가이드라인을 위반했어요.",
		guide: "가이드: 성별 제한, 외모 조건, 과도한 개인 정보 요구 금지",
	},
];

const POSTING_STATE: Record<
	Posting["state"],
	{ tone: "success" | "pending" | "danger"; label: string }
> = {
	published: { tone: "success", label: "게시됨" },
	review: { tone: "pending", label: "검수 중" },
	rejected: { tone: "danger", label: "반려됨" },
};

// 마켓플레이스 노출 등급을 구인자 화면에도 동일 언어로 보여준다(유료 홍보 체감).
const POSTING_TIER: Record<
	NonNullable<Posting["tier"]>,
	{ tone: "primary" | "info"; label: string; note: string }
> = {
	premium: { tone: "primary", label: "프리미엄", note: "상단 고정 노출 중" },
	recommended: { tone: "info", label: "추천", note: "추천 영역 노출 중" },
};

function PostingRow({ p }: { p: Posting }) {
	const stateConf = POSTING_STATE[p.state];
	const rejected = p.state === "rejected";
	const tierConf = p.tier ? POSTING_TIER[p.tier] : null;
	const promoted = p.state === "published" && tierConf;
	return (
		<div
			className={cn(
				"flex flex-col gap-2.5 rounded-2xl bg-card p-4 shadow-[var(--shadow-card)]",
				rejected ? "border border-red-500" : "border border-border"
			)}
		>
			<div className="flex items-start gap-2.5">
				<Avatar name={STORE_NAME} size="sm" square />
				<div className="min-w-0 flex-1">
					<div className="font-bold text-[15.5px] text-foreground">
						{p.title}
					</div>
					<div className="mt-[3px] flex items-center gap-1.5 text-[13px] text-muted-foreground">
						<span>{p.area}</span>
						<span className="text-[color:var(--border-strong)]">|</span>
						<span>{p.pay}</span>
					</div>
				</div>
				<div className="flex shrink-0 flex-wrap justify-end gap-1.5">
					{tierConf ? (
						<Badge tone={tierConf.tone}>{tierConf.label}</Badge>
					) : null}
					<Badge dot tone={stateConf.tone}>
						{stateConf.label}
					</Badge>
				</div>
			</div>
			{promoted ? (
				<div className="flex items-center gap-2 rounded-xl bg-coral-50 px-3 py-2 text-coral-700">
					<span className="inline-flex size-4 shrink-0">
						<Flash />
					</span>
					<span className="font-bold text-[12.5px] leading-normal">
						{tierConf.note} · 일반 대비 조회 3.2배
					</span>
				</div>
			) : null}
			<div className="border-border border-t pt-2.5">
				<span className="text-[color:var(--text-subtle)] text-xs">
					조회 {p.views} · 지원 {p.applicants} · {p.dateLabel}
				</span>
			</div>
			{rejected ? (
				<div className="flex gap-2 rounded-xl bg-red-50 px-3 py-2.5">
					<span className="mt-px inline-flex size-4 flex-[0_0_16px] text-red-600">
						<AlertCircle />
					</span>
					<div className="flex flex-col gap-[3px]">
						<span className="font-bold text-[12.5px] text-red-600 leading-normal">
							반려 사유 · {p.reason}
						</span>
						{p.guide ? (
							<span className="text-muted-foreground text-xs leading-normal">
								{p.guide}
							</span>
						) : null}
					</div>
				</div>
			) : null}
		</div>
	);
}

export function EmployerPostings({ onNew }: { onNew: () => void }) {
	const [tab, setTab] = useState("all");
	const published = MY_POSTINGS.filter((p) => p.state === "published").length;
	const review = MY_POSTINGS.filter((p) => p.state === "review").length;
	const rejected = MY_POSTINGS.filter((p) => p.state === "rejected").length;
	const list =
		tab === "all" ? MY_POSTINGS : MY_POSTINGS.filter((p) => p.state === tab);
	return (
		<div className="flex min-h-0 flex-1 flex-col">
			<div className="flex items-center justify-between px-5 pt-1.5 pb-2.5">
				<Logo lang="ko" size="md" />
				<div className="flex items-center gap-2">
					<span className="inline-flex h-[30px] items-center gap-[5px] whitespace-nowrap rounded-full bg-secondary px-[11px] font-bold text-foreground text-xs">
						<span className="inline-flex size-[14px] text-green-600">
							<ShieldIcon />
						</span>
						사업자 인증 완료
					</span>
					<IconButton variant="subtle">
						<BellIcon />
					</IconButton>
				</div>
			</div>
			<div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-6 pt-1 pb-4">
				<div className="flex flex-col gap-2">
					<h1 className="font-extrabold text-2xl text-foreground leading-[1.32]">
						내 공고
					</h1>
					<div className="inline-flex items-center gap-1.5 self-start">
						<span className="font-bold text-[15px] text-foreground">
							{STORE_NAME}
						</span>
						<span className="inline-flex size-[18px] text-muted-foreground">
							<ChevronDownIcon />
						</span>
					</div>
				</div>
				<StatGroup
					items={[
						{ label: "게시", value: published },
						{ label: "검수", value: review },
						{ label: "반려", tone: "danger", value: rejected },
					]}
				/>
				<Button
					block
					leftIcon={<PlusIcon />}
					onClick={onNew}
					size="lg"
					variant="primary"
				>
					새 공고 등록
				</Button>
				<SegmentedTabs
					items={[
						{ value: "all", label: `전체 ${MY_POSTINGS.length}` },
						{ value: "published", label: `게시됨 ${published}` },
						{ value: "review", label: `검수 중 ${review}` },
						{ value: "rejected", label: `반려됨 ${rejected}` },
					]}
					onChange={setTab}
					value={tab}
					variant="underline"
				/>
				<div className="flex flex-col gap-3">
					{list.map((p) => (
						<PostingRow key={p.id} p={p} />
					))}
				</div>
			</div>
		</div>
	);
}

export function EmployerMe() {
	const router = useRouter();
	const rows = [
		{ icon: <ClipboardListIcon />, label: "공고 검수 정책", meta: "" },
		{ icon: <AlertCircle />, label: "받은 경고", meta: "0회" },
		{ icon: <SettingsIcon />, label: "매장 정보", meta: "" },
	];
	const handleSignOut = async () => {
		await authClient.signOut();
		router.push("/");
		router.refresh();
	};
	return (
		<div className="mx-auto flex min-h-0 w-full max-w-[min(80%,72rem)] flex-1 flex-col py-5">
			<div className="px-6 pt-2 pb-1">
				<h1 className="font-extrabold text-2xl text-foreground">매장 정보</h1>
			</div>
			<div className="flex min-h-0 flex-1 flex-col gap-[18px] overflow-y-auto px-6 py-4">
				<div className="flex items-center gap-[14px] rounded-[18px] border border-primary p-[18px]">
					<Avatar name="달밤 라운지" size="lg" square />
					<div className="flex-1">
						<div className="font-extrabold text-[18px] text-foreground">
							달밤 라운지
						</div>
						<div className="mt-0.5 text-[13px] text-muted-foreground">
							구인자 · 강남
						</div>
					</div>
					<Badge dot tone="success">
						정상
					</Badge>
				</div>
				<div className="flex flex-col overflow-hidden rounded-2xl border border-border">
					{rows.map((r, i) => (
						<div
							className={cn(
								"flex items-center gap-3 p-4",
								i ? "border-border border-t" : "border-none"
							)}
							key={r.label}
						>
							<span className="inline-flex size-[22px] text-muted-foreground">
								{r.icon}
							</span>
							<span className="flex-1 font-semibold text-[15px] text-foreground">
								{r.label}
							</span>
							{r.meta ? (
								<span className="text-[13px] text-muted-foreground">
									{r.meta}
								</span>
							) : null}
							<span className="inline-flex size-[18px] text-[color:var(--text-subtle)]">
								<ChevronRightIcon />
							</span>
						</div>
					))}
				</div>
				<Button className="w-full" onClick={handleSignOut} variant="secondary">
					로그아웃
				</Button>
			</div>
		</div>
	);
}

interface EmployerFrame {
	name: string;
	params?: { state?: string };
}

export function EmployerPersona({
	tone = "calm",
	moderationModel = "hybrid",
}: {
	tone?: VisualTone;
	moderationModel?: ModerationModel;
}) {
	const [stack, setStack] = useState<EmployerFrame[]>([{ name: "postings" }]);
	const cur = stack.at(-1) ?? { name: "postings" };
	const p = cur.params || {};
	const push = (name: string, params?: EmployerFrame["params"]) =>
		setStack((s) => [...s, { name, params: params || {} }]);
	const setRoot = (name: string) => setStack([{ name, params: {} }]);

	let screen: React.ReactNode = null;
	if (cur.name === "postings") {
		screen = <EmployerPostings onNew={() => push("post")} />;
	} else if (cur.name === "post") {
		screen = (
			<EmployerPost
				model={moderationModel}
				onBack={() => setRoot("postings")}
				onDone={(state) =>
					setStack([
						{ name: "postings" },
						{ name: "result", params: { state } },
					])
				}
				tone={tone}
			/>
		);
	} else if (cur.name === "result") {
		screen = (
			<EmployerPostResult
				onDone={() => setRoot("postings")}
				state={p.state ?? ""}
			/>
		);
	} else if (cur.name === "me") {
		screen = <EmployerMe />;
	}

	const showNav = ["postings", "me"].includes(cur.name);
	const navItems = [
		{ value: "postings", label: "내 공고", icon: ClipboardListIcon },
		{ value: "post", label: "등록", icon: PlusIcon },
		{ value: "me", label: "내 정보", icon: UserIcon },
	];
	return (
		<PhoneFrame indicatorTone="dark" statusTone="dark">
			<div className="flex min-h-0 flex-1 flex-col">{screen}</div>
			{showNav && (
				<div className="border-border border-t bg-background">
					<BottomNav
						items={navItems}
						onChange={(v) => {
							if (v === "post") {
								push("post");
							} else {
								setRoot(v);
							}
						}}
						value={cur.name === "me" ? "me" : "postings"}
					/>
				</div>
			)}
		</PhoneFrame>
	);
}
