// 밤비 — 신뢰·안전 콘텐츠 스캐너
// 밤비는 합법적인 유흥·접객 채용만 다루고, 불법 성매매·강요·미성년·우회 표현을 금지한다.
// 스캐너는 공고/메시지 초안마다 실행되는 집행 코어다.
//
// 세 가지 심각도가 "혼합(hybrid)" 검수 모델에 매핑된다.
//   block  → 명백한 불법. 제출 거부.
//   review → 모호/우회 신호. 허용하되 사람 검수로 라우팅.
//   ok     → 깨끗 → 자동 게시.

import type {
	Finding,
	ModerationModel,
	ScanRule,
	Severity,
	Verdict,
} from "./types";

// 각 규칙: 매칭 단어(소문자, 부분 일치), 카테고리, 심각도, 사유, 작성자용 수정 힌트.
const RULES: ScanRule[] = [
	{
		cat: "minor",
		label: "미성년 관련",
		sev: "block",
		terms: [
			"미성년",
			"고등학생",
			"고딩",
			"교복",
			"중학생",
			"10대",
			"청소년",
			"어린 친구",
			"어린친구",
		],
		reason: "미성년자 고용·암시는 어떤 경우에도 등록할 수 없어요.",
		hint: "연령 조건은 '만 19세 이상'으로만 표기해 주세요.",
	},
	{
		cat: "prostitution",
		label: "성매매·성적 서비스",
		sev: "block",
		terms: ["성매매", "조건만남", "성관계", "유사성행위", "풀싸롱", "안마방"],
		reason: "성적 서비스·성매매를 직접 명시한 공고는 등록이 금지돼요.",
		hint: "합법적인 접객·홀·관리 업무 내용만 적어 주세요.",
	},
	{
		cat: "prostitution_euph",
		label: "성적 서비스 암시",
		sev: "review",
		terms: ["2차", "이차", "3차", "스폰", "애프터", "조건", "텐프로", "노콘"],
		reason: "성적 서비스를 우회·암시하는 표현으로 보여 검수가 필요해요.",
		hint: "업무 범위를 오해 없이 구체적으로 적으면 검수가 빨라져요.",
	},
	{
		cat: "coercion",
		label: "강요·착취 신호",
		sev: "review",
		terms: [
			"선불",
			"마이킹",
			"보증금",
			"위약금",
			"여권 보관",
			"여권보관",
			"감금",
			"강제",
		],
		reason: "선불금·위약금 등 강요·착취로 이어질 수 있는 조건이 감지됐어요.",
		hint: "금전 조건은 급여 항목에만, 페널티 없이 적어 주세요.",
	},
	{
		cat: "external",
		label: "외부 연락 유도",
		sev: "review",
		terms: [
			"카톡",
			"카카오",
			"텔레",
			"오픈채팅",
			"오픈톡",
			"라인 아이디",
			"라인아이디",
			"디엠",
			"dm",
		],
		reason:
			"연락처는 면접 확정·양측 동의 후에만 공개돼요. 외부 유도는 검수 대상이에요.",
		hint: "밤비 채팅 안에서 대화하면 안전하게 면접까지 진행돼요.",
	},
];

// 전화번호 패턴 → 외부 우회 (review)
const PHONE_RE = /01[016789][-.\s]?\d{3,4}[-.\s]?\d{4}/g;

export function sevRank(s: Severity): number {
	if (s === "block") {
		return 3;
	}
	if (s === "review") {
		return 2;
	}
	if (s === "warn") {
		return 1;
	}
	return 0;
}

export function scan(text: string): Finding[] {
	const findings: Finding[] = [];
	if (!text) {
		return findings;
	}
	const lower = text.toLowerCase();
	for (const rule of RULES) {
		for (const term of rule.terms) {
			const t = term.toLowerCase();
			let from = 0;
			let i = lower.indexOf(t, from);
			while (i !== -1) {
				findings.push({
					start: i,
					end: i + term.length,
					match: text.slice(i, i + term.length),
					cat: rule.cat,
					label: rule.label,
					sev: rule.sev,
					reason: rule.reason,
					hint: rule.hint,
				});
				from = i + term.length;
				i = lower.indexOf(t, from);
			}
		}
	}
	for (const m of text.matchAll(PHONE_RE)) {
		const idx = m.index ?? 0;
		findings.push({
			start: idx,
			end: idx + m[0].length,
			match: m[0],
			cat: "external",
			label: "연락처 직접 노출",
			sev: "review",
			reason:
				"전화번호 직접 노출은 동의 전 연락처 공개에 해당해 검수 대상이에요.",
			hint: "번호는 면접 확정 후 '연락처 공개' 단계에서 자동으로 교환돼요.",
		});
	}
	// 겹침 정리: 가장 높은 심각도 우선, 먼저 시작한 것 우선
	findings.sort((a, b) => a.start - b.start || sevRank(b.sev) - sevRank(a.sev));
	const out: Finding[] = [];
	let lastEnd = -1;
	for (const f of findings) {
		if (f.start >= lastEnd) {
			out.push(f);
			lastEnd = f.end;
		}
	}
	return out;
}

// 활성 검수 모델 기준의 종합 판정.
export function verdict(findings: Finding[], model: ModerationModel): Verdict {
	const hasBlock = findings.some((f) => f.sev === "block");
	const hasReview = findings.some((f) => f.sev === "review");
	if (hasBlock) {
		return { state: "block", findings };
	}
	if (model === "post") {
		return { state: "publish", findings }; // 사후: 바로 게시
	}
	if (model === "pre") {
		return { state: "review", findings }; // 사전: 항상 검수
	}
	// hybrid: 깨끗하면 게시, 위험 신호면 검수
	return hasReview
		? { state: "review", findings }
		: { state: "publish", findings };
}

export { RULES };
