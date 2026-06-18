"use client";

// 밤비 — 연락처 공개 (양측 동의 게이트).

import { useState } from "react";
import type { Job } from "@/lib/bambi/types";
import { AppBar, Avatar, Badge, Button, Card, Switch } from "../ds";
import { CheckIcon, CopyIcon, PhoneIcon } from "../icons";

export function ContactReveal({
	job,
	onBack,
	onDone,
}: {
	job?: Job;
	onBack: () => void;
	onDone: () => void;
}) {
	const [agree, setAgree] = useState(false);
	const revealed = agree;
	const company = job ? job.company : "달밤 라운지";
	return (
		<div
			style={{
				flex: 1,
				minHeight: 0,
				display: "flex",
				flexDirection: "column",
			}}
		>
			<AppBar onBack={onBack} title="연락처 공개" />
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
						padding: "8px 0 4px",
						textAlign: "center",
					}}
				>
					<div
						style={{
							width: 64,
							height: 64,
							borderRadius: 20,
							background: "var(--status-success-bg)",
							display: "flex",
							alignItems: "center",
							justifyContent: "center",
							color: "var(--status-success-fg)",
						}}
					>
						<span style={{ width: 30, height: 30, display: "inline-flex" }}>
							<CheckIcon />
						</span>
					</div>
					<h1
						style={{
							margin: "4px 0 0",
							fontFamily: "var(--font-display)",
							fontSize: 22,
							fontWeight: 800,
							color: "var(--text-strong)",
						}}
					>
						면접 일정이 확정됐어요
					</h1>
					<p
						style={{
							margin: 0,
							fontFamily: "var(--font-sans)",
							fontSize: 14,
							lineHeight: 1.55,
							color: "var(--text-muted)",
							maxWidth: 280,
						}}
					>
						양쪽 모두 동의해야 연락처가 공개됩니다. 안전을 위해 면접 확정 후에만
						열려요.
					</p>
				</div>
				<Card pad="none" style={{ overflow: "hidden" }}>
					<div
						style={{
							display: "flex",
							alignItems: "center",
							justifyContent: "space-between",
							padding: 16,
						}}
					>
						<div style={{ display: "flex", alignItems: "center", gap: 12 }}>
							<Avatar name={company} square />
							<div style={{ display: "flex", flexDirection: "column" }}>
								<span
									style={{
										fontFamily: "var(--font-sans)",
										fontSize: 15,
										fontWeight: 700,
										color: "var(--text-strong)",
									}}
								>
									{company}
								</span>
								<span
									style={{
										fontFamily: "var(--font-sans)",
										fontSize: 12,
										color: "var(--text-muted)",
									}}
								>
									구인자
								</span>
							</div>
						</div>
						<Badge dot tone="success">
							동의함
						</Badge>
					</div>
					<div style={{ height: 1, background: "var(--border-subtle)" }} />
					<div
						style={{
							display: "flex",
							alignItems: "center",
							justifyContent: "space-between",
							padding: 16,
						}}
					>
						<div style={{ display: "flex", alignItems: "center", gap: 12 }}>
							<Avatar name="김하늘" />
							<div style={{ display: "flex", flexDirection: "column" }}>
								<span
									style={{
										fontFamily: "var(--font-sans)",
										fontSize: 15,
										fontWeight: 700,
										color: "var(--text-strong)",
									}}
								>
									나
								</span>
								<span
									style={{
										fontFamily: "var(--font-sans)",
										fontSize: 12,
										color: "var(--text-muted)",
									}}
								>
									구직자
								</span>
							</div>
						</div>
						<Switch checked={agree} onChange={setAgree} />
					</div>
				</Card>
				{revealed ? (
					<Card style={{ display: "flex", flexDirection: "column", gap: 14 }}>
						<span
							style={{
								fontFamily: "var(--font-sans)",
								fontSize: 12,
								fontWeight: 700,
								letterSpacing: "0.04em",
								textTransform: "uppercase",
								color: "var(--text-subtle)",
							}}
						>
							공개된 연락처
						</span>
						<div style={{ display: "flex", alignItems: "center", gap: 12 }}>
							<div
								style={{
									width: 44,
									height: 44,
									borderRadius: 12,
									background: "var(--color-primary-soft)",
									color: "var(--color-primary-press)",
									display: "inline-flex",
									alignItems: "center",
									justifyContent: "center",
								}}
							>
								<span style={{ width: 22, height: 22, display: "inline-flex" }}>
									<PhoneIcon />
								</span>
							</div>
							<div style={{ display: "flex", flexDirection: "column" }}>
								<span
									style={{
										fontFamily: "var(--font-sans)",
										fontSize: 12,
										color: "var(--text-muted)",
									}}
								>
									{company}
								</span>
								<span
									style={{
										fontFamily: "var(--font-sans)",
										fontSize: 18,
										fontWeight: 800,
										color: "var(--text-strong)",
									}}
								>
									010-2840-1188
								</span>
							</div>
						</div>
						<Button block leftIcon={<CopyIcon />} size="md" variant="soft">
							번호 복사
						</Button>
					</Card>
				) : (
					<div
						style={{
							padding: 16,
							borderRadius: 16,
							background: "var(--surface-subtle)",
							textAlign: "center",
							fontFamily: "var(--font-sans)",
							fontSize: 13,
							color: "var(--text-muted)",
							lineHeight: 1.5,
						}}
					>
						동의하면 상대방의 연락처가 여기에 표시됩니다.
					</div>
				)}
			</div>
			<div
				style={{
					padding: "12px 24px 6px",
					borderTop: "1px solid var(--border-subtle)",
				}}
			>
				<Button
					block
					disabled={!revealed}
					onClick={onDone}
					size="lg"
					variant={revealed ? "primary" : "secondary"}
				>
					완료
				</Button>
			</div>
		</div>
	);
}
