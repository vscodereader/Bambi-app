export type BambiRole = "job_seeker" | "employer" | "admin";

// 역할별 기본 홈 경로. 현재 pathname에 의존하지 않으므로 "이미 그 경로에 있는데 또 그
// 경로로 보내는" 무한 리다이렉트가 구조적으로 발생하지 않는다. 미검증 구인자도 /employer로
// 보낸다 — /employer 레이아웃이 승인 대기 화면을 인라인으로 렌더하므로 별도 /employer/pending
// 경로로 보내 루프에 빠질 일이 없다.
export const homePathForRole = (role: BambiRole): string => {
	if (role === "admin") {
		return "/moderator";
	}
	if (role === "employer") {
		return "/employer";
	}
	return "/seeker";
};
