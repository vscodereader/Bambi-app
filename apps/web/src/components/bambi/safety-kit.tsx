"use client";

// 밤비 — 신뢰·안전 공용 키트.

import type { CSSProperties } from "react";
import { useRef, useState } from "react";
import { REPORT_REASONS } from "@/lib/bambi/data";
import { scan } from "@/lib/bambi/scanner";
import type {
	Finding,
	ReportReason,
	Severity,
	VerdictState,
	VisualTone,
} from "@/lib/bambi/types";
import { Button } from "./ds";
import { AlertCircle, CheckIcon, LockIcon } from "./icons";

type SevKey = "block" | "review" | "ok";
interface SevMeta {
	bg: string;
	dot: string;
	fg: string;
	label: string;
}

// 심각도 → 시각 처리. tone: "calm"(DS 기본, 연한 틴트) vs "bold"(채도 높은 안전 채움).
export function sevMeta(sev: SevKey, tone: VisualTone = "calm"): SevMeta {
	const calm: Record<SevKey, SevMeta> = {
		block: {
			bg: "var(--status-danger-bg)",
			fg: "var(--status-danger-fg)",
			dot: "var(--red-500)",
			label: "위반",
		},
		review: {
			bg: "var(--status-pending-bg)",
			fg: "var(--status-pending-fg)",
			dot: "var(--amber-500)",
			label: "검수",
		},
		ok: {
			bg: "var(--status-success-bg)",
			fg: "var(--status-success-fg)",
			dot: "var(--green-500)",
			label: "안전",
		},
	};
	const bold: Record<SevKey, SevMeta> = {
		block: { bg: "var(--red-500)", fg: "#fff", dot: "#fff", label: "위반" },
		review: {
			bg: "var(--amber-500)",
			fg: "#1A1206",
			dot: "#5b4708",
			label: "검수",
		},
		ok: { bg: "var(--green-500)", fg: "#fff", dot: "#fff", label: "안전" },
	};
	return (tone === "bold" ? bold : calm)[sev] || calm.ok;
}

const sevHi: Record<string, string> = {
	block: "rgba(255,90,95,0.22)",
	review: "rgba(245,158,11,0.22)",
};
const sevUnderline: Record<string, string> = {
	block: "var(--red-500)",
	review: "var(--amber-500)",
};

interface RiskFlagProps {
	label: string;
	match?: string;
	sev: Severity;
	tone?: VisualTone;
}

// 한 건의 탐지를 설명하는 작은 칩.
export function RiskFlag({ label, sev, match, tone = "calm" }: RiskFlagProps) {
	const m = sevMeta(sev as SevKey, tone);
	return (
		<span
			style={{
				display: "inline-flex",
				alignItems: "center",
				gap: 6,
				height: 26,
				padding: "0 10px",
				borderRadius: 999,
				background: m.bg,
				color: m.fg,
				fontFamily: "var(--font-sans)",
				fontSize: 12,
				fontWeight: 700,
				whiteSpace: "nowrap",
			}}
		>
			<span
				style={{ width: 6, height: 6, borderRadius: "50%", background: m.dot }}
			/>
			{label}
			{match ? (
				<span style={{ opacity: 0.7, fontWeight: 600 }}>· "{match}"</span>
			) : null}
		</span>
	);
}

interface GuardedTextareaProps {
	minHeight?: number;
	onChange: (value: string) => void;
	placeholder?: string;
	tone?: VisualTone;
	value: string;
}

// 입력하는 동안 위험 구간을 실시간 하이라이트하는 텍스트영역.
export function GuardedTextarea({
	value,
	onChange,
	placeholder,
	minHeight = 150,
}: GuardedTextareaProps) {
	const taRef = useRef<HTMLTextAreaElement>(null);
	const backRef = useRef<HTMLDivElement>(null);
	const findings = scan(value || "");
	const onScroll = () => {
		if (backRef.current && taRef.current) {
			backRef.current.scrollTop = taRef.current.scrollTop;
		}
	};

	const segs: { text: string; sev?: Severity; start: number }[] = [];
	let cur = 0;
	for (const f of findings) {
		if (f.start > cur) {
			segs.push({ text: value.slice(cur, f.start), start: cur });
		}
		segs.push({
			text: value.slice(f.start, f.end),
			sev: f.sev,
			start: f.start,
		});
		cur = f.end;
	}
	if (cur < (value || "").length) {
		segs.push({ text: value.slice(cur), start: cur });
	}
	if (!value) {
		segs.push({ text: "", start: 0 });
	}

	const sharedType: CSSProperties = {
		fontFamily: "var(--font-sans)",
		fontSize: 15,
		lineHeight: 1.6,
		letterSpacing: 0,
		padding: 16,
		boxSizing: "border-box",
		border: "1px solid transparent",
		borderRadius: 16,
		whiteSpace: "pre-wrap",
		overflowWrap: "break-word",
		wordBreak: "break-word",
		margin: 0,
	};
	const hasBlock = findings.some((f) => f.sev === "block");
	let borderColor = "var(--border-default)";
	if (hasBlock) {
		borderColor = "var(--red-500)";
	} else if (findings.length) {
		borderColor = "var(--amber-500)";
	}

	return (
		<div
			style={{
				position: "relative",
				borderRadius: 16,
				border: `1px solid ${borderColor}`,
				background: "var(--surface-card)",
				transition: "border-color var(--dur-base)",
			}}
		>
			<div
				aria-hidden="true"
				ref={backRef}
				style={{
					...sharedType,
					position: "absolute",
					inset: 0,
					color: "transparent",
					overflow: "auto",
					pointerEvents: "none",
					minHeight,
				}}
			>
				{segs.map((s) =>
					s.sev ? (
						<mark
							key={s.start}
							style={{
								background: sevHi[s.sev],
								color: "transparent",
								borderRadius: 4,
								boxShadow: `inset 0 -2px 0 ${sevUnderline[s.sev]}`,
							}}
						>
							{s.text}
						</mark>
					) : (
						<span key={s.start}>{s.text}</span>
					)
				)}
			</div>
			<textarea
				onChange={(e) => onChange(e.target.value)}
				onScroll={onScroll}
				placeholder={placeholder}
				ref={taRef}
				style={{
					...sharedType,
					position: "relative",
					display: "block",
					width: "100%",
					minHeight,
					resize: "none",
					outline: "none",
					background: "transparent",
					color: "var(--text-strong)",
				}}
				value={value}
			/>
		</div>
	);
}

interface GuardSummaryProps {
	findings: Finding[];
	state: VerdictState;
	tone?: VisualTone;
}

// 가드 필드 아래 표시되는 판정 배너.
export function GuardSummary({
	findings,
	state,
	tone = "calm",
}: GuardSummaryProps) {
	if (!findings.length) {
		const ok = sevMeta("ok", tone);
		return (
			<div
				style={{
					display: "flex",
					alignItems: "center",
					gap: 10,
					padding: "12px 14px",
					borderRadius: 14,
					background: ok.bg,
					color: ok.fg,
				}}
			>
				<span style={{ width: 20, height: 20, display: "inline-flex" }}>
					<CheckIcon />
				</span>
				<span
					style={{
						fontFamily: "var(--font-sans)",
						fontSize: 13,
						fontWeight: 700,
					}}
				>
					금지 표현이 없어요 · 바로 게시돼요
				</span>
			</div>
		);
	}
	const blocked = state === "block";
	const m = sevMeta(blocked ? "block" : "review", tone);
	const cats: Finding[] = [];
	for (const f of findings) {
		if (!cats.find((c) => c.label === f.label)) {
			cats.push(f);
		}
	}
	return (
		<div
			style={{
				display: "flex",
				flexDirection: "column",
				gap: 10,
				padding: 14,
				borderRadius: 14,
				background: m.bg,
			}}
		>
			<div
				style={{ display: "flex", alignItems: "center", gap: 8, color: m.fg }}
			>
				<span style={{ width: 20, height: 20, display: "inline-flex" }}>
					<AlertCircle />
				</span>
				<span
					style={{
						fontFamily: "var(--font-sans)",
						fontSize: 14,
						fontWeight: 800,
					}}
				>
					{blocked
						? "등록할 수 없는 표현이 있어요"
						: "검수가 필요한 표현이 감지됐어요"}
				</span>
			</div>
			<div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
				{cats.map((f) => (
					<RiskFlag key={f.label} label={f.label} sev={f.sev} tone={tone} />
				))}
			</div>
			<div
				style={{
					display: "flex",
					flexDirection: "column",
					gap: 7,
					marginTop: 2,
				}}
			>
				{cats.slice(0, 2).map((f) => (
					<div
						key={f.label}
						style={{
							display: "flex",
							gap: 8,
							fontFamily: "var(--font-sans)",
							fontSize: 12.5,
							lineHeight: 1.5,
							color: blocked
								? "var(--status-danger-fg)"
								: "var(--text-default)",
						}}
					>
						<span
							style={{
								flex: "0 0 auto",
								fontWeight: 800,
								color: m.fg === "#fff" ? "var(--text-strong)" : m.fg,
							}}
						>
							↳
						</span>
						<span>
							<b style={{ color: "var(--text-strong)" }}>{f.label}</b> —{" "}
							{f.hint}
						</span>
					</div>
				))}
			</div>
			<div
				style={{
					fontFamily: "var(--font-sans)",
					fontSize: 12,
					lineHeight: 1.5,
					color: "var(--text-muted)",
					paddingTop: 8,
					borderTop: "1px dashed var(--border-default)",
				}}
			>
				{blocked
					? "밤비는 불법 성매매·강요·미성년 관련 공고를 금지해요. 표현을 수정해야 등록할 수 있어요."
					: "게시 전 운영자가 빠르게 확인해요. 보통 10분 이내에 검수가 끝나요."}
			</div>
		</div>
	);
}

// 채팅 헤더에 들어가는 인라인 안전 안내.
export function SafetyNotice({
	tone = "calm",
	onReport,
}: {
	tone?: VisualTone;
	onReport?: () => void;
}) {
	const bold = tone === "bold";
	return (
		<div
			style={{
				display: "flex",
				alignItems: "center",
				gap: 10,
				padding: "10px 14px",
				background: bold ? "var(--ink-800)" : "var(--surface-subtle)",
				color: bold ? "#fff" : "var(--text-muted)",
				borderRadius: 0,
			}}
		>
			<span
				style={{
					width: 18,
					height: 18,
					display: "inline-flex",
					flex: "0 0 18px",
					color: bold ? "var(--coral-300)" : "var(--coral-500)",
				}}
			>
				<LockIcon />
			</span>
			<span
				style={{
					flex: 1,
					fontFamily: "var(--font-sans)",
					fontSize: 11.5,
					lineHeight: 1.45,
					fontWeight: 600,
				}}
			>
				연락처는 면접 확정·양측 동의 후에만 공개돼요. 외부 연락 유도는 신고해
				주세요.
			</span>
			<button
				onClick={onReport}
				style={{
					flex: "0 0 auto",
					border: "none",
					background: "transparent",
					cursor: "pointer",
					fontFamily: "var(--font-sans)",
					fontSize: 12,
					fontWeight: 800,
					padding: 0,
					color: bold ? "var(--coral-300)" : "var(--coral-600)",
				}}
				type="button"
			>
				신고
			</button>
		</div>
	);
}

// ---- 신고 플로우 (공용 폼, 3가지 인터랙션 쉘) ------------------------------
const SEV_TEXT: Record<string, string> = {
	high: "심각",
	mid: "주의",
	low: "참고",
};

interface ReportFormProps {
	compact?: boolean;
	onCancel: () => void;
	onSubmit: (reason: ReportReason | undefined, detail: string) => void;
	tone?: VisualTone;
}

export function ReportForm({
	onSubmit,
	onCancel,
	compact,
	tone = "calm",
}: ReportFormProps) {
	const [sel, setSel] = useState<string | null>(null);
	const [detail, setDetail] = useState("");
	const reasons = REPORT_REASONS;
	return (
		<div
			style={{
				display: "flex",
				flexDirection: "column",
				gap: compact ? 12 : 16,
			}}
		>
			{compact ? null : (
				<div>
					<h2
						style={{
							margin: "0 0 4px",
							fontFamily: "var(--font-display)",
							fontSize: 20,
							fontWeight: 800,
							color: "var(--text-strong)",
						}}
					>
						무엇을 신고할까요?
					</h2>
					<p
						style={{
							margin: 0,
							fontFamily: "var(--font-sans)",
							fontSize: 13,
							color: "var(--text-muted)",
						}}
					>
						신고는 익명으로 운영팀에 전달돼요.
					</p>
				</div>
			)}
			<div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
				{reasons.map((r) => {
					const on = sel === r.id;
					const m = sevMeta(r.sev === "high" ? "block" : "review", tone);
					return (
						<button
							key={r.id}
							onClick={() => setSel(r.id)}
							style={{
								display: "flex",
								alignItems: "center",
								gap: 12,
								padding: "12px 14px",
								borderRadius: 14,
								cursor: "pointer",
								textAlign: "left",
								background: on
									? "var(--color-primary-soft)"
									: "var(--surface-card)",
								border: on
									? "1px solid var(--color-primary)"
									: "1px solid var(--border-default)",
								transition: "all var(--dur-fast)",
							}}
							type="button"
						>
							<span
								style={{
									flex: 1,
									fontFamily: "var(--font-sans)",
									fontSize: 14.5,
									fontWeight: 700,
									color: "var(--text-strong)",
								}}
							>
								{r.label}
							</span>
							{r.sev === "high" ? (
								<span
									style={{
										fontFamily: "var(--font-sans)",
										fontSize: 11,
										fontWeight: 800,
										color: m.fg === "#fff" ? "var(--red-600)" : m.fg,
										background: "var(--status-danger-bg)",
										padding: "2px 8px",
										borderRadius: 999,
									}}
								>
									{SEV_TEXT[r.sev]}
								</span>
							) : null}
							<span
								style={{
									width: 20,
									height: 20,
									flex: "0 0 20px",
									borderRadius: "50%",
									display: "inline-flex",
									alignItems: "center",
									justifyContent: "center",
									border: on ? "none" : "1.5px solid var(--border-strong)",
									background: on ? "var(--color-primary)" : "transparent",
									color: "#fff",
								}}
							>
								{on ? (
									<span
										style={{ width: 12, height: 12, display: "inline-flex" }}
									>
										<CheckIcon />
									</span>
								) : null}
							</span>
						</button>
					);
				})}
			</div>
			<textarea
				onChange={(e) => setDetail(e.target.value)}
				placeholder="구체적인 상황을 적어주시면 처리가 빨라져요 (선택)"
				style={{
					width: "100%",
					minHeight: compact ? 56 : 80,
					resize: "none",
					boxSizing: "border-box",
					padding: 14,
					borderRadius: 14,
					border: "1px solid var(--border-default)",
					background: "var(--surface-card)",
					fontFamily: "var(--font-sans)",
					fontSize: 14,
					lineHeight: 1.5,
					color: "var(--text-strong)",
					outline: "none",
				}}
				value={detail}
			/>
			<div style={{ display: "flex", gap: 10 }}>
				<Button block onClick={onCancel} size="lg" variant="secondary">
					취소
				</Button>
				<Button
					block
					disabled={!sel}
					onClick={() =>
						onSubmit(
							reasons.find((r) => r.id === sel),
							detail
						)
					}
					size="lg"
					variant="danger"
				>
					신고 접수
				</Button>
			</div>
		</div>
	);
}

export function ReportDone({
	onClose,
	compact,
}: {
	onClose: () => void;
	compact?: boolean;
}) {
	return (
		<div
			style={{
				display: "flex",
				flexDirection: "column",
				alignItems: "center",
				gap: 12,
				padding: compact ? "8px 4px" : "12px 8px 4px",
				textAlign: "center",
			}}
		>
			<div
				style={{
					width: 56,
					height: 56,
					borderRadius: 18,
					background: "var(--status-success-bg)",
					display: "flex",
					alignItems: "center",
					justifyContent: "center",
					color: "var(--status-success-fg)",
				}}
			>
				<span style={{ width: 28, height: 28, display: "inline-flex" }}>
					<CheckIcon />
				</span>
			</div>
			<div>
				<h2
					style={{
						margin: "0 0 4px",
						fontFamily: "var(--font-display)",
						fontSize: 18,
						fontWeight: 800,
						color: "var(--text-strong)",
					}}
				>
					신고가 접수됐어요
				</h2>
				<p
					style={{
						margin: 0,
						fontFamily: "var(--font-sans)",
						fontSize: 13,
						lineHeight: 1.5,
						color: "var(--text-muted)",
						maxWidth: 260,
					}}
				>
					운영팀이 대화 내용을 검토하고 24시간 내 조치해요. 안전을 위해 해당
					채팅은 잠시 숨겨둘게요.
				</p>
			</div>
			<Button block onClick={onClose} size="lg" variant="primary">
				확인
			</Button>
		</div>
	);
}
