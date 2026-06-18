"use client";

// 밤비 — 구직자(Seeker) 화면: 탐색 → 상세 → 채팅 → 신고.

import { useEffect, useRef, useState } from "react";
import { JOBS } from "@/lib/bambi/data";
import type { Job, ReportMode, VisualTone } from "@/lib/bambi/types";
import {
	AppBar,
	Avatar,
	Badge,
	BottomNav,
	Button,
	ChatBubble,
	IconButton,
	InfoTile,
	JobCard,
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
	UserIcon,
} from "../icons";
import { PhoneFrame } from "../phone-frame";
import { ReportDone, ReportForm, SafetyNotice } from "../safety-kit";
import { ContactReveal } from "./contact-reveal";

function SeekerCategory() {
	const [sel, setSel] = useState("전체");
	const cats = ["전체", "라운지", "바", "클럽", "호스트바", "카페"];
	return (
		<div
			style={{
				display: "flex",
				gap: 8,
				overflowX: "auto",
				padding: "0 24px",
				scrollbarWidth: "none",
			}}
		>
			{cats.map((c) => (
				<Tag key={c} onClick={() => setSel(c)} selected={sel === c}>
					{c}
				</Tag>
			))}
			<button
				aria-label="카테고리 더보기"
				style={{
					flex: "0 0 auto",
					width: "var(--control-h-xs)",
					height: "var(--control-h-xs)",
					borderRadius: "var(--radius-pill)",
					border: "1px solid var(--border-default)",
					background: "var(--surface-card)",
					color: "var(--text-muted)",
					cursor: "pointer",
					display: "inline-flex",
					alignItems: "center",
					justifyContent: "center",
				}}
				type="button"
			>
				<span style={{ display: "inline-flex", width: 16, height: 16 }}>
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
			style={{
				display: "flex",
				alignItems: "center",
				gap: 10,
				padding: "13px 14px",
				borderRadius: 14,
				background: dark ? "var(--ink-800)" : "var(--color-primary-soft)",
				color: dark ? "#fff" : "var(--color-primary-press)",
			}}
		>
			<span
				style={{
					width: 20,
					height: 20,
					flex: "0 0 20px",
					display: "inline-flex",
					color: dark ? "var(--coral-300)" : "var(--coral-600)",
				}}
			>
				<ShieldIcon />
			</span>
			<span
				style={{
					flex: 1,
					fontFamily: "var(--font-sans)",
					fontSize: 12.5,
					fontWeight: 700,
					lineHeight: 1.4,
				}}
			>
				연락처는 면접 확정 전까지 비공개로 보호돼요
			</span>
			<span
				aria-hidden="true"
				style={{
					width: 18,
					height: 18,
					flex: "0 0 18px",
					display: "inline-flex",
					opacity: 0.7,
				}}
			>
				<ChevronRightIcon />
			</span>
		</div>
	);
}

export function SeekerHome({
	onOpenJob,
	onChatJob,
	tone = "calm",
}: {
	onOpenJob: (job: Job) => void;
	onChatJob: (job: Job) => void;
	tone?: VisualTone;
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
						익명 보호 중
					</span>
					<IconButton badge variant="subtle">
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
					gap: 18,
					paddingBottom: 16,
				}}
			>
				<div style={{ padding: "4px 24px 0" }}>
					<h1
						style={{
							margin: 0,
							fontFamily: "var(--font-display)",
							fontSize: 24,
							fontWeight: 800,
							lineHeight: 1.32,
							letterSpacing: "-0.01em",
							color: "var(--text-strong)",
						}}
					>
						하늘님, 좋은 자리를 확인해요
					</h1>
				</div>
				<div style={{ padding: "0 24px" }}>
					<SearchField
						filterLabel="필터"
						placeholder="업종, 지역, 공고 제목 검색"
					/>
				</div>
				<div style={{ padding: "0 24px" }}>
					<TrustStrip tone={tone} />
				</div>
				<SeekerCategory />
				<div
					style={{
						display: "flex",
						alignItems: "center",
						justifyContent: "space-between",
						padding: "2px 24px 0",
					}}
				>
					<span
						style={{
							fontFamily: "var(--font-sans)",
							fontSize: 16,
							fontWeight: 700,
							color: "var(--text-strong)",
						}}
					>
						추천 공고
					</span>
					<span
						style={{
							fontFamily: "var(--font-sans)",
							fontSize: 14,
							fontWeight: 600,
							color: "var(--text-link)",
						}}
					>
						전체보기
					</span>
				</div>
				<div
					style={{
						display: "flex",
						flexDirection: "column",
						gap: 12,
						padding: "0 24px",
					}}
				>
					{JOBS.map((j) => (
						<JobCard
							avatarName={j.company}
							featured={j.featured}
							key={j.id}
							location={j.location}
							onChat={() => onChatJob(j)}
							onClick={() => onOpenJob(j)}
							pay={j.pay}
							rating={j.rating}
							reviews={j.reviews}
							title={`${j.company} ${j.title}`}
							verified={j.verified}
						/>
					))}
				</div>
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
		<div
			style={{
				flex: 1,
				minHeight: 0,
				display: "flex",
				flexDirection: "column",
				position: "relative",
			}}
		>
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
						onClick={() => setMenu(false)}
						style={{
							position: "absolute",
							inset: 0,
							zIndex: 5,
							border: "none",
							background: "transparent",
							cursor: "default",
						}}
						type="button"
					/>
					<div
						style={{
							position: "absolute",
							top: 50,
							right: 12,
							zIndex: 6,
							background: "var(--surface-card)",
							borderRadius: 14,
							border: "1px solid var(--border-default)",
							boxShadow: "var(--shadow-lg)",
							overflow: "hidden",
							minWidth: 180,
						}}
					>
						<button
							onClick={() => {
								setMenu(false);
								onReport();
							}}
							style={{
								display: "flex",
								alignItems: "center",
								gap: 10,
								width: "100%",
								padding: "13px 16px",
								border: "none",
								background: "transparent",
								cursor: "pointer",
								fontFamily: "var(--font-sans)",
								fontSize: 14,
								fontWeight: 600,
								color: "var(--red-600)",
							}}
							type="button"
						>
							<span style={{ width: 18, height: 18, display: "inline-flex" }}>
								<AlertCircle />
							</span>
							이 공고 신고하기
						</button>
					</div>
				</>
			) : null}
			<div
				style={{
					flex: 1,
					minHeight: 0,
					overflowY: "auto",
					paddingBottom: 20,
				}}
			>
				<div
					style={{
						display: "flex",
						flexDirection: "column",
						alignItems: "center",
						gap: 12,
						padding: "12px 24px 18px",
					}}
				>
					<Avatar
						name={job.company}
						size="xl"
						square
						style={{
							width: 80,
							height: 80,
							flex: "0 0 80px",
							borderRadius: 22,
							boxShadow: "var(--shadow-md)",
						}}
					/>
					<div style={{ textAlign: "center" }}>
						<h1
							style={{
								margin: "0 0 6px",
								fontFamily: "var(--font-display)",
								fontSize: 24,
								fontWeight: 800,
								color: "var(--text-strong)",
							}}
						>
							{job.title}
						</h1>
						<span
							style={{
								fontFamily: "var(--font-sans)",
								fontSize: 15,
								fontWeight: 500,
								color: "var(--text-muted)",
							}}
						>
							{job.company} · {job.location}
						</span>
					</div>
					<div
						style={{
							display: "flex",
							alignItems: "center",
							gap: 6,
							padding: "5px 12px",
							borderRadius: 999,
							background: "var(--status-success-bg)",
							color: "var(--status-success-fg)",
						}}
					>
						<span style={{ width: 14, height: 14, display: "inline-flex" }}>
							<CheckIcon />
						</span>
						<span
							style={{
								fontFamily: "var(--font-sans)",
								fontSize: 12,
								fontWeight: 700,
							}}
						>
							검수 통과한 공고
						</span>
					</div>
				</div>
				<div style={{ padding: "0 24px" }}>
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
				<p
					style={{
						margin: "20px 24px",
						fontFamily: "var(--font-sans)",
						fontSize: 15,
						lineHeight: 1.6,
						color: "var(--text-default)",
					}}
				>
					{job.desc}
				</p>
				<div
					style={{
						display: "grid",
						gridTemplateColumns: "1fr 1fr",
						gap: 18,
						padding: "0 24px 22px",
					}}
				>
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
			<div
				style={{
					padding: "12px 24px 6px",
					borderTop: "1px solid var(--border-subtle)",
					display: "flex",
					gap: 10,
				}}
			>
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
			style={{
				position: "absolute",
				inset: 0,
				zIndex: 20,
				display: "flex",
				flexDirection: "column",
				justifyContent: fullscreen ? "flex-start" : "flex-end",
			}}
		>
			<button
				aria-label="닫기"
				onClick={step === "form" ? onCancel : undefined}
				style={{
					position: "absolute",
					inset: 0,
					border: "none",
					background: "var(--overlay-scrim)",
					opacity: fullscreen ? 0 : 1,
					transition: "opacity var(--dur-base)",
					cursor: "pointer",
				}}
				type="button"
			/>
			<div
				style={{
					position: "relative",
					background: "var(--surface-page)",
					borderRadius: fullscreen ? 0 : "24px 24px 0 0",
					height: fullscreen ? "100%" : "auto",
					maxHeight: fullscreen ? "100%" : "86%",
					display: "flex",
					flexDirection: "column",
					boxShadow: "0 -8px 40px rgba(0,0,0,0.18)",
					animation: "bambiSheetUp var(--dur-base) var(--ease-out)",
				}}
			>
				{fullscreen ? (
					<div
						style={{
							display: "flex",
							alignItems: "center",
							gap: 8,
							padding: "8px 8px",
							borderBottom: "1px solid var(--border-subtle)",
						}}
					>
						<button
							aria-label="닫기"
							onClick={step === "form" ? onCancel : onClose}
							style={{
								width: 40,
								height: 40,
								borderRadius: 12,
								border: "none",
								background: "var(--surface-subtle)",
								cursor: "pointer",
								display: "inline-flex",
								alignItems: "center",
								justifyContent: "center",
								color: "var(--text-strong)",
							}}
							type="button"
						>
							<span style={{ width: 22, height: 22, display: "inline-flex" }}>
								<ChevronLeftIcon />
							</span>
						</button>
						<span
							style={{
								fontFamily: "var(--font-sans)",
								fontSize: 16,
								fontWeight: 700,
								color: "var(--text-strong)",
							}}
						>
							{company} 신고
						</span>
					</div>
				) : (
					<div
						style={{
							display: "flex",
							justifyContent: "center",
							padding: "10px 0 2px",
						}}
					>
						<div
							style={{
								width: 40,
								height: 4,
								borderRadius: 2,
								background: "var(--border-strong)",
							}}
						/>
					</div>
				)}
				<div
					style={{
						flex: 1,
						minHeight: 0,
						overflowY: "auto",
						padding: fullscreen ? "20px 24px 24px" : "12px 24px 24px",
						display: "flex",
						flexDirection: "column",
						justifyContent:
							fullscreen && step === "done" ? "center" : "flex-start",
					}}
				>
					{step === "form" ? (
						<ReportForm onCancel={onCancel} onSubmit={onSubmit} tone={tone} />
					) : (
						<ReportDone onClose={onClose} />
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
		<div
			style={{
				flex: 1,
				minHeight: 0,
				display: "flex",
				flexDirection: "column",
				background: "var(--surface-subtle)",
				position: "relative",
			}}
		>
			<div
				style={{
					background: "var(--surface-page)",
					borderBottom: "1px solid var(--border-subtle)",
				}}
			>
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
				ref={scrollRef}
				style={{
					flex: 1,
					minHeight: 0,
					overflowY: "auto",
					padding: "16px 18px",
					display: "flex",
					flexDirection: "column",
					gap: 10,
				}}
			>
				{hidden ? (
					<div style={{ margin: "auto", textAlign: "center", padding: 24 }}>
						<div
							style={{
								width: 56,
								height: 56,
								margin: "0 auto 12px",
								borderRadius: 18,
								background: "var(--surface-sunken)",
								display: "flex",
								alignItems: "center",
								justifyContent: "center",
								color: "var(--text-muted)",
							}}
						>
							<span style={{ width: 26, height: 26, display: "inline-flex" }}>
								<LockIcon />
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
							신고 후 이 채팅을 숨겼어요
						</div>
						<p
							style={{
								margin: "6px auto 0",
								maxWidth: 240,
								fontFamily: "var(--font-sans)",
								fontSize: 12.5,
								lineHeight: 1.5,
								color: "var(--text-muted)",
							}}
						>
							운영팀이 검토 중이에요. 조치가 끝나면 알림으로 알려드려요.
						</p>
					</div>
				) : (
					<>
						<div
							style={{
								alignSelf: "center",
								padding: "5px 12px",
								borderRadius: 999,
								background: "var(--surface-sunken)",
								fontFamily: "var(--font-sans)",
								fontSize: 11,
								fontWeight: 600,
								color: "var(--text-muted)",
							}}
						>
							오늘
						</div>
						<div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
							<Avatar name={company} size="sm" square />
							<ChatBubble>
								안녕하세요! 공고 보고 연락드려요 😊 혹시 주말 근무 가능하실까요?
							</ChatBubble>
						</div>
						<ChatBubble mine read time="오후 2:14">
							네 안녕하세요, 가능합니다! 면접은 언제쯤 볼 수 있을까요?
						</ChatBubble>
						<div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
							<Avatar name={company} size="sm" square />
							<ChatBubble>
								좋아요. 이번 주 수요일 저녁 가능하시면 일정 잡아드릴게요.
							</ChatBubble>
						</div>
						{sched !== "none" && (
							<div style={{ alignSelf: "stretch", margin: "4px 0" }}>
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
							<div
								style={{
									alignSelf: "center",
									textAlign: "center",
									padding: "10px 14px",
									margin: "2px 0 4px",
									maxWidth: 280,
								}}
							>
								<Badge dot tone="success">
									면접 일정 확정
								</Badge>
								<p
									style={{
										margin: "8px 0 0",
										fontFamily: "var(--font-sans)",
										fontSize: 12,
										lineHeight: 1.5,
										color: "var(--text-muted)",
									}}
								>
									양쪽이 동의하면 연락처가 공개돼요.
								</p>
							</div>
						)}
						{report === "form" && reportMode === "inline" ? (
							<div
								style={{
									alignSelf: "stretch",
									margin: "4px 0",
									padding: 16,
									borderRadius: 16,
									background: "var(--surface-card)",
									border: "1px solid var(--red-500)",
									boxShadow: "var(--shadow-md)",
								}}
							>
								<div
									style={{
										display: "flex",
										alignItems: "center",
										gap: 8,
										marginBottom: 12,
									}}
								>
									<span
										style={{
											width: 18,
											height: 18,
											display: "inline-flex",
											color: "var(--red-600)",
										}}
									>
										<AlertCircle />
									</span>
									<span
										style={{
											fontFamily: "var(--font-sans)",
											fontSize: 14,
											fontWeight: 800,
											color: "var(--text-strong)",
										}}
									>
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
							<div
								style={{
									alignSelf: "stretch",
									margin: "4px 0",
									padding: 18,
									borderRadius: 16,
									background: "var(--surface-card)",
									border: "1px solid var(--border-subtle)",
									boxShadow: "var(--shadow-md)",
								}}
							>
								<ReportDone compact onClose={closeReport} />
							</div>
						) : null}
					</>
				)}
			</div>

			{!hidden && (
				<div
					style={{
						background: "var(--surface-page)",
						borderTop: "1px solid var(--border-subtle)",
						padding: "10px 16px 6px",
					}}
				>
					{sched === "confirmed" ? (
						<Button block onClick={onReveal} size="lg" variant="primary">
							연락처 공개하기
						</Button>
					) : (
						<div style={{ display: "flex", alignItems: "center", gap: 10 }}>
							<button
								aria-label="일정 제안"
								onClick={() => setSched("proposed")}
								style={{
									width: 44,
									height: 44,
									flex: "0 0 44px",
									borderRadius: 14,
									border: "none",
									cursor: "pointer",
									background: "var(--color-primary-soft)",
									color: "var(--color-primary-press)",
									display: "inline-flex",
									alignItems: "center",
									justifyContent: "center",
								}}
								type="button"
							>
								<span style={{ width: 22, height: 22, display: "inline-flex" }}>
									<PlusIcon />
								</span>
							</button>
							<div
								style={{
									flex: 1,
									height: 44,
									padding: "0 16px",
									borderRadius: 999,
									background: "var(--surface-subtle)",
									display: "flex",
									alignItems: "center",
								}}
							>
								<input
									aria-label="메시지를 입력하세요"
									placeholder="메시지를 입력하세요"
									style={{
										flex: 1,
										border: "none",
										outline: "none",
										background: "transparent",
										fontFamily: "var(--font-sans)",
										fontSize: 14,
										color: "var(--text-strong)",
									}}
								/>
							</div>
							<button
								onClick={() => setSched("proposed")}
								style={{
									height: 38,
									padding: "0 16px",
									borderRadius: 999,
									border: "none",
									cursor: "pointer",
									background: "var(--color-primary)",
									color: "#fff",
									fontFamily: "var(--font-sans)",
									fontSize: 13,
									fontWeight: 700,
									whiteSpace: "nowrap",
									boxShadow: "var(--shadow-primary)",
								}}
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

export function SeekerMe() {
	const rows = [
		{ icon: <ClipboardListIcon />, label: "내 신고 내역", meta: "0건" },
		{ icon: <ClockIcon />, label: "예정된 면접", meta: "1건" },
		{ icon: <LockIcon />, label: "차단한 상대", meta: "0명" },
		{ icon: <SettingsIcon />, label: "계정 설정", meta: "" },
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
					내 정보
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
					<Avatar name="김하늘" ring size="lg" />
					<div style={{ flex: 1 }}>
						<div
							style={{
								fontFamily: "var(--font-sans)",
								fontSize: 18,
								fontWeight: 800,
								color: "#fff",
							}}
						>
							김하늘
						</div>
						<div
							style={{
								fontFamily: "var(--font-sans)",
								fontSize: 13,
								color: "var(--text-on-dark-muted)",
								marginTop: 2,
							}}
						>
							구직자 · 강남 활동
						</div>
					</div>
					<Badge tone="primary">인증완료</Badge>
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

const CHAT_PREVIEWS = [
	{
		jobId: "j1",
		last: "네 안녕하세요, 가능합니다! 면접은 언제쯤 볼 수 있을까요?",
		time: "오후 2:14",
		unread: 1,
	},
	{
		jobId: "j3",
		last: "좋아요. 이번 주 수요일 저녁 가능하시면 일정 잡아드릴게요.",
		time: "어제",
		unread: 0,
	},
	{
		jobId: "j4",
		last: "지원 감사합니다. 확인 후 채팅으로 안내드릴게요.",
		time: "2일 전",
		unread: 0,
	},
];

export function SeekerChats({ onOpen }: { onOpen: (jobId: string) => void }) {
	const rows = CHAT_PREVIEWS.map((c) => ({
		...c,
		job: JOBS.find((j) => j.id === c.jobId),
	})).filter((c) => c.job);
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
					채팅
				</h1>
			</div>
			<div
				style={{
					flex: 1,
					minHeight: 0,
					overflowY: "auto",
					padding: "10px 16px 16px",
					display: "flex",
					flexDirection: "column",
					gap: 2,
				}}
			>
				{rows.map((c) => (
					<button
						key={c.jobId}
						onClick={() => onOpen(c.jobId)}
						style={{
							display: "flex",
							alignItems: "center",
							gap: 12,
							padding: "12px 8px",
							border: "none",
							background: "transparent",
							cursor: "pointer",
							textAlign: "left",
							borderRadius: 14,
						}}
						type="button"
					>
						<Avatar name={c.job?.company} size="lg" square />
						<div style={{ flex: 1, minWidth: 0 }}>
							<div
								style={{
									display: "flex",
									alignItems: "baseline",
									justifyContent: "space-between",
									gap: 8,
								}}
							>
								<span
									style={{
										fontFamily: "var(--font-sans)",
										fontSize: 15,
										fontWeight: 700,
										color: "var(--text-strong)",
										whiteSpace: "nowrap",
										overflow: "hidden",
										textOverflow: "ellipsis",
									}}
								>
									{c.job?.company}
								</span>
								<span
									style={{
										flex: "0 0 auto",
										fontFamily: "var(--font-sans)",
										fontSize: 11.5,
										color: "var(--text-subtle)",
									}}
								>
									{c.time}
								</span>
							</div>
							<div
								style={{
									display: "flex",
									alignItems: "center",
									gap: 8,
									marginTop: 3,
								}}
							>
								<span
									style={{
										flex: 1,
										minWidth: 0,
										fontFamily: "var(--font-sans)",
										fontSize: 13,
										color: "var(--text-muted)",
										whiteSpace: "nowrap",
										overflow: "hidden",
										textOverflow: "ellipsis",
									}}
								>
									{c.last}
								</span>
								{c.unread ? (
									<span
										style={{
											flex: "0 0 auto",
											minWidth: 18,
											height: 18,
											padding: "0 5px",
											borderRadius: 999,
											background: "var(--coral-500)",
											color: "#fff",
											fontFamily: "var(--font-sans)",
											fontSize: 11,
											fontWeight: 700,
											display: "inline-flex",
											alignItems: "center",
											justifyContent: "center",
										}}
									>
										{c.unread}
									</span>
								) : null}
							</div>
						</div>
					</button>
				))}
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
		screen = (
			<SeekerHome
				onChatJob={(j) => push("chat", { job: j })}
				onOpenJob={(j) => push("detail", { job: j })}
				tone={tone}
			/>
		);
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
						badges={{ chat: 1 }}
						items={navItems}
						onChange={(v) => {
							if (v === "chat") {
								push("chat", { job: JOBS[0] });
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
