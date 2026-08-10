// 역할별 사용자 매뉴얼(/manual)의 키·라벨·경로·열람 범위 단일 진실원.
// 원본 문서는 docs/manual/<key>-manual.md — 로딩은 manual-content.ts가 담당한다.
import type { Route } from "next";
import type { BambiRole } from "./home-path";

export const MANUAL_KEYS = ["seeker", "employer", "moderator"] as const;

export type ManualKey = (typeof MANUAL_KEYS)[number];

export const MANUAL_LABELS: Record<ManualKey, string> = {
	seeker: "구직자 가이드",
	employer: "구인자 가이드",
	moderator: "운영자 매뉴얼",
};

// app/manual/page.tsx가 생겼으므로 실재하는 경로다. 캐스트 대신 타입 주석으로 둔다
// (Next 16의 Route는 string & {}라 리터럴을 그대로 받는다). manualPath 쪽은
// 템플릿 리터럴이라 추론이 넓은 string이 되어 캐스트를 유지한다.
export const MANUAL_PATH: Route = "/manual";

export const manualPath = (key: ManualKey): Route => `/manual/${key}` as Route;

// 열람 범위는 위계형이다(설계 확정): 구인자는 구직자 흐름(지원자 응대)을 알아야 하고,
// 운영자는 전 화면을 관리하므로 전부 본다. 법률자문은 구직자 화면을 쓰는 역할이라 구직자와 같다.
export const manualKeysForRole = (role: BambiRole): ManualKey[] => {
	if (role === "admin") {
		return ["seeker", "employer", "moderator"];
	}
	if (role === "employer") {
		return ["seeker", "employer"];
	}
	return ["seeker"];
};

// /manual 인덱스 진입 시 보낼 자기 역할의 기본 매뉴얼.
export const defaultManualKeyForRole = (role: BambiRole): ManualKey => {
	if (role === "admin") {
		return "moderator";
	}
	if (role === "employer") {
		return "employer";
	}
	return "seeker";
};
