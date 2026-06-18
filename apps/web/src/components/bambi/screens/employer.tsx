"use client";

// 밤비 — 구인자(Employer) 화면: 실시간 콘텐츠 가드가 붙은 공고 등록 + 내 공고.

import type { ReactNode } from "react";
import { useState } from "react";
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
		<div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
			<div
				style={{
					display: "flex",
					alignItems: "baseline",
					justifyContent: "space-between",
				}}
			>
				<span
					style={{
						fontFamily: "var(--font-sans)",
						fontSize: 13,
						fontWeight: 700,
						color: "var(--text-strong)",
					}}
				>
					{label}
				</span>
				{hint ? (
					<span
						style={{
							fontFamily: "var(--font-sans)",
							fontSize: 11,
							color: "var(--text-subtle)",
						}}
					>
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
			style={{
				display: "flex",
				gap: 12,
				padding: 14,
				borderRadius: 16,
				background: dark ? "var(--ink-800)" : "var(--surface-subtle)",
				color: dark ? "#fff" : "var(--text-default)",
			}}
		>
			<span
				style={{
					width: 22,
					height: 22,
					flex: "0 0 22px",
					display: "inline-flex",
					color: dark ? "var(--coral-300)" : "var(--coral-500)",
				}}
			>
				<AlertCircle />
			</span>
			<div
				style={{
					fontFamily: "var(--font-sans)",
					fontSize: 12.5,
					lineHeight: 1.5,
				}}
			>
				<b style={{ fontWeight: 800 }}>
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
		<div
			style={{
				flex: 1,
				minHeight: 0,
				display: "flex",
				flexDirection: "column",
			}}
		>
			<AppBar onBack={onBack} title="공고 등록" />
			<div
				style={{
					flex: 1,
					minHeight: 0,
					overflowY: "auto",
					display: "flex",
					flexDirection: "column",
					gap: 18,
					padding: "6px 24px 20px",
				}}
			>
				<GuardIntro tone={tone} />
				<FieldE label="공고 제목">
					<Input
						onChange={(e) => setTitle(e.target.value)}
						placeholder="예) 주말 야간 홀 서빙"
						value={title}
					/>
				</FieldE>
				<FieldE label="직무">
					<div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
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
			<div
				style={{
					padding: "12px 24px 6px",
					borderTop: "1px solid var(--border-subtle)",
				}}
			>
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
				bg: "var(--status-pending-bg)",
				fg: "var(--status-pending-fg)",
				icon: <ClockIcon />,
				title: "검수 요청이 접수됐어요",
				body: "공고에서 확인이 필요한 표현이 있어 운영자가 먼저 검토해요. 보통 10분 이내에 게시 여부를 알려드려요.",
				badge: "검수 대기",
			}
		: {
				bg: "var(--status-success-bg)",
				fg: "var(--status-success-fg)",
				icon: <CheckIcon />,
				title: "공고가 게시됐어요",
				body: "금지 표현 없이 통과했어요. 지금부터 구직자에게 노출되고, 채팅 문의를 받을 수 있어요.",
				badge: "게시됨",
			};
	return (
		<div
			style={{
				flex: 1,
				minHeight: 0,
				display: "flex",
				flexDirection: "column",
				justifyContent: "center",
				alignItems: "center",
				gap: 18,
				padding: "0 32px",
				textAlign: "center",
			}}
		>
			<div
				style={{
					width: 76,
					height: 76,
					borderRadius: 24,
					background: conf.bg,
					color: conf.fg,
					display: "flex",
					alignItems: "center",
					justifyContent: "center",
				}}
			>
				<span style={{ width: 38, height: 38, display: "inline-flex" }}>
					{conf.icon}
				</span>
			</div>
			<Badge dot tone={review ? "pending" : "success"}>
				{conf.badge}
			</Badge>
			<div>
				<h1
					style={{
						margin: "0 0 8px",
						fontFamily: "var(--font-display)",
						fontSize: 22,
						fontWeight: 800,
						color: "var(--text-strong)",
					}}
				>
					{conf.title}
				</h1>
				<p
					style={{
						margin: 0,
						fontFamily: "var(--font-sans)",
						fontSize: 14,
						lineHeight: 1.6,
						color: "var(--text-muted)",
						maxWidth: 300,
					}}
				>
					{conf.body}
				</p>
			</div>
			<div style={{ width: "100%", maxWidth: 320, marginTop: 6 }}>
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
	title: string;
	views: number;
}

const STORE_NAME = "달밤 라운지";

const MY_POSTINGS: Posting[] = [
	{
		id: "p1",
		title: "홀 서빙 · 주말 야간",
		state: "published",
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

function PostingRow({ p }: { p: Posting }) {
	const stateConf = POSTING_STATE[p.state];
	const rejected = p.state === "rejected";
	return (
		<div
			style={{
				padding: 16,
				borderRadius: 16,
				background: "var(--surface-card)",
				border: rejected
					? "1px solid var(--red-500)"
					: "1px solid var(--border-subtle)",
				boxShadow: "var(--shadow-card)",
				display: "flex",
				flexDirection: "column",
				gap: 10,
			}}
		>
			<div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
				<Avatar name={STORE_NAME} size="sm" square />
				<div style={{ flex: 1, minWidth: 0 }}>
					<div
						style={{
							fontFamily: "var(--font-sans)",
							fontSize: 15.5,
							fontWeight: 700,
							color: "var(--text-strong)",
						}}
					>
						{p.title}
					</div>
					<div
						style={{
							display: "flex",
							alignItems: "center",
							gap: 6,
							fontFamily: "var(--font-sans)",
							fontSize: 13,
							color: "var(--text-muted)",
							marginTop: 3,
						}}
					>
						<span>{p.area}</span>
						<span style={{ color: "var(--border-strong)" }}>|</span>
						<span>{p.pay}</span>
					</div>
				</div>
				<Badge dot tone={stateConf.tone}>
					{stateConf.label}
				</Badge>
			</div>
			<div
				style={{
					paddingTop: 10,
					borderTop: "1px solid var(--border-subtle)",
				}}
			>
				<span
					style={{
						fontFamily: "var(--font-sans)",
						fontSize: 12,
						color: "var(--text-subtle)",
					}}
				>
					조회 {p.views} · 지원 {p.applicants} · {p.dateLabel}
				</span>
			</div>
			{rejected ? (
				<div
					style={{
						display: "flex",
						gap: 8,
						padding: "10px 12px",
						borderRadius: 12,
						background: "var(--status-danger-bg)",
					}}
				>
					<span
						style={{
							width: 16,
							height: 16,
							flex: "0 0 16px",
							marginTop: 1,
							display: "inline-flex",
							color: "var(--red-600)",
						}}
					>
						<AlertCircle />
					</span>
					<div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
						<span
							style={{
								fontFamily: "var(--font-sans)",
								fontSize: 12.5,
								fontWeight: 700,
								lineHeight: 1.5,
								color: "var(--status-danger-fg)",
							}}
						>
							반려 사유 · {p.reason}
						</span>
						{p.guide ? (
							<span
								style={{
									fontFamily: "var(--font-sans)",
									fontSize: 12,
									lineHeight: 1.5,
									color: "var(--text-muted)",
								}}
							>
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
					display: "flex",
					alignItems: "center",
					justifyContent: "space-between",
					padding: "6px 20px 10px",
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
								color: "var(--green-600)",
							}}
						>
							<ShieldIcon />
						</span>
						사업자 인증 완료
					</span>
					<IconButton variant="subtle">
						<BellIcon />
					</IconButton>
				</div>
			</div>
			<div
				style={{
					flex: 1,
					minHeight: 0,
					overflowY: "auto",
					display: "flex",
					flexDirection: "column",
					gap: 16,
					padding: "4px 24px 16px",
				}}
			>
				<div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
					<h1
						style={{
							margin: 0,
							fontFamily: "var(--font-display)",
							fontSize: 24,
							fontWeight: 800,
							lineHeight: 1.32,
							color: "var(--text-strong)",
						}}
					>
						내 공고
					</h1>
					<div
						style={{
							display: "inline-flex",
							alignItems: "center",
							gap: 6,
							alignSelf: "flex-start",
						}}
					>
						<span
							style={{
								fontFamily: "var(--font-sans)",
								fontSize: 15,
								fontWeight: 700,
								color: "var(--text-default)",
							}}
						>
							{STORE_NAME}
						</span>
						<span
							style={{
								display: "inline-flex",
								width: 18,
								height: 18,
								color: "var(--text-muted)",
							}}
						>
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
				<div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
					{list.map((p) => (
						<PostingRow key={p.id} p={p} />
					))}
				</div>
			</div>
		</div>
	);
}

export function EmployerMe() {
	const rows = [
		{ icon: <ClipboardListIcon />, label: "공고 검수 정책", meta: "" },
		{ icon: <AlertCircle />, label: "받은 경고", meta: "0회" },
		{ icon: <SettingsIcon />, label: "매장 정보", meta: "" },
	];
	return (
		<div
			style={{
				flex: 1,
				minHeight: 0,
				display: "flex",
				flexDirection: "column",
			}}
		>
			<div style={{ padding: "8px 24px 4px" }}>
				<h1
					style={{
						margin: 0,
						fontFamily: "var(--font-display)",
						fontSize: 24,
						fontWeight: 800,
						color: "var(--text-strong)",
					}}
				>
					매장 정보
				</h1>
			</div>
			<div
				style={{
					flex: 1,
					minHeight: 0,
					overflowY: "auto",
					padding: "16px 24px",
					display: "flex",
					flexDirection: "column",
					gap: 18,
				}}
			>
				<div
					style={{
						display: "flex",
						alignItems: "center",
						gap: 14,
						padding: 18,
						borderRadius: 18,
						background: "var(--surface-inverse)",
					}}
				>
					<Avatar name="달밤 라운지" size="lg" square />
					<div style={{ flex: 1 }}>
						<div
							style={{
								fontFamily: "var(--font-sans)",
								fontSize: 18,
								fontWeight: 800,
								color: "#fff",
							}}
						>
							달밤 라운지
						</div>
						<div
							style={{
								fontFamily: "var(--font-sans)",
								fontSize: 13,
								color: "var(--text-on-dark-muted)",
								marginTop: 2,
							}}
						>
							구인자 · 강남
						</div>
					</div>
					<Badge dot tone="success">
						정상
					</Badge>
				</div>
				<div
					style={{
						display: "flex",
						flexDirection: "column",
						borderRadius: 16,
						border: "1px solid var(--border-subtle)",
						overflow: "hidden",
					}}
				>
					{rows.map((r, i) => (
						<div
							key={r.label}
							style={{
								display: "flex",
								alignItems: "center",
								gap: 12,
								padding: "16px",
								borderTop: i ? "1px solid var(--border-subtle)" : "none",
							}}
						>
							<span
								style={{
									width: 22,
									height: 22,
									display: "inline-flex",
									color: "var(--text-muted)",
								}}
							>
								{r.icon}
							</span>
							<span
								style={{
									flex: 1,
									fontFamily: "var(--font-sans)",
									fontSize: 15,
									fontWeight: 600,
									color: "var(--text-strong)",
								}}
							>
								{r.label}
							</span>
							{r.meta ? (
								<span
									style={{
										fontFamily: "var(--font-sans)",
										fontSize: 13,
										color: "var(--text-muted)",
									}}
								>
									{r.meta}
								</span>
							) : null}
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
						</div>
					))}
				</div>
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
			<div
				style={{
					flex: 1,
					minHeight: 0,
					display: "flex",
					flexDirection: "column",
				}}
			>
				{screen}
			</div>
			{showNav && (
				<div
					style={{
						borderTop: "1px solid var(--border-subtle)",
						background: "var(--surface-page)",
					}}
				>
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
