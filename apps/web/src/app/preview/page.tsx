"use client";

// 밤비 — 신뢰·안전 흐름 디자인 프리뷰 스테이지.
// 페르소나(구직자/구인자/운영자)별 모바일 흐름을 디바이스 프레임 안에서 보여준다.
// (실제 서비스는 /seeker · /employer · /moderator 라우트에서 동작)

import { useEffect, useState } from "react";
import { PhoneFrame } from "@/components/bambi/phone-frame";
import { EmployerPersona } from "@/components/bambi/screens/employer";
import { ModeratorApp } from "@/components/bambi/screens/moderator";
import { SeekerPersona } from "@/components/bambi/screens/seeker";

// 데모 기본값 — 원본 프로토타입의 Tweaks 기본값에 해당.
const VISUAL_TONE = "calm" as const;
const REPORT_MODE = "sheet" as const;
const MODERATION_MODEL = "hybrid" as const;

type PersonaId = "seeker" | "employer" | "mod";

const PERSONAS: { id: PersonaId; label: string }[] = [
	{ id: "seeker", label: "구직자" },
	{ id: "employer", label: "구인자" },
	{ id: "mod", label: "운영자" },
];

const CAP_BY_PERSONA: Record<PersonaId, string> = {
	seeker: "탐색 → 상세 → 채팅 → 신고",
	employer: "공고 등록 → 실시간 콘텐츠 가드 → 검수/게시",
	mod: "검수 큐 → 신고 처리 → 사용자 제재",
};

export default function Preview() {
	const [persona, setPersona] = useState<PersonaId>("seeker");
	const [scale, setScale] = useState(1);

	useEffect(() => {
		const fit = () => {
			const margin = 36;
			const cw = 375;
			const ch = 812 + 70; // 폰 + 스위처 행
			const s = Math.min(
				1,
				(window.innerWidth - margin) / cw,
				(window.innerHeight - margin) / ch
			);
			setScale(s);
		};
		fit();
		window.addEventListener("resize", fit);
		return () => window.removeEventListener("resize", fit);
	}, []);

	let app: React.ReactNode;
	if (persona === "seeker") {
		app = <SeekerPersona reportMode={REPORT_MODE} tone={VISUAL_TONE} />;
	} else if (persona === "employer") {
		app = (
			<EmployerPersona moderationModel={MODERATION_MODEL} tone={VISUAL_TONE} />
		);
	} else {
		app = (
			<PhoneFrame indicatorTone="dark" statusTone="dark">
				<ModeratorApp tone={VISUAL_TONE} />
			</PhoneFrame>
		);
	}

	return (
		<main className="bambi-stage">
			<div
				style={{
					transform: `scale(${scale})`,
					transformOrigin: "center center",
					display: "flex",
					flexDirection: "column",
					alignItems: "center",
					gap: 18,
				}}
			>
				<div
					style={{
						display: "flex",
						flexDirection: "column",
						alignItems: "center",
						gap: 8,
					}}
				>
					<div className="persona-seg">
						{PERSONAS.map((pp) => (
							<button
								className={persona === pp.id ? "on" : ""}
								key={pp.id}
								onClick={() => setPersona(pp.id)}
								type="button"
							>
								<span className="pdot" />
								{pp.label}
							</button>
						))}
					</div>
					<span className="stage-cap">{CAP_BY_PERSONA[persona]}</span>
				</div>
				<div
					style={{
						width: 375,
						height: 812,
						background: "var(--surface-page)",
						borderRadius: 44,
						boxShadow:
							"0 40px 90px rgba(0,0,0,0.55), 0 0 0 10px #05080d, 0 0 0 11px rgba(255,255,255,0.06)",
						overflow: "hidden",
						position: "relative",
					}}
				>
					{app}
				</div>
			</div>
		</main>
	);
}
