"use client";

// 밤비 — 운영자(Moderator) 콘솔: 검수 큐, 신고 인박스, 사용자 제재.

// 복구 가능 여부 판정은 서버(accountRecovery.restoreWithdrawnAccount)와 같은 순수 함수를
// 공유한다 — 화면이 규칙을 따로 구현하면 버튼은 열려 있는데 서버가 거절하는 상태가 생긴다.
import { resolveAccountRestoreDecision } from "@bambi-app/api/services/bambi-account-restore";
import { Button as UiButton } from "@bambi-app/ui/components/button";
import { Checkbox } from "@bambi-app/ui/components/checkbox";
import {
	Dialog,
	DialogContent,
	DialogTitle,
} from "@bambi-app/ui/components/dialog";
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
import { Skeleton } from "@bambi-app/ui/components/skeleton";
import { cn } from "@bambi-app/ui/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight } from "lucide-react";
import type { Route } from "next";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { type DataColumn, DataTable } from "@/components/bambi/data-table";
import { StatusBadge } from "@/components/bambi/status-badge";
import { jobMediaPublicUrl } from "@/lib/bambi/api-job-mapper";
import {
	COMMUNITY_BOARDS,
	communityAuthorName,
	formatCommunityDate,
} from "@/lib/bambi/community";
import {
	accountStatusLabel,
	jobPostStatusLabel,
	moderationActionLabel,
	reviewStatusLabel,
	userRoleLabel,
} from "@/lib/bambi/moderation-labels";
import { MODERATOR_MORE_GROUPS } from "@/lib/bambi/moderator-navigation";
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
import { formatDateTime } from "@/lib/bambi-format";
import { orpc } from "@/utils/orpc";
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
import {
	type ModerationBulkAction,
	type ModerationBulkScope,
	QUEUE_VERDICT_TOAST,
	type QueueVerdict,
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

// 카드 목록(검수 큐·신고·사용자)의 선택 체크박스. shadcn Checkbox를 쓰지 않는 이유는
// base-ui Checkbox가 숨은 <input>을 루트의 형제로 렌더하고 클릭을 그 input에 재발행해서,
// 행 클릭(상세 이동)과 분리하려면 래퍼를 한 겹 더 둬야 하기 때문이다. 여기서는 토글
// 버튼(aria-pressed) 하나로 끝내고 클릭을 그 자리에서 멈춘다. 모양은 콘솔 체크박스 토큰
// (rounded-sm · border-input · 선택 시 primary)에 맞춘다.
function QueueCheckbox({
	checked,
	label = "항목 선택",
	onToggle,
}: {
	checked: boolean;
	label?: string;
	onToggle: () => void;
}) {
	return (
		<button
			aria-label={label}
			aria-pressed={checked}
			className={cn(
				"mt-0.5 inline-flex size-5 shrink-0 cursor-pointer items-center justify-center rounded-sm border transition-colors",
				checked
					? "border-primary bg-primary text-primary-foreground"
					: "border-input bg-card text-transparent hover:border-primary/60"
			)}
			onClick={(e) => {
				e.stopPropagation();
				onToggle();
			}}
			type="button"
		>
			<span className="inline-flex size-3">
				<CheckIcon />
			</span>
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
	// 선택 표시는 신고·사용자 목록과 같은 언어(코럴 테두리 + 연한 코럴 배경)로 통일한다.
	// 예전처럼 행 전체를 잉크색으로 반전시키면 선택이 "조치 완료"처럼 읽히고, 여러 건을
	// 고를수록 목록이 통째로 어두워져 남은 항목을 훑기 어렵다.
	const subFg = "text-muted-foreground";
	return (
		// biome-ignore lint/a11y/useSemanticElements: 행 내부에 체크박스 버튼이 중첩되어 네이티브 button 사용 불가. tabIndex/onKeyDown으로 키보드 접근성 보장.
		<div
			className={cn(
				"flex cursor-pointer items-start gap-3 rounded-2xl p-[14px] text-[color:var(--text-default)] shadow-card",
				selected
					? "border border-primary bg-coral-50"
					: "border border-border bg-card"
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
			<QueueCheckbox
				checked={selected}
				label={`${q.company} 공고 선택`}
				onToggle={onToggle}
			/>
			<Avatar name={q.company} size="sm" square />
			<div className="flex min-w-0 flex-1 flex-col gap-[5px]">
				<div className="flex items-center gap-2">
					<span className="whitespace-nowrap font-bold text-[14.5px] text-foreground">
						{q.company}
					</span>
					<span className={cn("min-w-0 flex-1 truncate text-[13px]", subFg)}>
						{q.role}
					</span>
					<RiskBadge level={q.riskLevel} />
				</div>
				<div className={cn("text-[12.5px] leading-[1.45]", subFg)}>
					{q.detected.length > 0 ? (
						<>
							<span>감지 문구 </span>
							<span className="font-bold text-[color:var(--text-default)]">
								{q.detected.map((d) => `"${d}"`).join(", ")}
							</span>
						</>
					) : (
						<span>감지된 문구 없음 · 정상 등록 건</span>
					)}
				</div>
				<div className="text-[11.5px] text-[color:var(--text-subtle)]">
					접수 {q.receivedAt} · ID {q.refId}
				</div>
			</div>
			<span
				aria-hidden="true"
				className="mt-px inline-flex size-[18px] text-[color:var(--text-subtle)]"
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

export interface QueueDetailMediaItem {
	altText: string;
	storageKey: string;
}

export interface QueueDetailMedia {
	cover: QueueDetailMediaItem | null;
	detail: QueueDetailMediaItem[];
}

// 검수용 이미지 열람. 본문 없이 이미지로만 등록된 공고가 있어 운영자가 실제 이미지를
// 봐야 승인/반려를 판단할 수 있다. JobCoverImage는 쓰지 않는다 — 로드 실패를 샘플
// 썸네일로 가려서, 운영자가 남의 사진을 이 공고 이미지로 오인할 수 있다.
function QueueMediaSection({
	isLoading,
	media,
}: {
	isLoading: boolean;
	media?: QueueDetailMedia;
}) {
	const [zoomed, setZoomed] = useState<QueueDetailMediaItem | null>(null);

	if (isLoading) {
		return (
			<div className="grid grid-cols-2 gap-2.5 lg:grid-cols-3">
				<Skeleton className="aspect-video w-full rounded-xl" />
				<Skeleton className="aspect-video w-full rounded-xl" />
				<Skeleton className="hidden aspect-video w-full rounded-xl lg:block" />
			</div>
		);
	}

	const items = [
		...(media?.cover ? [media.cover] : []),
		...(media?.detail ?? []),
	];

	if (items.length === 0) {
		return null;
	}

	return (
		<div className="flex flex-col gap-2">
			<div className="font-bold text-[13px] text-foreground">
				공고 이미지 {items.length}장
			</div>
			<div className="grid grid-cols-2 gap-2.5 lg:grid-cols-3">
				{items.map((mediaItem) => (
					<button
						className="relative aspect-video overflow-hidden rounded-xl border border-border bg-secondary p-0"
						key={mediaItem.storageKey}
						onClick={() => setZoomed(mediaItem)}
						type="button"
					>
						<Image
							alt={mediaItem.altText || "공고 이미지"}
							className="object-cover"
							fill
							sizes="(max-width: 768px) 50vw, 320px"
							src={jobMediaPublicUrl(mediaItem.storageKey)}
							unoptimized
						/>
					</button>
				))}
			</div>
			<Dialog
				onOpenChange={(open) => {
					if (!open) {
						setZoomed(null);
					}
				}}
				open={zoomed !== null}
			>
				<DialogContent className="w-[92vw] max-w-3xl">
					<DialogTitle>공고 이미지</DialogTitle>
					{zoomed ? (
						<div className="relative h-[70vh] w-full">
							<Image
								alt={zoomed.altText || "공고 이미지"}
								className="rounded-xl object-contain"
								fill
								sizes="768px"
								src={jobMediaPublicUrl(zoomed.storageKey)}
								unoptimized
							/>
						</div>
					) : null}
				</DialogContent>
			</Dialog>
		</div>
	);
}

// 판단 기준 안내는 데스크톱(판정 도크)과 모바일(본문 아래) 두 자리에 놓인다.
// 자리가 다를 뿐 같은 문장이라 원본을 하나만 둔다.
const VERDICT_GUIDE =
	"판단 기준: 성적 서비스 암시·강요·외부 연락 유도는 반려, 단순 오해 소지는 승인 후 안내해요.";

// 승인·보류·반려도 마찬가지로 두 자리에 놓인다(데스크톱 도크 / 모바일 하단 바).
// 버튼 자체를 한 곳에 모아 둬야 한쪽만 고치는 실수가 안 난다. 모바일 하단 바는 2열
// 그리드라 보류·반려를 한 줄에 두고 승인만 아래 줄 전체를 쓴다(주요 액션 한 곳).
function VerdictActions({
	onApprove,
	onHold,
	onReject,
}: {
	onApprove: () => void;
	onHold: () => void;
	onReject: () => void;
}) {
	return (
		<>
			<Button block onClick={onHold} size="lg" variant="secondary">
				보류
			</Button>
			<Button block onClick={onReject} size="lg" variant="secondary">
				반려
			</Button>
			<Button
				block
				className="col-span-2 shadow-none"
				onClick={onApprove}
				size="lg"
				variant="primary"
			>
				승인
			</Button>
		</>
	);
}

export function QueueDetail({
	item,
	isMediaLoading = false,
	media,
	tone,
	onBack,
	onResolve,
}: {
	item: QueueItem;
	isMediaLoading?: boolean;
	media?: QueueDetailMedia;
	tone: VisualTone;
	onBack: () => void;
	onResolve: (id: string, action: QueueVerdict, reason?: string) => void;
}) {
	// 세 판정 모두 사유 시트를 거친다 — 목록 일괄 처리는 승인에도 사유를 받는데
	// 상세만 즉시 처리하면 같은 조치의 기록이 경로마다 달라진다.
	const [verdict, setVerdict] = useState<QueueVerdict | null>(null);
	const approve = () => setVerdict("approve");
	return (
		<div className="relative flex min-h-0 flex-1 flex-col lg:flex-none">
			<AppBar onBack={onBack} title="공고 검수" />
			{/* 모바일은 화면 한 장이 곧 앱 화면이라 안에서 스크롤하고 하단 바를 바닥에 붙인다.
			    데스크톱에 그 틀을 그대로 쓰면 내용이 짧을 때 뷰포트 높이만큼 빈 판이 생기고
			    액션 바가 본문에서 수백 px 아래로 떨어진다. lg부터는 문서처럼 흐르게 두고
			    카드 한 장으로 감싼다 — 페이지 배경이 bg-secondary라 이 카드가 경계를 만든다. */}
			<div className="flex min-h-0 flex-1 flex-col gap-[18px] overflow-y-auto px-6 pt-1 pb-5 lg:mb-6 lg:flex-none lg:gap-6 lg:overflow-visible lg:rounded-2xl lg:border lg:border-border lg:bg-card lg:px-7 lg:pt-6 lg:pb-7 lg:shadow-[var(--shadow-card)]">
				{/* 제목과 급여·접수는 "무엇을 심사하는가" 한 덩어리다. 데스크톱에서는 한 줄에
				    붙여 판단 재료가 시작되는 지점을 위로 끌어올린다. 모바일 순서(제목 → 메타)는
				    DOM 그대로여야 해서 래퍼를 display:contents로 접어 둔다. */}
				<div className="contents lg:flex lg:items-center lg:justify-between lg:gap-6">
					<div className="flex items-center gap-3 lg:min-w-0 lg:flex-1">
						<Avatar name={item.company} size="lg" square />
						<div className="min-w-0 flex-1">
							<div className="font-extrabold text-[19px] text-foreground lg:text-2xl">
								{item.title}
							</div>
							<div className="mt-0.5 text-[13px] text-muted-foreground">
								{item.company} · {item.location} · ID {item.refId}
							</div>
						</div>
					</div>
					<div className="grid grid-cols-2 gap-2.5 lg:w-72 lg:shrink-0">
						<MetaBox label="급여" value={item.pay} />
						<MetaBox label="접수" value={item.receivedAt} />
					</div>
				</div>
				{/* 이 공고가 큐에 온 이유라 데스크톱에서도 전체 폭 밴드로 둔다. 좁은 열에 넣으면
				    RiskFlag가 whitespace-nowrap이라 긴 감지 문구가 열 밖으로 삐져나간다. */}
				<div className="flex flex-col gap-2 rounded-[14px] bg-[color:var(--status-pending-bg)] p-[14px] lg:px-5 lg:py-4">
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
				<div className="flex flex-col gap-[18px] lg:flex-row lg:items-start lg:gap-7">
					<div className="contents lg:flex lg:min-w-0 lg:flex-1 lg:flex-col lg:gap-5">
						{item.desc.trim().length > 0 ? (
							<>
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
								<QueueMediaSection isLoading={isMediaLoading} media={media} />
							</>
						) : (
							<>
								{/* 본문이 없으면 이미지가 유일한 판단 재료다 — 위로 올린다. */}
								<div className="flex items-center gap-2 rounded-[14px] bg-secondary px-4 py-3">
									<span className="inline-flex size-[18px] text-muted-foreground">
										<AlertCircle />
									</span>
									<span className="font-bold text-[13px] text-foreground">
										본문 없음 · 이미지로만 등록된 공고
									</span>
								</div>
								<QueueMediaSection isLoading={isMediaLoading} media={media} />
							</>
						)}
						<div className="px-0.5 text-[12px] text-muted-foreground leading-[1.55] lg:hidden">
							{VERDICT_GUIDE}
						</div>
					</div>
					{/* 판정 도크. 승인·반려를 근거 옆에 붙여 두고 스크롤을 따라오게 한다 —
					    화면 바닥에 고정된 바는 데스크톱에서 본문과 멀어지기만 한다.
					    모바일에서는 도크가 통째로 숨고 하단 바가 같은 역할을 한다. */}
					<aside className="hidden lg:sticky lg:top-20 lg:flex lg:w-72 lg:shrink-0 lg:flex-col lg:gap-3 lg:rounded-xl lg:bg-secondary lg:p-5">
						<div className="font-extrabold text-[13px] text-foreground">
							판정
						</div>
						<p className="m-0 text-[12px] text-muted-foreground leading-[1.55]">
							{VERDICT_GUIDE}
						</p>
						{/* 좁은 도크라 세로로 쌓고, 마지막 줄에 승인을 놓아
						    "확인하고 → 내보낸다" 순서가 그대로 읽히게 한다. */}
						<div className="flex flex-col gap-2.5">
							<VerdictActions
								onApprove={approve}
								onHold={() => setVerdict("hold")}
								onReject={() => setVerdict("reject")}
							/>
						</div>
					</aside>
				</div>
			</div>
			<div className="grid grid-cols-2 gap-2.5 border-border border-t px-6 pt-3 pb-1.5 lg:hidden">
				<VerdictActions
					onApprove={approve}
					onHold={() => setVerdict("hold")}
					onReject={() => setVerdict("reject")}
				/>
			</div>
			{verdict ? (
				<VerdictReasonSheet
					onCancel={() => setVerdict(null)}
					onConfirm={(reason) => onResolve(item.id, verdict, reason)}
					verdict={verdict}
				/>
			) : null}
		</div>
	);
}

// 판정별 시트 문구·선택지. 보류는 일괄 처리(on_hold 전환)와 같은 조치라 사유 목록도
// "지금 결론을 못 내는 이유"로 맞춘다. 선택지는 프리셋일 뿐이고, 운영자는 목록 일괄
// 처리(ReasonConfirmSheet)와 동일하게 사유를 직접 고쳐 쓸 수 있다.
const VERDICT_SHEETS: Record<
	QueueVerdict,
	{
		confirmLabel: string;
		danger: boolean;
		description: string;
		reasons: string[];
		title: string;
	}
> = {
	approve: {
		confirmLabel: "승인하기",
		danger: false,
		// 유료 상품 공고는 승인만으로 게시되지 않는다(입금 확인이 남는다) — 승인 = 게시로
		// 읽히지 않게 두 경우를 다 적는다.
		description:
			"승인하면 무료 공고는 바로 게시되고, 유료 상품 공고는 입금 확인 후 게시돼요. 사유는 처리 기록에 남아요.",
		reasons: [
			"운영 검수 기준 충족",
			"감지 표현이 오해 소지 수준",
			"업소 정보 확인 완료",
			"보완 요청 반영 확인",
			"기타 승인 사유",
		],
		title: "승인 사유 작성",
	},
	hold: {
		confirmLabel: "보류하기",
		danger: false,
		description:
			"보류하면 공고가 검수 보류 상태로 내려가고, 사유가 기록돼요. 공고 관리의 '검수 보류' 탭에서 다시 처리할 수 있어요.",
		reasons: [
			"업소 정보 추가 확인 필요",
			"사업자 인증 확인 필요",
			"공고 내용 보완 요청 예정",
			"내부 논의 필요",
			"기타 확인 필요",
		],
		title: "보류 사유 작성",
	},
	reject: {
		confirmLabel: "반려하기",
		danger: true,
		description: "작성한 사유는 처리 기록에 그대로 남아요.",
		reasons: [
			"성적 서비스 암시 표현",
			"강요·착취 의심 조건",
			"외부 연락 유도",
			"허위·과장 정보",
			"기타 정책 위반",
		],
		title: "반려 사유 작성",
	},
};

// 사유 최소 길이. 목록 일괄 처리(ReasonConfirmSheet)·서버 입력 스키마와 같은 2자.
const VERDICT_REASON_MIN_LENGTH = 2;

function VerdictReasonSheet({
	onCancel,
	onConfirm,
	verdict,
}: {
	onCancel: () => void;
	onConfirm: (reason: string) => void;
	verdict: QueueVerdict;
}) {
	const config = VERDICT_SHEETS[verdict];
	const reasons = config.reasons;
	// 선택지는 입력칸을 채우는 프리셋이다 — 고른 뒤 그대로 보내도 되고, 고쳐 써도 된다.
	const [reason, setReason] = useState(reasons[0] ?? "");
	const reasonFieldId = `queue-verdict-reason-${verdict}`;
	const canConfirm = reason.trim().length >= VERDICT_REASON_MIN_LENGTH;
	return (
		// 모바일은 바닥에서 올라오는 시트, 데스크톱은 화면 가운데 카드다.
		// absolute는 상세 영역만 덮어서, 데스크톱에서는 헤더·푸터만 멀쩡히 밝은 채로 남아
		// 모달이 페이지 일부에 낀 것처럼 보인다 — lg부터 fixed로 뷰포트 전체를 덮고
		// 스티키 헤더(z-30) 위로 올린다. 올라오는 애니메이션은 바닥 시트일 때만 뜻이 있다.
		<div className="absolute inset-0 z-20 flex flex-col justify-end lg:fixed lg:z-40 lg:items-center lg:justify-center">
			<button
				aria-label="닫기"
				className="absolute inset-0 cursor-pointer border-none bg-[color:var(--overlay-scrim)]"
				onClick={onCancel}
				type="button"
			/>
			{/* 선택지 5개 + 사유 입력칸이라 작은 화면에서는 시트가 뷰포트를 넘는다.
			    안에서 스크롤시켜 확정 버튼이 화면 밖으로 밀리지 않게 한다. */}
			<div className="relative max-h-[90vh] animate-[bambiSheetUp_var(--dur-base)_var(--ease-out)] overflow-y-auto rounded-t-[24px] bg-background px-6 pt-5 pb-6 shadow-[0_-8px_40px_rgba(0,0,0,0.18)] lg:w-full lg:max-w-md lg:animate-none lg:rounded-3xl lg:pt-6 lg:shadow-[var(--shadow-card)]">
				<h2 className="mt-0 mr-0 mb-1 ml-0 font-extrabold text-[19px] text-foreground">
					{config.title}
				</h2>
				<p className="mt-0 mr-0 mb-[14px] ml-0 text-[13px] text-muted-foreground">
					{config.description}
				</p>
				<div className="mb-3 flex flex-col gap-2">
					{reasons.map((r) => {
						const on = reason === r;
						return (
							<button
								className={cn(
									"flex cursor-pointer items-center gap-2.5 rounded-xl px-[14px] py-3 text-left",
									on
										? "border border-primary bg-coral-50"
										: "border border-[color:var(--border-default)] bg-card"
								)}
								key={r}
								onClick={() => setReason(r)}
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
				<label
					className="mb-2 block font-bold text-[13px] text-foreground"
					htmlFor={reasonFieldId}
				>
					처리 사유
				</label>
				<textarea
					className="min-h-[92px] w-full resize-none rounded-[14px] border border-border bg-card px-3 py-2.5 text-[14px] text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
					id={reasonFieldId}
					onChange={(event) => setReason(event.target.value)}
					placeholder="위 선택지를 고르거나 직접 작성해 주세요(2자 이상)."
					value={reason}
				/>
				<div className="mt-4 grid grid-cols-2 gap-2.5">
					<Button block onClick={onCancel} size="lg" variant="secondary">
						취소
					</Button>
					<Button
						block
						disabled={!canConfirm}
						onClick={() => onConfirm(reason.trim())}
						size="lg"
						variant={config.danger ? "danger" : "primary"}
					>
						{config.confirmLabel}
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
				<QueueCheckbox
					checked={selected}
					label={`${r.reason} 신고 선택`}
					onToggle={onToggle}
				/>
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

// 데스크톱 신고 표 — 콘솔 표준 DataTable. 정렬용 심각도 랭크(심각 → 참고).
const SEV_RANK: Record<ReportSeverity, number> = { high: 0, mid: 1, low: 2 };

// 이름 + 역할 2줄 셀(피신고 대상·신고자 공용).
function PartyCell({ name, role }: { name: string; role: string }) {
	return (
		<div className="flex flex-col">
			<span className="text-foreground">{name}</span>
			<span className="text-muted-foreground text-xs">{role}</span>
		</div>
	);
}

function getReportColumns({
	onOpen,
	onToggle,
	selected,
}: {
	onOpen: (r: Report) => void;
	onToggle?: (id: string) => void;
	selected: string[];
}): DataColumn<Report>[] {
	return [
		// 선택 기능이 없으면(일괄 처리 바 미사용) 컬럼 자체를 뺀다.
		...(onToggle
			? [
					{
						id: "select",
						header: <span className="sr-only">선택</span>,
						headerClassName: "w-10",
						cell: (r: Report) => (
							<Checkbox
								aria-label={`${r.reason} 신고 선택`}
								checked={selected.includes(r.id)}
								onCheckedChange={() => onToggle(r.id)}
								// 행 클릭(상세 이동)과 겹치지 않게 체크박스 클릭은 여기서 멈춘다.
								onClick={(event) => event.stopPropagation()}
							/>
						),
					},
				]
			: []),
		{
			id: "sev",
			header: "심각도",
			sortValue: (r) => SEV_RANK[r.sev],
			cell: (r) => <SevPill sev={r.sev} />,
		},
		{
			id: "reason",
			header: "사유",
			sortValue: (r) => r.reason,
			cell: (r) => (
				<span
					className={cn(
						"font-medium",
						// 처리 완료 행은 카드 목록처럼 한 톤 죽인다.
						r.status === "open" ? "text-foreground" : "text-muted-foreground"
					)}
				>
					{r.reason}
				</span>
			),
		},
		{
			id: "target",
			header: "피신고 대상",
			sortValue: (r) => r.target,
			cell: (r) => <PartyCell name={r.target} role={r.targetRole} />,
		},
		{
			id: "reporter",
			header: "신고자",
			sortValue: (r) => r.reporter,
			cell: (r) => <PartyCell name={r.reporter} role={r.reporterRole} />,
		},
		{
			id: "note",
			header: "신고 내용",
			cell: (r) => (
				<span className="block max-w-xs truncate text-muted-foreground">
					{r.note}
				</span>
			),
		},
		{
			id: "time",
			header: "접수",
			sortValue: (r) => r.time,
			cell: (r) => (
				<span className="whitespace-nowrap text-muted-foreground">
					{r.time}
				</span>
			),
		},
		{
			id: "status",
			header: "상태",
			sortValue: (r) => (r.status === "open" ? 0 : 1),
			cell: (r) =>
				r.status === "open" ? (
					<StatusBadge tone="warning">대기</StatusBadge>
				) : (
					<StatusBadge>완료</StatusBadge>
				),
		},
		{
			id: "open",
			header: <span className="sr-only">상세</span>,
			headerClassName: "w-10",
			cellClassName: "text-right",
			// 행 클릭의 키보드 대체 경로.
			cell: (r) => (
				<UiButton
					aria-label="신고 상세 열기"
					// 행 클릭과 중복 호출되지 않게 여기서 멈춘다.
					onClick={(event) => {
						event.stopPropagation();
						onOpen(r);
					}}
					size="icon-sm"
					type="button"
					variant="ghost"
				>
					<ChevronRight />
				</UiButton>
			),
		},
	];
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
			{/* 데스크톱: 콘솔 표준 표(미처리 → 처리 완료 순). */}
			<div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-6 pt-1 pb-5 max-md:hidden">
				<DataTable
					columns={getReportColumns({ onOpen, onToggle, selected })}
					data={[...open, ...closed]}
					emptyMessage="신고 내역이 없어요"
					getRowKey={(r) => r.id}
					onRowClick={onOpen}
					pageSize={10}
				/>
			</div>
			{/* 모바일: 기존 카드 목록. */}
			<div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-6 pt-1 pb-5 md:hidden">
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

// 당사자 카드 2개. 모바일은 가로 나란히, 데스크톱 사이드 패널에서는 세로로 쌓는다.
// 피신고 대상이 사용자 계정이면 카드를 그대로 계정 상세 링크로 감싼다(제재 이력·누적
// 신고를 바로 확인할 수 있게).
function ReportParties({ item }: { item: Report }) {
	const targetBox = (
		<PartyBox flagged name={item.target} role={`피신고 · ${item.targetRole}`} />
	);
	const targetUserId =
		item.targetType === "user" && item.targetId ? item.targetId : null;

	return (
		<div className="flex gap-2.5 md:flex-col">
			{targetUserId ? (
				<Link
					className="flex min-w-0 flex-1"
					href={`/moderator/users/${targetUserId}` as Route}
				>
					{targetBox}
				</Link>
			) : (
				targetBox
			)}
			<PartyBox name={item.reporter} role={`신고자 · ${item.reporterRole}`} />
		</div>
	);
}

// 처리 완료 안내. 모바일은 본문 끝, 데스크톱은 오른쪽 패널에 둔다(위치만 다르고 내용 동일).
function ReportResolvedNotice({ className }: { className?: string }) {
	return (
		<div
			className={cn(
				"flex items-center gap-2 rounded-[14px] bg-[color:var(--status-success-bg)] p-[14px] text-[color:var(--status-success-fg)]",
				className
			)}
		>
			<span className="inline-flex size-[18px]">
				<CheckIcon />
			</span>
			<span className="font-bold text-[13px]">이미 처리된 신고예요</span>
		</div>
	);
}

// 구조화된 대상 맥락이 없는 신고(채팅 메시지·프리뷰 목업)의 스레드 폴백.
function ReportThread({ item }: { item: Report }) {
	return (
		<div>
			<div className="mb-2 font-bold text-[13px] text-foreground">
				신고된 대화
			</div>
			<div className="flex flex-col gap-2 rounded-[14px] border border-border bg-secondary p-[14px]">
				{item.thread.map((m) => (
					<div
						className={cn("max-w-[85%]", m.mine ? "self-end" : "self-start")}
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
	);
}

// 기각·제재 액션. 모바일 하단 고정 바와 데스크톱 오른쪽 패널이 같은 컴포넌트를 쓴다.
function ReportActions({
	item,
	onResolve,
	onSanctionRequest,
	sanctionUserId,
}: {
	item: Report;
	onResolve: (id: string, action: "dismiss" | "act") => void;
	onSanctionRequest: () => void;
	sanctionUserId: string | null;
}) {
	return (
		<div>
			{sanctionUserId ? null : (
				<p className="m-0 mb-2.5 text-[12px] text-muted-foreground leading-[1.5]">
					이 신고는 사용자 계정이 대상이 아니에요. 사용자 제재가 필요하면 사용자
					관리에서 진행해 주세요.
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
					<Button block onClick={onSanctionRequest} size="lg" variant="danger">
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
	const isOpen = item.status === "open";
	const actions = (
		<ReportActions
			item={item}
			onResolve={onResolve}
			onSanctionRequest={() => setAct(true)}
			sanctionUserId={sanctionUserId}
		/>
	);
	return (
		<div className="relative flex min-h-0 flex-1 flex-col">
			<AppBar onBack={onBack} title="신고 검토" />
			{/* 모바일: 세로 한 줄. 데스크톱: 왼쪽 대상 맥락 + 오른쪽 고정폭 요약·조치 패널. */}
			<div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-6 pt-1 pb-5 md:grid md:grid-cols-[minmax(0,1fr)_20rem] md:items-start md:gap-6">
				<aside className="flex flex-col gap-4 md:sticky md:top-2 md:order-2">
					<div className="flex items-center gap-2">
						<SevPill sev={item.sev} />
						<h2 className="m-0 min-w-0 flex-1 font-extrabold text-[19px] text-foreground">
							{item.reason}
						</h2>
					</div>
					<ReportParties item={item} />
					{/* 데스크톱 전용: 처리 상태·조치는 오른쪽 패널에서 끝낸다. */}
					<div className="flex flex-col gap-4 max-md:hidden">
						{isOpen ? actions : <ReportResolvedNotice />}
					</div>
				</aside>
				<div className="min-w-0 md:order-1">
					{item.communityKind || hasStructuredContext ? (
						<ReportTargetContextView
							isBlockingChatRoom={isBlockingChatRoom}
							item={item}
							onBlockChatRoom={onBlockChatRoom}
							onModerateCommunity={onModerateCommunity}
						/>
					) : (
						<ReportThread item={item} />
					)}
				</div>
				{isOpen ? null : <ReportResolvedNotice className="md:hidden" />}
			</div>
			{/* 모바일 전용: 기존 하단 고정 액션 바. */}
			{isOpen ? (
				<div className="border-border border-t px-6 pt-3 pb-1.5 md:hidden">
					{actions}
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
				<QueueCheckbox
					checked={selected}
					label={`${u.name} 선택`}
					onToggle={onToggle}
				/>
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
		// 자동 해제 기간이 없다 — 운영자가 "정상으로 복구"를 누를 때까지 유지된다.
		desc: "정상으로 복구할 때까지 공고·채팅을 막아요",
		status: "suspended",
		title: "이용 정지",
		tone: "danger",
	},
];

// 사유 작성 시트(공용). 일괄 처리·사용자 상세 제재·신고 상세 제재가 모두 이 컴포넌트를
// 재사용한다. 제목/설명/사유 라벨/기본 문구/확정 버튼 문구를 주입받고, 사유 textarea는
// defaultReason으로 프리필한 뒤 최소 길이(minLength, 기본 2자)를 만족해야 확정된다.
// positioning="fixed"는 document.body로 포털된 일괄 시트(전체 화면 중앙 정렬)용,
// "absolute"는 콘솔 컨테이너 내부(사용자 상세·신고 상세)에서 부모 relative 박스를 덮는 시트용.
export function ReasonConfirmSheet({
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
		// 모바일은 바닥에서 올라오는 시트, 데스크톱(lg~)은 화면 가운데 카드다 —
		// 넓은 화면에서 폭 좁은 바텀시트를 그대로 쓰면 사유 입력칸이 모바일 폭에 갇힌다.
		<div
			className={cn(
				"inset-0 flex flex-col justify-end lg:items-center lg:justify-center",
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
					"relative animate-[bambiSheetUp_var(--dur-base)_var(--ease-out)] rounded-t-3xl bg-background px-6 pt-5 pb-6 shadow-[0_-8px_40px_rgba(0,0,0,0.18)]",
					"lg:w-full lg:max-w-lg lg:animate-none lg:rounded-3xl lg:px-7 lg:pt-6 lg:shadow-[var(--shadow-card)]",
					fixed && "mx-auto w-full max-w-lg"
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

// 계정 상세의 제재 이력(감사 로그 최신 50건). 액션 코드는 라벨 맵으로만 노출한다.
function UserModerationHistory({ userId }: { userId: string }) {
	const historyQuery = useQuery(
		orpc.bambi.moderation.listUserModerationActions.queryOptions({
			input: { targetUserId: userId },
		})
	);
	const actions = historyQuery.data ?? [];

	return (
		<div>
			<div className="mb-2.5 font-bold text-[13px] text-foreground">
				제재 이력
			</div>
			{historyQuery.isPending ? (
				<div className="flex flex-col gap-2">
					<Skeleton className="h-16 w-full" />
					<Skeleton className="h-16 w-full" />
				</div>
			) : null}
			{historyQuery.isError ? (
				<p className="m-0 text-[12.5px] text-muted-foreground">
					제재 이력을 불러오지 못했어요.
				</p>
			) : null}
			{historyQuery.isSuccess && actions.length === 0 ? (
				<p className="m-0 text-[12.5px] text-muted-foreground">
					제재 이력이 없어요
				</p>
			) : null}
			{actions.length > 0 ? (
				<ul className="m-0 flex list-none flex-col gap-2 p-0">
					{actions.map((action) => (
						<li
							className="rounded-[14px] border border-border bg-card p-3"
							key={action.id}
						>
							<div className="flex items-center justify-between gap-2">
								<span className="font-bold text-[13px] text-foreground">
									{moderationActionLabel(action.action)}
								</span>
								<span className="whitespace-nowrap text-[11px] text-muted-foreground">
									{formatDateTime(action.createdAt)}
								</span>
							</div>
							<p className="mt-1 mb-0 text-[12.5px] text-[color:var(--text-default)] leading-[1.5]">
								{action.reason}
							</p>
							<div className="mt-1 text-[11px] text-muted-foreground">
								처리자 {action.adminName}
							</div>
						</li>
					))}
				</ul>
			) : null}
		</div>
	);
}

// 무료 법률 자문 답변 계정 지정·해제. 구직자 ↔ 법률자문만 오갈 수 있고(서버 규칙),
// 액션 UI는 사용자 목록(/moderator/users)이 이 헬퍼로 대상 여부를 판정해 띄운다.
const LEGAL_ADVISOR_ROLE = "legal_advisor";

export interface LegalAdvisorChoice {
	confirmLabel: string;
	defaultReason: string;
	desc: string;
	role: "job_seeker" | "legal_advisor";
	title: string;
}

export const legalAdvisorChoice = (
	roleKey: string
): LegalAdvisorChoice | null => {
	if (roleKey === LEGAL_ADVISOR_ROLE) {
		return {
			confirmLabel: "법률자문 해제",
			defaultReason: "법률 자문 활동이 끝나 지정을 해제했어요",
			desc: "무료 법률 자문 글 열람·답변 권한을 거둬요",
			role: "job_seeker",
			title: "법률자문 해제",
		};
	}
	if (roleKey === "job_seeker") {
		return {
			confirmLabel: "법률자문 지정",
			defaultReason: "무료 법률 자문 답변을 맡기려고 지정했어요",
			desc: "무료 법률 자문의 비밀글을 열람하고 답변할 수 있게 해요",
			role: LEGAL_ADVISOR_ROLE,
			title: "법률자문 지정",
		};
	}
	return null;
};

// 탈퇴 계정 안내·복구 블록. 표시명은 탈퇴해도 원본이 그대로라(익명화는 사용자 화면의
// 표시 계층이 담당) 운영자는 여기서 원래 이름과 탈퇴 상태를 함께 본다.
// 파기 배치가 지나간 계정은 되살릴 수단이 없어 버튼 대신 사유만 남긴다.
function UserWithdrawalPanel({
	item,
	onRestore,
}: {
	item: ManagedUser;
	onRestore: (id: string, reason: string) => void;
}) {
	const [isConfirming, setIsConfirming] = useState(false);
	const decision = resolveAccountRestoreDecision(item);

	return (
		<div>
			<div className="mb-2.5 font-bold text-[13px] text-foreground">
				탈퇴 계정
			</div>
			<p className="mt-0 mb-2.5 text-[12.5px] text-muted-foreground leading-[1.5]">
				{decision.canRestore
					? "실수로 탈퇴했거나 운영자 판단으로 되살려야 하는 계정이면 복구할 수 있어요. 복구하면 본인이 기존 아이디로 다시 로그인할 수 있어요. 팀 소속과 내려간 공고는 함께 돌아오지 않아요."
					: decision.message}
			</p>
			<Button
				block
				disabled={!decision.canRestore}
				leftIcon={<CheckIcon />}
				onClick={() => setIsConfirming(true)}
				size="lg"
				variant="secondary"
			>
				탈퇴 복구
			</Button>
			{isConfirming ? (
				<ReasonConfirmSheet
					confirmLabel="탈퇴 복구"
					defaultReason="본인 요청으로 탈퇴를 되돌렸어요"
					description={`${item.name} 님의 계정을 다시 이용 가능한 상태로 되돌려요`}
					onCancel={() => setIsConfirming(false)}
					onConfirm={(reason) => {
						onRestore(item.id, reason);
						setIsConfirming(false);
					}}
					positioning="absolute"
					reasonFieldId={`user-restore-reason-${item.id}`}
					reasonLabel="복구 사유"
					title="탈퇴 복구"
				/>
			) : null}
		</div>
	);
}

export function UserDetail({
	item,
	onBack,
	onRestore,
	onSanction,
}: {
	item: ManagedUser;
	onBack: () => void;
	onRestore: (id: string, reason: string) => void;
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
					<div className="flex items-center gap-2">
						<Badge dot tone={c.tone}>
							{c.label}
						</Badge>
						{item.deletedAt ? <Badge tone="neutral">탈퇴</Badge> : null}
					</div>
				</div>
				<div className="flex flex-col gap-2">
					<div className="grid grid-cols-2 gap-2.5">
						<MetaBox label="누적 신고" value={`${item.reports}건`} />
						<MetaBox label="경고 횟수" value={`${item.warnings}회`} />
						<MetaBox label="차단당한 횟수" value={`${item.blockedByCount}회`} />
					</div>
					<Link
						className="self-start text-[12.5px] text-primary underline-offset-4 hover:underline"
						href={`/moderator/reports?user=${item.id}` as Route}
					>
						신고 내역 보기
					</Link>
				</div>
				<ContextSection title="계정 정보">
					<ContextField label="이메일" value={item.email} />
					<ContextField
						label="로그인 아이디"
						value={item.loginId ?? "미설정"}
					/>
					{item.organizationNames.length > 0 ? (
						<ContextField
							label="소속 업소"
							value={item.organizationNames.join(", ")}
						/>
					) : null}
					{item.deletedAt ? (
						<ContextField
							label="탈퇴 시각"
							value={formatDateTime(item.deletedAt)}
						/>
					) : null}
				</ContextSection>
				<div className="flex gap-2 rounded-[14px] bg-secondary p-[14px]">
					<span className="mt-px inline-flex size-4 flex-[0_0_16px] text-muted-foreground">
						<AlertCircle />
					</span>
					<span className="text-[12.5px] text-[color:var(--text-default)] leading-[1.5]">
						{item.note}
					</span>
				</div>
				{item.deletedAt ? (
					<UserWithdrawalPanel item={item} onRestore={onRestore} />
				) : null}
				{item.status === "active" ? null : (
					<div>
						<div className="mb-2.5 font-bold text-[13px] text-foreground">
							계정 상태 복구
						</div>
						<p className="mt-0 mb-2.5 text-[12.5px] text-muted-foreground leading-[1.5]">
							현재 {c.label} 상태예요. 제재 사유가 해소됐다면 계정을 정상 이용
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
				)}
				<UserModerationHistory userId={item.id} />
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
			<SheetContent className="pb-28">
				<SheetTitle>더보기</SheetTitle>
				<div className="mt-5 flex flex-col gap-6">
					{MODERATOR_MORE_GROUPS.map((group) => (
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

// 일괄 처리 버튼의 시각 위계. 되돌리기 어려운 조치(반려·정지)는 destructive,
// 마무리 조치(승인·해결)만 기본(코럴) 버튼, 나머지는 한 톤 낮춘 secondary다.
const BULK_TONE_VARIANT = {
	danger: "destructive",
	success: "default",
} as const;

// 액션 바 헤드라인에 쓰는 선택 대상 이름 — "3개"만 있으면 무엇을 고른 건지 모른다.
const BULK_SCOPE_LABEL: Record<ModerationBulkScope, string> = {
	queue: "검수 공고",
	reports: "신고",
	users: "사용자",
};

export function QueueActionBar({
	count,
	isApplying = false,
	onAction,
	onClearSelection,
	scope = "queue",
}: {
	count: number;
	isApplying?: boolean;
	onAction: (
		scope: ModerationBulkScope,
		action: ModerationBulkAction,
		reason: string
	) => void;
	onClearSelection?: () => void;
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
			{/* 모바일은 좁아서 개수 줄과 버튼 줄을 나누고, 데스크톱부터 한 줄로 붙인다. */}
			<div className="flex flex-col gap-2 rounded-2xl border border-border bg-background px-3 py-2.5 shadow-[var(--shadow-card)] sm:flex-row sm:items-center">
				<div className="flex min-w-0 items-center gap-2">
					<span className="inline-flex shrink-0 items-center rounded-full bg-primary px-2.5 py-1 font-extrabold text-[12px] text-primary-foreground tabular-nums">
						{count}
					</span>
					<span className="truncate font-bold text-[13px] text-foreground">
						{BULK_SCOPE_LABEL[scope]} {count}건 선택됨
					</span>
					{onClearSelection ? (
						<UiButton
							className="ml-auto shrink-0 sm:ml-0"
							onClick={onClearSelection}
							size="sm"
							type="button"
							variant="ghost"
						>
							선택 해제
						</UiButton>
					) : null}
				</div>
				<div className="flex min-w-0 gap-1.5 overflow-x-auto sm:ml-auto">
					{actions.map((action) => (
						<UiButton
							className="shrink-0"
							disabled={isApplying}
							key={`${action.scope}-${action.action}`}
							onClick={() => setPendingAction(action)}
							size="sm"
							type="button"
							variant={
								action.tone ? BULK_TONE_VARIANT[action.tone] : "secondary"
							}
						>
							{action.label}
						</UiButton>
					))}
				</div>
			</div>
			{pendingAction
				? createPortal(
						<ReasonConfirmSheet
							confirmLabel={`${pendingAction.label} 적용`}
							danger={pendingAction.tone === "danger"}
							defaultReason={pendingAction.defaultReason}
							description={`${BULK_SCOPE_LABEL[scope]} ${count}건에 적용해요.`}
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
	// 프리뷰(프로토타입) 콘솔. 샘플 데이터 제거 후 빈 상태로 시작한다 — 실서비스 콘솔은
	// /moderator 라우트(ModProvider/useMod)가 API 데이터로 렌더한다.
	const [queue, setQueue] = useState<QueueItem[]>([]);
	const [reports, setReports] = useState<Report[]>([]);
	const [users, setUsers] = useState<ManagedUser[]>([]);
	const [selected, setSelected] = useState<string[]>([]);
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

	const resolveQueue = (id: string, action: QueueVerdict) => {
		setQueue((q) => q.filter((x) => x.id !== id));
		setSelected((s) => s.filter((x) => x !== id));
		setDetail(null);
		flash(QUEUE_VERDICT_TOAST[action]);
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
	// 프리뷰(목업) 콘솔은 API를 부르지 않고 로컬 상태에서 탈퇴 마커만 지운다.
	const restoreAccount = (id: string) => {
		setUsers((u) =>
			u.map((x) => (x.id === id ? { ...x, deletedAt: null } : x))
		);
		setDetail(null);
		flash("탈퇴를 복구했어요");
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
				onRestore={restoreAccount}
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
				<QueueActionBar
					count={selected.length}
					onAction={bulkAction}
					onClearSelection={() => setSelected([])}
				/>
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
