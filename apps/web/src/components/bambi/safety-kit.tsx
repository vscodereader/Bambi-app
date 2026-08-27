"use client";

// 밤비 — 신뢰·안전 공용 키트.

import { cn } from "@bambi-app/ui/lib/utils";
import { useRef, useState } from "react";
import { REPORT_REASONS } from "@/lib/bambi/report-reasons";
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

// sevMeta 색을 Tailwind 유틸로 미러링 (인라인 style 제거용). 동일한 calm/bold 매핑.
const SEV_BG_CLASS: Record<VisualTone, Record<SevKey, string>> = {
	calm: {
		block: "bg-red-50",
		review: "bg-amber-50",
		ok: "bg-green-50",
	},
	bold: {
		block: "bg-red-500",
		review: "bg-amber-500",
		ok: "bg-green-500",
	},
};
const SEV_FG_CLASS: Record<VisualTone, Record<SevKey, string>> = {
	calm: {
		block: "text-red-600",
		review: "text-amber-500",
		ok: "text-green-600",
	},
	bold: {
		block: "text-white",
		review: "text-[#1A1206]",
		ok: "text-white",
	},
};
const SEV_DOT_CLASS: Record<VisualTone, Record<SevKey, string>> = {
	calm: {
		block: "bg-red-500",
		review: "bg-amber-500",
		ok: "bg-green-500",
	},
	bold: {
		block: "bg-white",
		review: "bg-[#5b4708]",
		ok: "bg-white",
	},
};

// 실시간 하이라이트 마크 — 위험도별 정적 클래스.
const SEV_HI_CLASS: Record<string, string> = {
	block:
		"rounded bg-[rgba(255,90,95,0.22)] text-transparent shadow-[inset_0_-2px_0_var(--red-500)]",
	review:
		"rounded bg-[rgba(245,158,11,0.22)] text-transparent shadow-[inset_0_-2px_0_var(--amber-500)]",
};
// textarea/backdrop 오버레이 정렬용 공유 타이포 — 양쪽에 동일 클래스를 적용해 박스를 일치시킨다.
const SHARED_TYPE_CLASS =
	"m-0 box-border min-h-[150px] whitespace-pre-wrap break-words rounded-2xl border border-transparent p-4 text-[15px] leading-[1.6] tracking-normal [overflow-wrap:break-word]";

interface RiskFlagProps {
	label: string;
	match?: string;
	sev: Severity;
	tone?: VisualTone;
}

// 한 건의 탐지를 설명하는 작은 칩.
export function RiskFlag({ label, sev, match, tone = "calm" }: RiskFlagProps) {
	const key = sev as SevKey;
	return (
		<span
			className={cn(
				"inline-flex h-[26px] items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 font-bold text-xs",
				SEV_BG_CLASS[tone][key] || SEV_BG_CLASS.calm.ok,
				SEV_FG_CLASS[tone][key] || SEV_FG_CLASS.calm.ok
			)}
		>
			<span
				className={cn(
					"size-1.5 rounded-full",
					SEV_DOT_CLASS[tone][key] || SEV_DOT_CLASS.calm.ok
				)}
			/>
			{label}
			{match ? (
				<span className="font-semibold opacity-70">· "{match}"</span>
			) : null}
		</span>
	);
}

interface GuardedTextareaProps {
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

	const hasBlock = findings.some((f) => f.sev === "block");
	let borderClass = "border-[color:var(--border-default)]";
	if (hasBlock) {
		borderClass = "border-[color:var(--red-500)]";
	} else if (findings.length) {
		borderClass = "border-[color:var(--amber-500)]";
	}

	return (
		<div
			className={cn(
				"relative rounded-2xl border bg-card transition-[border-color]",
				borderClass
			)}
		>
			<div
				aria-hidden="true"
				className={cn(
					"pointer-events-none absolute inset-0 overflow-auto text-transparent",
					SHARED_TYPE_CLASS
				)}
				ref={backRef}
			>
				{segs.map((s) =>
					s.sev ? (
						<mark className={SEV_HI_CLASS[s.sev]} key={s.start}>
							{s.text}
						</mark>
					) : (
						<span key={s.start}>{s.text}</span>
					)
				)}
			</div>
			<textarea
				className={cn(
					"relative block w-full resize-none bg-transparent text-foreground outline-none",
					SHARED_TYPE_CLASS
				)}
				onChange={(e) => onChange(e.target.value)}
				onScroll={onScroll}
				placeholder={placeholder}
				ref={taRef}
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
		return (
			<div
				className={cn(
					"flex items-center gap-2.5 rounded-md px-3.5 py-3",
					SEV_BG_CLASS[tone].ok,
					SEV_FG_CLASS[tone].ok
				)}
			>
				<span className="inline-flex size-5">
					<CheckIcon />
				</span>
				<span className="font-bold text-[13px]">
					금지 표현이 없어요 · 바로 게시돼요
				</span>
			</div>
		);
	}
	const blocked = state === "block";
	const key: SevKey = blocked ? "block" : "review";
	const m = sevMeta(key, tone);
	const cats: Finding[] = [];
	for (const f of findings) {
		if (!cats.find((c) => c.label === f.label)) {
			cats.push(f);
		}
	}
	return (
		<div
			className={cn(
				"flex flex-col gap-2.5 rounded-md p-3.5",
				SEV_BG_CLASS[tone][key]
			)}
		>
			<div className={cn("flex items-center gap-2", SEV_FG_CLASS[tone][key])}>
				<span className="inline-flex size-5">
					<AlertCircle />
				</span>
				<span className="font-extrabold text-sm">
					{blocked
						? "등록할 수 없는 표현이 있어요"
						: "검수가 필요한 표현이 감지됐어요"}
				</span>
			</div>
			<div className="flex flex-wrap gap-1.5">
				{cats.map((f) => (
					<RiskFlag key={f.label} label={f.label} sev={f.sev} tone={tone} />
				))}
			</div>
			<div className="mt-0.5 flex flex-col gap-[7px]">
				{cats.slice(0, 2).map((f) => (
					<div
						className={cn(
							"flex gap-2 text-[12.5px] leading-normal",
							blocked
								? "text-[color:var(--status-danger-fg)]"
								: "text-foreground"
						)}
						key={f.label}
					>
						<span
							className={cn(
								"flex-[0_0_auto] font-extrabold",
								m.fg === "#fff" ? "text-foreground" : SEV_FG_CLASS[tone][key]
							)}
						>
							↳
						</span>
						<span>
							<b className="text-foreground">{f.label}</b> — {f.hint}
						</span>
					</div>
				))}
			</div>
			<div className="border-[color:var(--border-default)] border-t border-dashed pt-2 text-muted-foreground text-xs leading-normal">
				{blocked
					? "밤비알바는 불법 성매매·강요·미성년 관련 공고를 금지해요. 표현을 수정해야 등록할 수 있어요."
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
			className={cn(
				"flex items-center gap-2.5 px-3.5 py-2.5",
				bold ? "bg-ink-800 text-white" : "bg-secondary text-muted-foreground"
			)}
		>
			<span
				className={cn(
					"inline-flex size-[18px] flex-[0_0_18px]",
					bold ? "text-coral-300" : "text-primary"
				)}
			>
				<LockIcon />
			</span>
			<span className="flex-1 font-semibold text-[11.5px] leading-[1.45]">
				연락처는 면접 확정·양측 동의 후에만 공개돼요. 외부 연락 유도는 신고해
				주세요.
			</span>
			<button
				className={cn(
					"flex-[0_0_auto] cursor-pointer border-none bg-transparent p-0 font-extrabold text-xs",
					bold ? "text-coral-300" : "text-coral-600"
				)}
				onClick={onReport}
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
		<div className={cn("flex flex-col", compact ? "gap-3" : "gap-3 md:gap-4")}>
			{compact ? null : (
				<div>
					<h2 className="mt-0 mr-0 mb-1 ml-0 font-extrabold text-foreground text-lg md:text-xl">
						무엇을 신고할까요?
					</h2>
					<p className="m-0 text-[13px] text-muted-foreground">
						신고는 익명으로 운영팀에 전달돼요.
					</p>
				</div>
			)}
			<div className="flex flex-col gap-1.5 md:gap-2">
				{reasons.map((r) => {
					const on = sel === r.id;
					const key: SevKey = r.sev === "high" ? "block" : "review";
					const m = sevMeta(key, tone);
					return (
						<button
							className={cn(
								"flex min-h-11 cursor-pointer items-center gap-3 rounded-md border px-3 py-2 text-left transition-all md:px-3.5 md:py-3",
								on
									? "border-[color:var(--color-primary)] bg-coral-50"
									: "border-[color:var(--border-default)] bg-card"
							)}
							key={r.id}
							onClick={() => setSel(r.id)}
							type="button"
						>
							<span className="flex-1 font-bold text-[14.5px] text-foreground">
								{r.label}
							</span>
							{r.sev === "high" ? (
								<span
									className={cn(
										"rounded-full bg-[var(--status-danger-bg)] px-2 py-0.5 font-extrabold text-[11px]",
										m.fg === "#fff" ? "text-red-600" : SEV_FG_CLASS[tone][key]
									)}
								>
									{SEV_TEXT[r.sev]}
								</span>
							) : null}
							<span
								className={cn(
									"inline-flex size-5 flex-[0_0_20px] items-center justify-center rounded-full text-white",
									on
										? "border-none bg-primary"
										: "border-[1.5px] border-[color:var(--border-strong)] bg-transparent"
								)}
							>
								{on ? (
									<span className="inline-flex size-3">
										<CheckIcon />
									</span>
								) : null}
							</span>
						</button>
					);
				})}
			</div>
			<textarea
				className={cn(
					"box-border w-full resize-none rounded-md border border-[color:var(--border-default)] bg-card p-3.5 text-base text-foreground leading-normal outline-none",
					compact ? "min-h-14" : "min-h-16 md:min-h-20"
				)}
				onChange={(e) => setDetail(e.target.value)}
				placeholder="구체적인 상황을 적어주시면 처리가 빨라져요 (선택)"
				value={detail}
			/>
			<div className="grid grid-cols-2 gap-2.5">
				<Button
					block
					className="sm:flex-1"
					onClick={onCancel}
					size="lg"
					variant="secondary"
				>
					신고 취소
				</Button>
				<Button
					block
					className="sm:flex-1"
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
	isChat,
}: {
	onClose: () => void;
	compact?: boolean;
	isChat?: boolean;
}) {
	return (
		<div
			className={cn(
				"flex flex-col items-center gap-3 text-center",
				compact ? "px-1 py-2" : "px-2 pt-3 pb-1"
			)}
		>
			<div className="flex size-14 items-center justify-center rounded-[18px] bg-[var(--status-success-bg)] text-[color:var(--status-success-fg)]">
				<span className="inline-flex size-7">
					<CheckIcon />
				</span>
			</div>
			<div>
				<h2 className="mt-0 mr-0 mb-1 ml-0 font-extrabold text-foreground text-lg">
					신고가 접수됐어요
				</h2>
				<p className="m-0 max-w-[260px] text-[13px] text-muted-foreground leading-normal">
					{isChat
						? "운영팀이 대화 내용을 검토하고 24시간 내 조치해요. 안전을 위해 해당 채팅은 잠시 숨겨둘게요."
						: "운영팀이 신고 내용을 검토하고 24시간 내 조치해요."}
				</p>
			</div>
			<Button block onClick={onClose} size="lg" variant="primary">
				확인
			</Button>
		</div>
	);
}
