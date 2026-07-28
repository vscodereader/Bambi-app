"use client";

// 밤비 — 운영자(Moderator) 콘솔: 검수 큐, 신고 인박스, 사용자 제재.

import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@bambi-app/ui/components/select";
import {
	Sheet,
	SheetClose,
	SheetContent,
	SheetTitle,
	SheetTrigger,
} from "@bambi-app/ui/components/sheet";
import { cn } from "@bambi-app/ui/lib/utils";
import type { Route } from "next";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
	COMMUNITY_BOARDS,
	communityAuthorName,
	formatCommunityDate,
} from "@/lib/bambi/community";
import { QUEUE, REPORTS, USERS } from "@/lib/bambi/data";
import {
	accountStatusLabel,
	jobPostStatusLabel,
	reviewStatusLabel,
	userRoleLabel,
} from "@/lib/bambi/moderation-labels";
import { scan } from "@/lib/bambi/scanner";
import type {
	CommunityTargetStatus,
	ManagedUser,
	QueueItem,
	Report,
	ReportSeverity,
	RiskLevel,
	UserStatus,
	VisualTone,
} from "@/lib/bambi/types";
import { BOTTOM_NAV_STACK_OFFSET } from "../bottom-nav-shell";
import { AppBar, Avatar, Badge, Button, StatGroup } from "../ds";
import {
	AlertCircle,
	CheckIcon,
	ChevronRightIcon,
	ClipboardListIcon,
	FlagIcon,
	MoreIcon,
	ShieldIcon,
	SortIcon,
	StarIcon,
	UserIcon,
	XIcon,
} from "../icons";
import { RiskFlag } from "../safety-kit";
import type {
	ModerationBulkAction,
	ModerationBulkScope,
} from "./moderator-context";

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

export function ConsoleTop({
	counts,
}: {
	counts: { queue: number; reports: number; warned: number };
}) {
	return (
		<div className="flex flex-col gap-[14px] px-6 pt-3 pb-3">
			<h1 className="m-0 px-1 font-extrabold text-[24px] text-foreground">
				운영자 콘솔
			</h1>
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
// 검수 큐 필터·정렬 상태. 상태는 공고 위험도(riskLevel) 기준, 정렬은 접수 시각·위험도 기준.
type QueueStatusFilter = "all" | RiskLevel;
type QueueSortKey = "reply" | "recent" | "risk";

const QUEUE_STATUS_OPTIONS: { value: QueueStatusFilter; label: string }[] = [
	{ value: "all", label: "전체 상태" },
	{ value: "high", label: "높은 위험" },
	{ value: "mid", label: "중간 위험" },
	{ value: "low", label: "낮은 위험" },
];
const QUEUE_STATUS_LABEL: Record<QueueStatusFilter, string> = {
	all: "전체 상태",
	high: "높은 위험",
	mid: "중간 위험",
	low: "낮은 위험",
};

const QUEUE_SORT_OPTIONS: { value: QueueSortKey; label: string }[] = [
	{ value: "reply", label: "회신순" },
	{ value: "recent", label: "최신순" },
	{ value: "risk", label: "위험도순" },
];
const QUEUE_SORT_LABEL: Record<QueueSortKey, string> = {
	reply: "회신순",
	recent: "최신순",
	risk: "위험도순",
};

// 위험도 정렬 우선순위 (높음이 먼저).
const RISK_ORDER: Record<RiskLevel, number> = { high: 0, mid: 1, low: 2 };

const QUEUE_TRIGGER_CLASS =
	"h-10 gap-1.5 rounded-xl border-[color:var(--border-default)] bg-card px-[14px] font-semibold text-[13px] text-[color:var(--text-default)]";

function QueueFilterRow({
	status,
	sort,
	onStatusChange,
	onSortChange,
}: {
	status: QueueStatusFilter;
	sort: QueueSortKey;
	onStatusChange: (value: QueueStatusFilter) => void;
	onSortChange: (value: QueueSortKey) => void;
}) {
	return (
		<div className="flex gap-2">
			<Select
				onValueChange={(value) => {
					if (value) {
						onStatusChange(value as QueueStatusFilter);
					}
				}}
				value={status}
			>
				<SelectTrigger className={cn(QUEUE_TRIGGER_CLASS, "flex-1")}>
					<SelectValue>
						{(value) => QUEUE_STATUS_LABEL[value as QueueStatusFilter]}
					</SelectValue>
				</SelectTrigger>
				<SelectContent>
					{QUEUE_STATUS_OPTIONS.map((option) => (
						<SelectItem key={option.value} value={option.value}>
							{option.label}
						</SelectItem>
					))}
				</SelectContent>
			</Select>
			<Select
				onValueChange={(value) => {
					if (value) {
						onSortChange(value as QueueSortKey);
					}
				}}
				value={sort}
			>
				<SelectTrigger className={QUEUE_TRIGGER_CLASS}>
					<span className="inline-flex size-[15px] text-muted-foreground">
						<SortIcon />
					</span>
					<SelectValue>
						{(value) => QUEUE_SORT_LABEL[value as QueueSortKey]}
					</SelectValue>
				</SelectTrigger>
				<SelectContent>
					{QUEUE_SORT_OPTIONS.map((option) => (
						<SelectItem key={option.value} value={option.value}>
							{option.label}
						</SelectItem>
					))}
				</SelectContent>
			</Select>
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
	const [status, setStatus] = useState<QueueStatusFilter>("all");
	const [sort, setSort] = useState<QueueSortKey>("reply");

	const visibleItems = useMemo(() => {
		const filtered =
			status === "all" ? items : items.filter((q) => q.riskLevel === status);
		return [...filtered].sort((a, b) => {
			if (sort === "risk") {
				return RISK_ORDER[a.riskLevel] - RISK_ORDER[b.riskLevel];
			}
			if (sort === "recent") {
				// 접수 최신 순 (receivedAt: "YYYY.MM.DD HH:mm" 은 사전식 비교로 시간순 정렬 가능)
				return b.receivedAt.localeCompare(a.receivedAt);
			}
			// 회신순: 먼저 접수된 공고부터 회신 (접수 오래된 순)
			return a.receivedAt.localeCompare(b.receivedAt);
		});
	}, [items, status, sort]);

	let empty: ReactNode = null;
	if (visibleItems.length === 0) {
		empty =
			items.length === 0 ? (
				<EmptyState icon={<CheckIcon />} text="검수할 공고가 없어요" />
			) : (
				<EmptyState icon={<CheckIcon />} text="해당 상태의 공고가 없어요" />
			);
	}

	return (
		<div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-6 pb-5">
			<QueueFilterRow
				onSortChange={setSort}
				onStatusChange={setStatus}
				sort={sort}
				status={status}
			/>
			{empty
				? empty
				: visibleItems.map((q) => (
						<QueueRow
							key={q.id}
							onOpen={() => onOpen(q)}
							onToggle={() => onToggle(q.id)}
							q={q}
							selected={selected.includes(q.id)}
						/>
					))}
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
					<div className="min-w-0 flex-1">
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
			<div className="grid grid-cols-2 gap-2.5 border-border border-t px-6 pt-3 pb-1.5">
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
					className="shadow-none"
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
				<div className="grid grid-cols-2 gap-2.5">
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
	selected = false,
	onToggle,
}: {
	r: Report;
	onOpen: (r: Report) => void;
	done?: boolean;
	selected?: boolean;
	onToggle?: () => void;
}) {
	let borderClass = "border border-border";
	if (selected) {
		borderClass = "border border-primary bg-coral-50";
	} else if (r.sev === "high" && !done) {
		borderClass = "border border-[color:var(--red-500)]";
	}

	return (
		// biome-ignore lint/a11y/useSemanticElements: 행 내부에 체크박스 버튼이 중첩되어 네이티브 button 사용 불가. tabIndex/onKeyDown으로 키보드 접근성 보장.
		<div
			className={cn(
				"flex cursor-pointer gap-3 rounded-2xl bg-card p-4 text-left shadow-card",
				done ? "cursor-pointer opacity-60" : "cursor-pointer opacity-100",
				borderClass
			)}
			onClick={() => onOpen(r)}
			onKeyDown={(e) => {
				if (e.key === "Enter" || e.key === " ") {
					e.preventDefault();
					onOpen(r);
				}
			}}
			role="button"
			tabIndex={0}
		>
			{onToggle ? (
				<QueueCheckbox checked={selected} dark={false} onToggle={onToggle} />
			) : null}
			<div className="min-w-0 flex-1">
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
				<div className="mt-2.5 text-[12.5px] text-muted-foreground">
					<b className="text-[color:var(--text-default)]">{r.target}</b>(
					{r.targetRole}) · 신고 {r.reporter}({r.reporterRole})
				</div>
				<div className="mt-2.5 rounded-[10px] bg-secondary px-2.5 py-2 text-[12.5px] text-[color:var(--text-default)] leading-[1.45]">
					"{r.note}"
				</div>
			</div>
		</div>
	);
}

export function ReportList({
	items,
	onOpen,
	selected = [],
	onToggle,
}: {
	items: Report[];
	onOpen: (r: Report) => void;
	selected?: string[];
	onToggle?: (id: string) => void;
}) {
	const open = items.filter((r) => r.status === "open");
	const closed = items.filter((r) => r.status !== "open");
	return (
		<div className="flex min-h-0 flex-1 flex-col">
			<div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-6 pt-1 pb-5">
				{open.map((r) => (
					<ReportRow
						key={r.id}
						onOpen={onOpen}
						onToggle={onToggle ? () => onToggle(r.id) : undefined}
						r={r}
						selected={selected.includes(r.id)}
					/>
				))}
				{closed.length ? (
					<div className="mt-1.5 font-bold text-[12px] text-[color:var(--text-subtle)]">
						처리 완료
					</div>
				) : null}
				{closed.map((r) => (
					<ReportRow
						done
						key={r.id}
						onOpen={onOpen}
						onToggle={onToggle ? () => onToggle(r.id) : undefined}
						r={r}
						selected={selected.includes(r.id)}
					/>
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
				<div className="truncate text-[11px] text-muted-foreground">{role}</div>
			</div>
		</div>
	);
}

// ---- 신고 대상 맥락(targetType별 분기 렌더) --------------------------------
// 상태·역할 라벨은 공용 moderation-labels 모듈에서 소비한다(원값 노출 금지·중립 폴백).
const formatMessageTime = (value: Date | string) =>
	new Intl.DateTimeFormat("ko-KR", {
		dateStyle: "short",
		timeStyle: "short",
	}).format(new Date(value));

// 대상 맥락 카드의 공통 껍데기(제목 + 회색 박스). 기존 "신고된 대화" 블록과 룩앤필 통일.
function ContextSection({
	title,
	children,
}: {
	title: string;
	children: ReactNode;
}) {
	return (
		<div>
			<div className="mb-2 font-bold text-[13px] text-foreground">{title}</div>
			<div className="flex flex-col gap-2.5 rounded-[14px] border border-border bg-secondary p-[14px]">
				{children}
			</div>
		</div>
	);
}

function ContextField({ label, value }: { label: string; value: string }) {
	return (
		<div className="flex flex-col gap-0.5">
			<div className="text-[11px] text-muted-foreground">{label}</div>
			<div className="text-[13.5px] text-[color:var(--text-default)] leading-[1.5]">
				{value}
			</div>
		</div>
	);
}

function JobPostContext({
	jobPost,
}: {
	jobPost: {
		description: string;
		organizationDisplayName: string;
		rejectionReason: string | null;
		status: string;
		title: string;
	};
}) {
	return (
		<ContextSection title="신고된 공고">
			<ContextField label="제목" value={jobPost.title} />
			<ContextField label="업소" value={jobPost.organizationDisplayName} />
			<ContextField label="상태" value={jobPostStatusLabel(jobPost.status)} />
			<div className="flex flex-col gap-0.5">
				<div className="text-[11px] text-muted-foreground">공고 본문</div>
				<div className="line-clamp-4 text-[13.5px] text-[color:var(--text-default)] leading-[1.5]">
					{jobPost.description}
				</div>
			</div>
			{jobPost.rejectionReason ? (
				<ContextField label="반려 사유" value={jobPost.rejectionReason} />
			) : null}
		</ContextSection>
	);
}

function ReviewContext({
	review,
}: {
	review: { body: string; rating: number; status: string };
}) {
	const filled = Math.max(0, Math.min(5, review.rating));
	return (
		<ContextSection title="신고된 후기">
			<div className="flex items-center gap-2">
				<span className="font-bold text-[13.5px]">
					<span className="text-amber-500">{"★".repeat(filled)}</span>
					<span className="text-muted-foreground">
						{"★".repeat(5 - filled)}
					</span>
				</span>
				<span className="text-[12px] text-muted-foreground">
					{reviewStatusLabel(review.status)}
				</span>
			</div>
			<div className="whitespace-pre-wrap text-[13.5px] text-[color:var(--text-default)] leading-[1.5]">
				{review.body}
			</div>
		</ContextSection>
	);
}

function UserContext({
	user,
}: {
	user: {
		displayName: string | null;
		isPhoneVerified: boolean;
		role: string;
		status: string;
	};
}) {
	return (
		<ContextSection title="신고된 사용자">
			<ContextField label="표시명" value={user.displayName ?? "이름 없음"} />
			<ContextField label="역할" value={userRoleLabel(user.role)} />
			<ContextField label="계정 상태" value={accountStatusLabel(user.status)} />
			<ContextField
				label="전화 인증"
				value={user.isPhoneVerified ? "인증 완료" : "미인증"}
			/>
		</ContextSection>
	);
}

function ChatRoomContext({
	chatRoom,
	isBlocking,
	onBlock,
}: {
	chatRoom: {
		id: string;
		isBlocked: boolean;
		jobPostTitle: string;
		recentMessages: {
			body: string;
			createdAt: Date | string;
			id: string;
			senderUserId: string;
		}[];
	};
	isBlocking: boolean;
	onBlock?: (chatRoomId: string, isBlocked: boolean, reason: string) => void;
}) {
	const [reason, setReason] = useState("");
	const nextBlocked = !chatRoom.isBlocked;
	const canSubmit = reason.trim().length >= 2 && !isBlocking;
	const reasonId = `chat-room-block-reason-${chatRoom.id}`;

	return (
		<ContextSection title="신고된 대화방">
			<div className="flex items-center gap-2">
				<span className="min-w-0 flex-1 truncate font-bold text-[13.5px] text-foreground">
					{chatRoom.jobPostTitle}
				</span>
				<Badge tone={chatRoom.isBlocked ? "danger" : "success"}>
					{chatRoom.isBlocked ? "차단됨" : "정상"}
				</Badge>
			</div>
			<div className="flex flex-col gap-1.5">
				<div className="text-[11px] text-muted-foreground">
					최근 메시지 {chatRoom.recentMessages.length}건
				</div>
				{chatRoom.recentMessages.length ? (
					chatRoom.recentMessages.map((message) => (
						<div
							className="rounded-[10px] border border-border bg-card px-2.5 py-2"
							key={message.id}
						>
							<div className="mb-0.5 flex items-center justify-between gap-2 text-[10.5px] text-[color:var(--text-subtle)]">
								<span className="truncate">
									{message.senderUserId.slice(0, 6)}
								</span>
								<span className="whitespace-nowrap">
									{formatMessageTime(message.createdAt)}
								</span>
							</div>
							<div className="text-[13px] text-[color:var(--text-default)] leading-[1.45]">
								{message.body}
							</div>
						</div>
					))
				) : (
					<div className="text-[12.5px] text-muted-foreground">
						표시할 메시지가 없어요.
					</div>
				)}
			</div>
			{onBlock ? (
				<div className="flex flex-col gap-2 border-border border-t pt-2.5">
					<label
						className="font-bold text-[12.5px] text-foreground"
						htmlFor={reasonId}
					>
						{nextBlocked ? "방 차단" : "차단 해제"} 사유 (2자 이상)
					</label>
					<textarea
						className="min-h-[72px] w-full resize-none rounded-[12px] border border-border bg-card px-3 py-2.5 text-[13.5px] text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
						id={reasonId}
						onChange={(event) => setReason(event.target.value)}
						placeholder="조치 사유는 감사 로그에 남아요."
						value={reason}
					/>
					<Button
						block
						disabled={!canSubmit}
						onClick={() => onBlock(chatRoom.id, nextBlocked, reason.trim())}
						size="lg"
						variant={nextBlocked ? "danger" : "secondary"}
					>
						{nextBlocked ? "방 차단" : "차단 해제"}
					</Button>
				</div>
			) : null}
		</ContextSection>
	);
}

// 신고 대상 맥락을 targetType별로 분기 렌더한다. 구조화 맥락이 없으면(채팅 메시지·프리뷰
// 목업) null을 반환하고, 호출부가 기존 "신고된 대화" 스레드 블록으로 폴백한다.
function ReportTargetContextView({
	item,
	isBlockingChatRoom = false,
	onBlockChatRoom,
	onModerateCommunity,
}: {
	item: Report;
	isBlockingChatRoom?: boolean;
	onBlockChatRoom?: (
		chatRoomId: string,
		isBlocked: boolean,
		reason: string
	) => void;
	onModerateCommunity?: (
		report: Report,
		status: CommunityTargetStatus,
		reason: string
	) => void;
}) {
	// 커뮤니티 글·댓글은 미리보기와 숨김/삭제 조치를 함께 제공하는 전용 패널로 렌더한다.
	// 컨텍스트가 유실돼도 패널이 "대상을 찾을 수 없어요"를 안내하므로 targetContext보다 먼저 본다.
	if (item.communityKind) {
		return (
			<CommunityTargetPanel onModerate={onModerateCommunity} report={item} />
		);
	}
	const ctx = item.targetContext;
	if (!ctx) {
		return null;
	}
	if ("jobPost" in ctx) {
		return <JobPostContext jobPost={ctx.jobPost} />;
	}
	if ("review" in ctx) {
		return <ReviewContext review={ctx.review} />;
	}
	if ("user" in ctx) {
		return <UserContext user={ctx.user} />;
	}
	if ("chatRoom" in ctx) {
		return (
			<ChatRoomContext
				chatRoom={ctx.chatRoom}
				isBlocking={isBlockingChatRoom}
				onBlock={onBlockChatRoom}
			/>
		);
	}
	return null;
}

// ---- 커뮤니티 대상 미리보기·조치 ------------------------------------------
// 현재 콘텐츠 상태별 배지(라벨·톤)와 노출 조치 매트릭스.
const COMMUNITY_STATUS_BADGE: Record<
	CommunityTargetStatus,
	{ label: string; tone: "neutral" | "pending" | "danger" }
> = {
	published: { label: "게시 중", tone: "neutral" },
	hidden: { label: "숨김", tone: "pending" },
	deleted: { label: "삭제됨", tone: "danger" },
};

interface CommunityActionConfig {
	label: string;
	status: CommunityTargetStatus;
	tone?: "danger";
}

const COMMUNITY_ACTIONS: Record<
	CommunityTargetStatus,
	CommunityActionConfig[]
> = {
	published: [
		{ label: "숨기기", status: "hidden" },
		{ label: "삭제", status: "deleted", tone: "danger" },
	],
	hidden: [
		{ label: "복구", status: "published" },
		{ label: "삭제", status: "deleted", tone: "danger" },
	],
	deleted: [{ label: "복구", status: "published" }],
};

// 게시판 키를 사람이 읽는 라벨로. 미지의 키는 원본을 그대로 노출한다.
const getCommunityBoardLabel = (board: string): string =>
	COMMUNITY_BOARDS.find((item) => item.key === board)?.label ?? board;

function CommunityDeleteSheet({
	kindLabel,
	reason,
	onCancel,
	onConfirm,
}: {
	kindLabel: string;
	reason: string;
	onCancel: () => void;
	onConfirm: () => void;
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
					{kindLabel}을 삭제할까요?
				</h2>
				<p className="mt-0 mr-0 mb-[14px] ml-0 text-[13px] text-muted-foreground">
					삭제하면 사용자에게 더 이상 보이지 않아요. 입력한 사유는 기록에
					남아요.
				</p>
				<div className="mb-4 rounded-[14px] bg-secondary px-3 py-2.5 text-[13px] text-[color:var(--text-default)] leading-[1.5]">
					{reason}
				</div>
				<div className="grid grid-cols-2 gap-2.5">
					<Button block onClick={onCancel} size="lg" variant="secondary">
						취소
					</Button>
					<Button block onClick={onConfirm} size="lg" variant="danger">
						삭제하기
					</Button>
				</div>
			</div>
		</div>
	);
}

function CommunityTargetPanel({
	report,
	onModerate,
}: {
	report: Report;
	onModerate?: (
		report: Report,
		status: CommunityTargetStatus,
		reason: string
	) => void;
}) {
	const target = report.communityTarget;
	const [reason, setReason] = useState("");
	const [pendingDelete, setPendingDelete] = useState(false);

	// 커뮤니티 신고인데 대상 컨텍스트가 유실된 경우: 조치 없이 안내만.
	if (!target) {
		return (
			<div className="flex items-center gap-2 rounded-[14px] border border-border bg-secondary p-[14px]">
				<span className="inline-flex size-[18px] text-muted-foreground">
					<AlertCircle />
				</span>
				<span className="text-[13px] text-muted-foreground">
					대상 콘텐츠를 찾을 수 없어요.
				</span>
			</div>
		);
	}

	const kindLabel = target.kind === "post" ? "글" : "댓글";
	const titleLabel =
		target.kind === "comment" ? `원글: ${target.title}` : target.title;
	const statusBadge = COMMUNITY_STATUS_BADGE[target.status];
	const actions = COMMUNITY_ACTIONS[target.status];
	const canModerate = reason.trim().length >= 2 && Boolean(onModerate);
	const reasonId = `community-reason-${target.id}`;

	const runAction = (status: CommunityTargetStatus) => {
		const trimmed = reason.trim();
		if (!(onModerate && trimmed)) {
			return;
		}
		onModerate(report, status, trimmed);
	};

	return (
		<div className="flex flex-col gap-3">
			<div className="font-bold text-[13px] text-foreground">
				신고된 커뮤니티 {kindLabel}
			</div>
			<div className="flex flex-col gap-2.5 rounded-[14px] border border-border bg-secondary p-[14px]">
				<div className="flex flex-wrap items-center gap-2">
					<Badge tone="neutral">{getCommunityBoardLabel(target.board)}</Badge>
					<Badge tone={statusBadge.tone}>{statusBadge.label}</Badge>
					<span className="ml-auto text-[11.5px] text-[color:var(--text-subtle)]">
						{formatCommunityDate(target.createdAt)}
					</span>
				</div>
				<div className="font-extrabold text-[15px] text-foreground leading-[1.4]">
					{titleLabel}
				</div>
				<p className="m-0 whitespace-pre-wrap text-[13px] text-[color:var(--text-default)] leading-[1.6]">
					{target.bodyPreview}
				</p>
				<div className="text-[11.5px] text-muted-foreground">
					작성자 {communityAuthorName(target.authorName)}
				</div>
			</div>
			<div className="flex flex-col gap-2">
				<label
					className="font-bold text-[13px] text-foreground"
					htmlFor={reasonId}
				>
					조치 사유
				</label>
				<textarea
					className="min-h-[72px] w-full resize-none rounded-[14px] border border-border bg-card px-3 py-2.5 text-[14px] text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
					id={reasonId}
					maxLength={500}
					onChange={(event) => setReason(event.target.value)}
					placeholder="조치 사유를 입력하면 기록에 남아요."
					value={reason}
				/>
				<div className="flex flex-wrap gap-2">
					{actions.map((action) => (
						<Button
							disabled={!canModerate}
							key={action.status}
							onClick={() => {
								if (action.status === "deleted") {
									setPendingDelete(true);
									return;
								}
								runAction(action.status);
							}}
							size="sm"
							variant={action.tone === "danger" ? "danger" : "secondary"}
						>
							{action.label}
						</Button>
					))}
				</div>
			</div>
			{pendingDelete ? (
				<CommunityDeleteSheet
					kindLabel={kindLabel}
					onCancel={() => setPendingDelete(false)}
					onConfirm={() => {
						setPendingDelete(false);
						runAction("deleted");
					}}
					reason={reason.trim()}
				/>
			) : null}
		</div>
	);
}

export function ReportDetail({
	item,
	onBack,
	onResolve,
	onSanction,
	onBlockChatRoom,
	isBlockingChatRoom = false,
	onModerateCommunity,
}: {
	item: Report;
	onBack: () => void;
	onResolve: (id: string, action: "dismiss" | "act") => void;
	onSanction: (id: string, status: UserStatus, label: string) => void;
	onBlockChatRoom?: (
		chatRoomId: string,
		isBlocked: boolean,
		reason: string
	) => void;
	isBlockingChatRoom?: boolean;
	onModerateCommunity?: (
		report: Report,
		status: CommunityTargetStatus,
		reason: string
	) => void;
}) {
	const [act, setAct] = useState(false);
	// 구조화된 대상 맥락(공고·후기·사용자·대화방)이 있으면 전용 카드로, 없으면(채팅 메시지·
	// 프리뷰 목업) 기존 스레드 블록으로 폴백한다.
	const ctx = item.targetContext;
	const hasStructuredContext = Boolean(
		ctx &&
			("jobPost" in ctx ||
				"review" in ctx ||
				"user" in ctx ||
				"chatRoom" in ctx)
	);
	// 실데이터: 대상이 사용자면 실제 사용자 id로 제재한다. 그 외 유형(공고·후기·채팅 등)은
	// 사용자 제재 액션을 숨기고 사용자 관리로 안내한다. 프리뷰 목업(targetType 없음)은 기존
	// 합성 id 동작을 유지한다.
	let sanctionUserId: string | null = null;
	if (!item.targetType) {
		sanctionUserId = `u-${item.id}`;
	} else if (item.targetType === "user" && item.targetId) {
		sanctionUserId = item.targetId;
	}
	return (
		<div className="relative flex min-h-0 flex-1 flex-col">
			<AppBar onBack={onBack} title="신고 검토" />
			<div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-6 pt-1 pb-5">
				<div className="flex items-center gap-2">
					<SevPill sev={item.sev} />
					<h2 className="m-0 min-w-0 flex-1 font-extrabold text-[19px] text-foreground">
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
				{item.communityKind || hasStructuredContext ? (
					<ReportTargetContextView
						isBlockingChatRoom={isBlockingChatRoom}
						item={item}
						onBlockChatRoom={onBlockChatRoom}
						onModerateCommunity={onModerateCommunity}
					/>
				) : (
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
				)}
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
				<div className="border-border border-t px-6 pt-3 pb-1.5">
					{sanctionUserId ? null : (
						<p className="m-0 mb-2.5 text-[12px] text-muted-foreground leading-[1.5]">
							이 신고는 사용자 계정이 대상이 아니에요. 사용자 제재가 필요하면
							사용자 관리에서 진행해 주세요.
						</p>
					)}
					<div className="grid grid-cols-2 gap-2.5">
						<Button
							block
							onClick={() => onResolve(item.id, "dismiss")}
							size="lg"
							variant="secondary"
						>
							기각
						</Button>
						{sanctionUserId ? (
							<Button
								block
								onClick={() => setAct(true)}
								size="lg"
								variant="danger"
							>
								제재 적용
							</Button>
						) : (
							<Button
								block
								onClick={() => onResolve(item.id, "act")}
								size="lg"
								variant="primary"
							>
								조치 완료
							</Button>
						)}
					</div>
				</div>
			) : null}
			{act && sanctionUserId ? (
				<SanctionSheet
					onCancel={() => setAct(false)}
					onPick={(status, label) => {
						onSanction(sanctionUserId, status, label);
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
	selected = false,
	onToggle,
}: {
	u: ManagedUser;
	onOpen: (u: ManagedUser) => void;
	selected?: boolean;
	onToggle?: () => void;
}) {
	const c = STATUS_CONF[u.status];
	return (
		// biome-ignore lint/a11y/useSemanticElements: 행 내부에 체크박스 버튼이 중첩되어 네이티브 button 사용 불가. tabIndex/onKeyDown으로 키보드 접근성 보장.
		<div
			className={cn(
				"flex cursor-pointer items-center gap-3 rounded-2xl border bg-card p-4 text-left shadow-card",
				selected ? "border-primary bg-coral-50" : "border-border"
			)}
			onClick={() => onOpen(u)}
			onKeyDown={(e) => {
				if (e.key === "Enter" || e.key === " ") {
					e.preventDefault();
					onOpen(u);
				}
			}}
			role="button"
			tabIndex={0}
		>
			{onToggle ? (
				<QueueCheckbox checked={selected} dark={false} onToggle={onToggle} />
			) : null}
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
		</div>
	);
}

export function UserList({
	items,
	onOpen,
	selected = [],
	onToggle,
}: {
	items: ManagedUser[];
	onOpen: (u: ManagedUser) => void;
	selected?: string[];
	onToggle?: (id: string) => void;
}) {
	return (
		<div className="flex min-h-0 flex-1 flex-col">
			<div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-6 pt-1 pb-5">
				{items.map((u) => (
					<UserRow
						key={u.id}
						onOpen={onOpen}
						onToggle={onToggle ? () => onToggle(u.id) : undefined}
						selected={selected.includes(u.id)}
						u={u}
					/>
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

// 제재 선택지(경고/정지)별 기본 사유·라벨 정의. 사용자 상세와 신고 상세 양쪽에서
// 같은 기본 문구를 프리필하기 위해 공용화한다. defaultReason은 사유 입력 textarea에
// 미리 채워지며 운영자가 자유롭게 수정할 수 있다.
interface SanctionChoice {
	confirmLabel: string;
	danger: boolean;
	defaultReason: string;
	desc: string;
	status: UserStatus;
	title: string;
	tone: "pending" | "danger";
}

const SANCTION_CHOICES: SanctionChoice[] = [
	{
		confirmLabel: "경고 보내기",
		danger: false,
		defaultReason: "정책 안내와 함께 경고를 보냈어요",
		desc: "정책 안내와 함께 경고를 1회 누적해요",
		status: "warned",
		title: "경고 보내기",
		tone: "pending",
	},
	{
		confirmLabel: "이용 정지",
		danger: true,
		defaultReason: "정책 위반이 확인되어 이용을 정지했어요",
		desc: "기간 동안 공고·채팅을 막아요",
		status: "suspended",
		title: "이용 정지 (7일)",
		tone: "danger",
	},
];

// 사유 작성 시트(공용). 일괄 처리·사용자 상세 제재·신고 상세 제재가 모두 이 컴포넌트를
// 재사용한다. 제목/설명/사유 라벨/기본 문구/확정 버튼 문구를 주입받고, 사유 textarea는
// defaultReason으로 프리필한 뒤 최소 길이(minLength, 기본 2자)를 만족해야 확정된다.
// positioning="fixed"는 document.body로 포털된 일괄 시트(전체 화면 중앙 정렬)용,
// "absolute"는 콘솔 컨테이너 내부(사용자 상세·신고 상세)에서 부모 relative 박스를 덮는 시트용.
function ReasonConfirmSheet({
	confirmLabel,
	danger = false,
	defaultReason,
	description,
	busyLabel = "처리 중",
	isApplying = false,
	minLength = 2,
	placeholder,
	positioning = "fixed",
	reasonFieldId,
	reasonLabel = "처리 사유",
	title,
	onCancel,
	onConfirm,
}: {
	confirmLabel: string;
	danger?: boolean;
	defaultReason: string;
	description: ReactNode;
	busyLabel?: string;
	isApplying?: boolean;
	minLength?: number;
	placeholder?: string;
	positioning?: "fixed" | "absolute";
	reasonFieldId: string;
	reasonLabel?: string;
	title: string;
	onCancel: () => void;
	onConfirm: (reason: string) => void;
}) {
	const [reason, setReason] = useState(defaultReason);
	const canConfirm = reason.trim().length >= minLength && !isApplying;
	const fixed = positioning === "fixed";

	return (
		<div
			className={cn(
				"inset-0 flex flex-col justify-end",
				fixed ? "fixed z-50" : "absolute z-20"
			)}
		>
			<button
				aria-label="닫기"
				className="absolute inset-0 cursor-pointer border-none bg-[color:var(--overlay-scrim)]"
				onClick={onCancel}
				type="button"
			/>
			<div
				className={cn(
					"relative animate-[bambiSheetUp_var(--dur-base)_var(--ease-out)] rounded-t-[24px] bg-background px-6 pt-5 pb-6 shadow-[0_-8px_40px_rgba(0,0,0,0.18)]",
					fixed && "mx-auto w-full max-w-[520px]"
				)}
			>
				<h2 className="mt-0 mr-0 mb-1 ml-0 font-extrabold text-[19px] text-foreground">
					{title}
				</h2>
				<p className="mt-0 mr-0 mb-[14px] ml-0 text-[13px] text-muted-foreground">
					{description}
				</p>
				<label
					className="mb-2 block font-bold text-[13px] text-foreground"
					htmlFor={reasonFieldId}
				>
					{reasonLabel}
				</label>
				<textarea
					className="min-h-[92px] w-full resize-none rounded-[14px] border border-border bg-card px-3 py-2.5 text-[14px] text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
					id={reasonFieldId}
					onChange={(event) => setReason(event.target.value)}
					placeholder={placeholder ?? defaultReason}
					value={reason}
				/>
				<div className="mt-4 grid grid-cols-2 gap-2.5">
					<Button block onClick={onCancel} size="lg" variant="secondary">
						취소
					</Button>
					<Button
						block
						className="shadow-none"
						disabled={!canConfirm}
						onClick={() => onConfirm(reason.trim())}
						size="lg"
						variant={danger ? "danger" : "primary"}
					>
						{isApplying ? busyLabel : confirmLabel}
					</Button>
				</div>
			</div>
		</div>
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
	// 2단계 시트: 1단계에서 경고/정지를 고르면 2단계 사유 작성 시트로 전환한다.
	// 사유 단계에서 취소하면 1단계(선택)로 돌아가고, 선택 단계에서 취소하면 전체를 닫는다.
	const [picked, setPicked] = useState<SanctionChoice | null>(null);

	if (picked) {
		return (
			<ReasonConfirmSheet
				confirmLabel={picked.confirmLabel}
				danger={picked.danger}
				defaultReason={picked.defaultReason}
				description={`${target} 님에게 적용돼요`}
				onCancel={() => setPicked(null)}
				onConfirm={(reason) => onPick(picked.status, reason)}
				positioning="absolute"
				reasonFieldId="report-sanction-reason"
				reasonLabel="제재 사유"
				title={picked.title}
			/>
		);
	}

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
					{SANCTION_CHOICES.map((choice) => (
						<SanctionBtn
							desc={choice.desc}
							key={choice.status}
							label={choice.title}
							onClick={() => setPicked(choice)}
							tone={choice.tone}
						/>
					))}
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
	// 경고/정지 버튼을 누르면 곧바로 적용하지 않고, 공용 사유 작성 시트를 띄워
	// 기본 문구가 프리필된 사유를 운영자가 확인·수정한 뒤 확정하게 한다.
	const [pending, setPending] = useState<SanctionChoice | null>(null);
	return (
		<div className="relative flex min-h-0 flex-1 flex-col">
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
				{item.status === "suspended" ? (
					<div>
						<div className="mb-2.5 font-bold text-[13px] text-foreground">
							계정 상태 복구
						</div>
						<p className="mt-0 mb-2.5 text-[12.5px] text-muted-foreground leading-[1.5]">
							현재 이용 정지 상태예요. 제재 사유가 해소됐다면 계정을 정상 이용
							상태로 되돌릴 수 있어요.
						</p>
						<Button
							block
							leftIcon={<CheckIcon />}
							onClick={() =>
								onSanction(item.id, "active", "계정을 정상으로 복구했어요")
							}
							size="lg"
							variant="primary"
						>
							정상으로 복구
						</Button>
					</div>
				) : null}
				<div>
					<div className="mb-2.5 font-bold text-[13px] text-foreground">
						제재 적용
					</div>
					<div className="flex flex-col gap-2.5">
						{SANCTION_CHOICES.map((choice) => (
							<SanctionBtn
								desc={choice.desc}
								key={choice.status}
								label={choice.title}
								onClick={() => setPending(choice)}
								tone={choice.tone}
							/>
						))}
					</div>
				</div>
			</div>
			{pending ? (
				<ReasonConfirmSheet
					confirmLabel={pending.confirmLabel}
					danger={pending.danger}
					defaultReason={pending.defaultReason}
					description={`${item.name} 님에게 적용돼요`}
					onCancel={() => setPending(null)}
					onConfirm={(reason) => {
						onSanction(item.id, pending.status, reason);
						setPending(null);
					}}
					positioning="absolute"
					reasonFieldId={`user-sanction-reason-${item.id}`}
					reasonLabel="제재 사유"
					title={pending.title}
				/>
			) : null}
		</div>
	);
}

// ---- 콘솔 셸 ---------------------------------------------------------------
// "더보기" 시트가 노출하는 목적지 — 데스크톱 헤더 nav(승인 관리·광고·결제 그룹,
// moderator/layout.tsx)를 모바일에서 미러링한다. 하단 평면 탭(검수·신고·사용자·
// 광고 상품)에 자리가 없어 여기로 접는다. 라우트가 바뀌면 layout.tsx와 함께 갱신.
const MOD_MORE_GROUPS: {
	items: { href: Route; label: string }[];
	label: string;
}[] = [
	{
		label: "공고",
		items: [{ href: "/moderator/jobs" as Route, label: "공고 관리" }],
	},
	{
		label: "승인 관리",
		items: [
			{ href: "/moderator/employers", label: "업소 승인" },
			{ href: "/moderator/team-invites", label: "팀 합류 승인" },
		],
	},
	{
		label: "광고·결제",
		items: [
			{ href: "/moderator/ad-products", label: "광고 상품" },
			{ href: "/moderator/payments", label: "결제 관리" },
		],
	},
	{
		label: "콘텐츠·고객센터",
		items: [
			{ href: "/moderator/content" as Route, label: "게시물" },
			{ href: "/moderator/support" as Route, label: "고객센터" },
			{ href: "/moderator/banned-words" as Route, label: "금칙어" },
			{ href: "/moderator/crawler" as Route, label: "크롤링" },
		],
	},
	{
		label: "사이트",
		items: [
			{ href: "/moderator/site-settings" as Route, label: "사이트 정보" },
		],
	},
];

// 하단 탭 버튼 공통 톤(평면 탭·더보기 탭 공유).
function modTabButtonClassName(on: boolean): string {
	return cn(
		"flex flex-1 cursor-pointer flex-col items-center gap-1 border-none bg-none px-0 py-1",
		on ? "text-primary" : "text-[color:var(--text-subtle)]"
	);
}

function modTabLabelClassName(on: boolean): string {
	return cn("text-[10px]", on ? "font-extrabold" : "font-medium");
}

// "더보기" 탭 — 하단 탭에 담기지 않는 목적지를 시트로 펼친다.
function ModMoreTab({ active }: { active: boolean }) {
	const [open, setOpen] = useState(false);
	const pathname = usePathname();
	return (
		<Sheet onOpenChange={setOpen} open={open}>
			{/* base-ui Trigger가 열림/닫힘을 토글하고 outside-press 대상에서 트리거를
			    제외하므로, "더보기"를 다시 눌러도 재오픈 레이스 없이 확실히 닫힌다. */}
			<SheetTrigger className={modTabButtonClassName(active)}>
				<span className="inline-flex size-6">
					{open ? <XIcon /> : <MoreIcon />}
				</span>
				<span className={modTabLabelClassName(active)}>
					{open ? "닫기" : "더보기"}
				</span>
			</SheetTrigger>
			<SheetContent>
				<SheetTitle>더보기</SheetTitle>
				<div className="mt-5 flex flex-col gap-6">
					{MOD_MORE_GROUPS.map((group) => (
						<div className="flex flex-col gap-1" key={group.label}>
							<p className="px-3 font-bold text-muted-foreground text-xs">
								{group.label}
							</p>
							{group.items.map((item) => {
								const isActive =
									pathname === item.href ||
									pathname.startsWith(`${item.href}/`);
								return (
									<SheetClose
										className={cn(
											"rounded-lg px-3 py-2.5 text-left font-bold text-sm no-underline",
											isActive
												? "bg-muted text-foreground"
												: "text-foreground hover:bg-muted/50"
										)}
										key={item.href}
										// Link는 <a>라 네이티브 버튼이 아니므로 base-ui에 명시(경고 방지).
										nativeButton={false}
										render={<Link href={item.href} />}
									>
										{item.label}
									</SheetClose>
								);
							})}
						</div>
					))}
				</div>
			</SheetContent>
		</Sheet>
	);
}

export function ModTabs({
	tab,
	setTab,
	showEmployers = false,
	showReviews = false,
}: {
	tab: string;
	setTab: (v: string) => void;
	// 라이브 운영자 콘솔에서만 광고 상품·더보기 탭을 노출한다(프리뷰 목업은 3탭 유지).
	showEmployers?: boolean;
	// 라이브 콘솔에서 후기 관리 탭을 노출한다(PC 상단 메뉴와 동일하게).
	showReviews?: boolean;
}) {
	const items = [
		{ v: "queue", label: "검수", icon: <ShieldIcon /> },
		{ v: "reports", label: "신고", icon: <FlagIcon /> },
		{ v: "users", label: "사용자", icon: <UserIcon /> },
		...(showReviews
			? [{ v: "reviews", label: "후기", icon: <StarIcon /> }]
			: []),
		...(showEmployers
			? [{ v: "adProducts", label: "광고 상품", icon: <ClipboardListIcon /> }]
			: []),
	];
	return (
		<nav className="flex px-2 pt-2.5 pb-2">
			{items.map((it) => {
				const on = tab === it.v;
				return (
					<button
						className={modTabButtonClassName(on)}
						key={it.v}
						onClick={() => setTab(it.v)}
						type="button"
					>
						<span className="inline-flex size-6">{it.icon}</span>
						<span className={modTabLabelClassName(on)}>{it.label}</span>
					</button>
				);
			})}
			{showEmployers ? <ModMoreTab active={tab === "more"} /> : null}
		</nav>
	);
}

// ---- 일괄 처리 액션 바 -----------------------------------------------------
interface BulkActionConfig {
	action: ModerationBulkAction;
	defaultReason: string;
	label: string;
	scope: ModerationBulkScope;
	tone?: "danger" | "success";
}

const BULK_ACTIONS: Record<ModerationBulkScope, BulkActionConfig[]> = {
	queue: [
		{
			action: "reject",
			defaultReason: "정책 위반 표현이 포함되어 공고를 반려합니다.",
			label: "반려",
			scope: "queue",
			tone: "danger",
		},
		{
			action: "hold",
			defaultReason: "추가 확인이 필요해 공고를 보류합니다.",
			label: "보류",
			scope: "queue",
		},
		{
			action: "approve",
			defaultReason: "운영 검수 기준을 충족해 공고를 승인합니다.",
			label: "승인",
			scope: "queue",
			tone: "success",
		},
	],
	reports: [
		{
			action: "dismiss",
			defaultReason: "정책 위반으로 보기 어려워 신고를 기각합니다.",
			label: "기각",
			scope: "reports",
		},
		{
			action: "resolve",
			defaultReason: "신고 내용을 확인하고 필요한 조치를 완료했습니다.",
			label: "해결",
			scope: "reports",
			tone: "success",
		},
	],
	users: [
		{
			action: "warn",
			defaultReason: "정책 위반 가능성을 안내하고 경고를 발송합니다.",
			label: "경고",
			scope: "users",
		},
		{
			action: "suspend",
			defaultReason: "정책 위반이 확인되어 계정 이용을 정지합니다.",
			label: "정지",
			scope: "users",
			tone: "danger",
		},
	],
};

function ActionBtn({
	disabled = false,
	label,
	tone,
	onClick,
}: {
	disabled?: boolean;
	label: string;
	tone?: "danger" | "success";
	onClick: () => void;
}) {
	let toneClass = "bg-secondary text-foreground";
	if (tone === "danger") {
		toneClass = "bg-coral-500 text-white";
	} else if (tone === "success") {
		toneClass = "bg-primary text-primary-foreground";
	}
	return (
		<button
			className={cn(
				"h-[34px] cursor-pointer whitespace-nowrap rounded-[10px] px-[11px] font-bold text-[12.5px]",
				toneClass,
				disabled && "cursor-not-allowed opacity-50"
			)}
			disabled={disabled}
			onClick={onClick}
			type="button"
		>
			{label}
		</button>
	);
}

export function QueueActionBar({
	count,
	isApplying = false,
	onAction,
	scope = "queue",
}: {
	count: number;
	isApplying?: boolean;
	onAction: (
		scope: ModerationBulkScope,
		action: ModerationBulkAction,
		reason: string
	) => void;
	scope?: ModerationBulkScope;
}) {
	const [pendingAction, setPendingAction] = useState<BulkActionConfig | null>(
		null
	);
	const actions = BULK_ACTIONS[scope];
	const confirm = (reason: string) => {
		if (!pendingAction) {
			return;
		}

		onAction(pendingAction.scope, pendingAction.action, reason);
		setPendingAction(null);
	};

	return (
		<div className="px-4 pt-2 pb-1">
			<div className="flex items-center gap-2 rounded-2xl border border-border bg-background px-3 py-2.5 shadow-[var(--shadow-card)]">
				<span className="whitespace-nowrap font-bold text-[12.5px] text-foreground">
					{count}개 선택됨
				</span>
				<div className="ml-auto flex min-w-0 gap-1.5 overflow-x-auto">
					{actions.map((action) => (
						<ActionBtn
							disabled={isApplying}
							key={`${action.scope}-${action.action}`}
							label={action.label}
							onClick={() => setPendingAction(action)}
							tone={action.tone}
						/>
					))}
				</div>
			</div>
			{pendingAction
				? createPortal(
						<ReasonConfirmSheet
							confirmLabel={`${pendingAction.label} 적용`}
							danger={pendingAction.tone === "danger"}
							defaultReason={pendingAction.defaultReason}
							description={`${count}건 선택됨`}
							isApplying={isApplying}
							onCancel={() => setPendingAction(null)}
							onConfirm={confirm}
							positioning="fixed"
							reasonFieldId={`bulk-reason-${pendingAction.scope}-${pendingAction.action}`}
							title={`${pendingAction.label} 확인`}
						/>,
						document.body
					)
				: null}
		</div>
	);
}

export function ConsoleToast({ message }: { message: string }) {
	return (
		<div
			className={cn(
				"pointer-events-none absolute right-0 left-0 z-30 flex justify-center px-4",
				BOTTOM_NAV_STACK_OFFSET
			)}
		>
			<div className="flex max-w-[420px] items-center gap-2 rounded-[18px] bg-ink-800 px-[18px] py-[11px] font-bold text-[13px] text-white shadow-lg">
				<span className="inline-flex size-4 flex-[0_0_16px] text-green-500">
					<CheckIcon />
				</span>
				<span className="min-w-0 leading-[1.35]">{message}</span>
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

	const bulkAction = (
		_scope: ModerationBulkScope,
		action: ModerationBulkAction,
		_reason: string
	) => {
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
			flash(`${n}건을 처리했어요`);
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
