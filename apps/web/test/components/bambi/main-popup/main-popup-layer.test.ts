import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { srcPath } from "../../../src-path";

const source = readFileSync(
	srcPath("components/bambi/main-popup/main-popup-layer.tsx"),
	"utf8"
);
const managementSource = readFileSync(
	srcPath("components/bambi/main-popup/popup-management.tsx"),
	"utf8"
);
const coachmarkSource = readFileSync(
	srcPath("components/bambi/onboarding/coachmark.tsx"),
	"utf8"
);
const coachmarkRunnerSource = readFileSync(
	srcPath("components/bambi/onboarding/role-coachmark-runner.tsx"),
	"utf8"
);

describe("PC 다중 팝업 배치", () => {
	it("너비 초과 팝업을 다음 flex 행으로 내리지 않는다", () => {
		expect(source).not.toContain("flex-wrap content-start");
		expect(source).toContain("DesktopPopupStack");
	});

	it("팝업 개수와 무관하게 같은 계단 간격을 재귀적으로 누적한다", () => {
		expect(source).toContain("items.slice(1)");
		expect(source).toContain("pt-8 pl-8");
	});
});

describe("팝업 표시 시점", () => {
	it("로그인 이동 화면에서는 숨기고 목적 페이지 렌더링 뒤 표시한다", () => {
		expect(source).toContain('document.readyState === "complete"');
		expect(source).toContain("popupAuthTransitionStorageKey");
		expect(source).toContain("!authTransition");
		expect(source).toContain("window.requestAnimationFrame");
	});

	it("신규회원 코치마크가 끝날 때까지 메인 팝업을 숨긴다", () => {
		expect(source).toContain("COACHMARK_STATE_EVENT");
		expect(source).toContain("readCoachmarkIntent");
		expect(source).toContain("!coachmarkActive");
		expect(coachmarkRunnerSource).not.toContain(
			"setRect(measureTarget(target));\n\t\t\t\tclearCoachmarkIntent();"
		);
	});

	it("코치마크 설명창은 공용 Dialog 콘텐츠 배치를 재사용한다", () => {
		expect(coachmarkSource).toContain("dialogContentClassName");
		expect(coachmarkSource).toContain('className="fixed inset-0 z-50"');
		expect(coachmarkSource).toContain("text-ink-900/70");
		expect(coachmarkSource).not.toContain(
			'className="absolute inset-0 size-full text-ink-900"'
		);
	});

	it("spotlight는 실제 대상 버튼의 둥근 테두리를 따른다", () => {
		expect(coachmarkRunnerSource).toContain("borderTopLeftRadius");
		expect(coachmarkRunnerSource).toContain("resolveSpotlightTarget(target)");
		expect(coachmarkSource).toContain("rx={rect.borderRadius}");
		expect(coachmarkSource).toContain("ry={rect.borderRadius}");
	});
});

describe("팝업 운영자 라벨", () => {
	it("중복 단계 번호 없이 필드 이름만 표시한다", () => {
		expect(managementSource).toContain("게시 구분");
		expect(managementSource).toContain("링크 삽입 (밤비 내부 주소)");
		expect(managementSource).toContain("시작 일시 (KST)");
		expect(managementSource).not.toContain("5. 게시 구분");
		expect(managementSource).not.toContain("5. 링크 삽입");
		expect(managementSource).not.toContain("4. 시작 일시");
	});
});
