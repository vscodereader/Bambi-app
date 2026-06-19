"use client";

// 밤비 — 운영자(Moderator) 콘솔: 검수 큐, 신고 인박스, 사용자 제재.

import { cn } from "@bambi-app/ui/lib/utils";
import type { ReactNode } from "react";
import { useRef, useState } from "react";
import { QUEUE, REPORTS, USERS } from "@/lib/bambi/data";
import { scan } from "@/lib/bambi/scanner";
import type {
	ManagedUser,
	QueueItem,
	Report,
	ReportSeverity,
	RiskLevel,
	UserStatus,
	VisualTone,
} from "@/lib/bambi/types";
import {
	AppBar,
	Avatar,
	Badge,
	Button,
	IconButton,
	Logo,
	StatGroup,
} from "../ds";
import {
	AlertCircle,
	BellIcon,
	CheckIcon,
	ChevronDownIcon,
	ChevronRightIcon,
	FlagIcon,
	ShieldIcon,
	SortIcon,
	UserIcon,
} from "../icons";
import { RiskFlag } from "../safety-kit";

const HI_CLASS: Record<string, string> = {
	block: "bg-[rgba(255,90,95,0.22)] shadow-[inset_0_-2px_0_var(--red-500)]",
	review: "bg-[rgba(245,158,11,0.24)] shadow-[inset_0_-2px_0_var(--amber-500)]",
	low: "bg-[rgba(31,181,115,0.20)] shadow-[inset_0_-2px_0_var(--green-500)]",
};
const RISK_HI_KEY: Record<RiskLevel, string> = {
	high: "block",
	mid: "review",
	low: "low",
};

// 감지 문구를 위험도 색상으로 강조하는 읽기 전용 본문 (큐 검수용).
function HiText({
	text,
	terms,
	level = "mid",
}: {
	text: string;
	terms?: string[];
	level?: RiskLevel;
}) {
	const ranges: { start: number; end: number }[] = [];
	if (terms?.length) {
		for (const term of terms) {
			let from = 0;
			let i = text.indexOf(term, from);
			while (i !== -1) {
				ranges.push({ start: i, end: i + term.length });
				from = i + term.length;
				i = text.indexOf(term, from);
			}
		}
		ranges.sort((a, b) => a.start - b.start);
	} else {
		for (const f of scan(text)) {
			ranges.push({ start: f.start, end: f.end });
		}
	}
	const key = RISK_HI_KEY[level];
	const segs: { t: string; hi: boolean; start: number }[] = [];
	let cur = 0;
	for (const r of ranges) {
		if (r.start < cur) {
			continue;
		}
		if (r.start > cur) {
			segs.push({ t: text.slice(cur, r.start), hi: false, start: cur });
		}
		segs.push({ t: text.slice(r.start, r.end), hi: true, start: r.start });
		cur = r.end;
	}
	if (cur < text.length) {
		segs.push({ t: text.slice(cur), hi: false, start: cur });
	}
	return (
		<p className="m-0 text-[14.5px] text-[color:var(--text-default)] leading-[1.65]">
			{segs.map((s) =>
				s.hi ? (
					<mark
						className={cn(
							"rounded px-px py-px font-bold text-[color:var(--text-strong)]",
							HI_CLASS[key]
						)}
						key={s.start}
					>
						{s.t}
					</mark>
				) : (
					<span key={s.start}>{s.t}</span>
				)
			)}
		</p>
	);
}

// 위험도 배지 ("위험: 높음/중간/낮음").
const RISK_BADGE: Record<RiskLevel, { cls: string; label: string }> = {
	high: {
		cls: "bg-[color:var(--status-danger-bg)] text-[color:var(--status-danger-fg)]",
		label: "높음",
	},
	mid: {
		cls: "bg-[color:var(--status-pending-bg)] text-[color:var(--status-pending-fg)]",
		label: "중간",
	},
	low: {
		cls: "bg-[color:var(--status-success-bg)] text-[color:var(--status-success-fg)]",
		label: "낮음",
	},
};

function RiskBadge({ level }: { level: RiskLevel }) {
	const c = RISK_BADGE[level];
	return (
		<span
			className={cn(
				"whitespace-nowrap rounded-full px-[9px] py-[3px] font-extrabold text-[11px]",
				c.cls
			)}
		>
			위험: {c.label}
		</span>
	);
}

function SevPill({ sev }: { sev: ReportSeverity }) {
	const map: Record<ReportSeverity, { cls: string; t: string }> = {
		high: {
			cls: "bg-[color:var(--status-danger-bg)] text-[color:var(--status-danger-fg)]",
			t: "심각",
		},
		mid: {
			cls: "bg-[color:var(--status-pending-bg)] text-[color:var(--status-pending-fg)]",
			t: "주의",
		},
		low: { cls: "bg-muted text-muted-foreground", t: "참고" },
	};
	const m = map[sev] || map.low;
	return (
		<span
			className={cn(
				"rounded-full px-[9px] py-[3px] font-extrabold text-[11px]",
				m.cls
			)}
		>
			{m.t}
		</span>
	);
}

function MetaBox({ label, value }: { label: string; value: string }) {
	return (
		<div className="rounded-xl bg-secondary px-[14px] py-3">
			<div className="text-[11px] text-muted-foreground">{label}</div>
			<div className="mt-[3px] font-extrabold text-[15px] text-foreground">
				{value}
			</div>
		</div>
	);
}

function EmptyState({ icon, text }: { icon: ReactNode; text: string }) {
	return (
		<div className="m-auto p-10 text-center">
			<div className="mx-auto mt-0 mb-3 flex size-14 items-center justify-center rounded-[18px] bg-[color:var(--status-success-bg)] text-[color:var(--status-success-fg)]">
				<span className="inline-flex size-[26px]">{icon}</span>
			</div>
			<div className="font-bold text-[14px] text-[color:var(--text-default)]">
				{text}
			</div>
		</div>
	);
}

function ConsoleTabs({
	tab,
	onTab,
}: {
	tab: string;
	onTab: (v: string) => void;
}) {
	const items = [
		{ v: "queue", label: "공고 검수" },
		{ v: "reports", label: "신고" },
		{ v: "users", label: "사용자" },
	];
	return (
		<div className="flex gap-1.5 rounded-xl bg-muted p-1">
			{items.map((it) => {
				const on = tab === it.v;
				return (
					<button
						className={cn(
							"h-10 flex-1 cursor-pointer rounded-lg border-none text-[14px] transition-all",
							on
								? "bg-ink-800 font-extrabold text-white shadow-sm"
								: "bg-transparent font-semibold text-muted-foreground"
						)}
						key={it.v}
						onClick={() => onTab(it.v)}
						type="button"
					>
						{it.label}
					</button>
				);
			})}
		</div>
	);
}

export function ConsoleTop({
	tab,
	onTab,
	counts,
}: {
	tab: string;
	onTab: (v: string) => void;
	counts: { queue: number; reports: number; warned: number };
}) {
	return (
		<div className="flex flex-col gap-[14px] px-5 pt-1.5 pb-3">
			<div className="flex items-center justify-between">
				<Logo lang="ko" size="md" />
				<div className="flex items-center gap-2">
					<span className="inline-flex h-[30px] items-center gap-[5px] whitespace-nowrap rounded-full bg-secondary px-[11px] font-bold text-[12px] text-[color:var(--text-default)]">
						<span className="inline-flex size-[14px] text-[color:var(--ink-700)]">
							<ShieldIcon />
						</span>
						운영자 모드
					</span>
					<IconButton badge variant="subtle">
						<BellIcon />
					</IconButton>
				</div>
			</div>
			<h1 className="m-0 px-1 font-extrabold text-[24px] text-foreground">
				운영자 콘솔
			</h1>
			<div className="px-1">
				<ConsoleTabs onTab={onTab} tab={tab} />
			</div>
			<div className="px-1">
				<StatGroup
					items={[
						{ label: "검수 대기", value: counts.queue },
						{ label: "신고 대기", value: counts.reports },
						{ label: "경고 사용자", value: counts.warned },
					]}
				/>
			</div>
		</div>
	);
}

// ---- 큐 --------------------------------------------------------------------
function QueueFilterRow() {
	return (
		<div className="flex gap-2">
			<div className="flex h-10 flex-1 items-center justify-between rounded-xl border border-[color:var(--border-default)] bg-card px-[14px] font-semibold text-[13px] text-[color:var(--text-default)]">
				전체 상태
				<span className="inline-flex size-4 text-muted-foreground">
					<ChevronDownIcon />
				</span>
			</div>
			<div className="flex h-10 items-center gap-1.5 rounded-xl border border-[color:var(--border-default)] bg-card px-[14px] font-semibold text-[13px] text-[color:var(--text-default)]">
				회신순
				<span className="inline-flex size-[15px] text-muted-foreground">
					<SortIcon />
				</span>
			</div>
		</div>
	);
}

function QueueCheckbox({
	checked,
	dark,
	onToggle,
}: {
	checked: boolean;
	dark: boolean;
	onToggle: () => void;
}) {
	return (
		<button
			aria-label="항목 선택"
			aria-pressed={checked}
			className={cn(
				"mt-px inline-flex size-[22px] flex-[0_0_22px] cursor-pointer items-center justify-center rounded-[7px] text-white",
				checked
					? "border border-transparent bg-primary"
					: cn(
							"border-[1.5px]",
							dark ? "border-white/40" : "border-[color:var(--border-strong)]"
						)
			)}
			onClick={(e) => {
				e.stopPropagation();
				onToggle();
			}}
			type="button"
		>
			{checked ? (
				<span className="inline-flex size-[13px]">
					<CheckIcon />
				</span>
			) : null}
		</button>
	);
}

function QueueRow({
	q,
	selected,
	onToggle,
	onOpen,
}: {
	q: QueueItem;
	selected: boolean;
	onToggle: () => void;
	onOpen: () => void;
}) {
	const dark = selected;
	const subFg = dark
		? "text-[color:var(--text-on-dark-muted)]"
		: "text-muted-foreground";
	return (
		// biome-ignore lint/a11y/useSemanticElements: 행 내부에 체크박스 버튼이 중첩되어 네이티브 button 사용 불가. tabIndex/onKeyDown으로 키보드 접근성 보장.
		<div
			className={cn(
				"flex cursor-pointer items-start gap-3 rounded-2xl p-[14px]",
				dark
					? "border border-transparent bg-ink-800 text-white shadow-md"
					: "border border-border bg-card text-[color:var(--text-default)] shadow-card"
			)}
			onClick={onOpen}
			onKeyDown={(e) => {
				if (e.key === "Enter" || e.key === " ") {
					e.preventDefault();
					onOpen();
				}
			}}
			role="button"
			tabIndex={0}
		>
			<QueueCheckbox checked={selected} dark={dark} onToggle={onToggle} />
			<Avatar name={q.company} size="sm" square />
			<div className="flex min-w-0 flex-1 flex-col gap-[5px]">
				<div className="flex items-center gap-2">
					<span
						className={cn(
							"whitespace-nowrap font-bold text-[14.5px]",
							dark ? "text-white" : "text-foreground"
						)}
					>
						{q.company}
					</span>
					<span className={cn("min-w-0 flex-1 truncate text-[13px]", subFg)}>
						{q.role}
					</span>
					<RiskBadge level={q.riskLevel} />
				</div>
				<div className={cn("text-[12.5px] leading-[1.45]", subFg)}>
					<span>감지 문구 </span>
					<span
						className={cn(
							"font-bold",
							dark ? "text-white" : "text-[color:var(--text-default)]"
						)}
					>
						{q.detected.map((d) => `"${d}"`).join(", ")}
					</span>
				</div>
				<div
					className={cn(
						"text-[11.5px]",
						dark ? "text-white/55" : "text-[color:var(--text-subtle)]"
					)}
				>
					접수 {q.receivedAt} · ID {q.refId}
				</div>
			</div>
			<span
				aria-hidden="true"
				className={cn(
					"mt-px inline-flex size-[18px]",
					dark ? "text-white/50" : "text-[color:var(--text-subtle)]"
				)}
			>
				<ChevronRightIcon />
			</span>
		</div>
	);
}

export function QueueList({
	items,
	selected,
	onToggle,
	onOpen,
}: {
	items: QueueItem[];
	selected: string[];
	onToggle: (id: string) => void;
	onOpen: (item: QueueItem) => void;
}) {
	return (
		<div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-6 pb-5">
			<QueueFilterRow />
			{items.length ? (
				items.map((q) => (
					<QueueRow
						key={q.id}
						onOpen={() => onOpen(q)}
						onToggle={() => onToggle(q.id)}
						q={q}
						selected={selected.includes(q.id)}
					/>
				))
			) : (
				<EmptyState icon={<CheckIcon />} text="검수할 공고가 없어요" />
			)}
		</div>
	);
}

export function QueueDetail({
	item,
	tone,
	onBack,
	onResolve,
}: {
	item: QueueItem;
	tone: VisualTone;
	onBack: () => void;
	onResolve: (id: string, action: "approve" | "reject") => void;
}) {
	const [reject, setReject] = useState(false);
	return (
		<div className="relative flex min-h-0 flex-1 flex-col">
			<AppBar onBack={onBack} title="공고 검수" />
			<div className="flex min-h-0 flex-1 flex-col gap-[18px] overflow-y-auto px-6 pt-1 pb-5">
				<div className="flex items-center gap-3">
					<Avatar name={item.company} size="lg" square />
					<div>
						<div className="font-extrabold text-[19px] text-foreground">
							{item.title}
						</div>
						<div className="mt-0.5 text-[13px] text-muted-foreground">
							{item.company} · {item.location} · ID {item.refId}
						</div>
					</div>
				</div>
				<div className="grid grid-cols-2 gap-2.5">
					<MetaBox label="급여" value={item.pay} />
					<MetaBox label="접수" value={item.receivedAt} />
				</div>
				<div className="flex flex-col gap-2 rounded-[14px] bg-[color:var(--status-pending-bg)] p-[14px]">
					<div className="flex items-center gap-2">
						<span className="inline-flex size-[18px] text-[color:var(--status-pending-fg)]">
							<AlertCircle />
						</span>
						<span className="font-extrabold text-[13.5px] text-[color:var(--status-pending-fg)]">
							자동 필터가 감지한 신호 {item.flags.length}건
						</span>
					</div>
					<div className="flex flex-wrap gap-1.5">
						{item.flags.map((f) => (
							<RiskFlag
								key={`${f.label}-${f.match}`}
								label={f.label}
								match={f.match}
								sev={f.sev}
								tone={tone}
							/>
						))}
					</div>
				</div>
				<div>
					<div className="mb-2 font-bold text-[13px] text-foreground">
						공고 본문 · 감지 표현 강조
					</div>
					<div className="rounded-[14px] border border-border bg-secondary p-4">
						<HiText
							level={item.riskLevel}
							terms={item.detected}
							text={item.desc}
						/>
					</div>
				</div>
				<div className="px-0.5 text-[12px] text-muted-foreground leading-[1.55]">
					판단 기준: 성적 서비스 암시·강요·외부 연락 유도는 반려, 단순 오해
					소지는 승인 후 안내해요.
				</div>
			</div>
			<div className="flex gap-2.5 border-border border-t px-6 pt-3 pb-1.5">
				<Button
					block
					onClick={() => setReject(true)}
					size="lg"
					variant="secondary"
				>
					반려
				</Button>
				<Button
					block
					onClick={() => onResolve(item.id, "approve")}
					size="lg"
					variant="primary"
				>
					승인 후 게시
				</Button>
			</div>
			{reject ? (
				<RejectSheet
					onCancel={() => setReject(false)}
					onConfirm={() => onResolve(item.id, "reject")}
				/>
			) : null}
		</div>
	);
}

function RejectSheet({
	onCancel,
	onConfirm,
}: {
	onCancel: () => void;
	onConfirm: () => void;
}) {
	const reasons = [
		"성적 서비스 암시 표현",
		"강요·착취 의심 조건",
		"외부 연락 유도",
		"허위·과장 정보",
		"기타 정책 위반",
	];
	const [sel, setSel] = useState(reasons[0]);
	return (
		<div className="absolute inset-0 z-20 flex flex-col justify-end">
			<button
				aria-label="닫기"
				className="absolute inset-0 cursor-pointer border-none bg-[color:var(--overlay-scrim)]"
				onClick={onCancel}
				type="button"
			/>
			<div className="relative animate-[bambiSheetUp_var(--dur-base)_var(--ease-out)] rounded-t-[24px] bg-background px-6 pt-5 pb-6 shadow-[0_-8px_40px_rgba(0,0,0,0.18)]">
				<h2 className="mt-0 mr-0 mb-1 ml-0 font-extrabold text-[19px] text-foreground">
					반려 사유 선택
				</h2>
				<p className="mt-0 mr-0 mb-[14px] ml-0 text-[13px] text-muted-foreground">
					선택한 사유는 구인자에게 그대로 전달돼요.
				</p>
				<div className="mb-4 flex flex-col gap-2">
					{reasons.map((r) => {
						const on = sel === r;
						return (
							<button
								className={cn(
									"flex cursor-pointer items-center gap-2.5 rounded-xl px-[14px] py-3 text-left",
									on
										? "border border-primary bg-coral-50"
										: "border border-[color:var(--border-default)] bg-card"
								)}
								key={r}
								onClick={() => setSel(r)}
								type="button"
							>
								<span className="flex-1 font-semibold text-[14px] text-foreground">
									{r}
								</span>
								{on ? (
									<span className="inline-flex size-[18px] text-primary">
										<CheckIcon />
									</span>
								) : null}
							</button>
						);
					})}
				</div>
				<div className="flex gap-2.5">
					<Button block onClick={onCancel} size="lg" variant="secondary">
						취소
					</Button>
					<Button block onClick={onConfirm} size="lg" variant="danger">
						반려하기
					</Button>
				</div>
			</div>
		</div>
	);
}

// ---- 신고 ------------------------------------------------------------------
function ReportRow({
	r,
	onOpen,
	done,
}: {
	r: Report;
	onOpen: (r: Report) => void;
	done?: boolean;
}) {
	return (
		<button
			className={cn(
				"flex flex-col gap-2.5 rounded-2xl bg-card p-4 text-left shadow-card",
				done ? "cursor-pointer opacity-60" : "cursor-pointer opacity-100",
				r.sev === "high" && !done
					? "border border-[color:var(--red-500)]"
					: "border border-border"
			)}
			onClick={() => onOpen(r)}
			type="button"
		>
			<div className="flex items-center gap-2">
				<SevPill sev={r.sev} />
				<span className="flex-1 font-extrabold text-[14.5px] text-foreground">
					{r.reason}
				</span>
				{done ? (
					<Badge tone="neutral">완료</Badge>
				) : (
					<span className="text-[11px] text-[color:var(--text-subtle)]">
						{r.time}
					</span>
				)}
			</div>
			<div className="text-[12.5px] text-muted-foreground">
				<b className="text-[color:var(--text-default)]">{r.target}</b>(
				{r.targetRole}) · 신고 {r.reporter}({r.reporterRole})
			</div>
			<div className="rounded-[10px] bg-secondary px-2.5 py-2 text-[12.5px] text-[color:var(--text-default)] leading-[1.45]">
				"{r.note}"
			</div>
		</button>
	);
}

export function ReportList({
	items,
	onOpen,
}: {
	items: Report[];
	onOpen: (r: Report) => void;
}) {
	const open = items.filter((r) => r.status === "open");
	const closed = items.filter((r) => r.status !== "open");
	return (
		<div className="flex min-h-0 flex-1 flex-col">
			<div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-6 pt-1 pb-5">
				{open.map((r) => (
					<ReportRow key={r.id} onOpen={onOpen} r={r} />
				))}
				{closed.length ? (
					<div className="mt-1.5 font-bold text-[12px] text-[color:var(--text-subtle)]">
						처리 완료
					</div>
				) : null}
				{closed.map((r) => (
					<ReportRow done key={r.id} onOpen={onOpen} r={r} />
				))}
			</div>
		</div>
	);
}

function PartyBox({
	name,
	role,
	flagged,
}: {
	name: string;
	role: string;
	flagged?: boolean;
}) {
	return (
		<div
			className={cn(
				"flex flex-1 items-center gap-2.5 rounded-[14px] bg-card p-3",
				flagged
					? "border border-[color:var(--red-300)]"
					: "border border-border"
			)}
		>
			<Avatar name={name} size="sm" square />
			<div className="min-w-0">
				<div className="truncate font-bold text-[13.5px] text-foreground">
					{name}
				</div>
				<div className="text-[11px] text-muted-foreground">{role}</div>
			</div>
		</div>
	);
}

export function ReportDetail({
	item,
	onBack,
	onResolve,
	onSanction,
}: {
	item: Report;
	onBack: () => void;
	onResolve: (id: string, action: "dismiss" | "act") => void;
	onSanction: (id: string, status: UserStatus, label: string) => void;
}) {
	const [act, setAct] = useState(false);
	return (
		<div className="relative flex min-h-0 flex-1 flex-col">
			<AppBar onBack={onBack} title="신고 검토" />
			<div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-6 pt-1 pb-5">
				<div className="flex items-center gap-2">
					<SevPill sev={item.sev} />
					<h2 className="m-0 font-extrabold text-[19px] text-foreground">
						{item.reason}
					</h2>
				</div>
				<div className="flex gap-2.5">
					<PartyBox
						flagged
						name={item.target}
						role={`피신고 · ${item.targetRole}`}
					/>
					<PartyBox
						name={item.reporter}
						role={`신고자 · ${item.reporterRole}`}
					/>
				</div>
				<div>
					<div className="mb-2 font-bold text-[13px] text-foreground">
						신고된 대화
					</div>
					<div className="flex flex-col gap-2 rounded-[14px] border border-border bg-secondary p-[14px]">
						{item.thread.map((m) => (
							<div
								className={cn(
									"max-w-[85%]",
									m.mine ? "self-end" : "self-start"
								)}
								key={`${m.mine ? "me" : "them"}-${m.text}`}
							>
								<div
									className={cn(
										"mb-[3px] text-[10.5px] text-[color:var(--text-subtle)]",
										m.mine ? "text-right" : "text-left"
									)}
								>
									{m.mine ? item.reporter : item.target}
								</div>
								<div
									className={cn(
										"rounded-[14px] px-[13px] py-[9px] text-[13.5px] leading-[1.45]",
										m.mine
											? "rounded-br-[4px] border border-[color:var(--border-default)] bg-card text-foreground"
											: "rounded-bl-[4px] bg-ink-800 text-white"
									)}
								>
									{m.text}
								</div>
							</div>
						))}
					</div>
				</div>
				{item.status === "open" ? null : (
					<div className="flex items-center gap-2 rounded-[14px] bg-[color:var(--status-success-bg)] p-[14px] text-[color:var(--status-success-fg)]">
						<span className="inline-flex size-[18px]">
							<CheckIcon />
						</span>
						<span className="font-bold text-[13px]">이미 처리된 신고예요</span>
					</div>
				)}
			</div>
			{item.status === "open" ? (
				<div className="flex gap-2.5 border-border border-t px-6 pt-3 pb-1.5">
					<Button
						block
						onClick={() => onResolve(item.id, "dismiss")}
						size="lg"
						variant="secondary"
					>
						기각
					</Button>
					<Button block onClick={() => setAct(true)} size="lg" variant="danger">
						제재 적용
					</Button>
				</div>
			) : null}
			{act ? (
				<SanctionSheet
					onCancel={() => setAct(false)}
					onPick={(status, label) => {
						onSanction(`u-${item.id}`, status, label);
						onResolve(item.id, "act");
					}}
					target={item.target}
				/>
			) : null}
		</div>
	);
}

// ---- 사용자 / 제재 ---------------------------------------------------------
const STATUS_CONF: Record<
	UserStatus,
	{ tone: "success" | "pending" | "danger"; label: string }
> = {
	active: { tone: "success", label: "정상" },
	warned: { tone: "pending", label: "경고" },
	suspended: { tone: "danger", label: "정지" },
	blocked: { tone: "danger", label: "차단" },
};

function UserRow({
	u,
	onOpen,
}: {
	u: ManagedUser;
	onOpen: (u: ManagedUser) => void;
}) {
	const c = STATUS_CONF[u.status];
	return (
		<button
			className="flex cursor-pointer items-center gap-3 rounded-2xl border border-border bg-card p-4 text-left shadow-card"
			onClick={() => onOpen(u)}
			type="button"
		>
			<Avatar name={u.name} square={u.role === "구인자"} />
			<div className="min-w-0 flex-1">
				<div className="flex items-center gap-2">
					<span className="font-bold text-[15px] text-foreground">
						{u.name}
					</span>
					<Badge dot tone={c.tone}>
						{c.label}
					</Badge>
				</div>
				<div className="mt-[3px] text-[12.5px] text-muted-foreground">
					{u.role} · 신고 {u.reports}건 · 경고 {u.warnings}회
				</div>
			</div>
			<span className="inline-flex size-[18px] text-[color:var(--text-subtle)]">
				<ChevronRightIcon />
			</span>
		</button>
	);
}

export function UserList({
	items,
	onOpen,
}: {
	items: ManagedUser[];
	onOpen: (u: ManagedUser) => void;
}) {
	return (
		<div className="flex min-h-0 flex-1 flex-col">
			<div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-6 pt-1 pb-5">
				{items.map((u) => (
					<UserRow key={u.id} onOpen={onOpen} u={u} />
				))}
			</div>
		</div>
	);
}

function SanctionBtn({
	label,
	desc,
	tone,
	strong,
	onClick,
}: {
	label: string;
	desc: string;
	tone: "pending" | "danger";
	strong?: boolean;
	onClick: () => void;
}) {
	const danger = tone === "danger";
	return (
		<button
			className={cn(
				"flex cursor-pointer items-center gap-3 rounded-[14px] p-[14px] text-left",
				strong
					? "border border-[color:var(--red-500)] bg-[color:var(--status-danger-bg)]"
					: "border border-[color:var(--border-default)] bg-card"
			)}
			onClick={onClick}
			type="button"
		>
			<div className="flex-1">
				<div
					className={cn(
						"font-extrabold text-[14.5px]",
						danger
							? "text-[color:var(--red-600)]"
							: "text-[color:var(--status-pending-fg)]"
					)}
				>
					{label}
				</div>
				<div className="mt-0.5 text-[12px] text-muted-foreground">{desc}</div>
			</div>
			<span
				className={cn(
					"inline-flex size-[18px]",
					danger
						? "text-[color:var(--red-500)]"
						: "text-[color:var(--text-subtle)]"
				)}
			>
				<ChevronRightIcon />
			</span>
		</button>
	);
}

function SanctionSheet({
	target,
	onCancel,
	onPick,
}: {
	target: string;
	onCancel: () => void;
	onPick: (status: UserStatus, label: string) => void;
}) {
	return (
		<div className="absolute inset-0 z-20 flex flex-col justify-end">
			<button
				aria-label="닫기"
				className="absolute inset-0 cursor-pointer border-none bg-[color:var(--overlay-scrim)]"
				onClick={onCancel}
				type="button"
			/>
			<div className="relative animate-[bambiSheetUp_var(--dur-base)_var(--ease-out)] rounded-t-[24px] bg-background px-6 pt-5 pb-6 shadow-[0_-8px_40px_rgba(0,0,0,0.18)]">
				<h2 className="mt-0 mr-0 mb-1 ml-0 font-extrabold text-[19px] text-foreground">
					{target} 제재
				</h2>
				<p className="mt-0 mr-0 mb-[14px] ml-0 text-[13px] text-muted-foreground">
					신고가 사실로 확인되면 단계별로 조치해요.
				</p>
				<div className="flex flex-col gap-2.5">
					<SanctionBtn
						desc="정책 안내와 함께 경고 1회 누적"
						label="경고 보내기"
						onClick={() => onPick("warned", "경고를 보냈어요")}
						tone="pending"
					/>
					<SanctionBtn
						desc="기간 동안 공고·채팅 차단"
						label="이용 정지 (7일)"
						onClick={() => onPick("suspended", "이용을 정지했어요")}
						tone="danger"
					/>
					<SanctionBtn
						desc="계정 즉시 차단"
						label="영구 차단"
						onClick={() => onPick("blocked", "계정을 차단했어요")}
						strong
						tone="danger"
					/>
				</div>
				<div className="mt-3">
					<Button block onClick={onCancel} size="lg" variant="secondary">
						취소
					</Button>
				</div>
			</div>
		</div>
	);
}

export function UserDetail({
	item,
	onBack,
	onSanction,
}: {
	item: ManagedUser;
	onBack: () => void;
	onSanction: (id: string, status: UserStatus, label: string) => void;
}) {
	const c = STATUS_CONF[item.status];
	return (
		<div className="flex min-h-0 flex-1 flex-col">
			<AppBar onBack={onBack} title="사용자 상세" />
			<div className="flex min-h-0 flex-1 flex-col gap-[18px] overflow-y-auto px-6 pt-2 pb-5">
				<div className="flex flex-col items-center gap-2.5 py-1 text-center">
					<Avatar name={item.name} size="xl" square={item.role === "구인자"} />
					<div>
						<div className="font-extrabold text-[21px] text-foreground">
							{item.name}
						</div>
						<div className="mt-[3px] text-[13px] text-muted-foreground">
							{item.role} · 가입 {item.joined}
						</div>
					</div>
					<Badge dot tone={c.tone}>
						{c.label}
					</Badge>
				</div>
				<div className="grid grid-cols-2 gap-2.5">
					<MetaBox label="누적 신고" value={`${item.reports}건`} />
					<MetaBox label="경고 횟수" value={`${item.warnings}회`} />
				</div>
				<div className="flex gap-2 rounded-[14px] bg-secondary p-[14px]">
					<span className="mt-px inline-flex size-4 flex-[0_0_16px] text-muted-foreground">
						<AlertCircle />
					</span>
					<span className="text-[12.5px] text-[color:var(--text-default)] leading-[1.5]">
						{item.note}
					</span>
				</div>
				<div>
					<div className="mb-2.5 font-bold text-[13px] text-foreground">
						제재 적용
					</div>
					<div className="flex flex-col gap-2.5">
						<SanctionBtn
							desc="정책 안내와 함께 경고를 1회 누적해요"
							label="경고 보내기"
							onClick={() => onSanction(item.id, "warned", "경고를 보냈어요")}
							tone="pending"
						/>
						<SanctionBtn
							desc="기간 동안 공고·채팅을 막아요"
							label="이용 정지 (7일)"
							onClick={() =>
								onSanction(item.id, "suspended", "이용을 정지했어요")
							}
							tone="danger"
						/>
						<SanctionBtn
							desc="계정을 즉시 차단하고 모든 공고를 내려요"
							label="영구 차단"
							onClick={() =>
								onSanction(item.id, "blocked", "계정을 차단했어요")
							}
							strong
							tone="danger"
						/>
					</div>
				</div>
			</div>
		</div>
	);
}

// ---- 콘솔 셸 ---------------------------------------------------------------
export function ModTabs({
	tab,
	setTab,
}: {
	tab: string;
	setTab: (v: string) => void;
}) {
	const items = [
		{ v: "queue", label: "검수", icon: <ShieldIcon /> },
		{ v: "reports", label: "신고", icon: <FlagIcon /> },
		{ v: "users", label: "사용자", icon: <UserIcon /> },
	];
	return (
		<nav className="flex px-2 pt-2.5 pb-2">
			{items.map((it) => {
				const on = tab === it.v;
				return (
					<button
						className={cn(
							"flex flex-1 cursor-pointer flex-col items-center gap-1 border-none bg-none px-0 py-1",
							on ? "text-primary" : "text-[color:var(--text-subtle)]"
						)}
						key={it.v}
						onClick={() => setTab(it.v)}
						type="button"
					>
						<span className="inline-flex size-6">{it.icon}</span>
						<span
							className={cn(
								"text-[10px]",
								on ? "font-extrabold" : "font-medium"
							)}
						>
							{it.label}
						</span>
					</button>
				);
			})}
		</nav>
	);
}

// ---- 일괄 처리 액션 바 -----------------------------------------------------
function ActionBtn({
	label,
	tone,
	onClick,
}: {
	label: string;
	tone?: "danger" | "success";
	onClick: () => void;
}) {
	let color = "text-white";
	if (tone === "danger") {
		color = "text-coral-400";
	} else if (tone === "success") {
		color = "text-green-500";
	}
	return (
		<button
			className={cn(
				"h-[34px] cursor-pointer whitespace-nowrap rounded-[10px] border border-white/[0.14] bg-white/[0.08] px-[11px] font-bold text-[12.5px]",
				color
			)}
			onClick={onClick}
			type="button"
		>
			{label}
		</button>
	);
}

export function QueueActionBar({
	count,
	onAction,
}: {
	count: number;
	onAction: (action: "reject" | "hold" | "approve" | "sanction") => void;
}) {
	return (
		<div className="px-4 pt-2 pb-1">
			<div className="flex items-center gap-2 rounded-2xl bg-ink-800 px-3 py-2.5 shadow-lg">
				<span className="whitespace-nowrap font-bold text-[12.5px] text-white">
					{count}개 선택됨
				</span>
				<div className="ml-auto flex gap-1.5">
					<ActionBtn
						label="반려"
						onClick={() => onAction("reject")}
						tone="danger"
					/>
					<ActionBtn label="보류" onClick={() => onAction("hold")} />
					<ActionBtn
						label="승인"
						onClick={() => onAction("approve")}
						tone="success"
					/>
					<ActionBtn label="경고/제재" onClick={() => onAction("sanction")} />
				</div>
			</div>
		</div>
	);
}

export function ConsoleToast({ message }: { message: string }) {
	return (
		<div className="pointer-events-none absolute right-0 bottom-[84px] left-0 z-30 flex justify-center">
			<div className="flex items-center gap-2 rounded-full bg-ink-800 px-[18px] py-[11px] font-bold text-[13px] text-white shadow-lg">
				<span className="inline-flex size-4 text-green-500">
					<CheckIcon />
				</span>
				{message}
			</div>
		</div>
	);
}

type Detail =
	| { kind: "queue"; item: QueueItem }
	| { kind: "report"; item: Report }
	| { kind: "user"; item: ManagedUser }
	| null;

export function ModeratorApp({ tone = "calm" }: { tone?: VisualTone }) {
	const [tab, setTabState] = useState("queue");
	const [detail, setDetail] = useState<Detail>(null);
	const [queue, setQueue] = useState<QueueItem[]>(QUEUE);
	const [reports, setReports] = useState<Report[]>(REPORTS);
	const [users, setUsers] = useState<ManagedUser[]>(USERS);
	const [selected, setSelected] = useState<string[]>(
		QUEUE.length ? [QUEUE[0].id] : []
	);
	const [toast, setToast] = useState<string | null>(null);
	const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

	const flash = (msg: string) => {
		setToast(msg);
		if (timer.current) {
			clearTimeout(timer.current);
		}
		timer.current = setTimeout(() => setToast(null), 2200);
	};

	const setTab = (v: string) => {
		setTabState(v);
		setSelected([]);
	};

	const toggleSelect = (id: string) =>
		setSelected((s) =>
			s.includes(id) ? s.filter((x) => x !== id) : [...s, id]
		);

	const resolveQueue = (id: string, action: "approve" | "reject") => {
		setQueue((q) => q.filter((x) => x.id !== id));
		setSelected((s) => s.filter((x) => x !== id));
		setDetail(null);
		flash(action === "approve" ? "공고를 승인했어요" : "공고를 반려했어요");
	};
	const resolveReport = (id: string, action: "dismiss" | "act") => {
		setReports((r) =>
			r.map((x) => (x.id === id ? { ...x, status: "closed" as const } : x))
		);
		setDetail(null);
		flash(action === "dismiss" ? "신고를 기각했어요" : "조치를 적용했어요");
	};
	const sanction = (id: string, status: UserStatus, label: string) => {
		setUsers((u) =>
			u.map((x) =>
				x.id === id
					? {
							...x,
							status,
							warnings: status === "warned" ? x.warnings + 1 : x.warnings,
						}
					: x
			)
		);
		setDetail(null);
		flash(label);
	};

	const bulkAction = (action: "reject" | "hold" | "approve" | "sanction") => {
		const n = selected.length;
		if (action === "approve") {
			setQueue((q) => q.filter((x) => !selected.includes(x.id)));
			flash(`${n}건을 승인했어요`);
		} else if (action === "reject") {
			setQueue((q) => q.filter((x) => !selected.includes(x.id)));
			flash(`${n}건을 반려했어요`);
		} else if (action === "hold") {
			flash(`${n}건을 보류했어요`);
		} else {
			flash(`${n}건에 경고를 보냈어요`);
		}
		setSelected([]);
	};

	const openReports = reports.filter((r) => r.status === "open").length;
	const warnedUsers = users.filter((u) => u.status === "warned").length;

	let detailBody: ReactNode = null;
	if (detail?.kind === "queue") {
		detailBody = (
			<QueueDetail
				item={detail.item}
				onBack={() => setDetail(null)}
				onResolve={resolveQueue}
				tone={tone}
			/>
		);
	} else if (detail?.kind === "report") {
		detailBody = (
			<ReportDetail
				item={detail.item}
				onBack={() => setDetail(null)}
				onResolve={resolveReport}
				onSanction={sanction}
			/>
		);
	} else if (detail?.kind === "user") {
		detailBody = (
			<UserDetail
				item={detail.item}
				onBack={() => setDetail(null)}
				onSanction={sanction}
			/>
		);
	}

	let listBody: ReactNode = null;
	if (tab === "queue") {
		listBody = (
			<QueueList
				items={queue}
				onOpen={(item) => setDetail({ kind: "queue", item })}
				onToggle={toggleSelect}
				selected={selected}
			/>
		);
	} else if (tab === "reports") {
		listBody = (
			<ReportList
				items={reports}
				onOpen={(item) => setDetail({ kind: "report", item })}
			/>
		);
	} else {
		listBody = (
			<UserList
				items={users}
				onOpen={(item) => setDetail({ kind: "user", item })}
			/>
		);
	}

	const showActionBar = !detail && tab === "queue" && selected.length > 0;

	return (
		<div className="relative flex min-h-0 flex-1 flex-col">
			{detail ? (
				detailBody
			) : (
				<>
					<ConsoleTop
						counts={{
							queue: queue.length,
							reports: openReports,
							warned: warnedUsers,
						}}
						onTab={setTab}
						tab={tab}
					/>
					<div className="flex min-h-0 flex-1 flex-col">{listBody}</div>
				</>
			)}
			{showActionBar ? (
				<QueueActionBar count={selected.length} onAction={bulkAction} />
			) : null}
			{detail ? null : (
				<div className="border-border border-t bg-background">
					<ModTabs setTab={setTab} tab={tab} />
				</div>
			)}
			{toast ? (
				<div className="pointer-events-none absolute right-0 bottom-[84px] left-0 z-30 flex justify-center">
					<div className="flex items-center gap-2 rounded-full bg-ink-800 px-[18px] py-[11px] font-bold text-[13px] text-white shadow-lg">
						<span className="inline-flex size-4 text-green-500">
							<CheckIcon />
						</span>
						{toast}
					</div>
				</div>
			) : null}
		</div>
	);
}
