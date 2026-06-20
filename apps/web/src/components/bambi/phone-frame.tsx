"use client";

// 밤비 UI 키트 — 아이폰 프레임, 상태바, 홈 인디케이터.

import type { CSSProperties, ReactNode } from "react";

type Tone = "light" | "dark";

function StatusBar({ tone = "dark" }: { tone?: Tone }) {
	const fg = tone === "light" ? "#fff" : "var(--ink-900)";
	return (
		<div
			style={{
				height: 44,
				padding: "0 26px",
				display: "flex",
				alignItems: "center",
				justifyContent: "space-between",
				flex: "0 0 44px",
			}}
		>
			<span
				style={{
					fontFamily: "var(--font-sans)",
					fontSize: 15,
					fontWeight: 700,
					color: fg,
					letterSpacing: "-0.02em",
				}}
			>
				9:41
			</span>
			<div style={{ display: "flex", alignItems: "center", gap: 6, color: fg }}>
				<svg
					aria-hidden="true"
					fill="none"
					height="11"
					viewBox="0 0 18 11"
					width="18"
				>
					<rect fill="currentColor" height="5" rx="1" width="3" x="0" y="6" />
					<rect fill="currentColor" height="7" rx="1" width="3" x="5" y="4" />
					<rect fill="currentColor" height="9" rx="1" width="3" x="10" y="2" />
					<rect
						fill="currentColor"
						height="11"
						opacity="0.4"
						rx="1"
						width="3"
						x="15"
						y="0"
					/>
				</svg>
				<svg
					aria-hidden="true"
					fill="none"
					height="11"
					viewBox="0 0 16 11"
					width="16"
				>
					<path
						d="M8 2.2c2.1 0 4 .8 5.4 2.1l1.3-1.3A9.4 9.4 0 0 0 8 .3C5.4.3 3 1.3 1.3 3l1.3 1.3A7.5 7.5 0 0 1 8 2.2Z"
						fill="currentColor"
					/>
					<path
						d="M8 5.6c1.2 0 2.3.5 3.1 1.2l1.3-1.3A6.6 6.6 0 0 0 8 3.7c-1.6 0-3 .6-4.1 1.6l1.3 1.3A4.7 4.7 0 0 1 8 5.6Z"
						fill="currentColor"
					/>
					<path
						d="M8 9.9 9.8 8a2.6 2.6 0 0 0-3.6 0L8 9.9Z"
						fill="currentColor"
					/>
				</svg>
				<svg
					aria-hidden="true"
					fill="none"
					height="12"
					viewBox="0 0 26 12"
					width="26"
				>
					<rect
						height="10.4"
						rx="3"
						stroke="currentColor"
						strokeOpacity="0.4"
						width="21"
						x="0.5"
						y="0.8"
					/>
					<rect
						fill="currentColor"
						height="7.4"
						rx="1.6"
						width="18"
						x="2"
						y="2.3"
					/>
					<rect
						fill="currentColor"
						height="4"
						opacity="0.5"
						rx="0.8"
						width="1.6"
						x="23"
						y="4"
					/>
				</svg>
			</div>
		</div>
	);
}

function HomeIndicator({ tone = "dark" }: { tone?: Tone }) {
	return (
		<div
			style={{
				height: 28,
				display: "flex",
				alignItems: "center",
				justifyContent: "center",
				flex: "0 0 28px",
			}}
		>
			<div
				style={{
					width: 134,
					height: 5,
					borderRadius: 3,
					background:
						tone === "light" ? "rgba(255,255,255,0.85)" : "var(--ink-900)",
				}}
			/>
		</div>
	);
}

interface PhoneFrameProps {
	bg?: string;
	children?: ReactNode;
	indicatorTone?: Tone;
	statusTone?: Tone;
}

export function PhoneFrame({
	children,
	statusTone = "dark",
	indicatorTone = "dark",
	bg = "var(--surface-page)",
}: PhoneFrameProps) {
	const frameStyle: CSSProperties = {
		width: 375,
		height: 812,
		position: "relative",
		background: bg,
		borderRadius: 0,
		overflow: "hidden",
		display: "flex",
		flexDirection: "column",
	};
	return (
		<div className="bambi-phone" style={frameStyle}>
			<StatusBar tone={statusTone} />
			<div
				style={{
					flex: 1,
					minHeight: 0,
					display: "flex",
					flexDirection: "column",
					position: "relative",
				}}
			>
				{children}
			</div>
			<HomeIndicator tone={indicatorTone} />
		</div>
	);
}
