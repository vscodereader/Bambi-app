import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { srcPath } from "../../src-path";

const source = (path: string): string => readFileSync(srcPath(path), "utf8");

describe("테스트 사이트 계정 제재·운영자 채팅·페이지네이션 QA", () => {
	it("이용정지 회원의 수다방 안내를 일반 자격 안내보다 우선한다", () => {
		const homeCommunity = source("components/bambi/home-community-section.tsx");
		const communityGate = source(
			"components/bambi/require-community-access.tsx"
		);

		expect(homeCommunity).toContain("차단된 유저는 확인이 불가합니다");
		expect(homeCommunity).toContain('accountStatus === "suspended"');
		expect(communityGate).toContain("차단된 유저는 확인이 불가합니다");
		expect(communityGate).toContain('accountStatus === "suspended"');
	});

	it("공용 페이지 이동에 호출부별 총 페이지 수를 표시한다", () => {
		const pageControls = source("components/bambi/page-controls.tsx");

		expect(pageControls).toContain(
			"const safePageCount = Math.max(pageCount, 1)"
		);
		expect(pageControls).toContain("/ {safePageCount}");
		expect(pageControls).toContain('<span className="sr-only">페이지</span>');
	});

	it("사용자 제재 이력을 서버에서 5개씩 페이지 조회한다", () => {
		const moderator = source("components/bambi/screens/moderator.tsx");

		expect(moderator).toContain("USER_MODERATION_HISTORY_PAGE_SIZE = 5");
		expect(moderator).toContain("listUserModerationActions.queryOptions");
		expect(moderator).toContain("Math.ceil(totalCount");
		expect(moderator).toContain("<PageControls");
	});

	it("운영자 채팅 내역에 탈퇴 참가자 배지를 표시한다", () => {
		const chatHistory = source("app/moderator/chats/chat-history-dialog.tsx");
		const moderator = source("components/bambi/screens/moderator.tsx");

		expect(chatHistory).toContain("employerWithdrawn");
		expect(chatHistory).toContain("jobSeekerWithdrawn");
		expect(chatHistory).toContain('<Badge variant="outline">탈퇴</Badge>');
		expect(moderator).toContain('roomStatusLabel = "탈퇴"');
	});

	it("사용자 제재와 경고 되돌리기 확인창은 현재 viewport에 고정한다", () => {
		const moderator = source("components/bambi/screens/moderator.tsx");
		const userSanctionCall = moderator.slice(
			moderator.indexOf("reasonFieldId={`user-sanction-reason-") - 500,
			moderator.indexOf("reasonFieldId={`user-sanction-reason-") + 200
		);
		const revertWarningCall = moderator.slice(
			moderator.indexOf('reasonFieldId="revert-warning-reason"') - 500,
			moderator.indexOf('reasonFieldId="revert-warning-reason"') + 200
		);

		expect(userSanctionCall).toContain('positioning="fixed"');
		expect(revertWarningCall).toContain('positioning="fixed"');
		expect(moderator).toContain("max-h-[calc(100dvh-2rem)]");
	});

	it("이용정지 구인자의 등록 진입점과 직접 URL을 차단한다", () => {
		const employerHome = source("app/employer/page.tsx");
		const employerNew = source("app/employer/new/page.tsx");
		const employerNav = source("components/bambi/persona-nav.tsx");
		const responsiveShell = source("components/bambi/responsive-shell.tsx");

		expect(employerHome).toContain('accountStatus !== "suspended"');
		expect(employerNew).toContain('profile.status === "suspended"');
		expect(employerNew).toContain("이용정지된 계정입니다");
		expect(employerNav).toContain("disabled: isRegistrationDisabled");
		expect(responsiveShell).toContain("isDisabledEmployerRegistration");
	});
});
