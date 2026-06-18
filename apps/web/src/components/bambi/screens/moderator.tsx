"use client";

// 밤비 — 운영자(Moderator) 콘솔: 검수 큐, 신고 인박스, 사용자 제재.

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

const HI: Record<string, string> = {
	block: "rgba(255,90,95,0.22)",
	review: "rgba(245,158,11,0.24)",
	low: "rgba(31,181,115,0.20)",
};
const UL: Record<string, string> = {
	block: "var(--red-500)",
	review: "var(--amber-500)",
	low: "var(--green-500)",
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
		<p
			style={{
				margin: 0,
				fontFamily: "var(--font-sans)",
				fontSize: 14.5,
				lineHeight: 1.65,
				color: "var(--text-default)",
			}}
		>
			{segs.map((s) =>
				s.hi ? (
					<mark
						key={s.start}
						style={{
							background: HI[key],
							color: "var(--text-strong)",
							borderRadius: 4,
							padding: "1px 1px",
							boxShadow: `inset 0 -2px 0 ${UL[key]}`,
							fontWeight: 700,
						}}
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
const RISK_BADGE: Record<RiskLevel, { bg: string; fg: string; label: string }> =
	{
		high: {
			bg: "var(--status-danger-bg)",
			fg: "var(--status-danger-fg)",
			label: "높음",
		},
		mid: {
			bg: "var(--status-pending-bg)",
			fg: "var(--status-pending-fg)",
			label: "중간",
		},
		low: {
			bg: "var(--status-success-bg)",
			fg: "var(--status-success-fg)",
			label: "낮음",
		},
	};

function RiskBadge({ level }: { level: RiskLevel }) {
	const c = RISK_BADGE[level];
	return (
		<span
			style={{
				fontFamily: "var(--font-sans)",
				fontSize: 11,
				fontWeight: 800,
				padding: "3px 9px",
				borderRadius: 999,
				background: c.bg,
				color: c.fg,
				whiteSpace: "nowrap",
			}}
		>
			위험: {c.label}
		</span>
	);
}

function SevPill({ sev }: { sev: ReportSeverity }) {
	const map: Record<ReportSeverity, { bg: string; fg: string; t: string }> = {
		high: {
			bg: "var(--status-danger-bg)",
			fg: "var(--status-danger-fg)",
			t: "심각",
		},
		mid: {
			bg: "var(--status-pending-bg)",
			fg: "var(--status-pending-fg)",
			t: "주의",
		},
		low: { bg: "var(--surface-sunken)", fg: "var(--text-muted)", t: "참고" },
	};
	const m = map[sev] || map.low;
	return (
		<span
			style={{
				fontFamily: "var(--font-sans)",
				fontSize: 11,
				fontWeight: 800,
				padding: "3px 9px",
				borderRadius: 999,
				background: m.bg,
				color: m.fg,
			}}
		>
			{m.t}
		</span>
	);
}

function MetaBox({ label, value }: { label: string; value: string }) {
	return (
		<div
			style={{
				padding: "12px 14px",
				borderRadius: 12,
				background: "var(--surface-subtle)",
			}}
		>
			<div
				style={{
					fontFamily: "var(--font-sans)",
					fontSize: 11,
					color: "var(--text-muted)",
				}}
			>
				{label}
			</div>
			<div
				style={{
					fontFamily: "var(--font-sans)",
					fontSize: 15,
					fontWeight: 800,
					color: "var(--text-strong)",
					marginTop: 3,
				}}
			>
				{value}
			</div>
		</div>
	);
}

function EmptyState({ icon, text }: { icon: ReactNode; text: string }) {
	return (
		<div style={{ margin: "auto", textAlign: "center", padding: 40 }}>
			<div
				style={{
					width: 56,
					height: 56,
					margin: "0 auto 12px",
					borderRadius: 18,
					background: "var(--status-success-bg)",
					display: "flex",
					alignItems: "center",
					justifyContent: "center",
					color: "var(--status-success-fg)",
				}}
			>
				<span style={{ width: 26, height: 26, display: "inline-flex" }}>
					{icon}
				</span>
			</div>
			<div
				style={{
					fontFamily: "var(--font-sans)",
					fontSize: 14,
					fontWeight: 700,
					color: "var(--text-default)",
				}}
			>
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
		<div
			style={{
				display: "flex",
				gap: 6,
				padding: 4,
				background: "var(--surface-sunken)",
				borderRadius: "var(--radius-md)",
			}}
		>
			{items.map((it) => {
				const on = tab === it.v;
				return (
					<button
						key={it.v}
						onClick={() => onTab(it.v)}
						style={{
							flex: 1,
							height: 40,
							border: "none",
							cursor: "pointer",
							borderRadius: "var(--radius-sm)",
							background: on ? "var(--ink-800)" : "transparent",
							color: on ? "#fff" : "var(--text-muted)",
							fontFamily: "var(--font-sans)",
							fontSize: 14,
							fontWeight: on ? 800 : 600,
							boxShadow: on ? "var(--shadow-sm)" : "none",
							transition: "all var(--dur-fast) var(--ease-out)",
						}}
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
		<div
			style={{
				display: "flex",
				flexDirection: "column",
				gap: 14,
				padding: "6px 20px 12px",
			}}
		>
			<div
				style={{
					display: "flex",
					alignItems: "center",
					justifyContent: "space-between",
				}}
			>
				<Logo lang="ko" size="md" />
				<div style={{ display: "flex", alignItems: "center", gap: 8 }}>
					<span
						style={{
							display: "inline-flex",
							alignItems: "center",
							gap: 5,
							height: 30,
							padding: "0 11px",
							borderRadius: "var(--radius-pill)",
							background: "var(--surface-subtle)",
							color: "var(--text-default)",
							fontFamily: "var(--font-sans)",
							fontSize: 12,
							fontWeight: 700,
							whiteSpace: "nowrap",
						}}
					>
						<span
							style={{
								display: "inline-flex",
								width: 14,
								height: 14,
								color: "var(--ink-700)",
							}}
						>
							<ShieldIcon />
						</span>
						운영자 모드
					</span>
					<IconButton badge variant="subtle">
						<BellIcon />
					</IconButton>
				</div>
			</div>
			<h1
				style={{
					margin: 0,
					padding: "0 4px",
					fontFamily: "var(--font-display)",
					fontSize: 24,
					fontWeight: 800,
					color: "var(--text-strong)",
				}}
			>
				운영자 콘솔
			</h1>
			<div style={{ padding: "0 4px" }}>
				<ConsoleTabs onTab={onTab} tab={tab} />
			</div>
			<div style={{ padding: "0 4px" }}>
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
		<div style={{ display: "flex", gap: 8 }}>
			<div
				style={{
					flex: 1,
					display: "flex",
					alignItems: "center",
					justifyContent: "space-between",
					height: 40,
					padding: "0 14px",
					borderRadius: 12,
					border: "1px solid var(--border-default)",
					background: "var(--surface-card)",
					color: "var(--text-default)",
					fontFamily: "var(--font-sans)",
					fontSize: 13,
					fontWeight: 600,
				}}
			>
				전체 상태
				<span
					style={{
						display: "inline-flex",
						width: 16,
						height: 16,
						color: "var(--text-muted)",
					}}
				>
					<ChevronDownIcon />
				</span>
			</div>
			<div
				style={{
					display: "flex",
					alignItems: "center",
					gap: 6,
					height: 40,
					padding: "0 14px",
					borderRadius: 12,
					border: "1px solid var(--border-default)",
					background: "var(--surface-card)",
					color: "var(--text-default)",
					fontFamily: "var(--font-sans)",
					fontSize: 13,
					fontWeight: 600,
				}}
			>
				회신순
				<span
					style={{
						display: "inline-flex",
						width: 15,
						height: 15,
						color: "var(--text-muted)",
					}}
				>
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
			onClick={(e) => {
				e.stopPropagation();
				onToggle();
			}}
			style={{
				flex: "0 0 22px",
				width: 22,
				height: 22,
				marginTop: 1,
				borderRadius: 7,
				cursor: "pointer",
				display: "inline-flex",
				alignItems: "center",
				justifyContent: "center",
				background: checked ? "var(--color-primary)" : "transparent",
				border: checked
					? "1px solid transparent"
					: `1.5px solid ${dark ? "rgba(255,255,255,0.4)" : "var(--border-strong)"}`,
				color: "#fff",
			}}
			type="button"
		>
			{checked ? (
				<span style={{ display: "inline-flex", width: 13, height: 13 }}>
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
	const subFg = dark ? "var(--text-on-dark-muted)" : "var(--text-muted)";
	return (
		// biome-ignore lint/a11y/useSemanticElements: 행 내부에 체크박스 버튼이 중첩되어 네이티브 button 사용 불가. tabIndex/onKeyDown으로 키보드 접근성 보장.
		<div
			onClick={onOpen}
			onKeyDown={(e) => {
				if (e.key === "Enter" || e.key === " ") {
					e.preventDefault();
					onOpen();
				}
			}}
			role="button"
			style={{
				display: "flex",
				alignItems: "flex-start",
				gap: 12,
				padding: 14,
				borderRadius: 16,
				cursor: "pointer",
				background: dark ? "var(--ink-800)" : "var(--surface-card)",
				color: dark ? "#fff" : "var(--text-default)",
				border: dark
					? "1px solid transparent"
					: "1px solid var(--border-subtle)",
				boxShadow: dark ? "var(--shadow-md)" : "var(--shadow-card)",
			}}
			tabIndex={0}
		>
			<QueueCheckbox checked={selected} dark={dark} onToggle={onToggle} />
			<Avatar name={q.company} size="sm" square />
			<div
				style={{
					flex: 1,
					minWidth: 0,
					display: "flex",
					flexDirection: "column",
					gap: 5,
				}}
			>
				<div style={{ display: "flex", alignItems: "center", gap: 8 }}>
					<span
						style={{
							fontFamily: "var(--font-sans)",
							fontSize: 14.5,
							fontWeight: 700,
							color: dark ? "#fff" : "var(--text-strong)",
							whiteSpace: "nowrap",
						}}
					>
						{q.company}
					</span>
					<span
						style={{
							flex: 1,
							minWidth: 0,
							fontFamily: "var(--font-sans)",
							fontSize: 13,
							color: subFg,
							whiteSpace: "nowrap",
							overflow: "hidden",
							textOverflow: "ellipsis",
						}}
					>
						{q.role}
					</span>
					<RiskBadge level={q.riskLevel} />
				</div>
				<div
					style={{
						fontFamily: "var(--font-sans)",
						fontSize: 12.5,
						lineHeight: 1.45,
						color: subFg,
					}}
				>
					<span>감지 문구 </span>
					<span
						style={{
							fontWeight: 700,
							color: dark ? "#fff" : "var(--text-default)",
						}}
					>
						{q.detected.map((d) => `"${d}"`).join(", ")}
					</span>
				</div>
				<div
					style={{
						fontFamily: "var(--font-sans)",
						fontSize: 11.5,
						color: dark ? "rgba(255,255,255,0.55)" : "var(--text-subtle)",
					}}
				>
					접수 {q.receivedAt} · ID {q.refId}
				</div>
			</div>
			<span
				aria-hidden="true"
				style={{
					display: "inline-flex",
					width: 18,
					height: 18,
					marginTop: 1,
					color: dark ? "rgba(255,255,255,0.5)" : "var(--text-subtle)",
				}}
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
		<div
			style={{
				flex: 1,
				minHeight: 0,
				overflowY: "auto",
				padding: "0 24px 20px",
				display: "flex",
				flexDirection: "column",
				gap: 12,
			}}
		>
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
		<div
			style={{
				flex: 1,
				minHeight: 0,
				display: "flex",
				flexDirection: "column",
				position: "relative",
			}}
		>
			<AppBar onBack={onBack} title="공고 검수" />
			<div
				style={{
					flex: 1,
					minHeight: 0,
					overflowY: "auto",
					padding: "4px 24px 20px",
					display: "flex",
					flexDirection: "column",
					gap: 18,
				}}
			>
				<div style={{ display: "flex", alignItems: "center", gap: 12 }}>
					<Avatar name={item.company} size="lg" square />
					<div>
						<div
							style={{
								fontFamily: "var(--font-display)",
								fontSize: 19,
								fontWeight: 800,
								color: "var(--text-strong)",
							}}
						>
							{item.title}
						</div>
						<div
							style={{
								fontFamily: "var(--font-sans)",
								fontSize: 13,
								color: "var(--text-muted)",
								marginTop: 2,
							}}
						>
							{item.company} · {item.location} · ID {item.refId}
						</div>
					</div>
				</div>
				<div
					style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}
				>
					<MetaBox label="급여" value={item.pay} />
					<MetaBox label="접수" value={item.receivedAt} />
				</div>
				<div
					style={{
						display: "flex",
						flexDirection: "column",
						gap: 8,
						padding: 14,
						borderRadius: 14,
						background: "var(--status-pending-bg)",
					}}
				>
					<div style={{ display: "flex", alignItems: "center", gap: 8 }}>
						<span
							style={{
								width: 18,
								height: 18,
								display: "inline-flex",
								color: "var(--status-pending-fg)",
							}}
						>
							<AlertCircle />
						</span>
						<span
							style={{
								fontFamily: "var(--font-sans)",
								fontSize: 13.5,
								fontWeight: 800,
								color: "var(--status-pending-fg)",
							}}
						>
							자동 필터가 감지한 신호 {item.flags.length}건
						</span>
					</div>
					<div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
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
					<div
						style={{
							fontFamily: "var(--font-sans)",
							fontSize: 13,
							fontWeight: 700,
							color: "var(--text-strong)",
							marginBottom: 8,
						}}
					>
						공고 본문 · 감지 표현 강조
					</div>
					<div
						style={{
							padding: 16,
							borderRadius: 14,
							background: "var(--surface-subtle)",
							border: "1px solid var(--border-subtle)",
						}}
					>
						<HiText
							level={item.riskLevel}
							terms={item.detected}
							text={item.desc}
						/>
					</div>
				</div>
				<div
					style={{
						fontFamily: "var(--font-sans)",
						fontSize: 12,
						lineHeight: 1.55,
						color: "var(--text-muted)",
						padding: "0 2px",
					}}
				>
					판단 기준: 성적 서비스 암시·강요·외부 연락 유도는 반려, 단순 오해
					소지는 승인 후 안내해요.
				</div>
			</div>
			<div
				style={{
					padding: "12px 24px 6px",
					borderTop: "1px solid var(--border-subtle)",
					display: "flex",
					gap: 10,
				}}
			>
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
		<div
			style={{
				position: "absolute",
				inset: 0,
				zIndex: 20,
				display: "flex",
				flexDirection: "column",
				justifyContent: "flex-end",
			}}
		>
			<button
				aria-label="닫기"
				onClick={onCancel}
				style={{
					position: "absolute",
					inset: 0,
					border: "none",
					background: "var(--overlay-scrim)",
					cursor: "pointer",
				}}
				type="button"
			/>
			<div
				style={{
					position: "relative",
					background: "var(--surface-page)",
					borderRadius: "24px 24px 0 0",
					padding: "20px 24px 24px",
					boxShadow: "0 -8px 40px rgba(0,0,0,0.18)",
					animation: "bambiSheetUp var(--dur-base) var(--ease-out)",
				}}
			>
				<h2
					style={{
						margin: "0 0 4px",
						fontFamily: "var(--font-display)",
						fontSize: 19,
						fontWeight: 800,
						color: "var(--text-strong)",
					}}
				>
					반려 사유 선택
				</h2>
				<p
					style={{
						margin: "0 0 14px",
						fontFamily: "var(--font-sans)",
						fontSize: 13,
						color: "var(--text-muted)",
					}}
				>
					선택한 사유는 구인자에게 그대로 전달돼요.
				</p>
				<div
					style={{
						display: "flex",
						flexDirection: "column",
						gap: 8,
						marginBottom: 16,
					}}
				>
					{reasons.map((r) => {
						const on = sel === r;
						return (
							<button
								key={r}
								onClick={() => setSel(r)}
								style={{
									display: "flex",
									alignItems: "center",
									gap: 10,
									padding: "12px 14px",
									borderRadius: 12,
									cursor: "pointer",
									textAlign: "left",
									background: on
										? "var(--color-primary-soft)"
										: "var(--surface-card)",
									border: on
										? "1px solid var(--color-primary)"
										: "1px solid var(--border-default)",
								}}
								type="button"
							>
								<span
									style={{
										flex: 1,
										fontFamily: "var(--font-sans)",
										fontSize: 14,
										fontWeight: 600,
										color: "var(--text-strong)",
									}}
								>
									{r}
								</span>
								{on ? (
									<span
										style={{
											width: 18,
											height: 18,
											display: "inline-flex",
											color: "var(--color-primary)",
										}}
									>
										<CheckIcon />
									</span>
								) : null}
							</button>
						);
					})}
				</div>
				<div style={{ display: "flex", gap: 10 }}>
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
			onClick={() => onOpen(r)}
			style={{
				textAlign: "left",
				padding: 16,
				borderRadius: 16,
				cursor: "pointer",
				background: "var(--surface-card)",
				opacity: done ? 0.6 : 1,
				border:
					r.sev === "high" && !done
						? "1px solid var(--red-500)"
						: "1px solid var(--border-subtle)",
				boxShadow: "var(--shadow-card)",
				display: "flex",
				flexDirection: "column",
				gap: 10,
			}}
			type="button"
		>
			<div style={{ display: "flex", alignItems: "center", gap: 8 }}>
				<SevPill sev={r.sev} />
				<span
					style={{
						flex: 1,
						fontFamily: "var(--font-sans)",
						fontSize: 14.5,
						fontWeight: 800,
						color: "var(--text-strong)",
					}}
				>
					{r.reason}
				</span>
				{done ? (
					<Badge tone="neutral">완료</Badge>
				) : (
					<span
						style={{
							fontFamily: "var(--font-sans)",
							fontSize: 11,
							color: "var(--text-subtle)",
						}}
					>
						{r.time}
					</span>
				)}
			</div>
			<div
				style={{
					fontFamily: "var(--font-sans)",
					fontSize: 12.5,
					color: "var(--text-muted)",
				}}
			>
				<b style={{ color: "var(--text-default)" }}>{r.target}</b>(
				{r.targetRole}) · 신고 {r.reporter}({r.reporterRole})
			</div>
			<div
				style={{
					fontFamily: "var(--font-sans)",
					fontSize: 12.5,
					lineHeight: 1.45,
					color: "var(--text-default)",
					padding: "8px 10px",
					borderRadius: 10,
					background: "var(--surface-subtle)",
				}}
			>
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
		<div
			style={{
				flex: 1,
				minHeight: 0,
				display: "flex",
				flexDirection: "column",
			}}
		>
			<div
				style={{
					flex: 1,
					minHeight: 0,
					overflowY: "auto",
					padding: "4px 24px 20px",
					display: "flex",
					flexDirection: "column",
					gap: 12,
				}}
			>
				{open.map((r) => (
					<ReportRow key={r.id} onOpen={onOpen} r={r} />
				))}
				{closed.length ? (
					<div
						style={{
							fontFamily: "var(--font-sans)",
							fontSize: 12,
							fontWeight: 700,
							color: "var(--text-subtle)",
							margin: "6px 0 0",
						}}
					>
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
			style={{
				flex: 1,
				display: "flex",
				alignItems: "center",
				gap: 10,
				padding: 12,
				borderRadius: 14,
				background: "var(--surface-card)",
				border: flagged
					? "1px solid var(--red-300)"
					: "1px solid var(--border-subtle)",
			}}
		>
			<Avatar name={name} size="sm" square />
			<div style={{ minWidth: 0 }}>
				<div
					style={{
						fontFamily: "var(--font-sans)",
						fontSize: 13.5,
						fontWeight: 700,
						color: "var(--text-strong)",
						whiteSpace: "nowrap",
						overflow: "hidden",
						textOverflow: "ellipsis",
					}}
				>
					{name}
				</div>
				<div
					style={{
						fontFamily: "var(--font-sans)",
						fontSize: 11,
						color: "var(--text-muted)",
					}}
				>
					{role}
				</div>
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
		<div
			style={{
				flex: 1,
				minHeight: 0,
				display: "flex",
				flexDirection: "column",
				position: "relative",
			}}
		>
			<AppBar onBack={onBack} title="신고 검토" />
			<div
				style={{
					flex: 1,
					minHeight: 0,
					overflowY: "auto",
					padding: "4px 24px 20px",
					display: "flex",
					flexDirection: "column",
					gap: 16,
				}}
			>
				<div style={{ display: "flex", alignItems: "center", gap: 8 }}>
					<SevPill sev={item.sev} />
					<h2
						style={{
							margin: 0,
							fontFamily: "var(--font-display)",
							fontSize: 19,
							fontWeight: 800,
							color: "var(--text-strong)",
						}}
					>
						{item.reason}
					</h2>
				</div>
				<div style={{ display: "flex", gap: 10 }}>
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
					<div
						style={{
							fontFamily: "var(--font-sans)",
							fontSize: 13,
							fontWeight: 700,
							color: "var(--text-strong)",
							marginBottom: 8,
						}}
					>
						신고된 대화
					</div>
					<div
						style={{
							display: "flex",
							flexDirection: "column",
							gap: 8,
							padding: 14,
							borderRadius: 14,
							background: "var(--surface-subtle)",
							border: "1px solid var(--border-subtle)",
						}}
					>
						{item.thread.map((m) => (
							<div
								key={`${m.mine ? "me" : "them"}-${m.text}`}
								style={{
									alignSelf: m.mine ? "flex-end" : "flex-start",
									maxWidth: "85%",
								}}
							>
								<div
									style={{
										fontFamily: "var(--font-sans)",
										fontSize: 10.5,
										color: "var(--text-subtle)",
										marginBottom: 3,
										textAlign: m.mine ? "right" : "left",
									}}
								>
									{m.mine ? item.reporter : item.target}
								</div>
								<div
									style={{
										padding: "9px 13px",
										borderRadius: 14,
										fontFamily: "var(--font-sans)",
										fontSize: 13.5,
										lineHeight: 1.45,
										background: m.mine
											? "var(--surface-card)"
											: "var(--ink-800)",
										color: m.mine ? "var(--text-strong)" : "#fff",
										border: m.mine ? "1px solid var(--border-default)" : "none",
										borderBottomRightRadius: m.mine ? 4 : 14,
										borderBottomLeftRadius: m.mine ? 14 : 4,
									}}
								>
									{m.text}
								</div>
							</div>
						))}
					</div>
				</div>
				{item.status === "open" ? null : (
					<div
						style={{
							display: "flex",
							alignItems: "center",
							gap: 8,
							padding: 14,
							borderRadius: 14,
							background: "var(--status-success-bg)",
							color: "var(--status-success-fg)",
						}}
					>
						<span style={{ width: 18, height: 18, display: "inline-flex" }}>
							<CheckIcon />
						</span>
						<span
							style={{
								fontFamily: "var(--font-sans)",
								fontSize: 13,
								fontWeight: 700,
							}}
						>
							이미 처리된 신고예요
						</span>
					</div>
				)}
			</div>
			{item.status === "open" ? (
				<div
					style={{
						padding: "12px 24px 6px",
						borderTop: "1px solid var(--border-subtle)",
						display: "flex",
						gap: 10,
					}}
				>
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
			onClick={() => onOpen(u)}
			style={{
				textAlign: "left",
				padding: 16,
				borderRadius: 16,
				cursor: "pointer",
				background: "var(--surface-card)",
				border: "1px solid var(--border-subtle)",
				boxShadow: "var(--shadow-card)",
				display: "flex",
				alignItems: "center",
				gap: 12,
			}}
			type="button"
		>
			<Avatar name={u.name} square={u.role === "구인자"} />
			<div style={{ flex: 1, minWidth: 0 }}>
				<div style={{ display: "flex", alignItems: "center", gap: 8 }}>
					<span
						style={{
							fontFamily: "var(--font-sans)",
							fontSize: 15,
							fontWeight: 700,
							color: "var(--text-strong)",
						}}
					>
						{u.name}
					</span>
					<Badge dot tone={c.tone}>
						{c.label}
					</Badge>
				</div>
				<div
					style={{
						fontFamily: "var(--font-sans)",
						fontSize: 12.5,
						color: "var(--text-muted)",
						marginTop: 3,
					}}
				>
					{u.role} · 신고 {u.reports}건 · 경고 {u.warnings}회
				</div>
			</div>
			<span
				style={{
					width: 18,
					height: 18,
					display: "inline-flex",
					color: "var(--text-subtle)",
				}}
			>
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
		<div
			style={{
				flex: 1,
				minHeight: 0,
				display: "flex",
				flexDirection: "column",
			}}
		>
			<div
				style={{
					flex: 1,
					minHeight: 0,
					overflowY: "auto",
					padding: "4px 24px 20px",
					display: "flex",
					flexDirection: "column",
					gap: 12,
				}}
			>
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
			onClick={onClick}
			style={{
				display: "flex",
				alignItems: "center",
				gap: 12,
				padding: 14,
				borderRadius: 14,
				cursor: "pointer",
				textAlign: "left",
				background: strong ? "var(--status-danger-bg)" : "var(--surface-card)",
				border: `1px solid ${strong ? "var(--red-500)" : "var(--border-default)"}`,
			}}
			type="button"
		>
			<div style={{ flex: 1 }}>
				<div
					style={{
						fontFamily: "var(--font-sans)",
						fontSize: 14.5,
						fontWeight: 800,
						color: danger ? "var(--red-600)" : "var(--status-pending-fg)",
					}}
				>
					{label}
				</div>
				<div
					style={{
						fontFamily: "var(--font-sans)",
						fontSize: 12,
						color: "var(--text-muted)",
						marginTop: 2,
					}}
				>
					{desc}
				</div>
			</div>
			<span
				style={{
					width: 18,
					height: 18,
					display: "inline-flex",
					color: danger ? "var(--red-500)" : "var(--text-subtle)",
				}}
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
		<div
			style={{
				position: "absolute",
				inset: 0,
				zIndex: 20,
				display: "flex",
				flexDirection: "column",
				justifyContent: "flex-end",
			}}
		>
			<button
				aria-label="닫기"
				onClick={onCancel}
				style={{
					position: "absolute",
					inset: 0,
					border: "none",
					background: "var(--overlay-scrim)",
					cursor: "pointer",
				}}
				type="button"
			/>
			<div
				style={{
					position: "relative",
					background: "var(--surface-page)",
					borderRadius: "24px 24px 0 0",
					padding: "20px 24px 24px",
					boxShadow: "0 -8px 40px rgba(0,0,0,0.18)",
					animation: "bambiSheetUp var(--dur-base) var(--ease-out)",
				}}
			>
				<h2
					style={{
						margin: "0 0 4px",
						fontFamily: "var(--font-display)",
						fontSize: 19,
						fontWeight: 800,
						color: "var(--text-strong)",
					}}
				>
					{target} 제재
				</h2>
				<p
					style={{
						margin: "0 0 14px",
						fontFamily: "var(--font-sans)",
						fontSize: 13,
						color: "var(--text-muted)",
					}}
				>
					신고가 사실로 확인되면 단계별로 조치해요.
				</p>
				<div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
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
				<div style={{ marginTop: 12 }}>
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
		<div
			style={{
				flex: 1,
				minHeight: 0,
				display: "flex",
				flexDirection: "column",
			}}
		>
			<AppBar onBack={onBack} title="사용자 상세" />
			<div
				style={{
					flex: 1,
					minHeight: 0,
					overflowY: "auto",
					padding: "8px 24px 20px",
					display: "flex",
					flexDirection: "column",
					gap: 18,
				}}
			>
				<div
					style={{
						display: "flex",
						flexDirection: "column",
						alignItems: "center",
						gap: 10,
						textAlign: "center",
						padding: "4px 0",
					}}
				>
					<Avatar name={item.name} size="xl" square={item.role === "구인자"} />
					<div>
						<div
							style={{
								fontFamily: "var(--font-display)",
								fontSize: 21,
								fontWeight: 800,
								color: "var(--text-strong)",
							}}
						>
							{item.name}
						</div>
						<div
							style={{
								fontFamily: "var(--font-sans)",
								fontSize: 13,
								color: "var(--text-muted)",
								marginTop: 3,
							}}
						>
							{item.role} · 가입 {item.joined}
						</div>
					</div>
					<Badge dot tone={c.tone}>
						{c.label}
					</Badge>
				</div>
				<div
					style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}
				>
					<MetaBox label="누적 신고" value={`${item.reports}건`} />
					<MetaBox label="경고 횟수" value={`${item.warnings}회`} />
				</div>
				<div
					style={{
						display: "flex",
						gap: 8,
						padding: 14,
						borderRadius: 14,
						background: "var(--surface-subtle)",
					}}
				>
					<span
						style={{
							width: 16,
							height: 16,
							flex: "0 0 16px",
							marginTop: 1,
							display: "inline-flex",
							color: "var(--text-muted)",
						}}
					>
						<AlertCircle />
					</span>
					<span
						style={{
							fontFamily: "var(--font-sans)",
							fontSize: 12.5,
							lineHeight: 1.5,
							color: "var(--text-default)",
						}}
					>
						{item.note}
					</span>
				</div>
				<div>
					<div
						style={{
							fontFamily: "var(--font-sans)",
							fontSize: 13,
							fontWeight: 700,
							color: "var(--text-strong)",
							marginBottom: 10,
						}}
					>
						제재 적용
					</div>
					<div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
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
		<nav style={{ display: "flex", padding: "10px 8px 8px" }}>
			{items.map((it) => {
				const on = tab === it.v;
				return (
					<button
						key={it.v}
						onClick={() => setTab(it.v)}
						style={{
							flex: 1,
							display: "flex",
							flexDirection: "column",
							alignItems: "center",
							gap: 4,
							border: "none",
							background: "none",
							cursor: "pointer",
							padding: "4px 0",
							color: on ? "var(--color-primary)" : "var(--text-subtle)",
						}}
						type="button"
					>
						<span style={{ display: "inline-flex", width: 24, height: 24 }}>
							{it.icon}
						</span>
						<span
							style={{
								fontFamily: "var(--font-sans)",
								fontSize: 10,
								fontWeight: on ? 800 : 500,
							}}
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
	let color = "#fff";
	if (tone === "danger") {
		color = "var(--coral-400)";
	} else if (tone === "success") {
		color = "var(--green-500)";
	}
	return (
		<button
			onClick={onClick}
			style={{
				height: 34,
				padding: "0 11px",
				borderRadius: 10,
				cursor: "pointer",
				whiteSpace: "nowrap",
				background: "rgba(255,255,255,0.08)",
				border: "1px solid rgba(255,255,255,0.14)",
				color,
				fontFamily: "var(--font-sans)",
				fontSize: 12.5,
				fontWeight: 700,
			}}
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
		<div style={{ padding: "8px 16px 4px" }}>
			<div
				style={{
					display: "flex",
					alignItems: "center",
					gap: 8,
					padding: "10px 12px",
					borderRadius: 16,
					background: "var(--ink-800)",
					boxShadow: "var(--shadow-lg)",
				}}
			>
				<span
					style={{
						fontFamily: "var(--font-sans)",
						fontSize: 12.5,
						fontWeight: 700,
						color: "#fff",
						whiteSpace: "nowrap",
					}}
				>
					{count}개 선택됨
				</span>
				<div
					style={{
						display: "flex",
						gap: 6,
						marginLeft: "auto",
					}}
				>
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
		<div
			style={{
				position: "absolute",
				left: 0,
				right: 0,
				bottom: 84,
				display: "flex",
				justifyContent: "center",
				zIndex: 30,
				pointerEvents: "none",
			}}
		>
			<div
				style={{
					display: "flex",
					alignItems: "center",
					gap: 8,
					padding: "11px 18px",
					borderRadius: 999,
					background: "var(--ink-800)",
					color: "#fff",
					boxShadow: "var(--shadow-lg)",
					fontFamily: "var(--font-sans)",
					fontSize: 13,
					fontWeight: 700,
				}}
			>
				<span
					style={{
						width: 16,
						height: 16,
						display: "inline-flex",
						color: "var(--green-500)",
					}}
				>
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
		<div
			style={{
				flex: 1,
				minHeight: 0,
				display: "flex",
				flexDirection: "column",
				position: "relative",
			}}
		>
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
					<div
						style={{
							flex: 1,
							minHeight: 0,
							display: "flex",
							flexDirection: "column",
						}}
					>
						{listBody}
					</div>
				</>
			)}
			{showActionBar ? (
				<QueueActionBar count={selected.length} onAction={bulkAction} />
			) : null}
			{detail ? null : (
				<div
					style={{
						borderTop: "1px solid var(--border-subtle)",
						background: "var(--surface-page)",
					}}
				>
					<ModTabs setTab={setTab} tab={tab} />
				</div>
			)}
			{toast ? (
				<div
					style={{
						position: "absolute",
						left: 0,
						right: 0,
						bottom: 84,
						display: "flex",
						justifyContent: "center",
						zIndex: 30,
						pointerEvents: "none",
					}}
				>
					<div
						style={{
							display: "flex",
							alignItems: "center",
							gap: 8,
							padding: "11px 18px",
							borderRadius: 999,
							background: "var(--ink-800)",
							color: "#fff",
							boxShadow: "var(--shadow-lg)",
							fontFamily: "var(--font-sans)",
							fontSize: 13,
							fontWeight: 700,
						}}
					>
						<span
							style={{
								width: 16,
								height: 16,
								display: "inline-flex",
								color: "var(--green-500)",
							}}
						>
							<CheckIcon />
						</span>
						{toast}
					</div>
				</div>
			) : null}
		</div>
	);
}
