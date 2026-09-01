import { describe, expect, it } from "vitest";

import {
	canRespondToInterview,
	interviewStatusLabel,
	interviewStatusTone,
} from "./me-interviews";

describe("interviewStatusLabel", () => {
	it("면접 상태 enum 5종을 모두 한국어 라벨로 덮는다", () => {
		expect(
			["proposed", "confirmed", "declined", "canceled", "completed"].map(
				interviewStatusLabel
			)
		).toEqual(["제안됨", "확정", "거절", "취소", "완료"]);
	});

	it("모르는 값은 원값 대신 폴백 문구를 낸다", () => {
		expect(interviewStatusLabel("rescheduled")).toBe("상태 미확인");
	});
});

describe("interviewStatusTone", () => {
	it("제안=warning, 확정=success, 나머지는 neutral", () => {
		expect(interviewStatusTone("proposed")).toBe("warning");
		expect(interviewStatusTone("confirmed")).toBe("success");
		expect(interviewStatusTone("declined")).toBe("neutral");
		expect(interviewStatusTone("completed")).toBe("neutral");
	});
});

describe("canRespondToInterview", () => {
	const proposedByMe = { proposedByUserId: "me", status: "proposed" };
	const proposedByThem = { proposedByUserId: "them", status: "proposed" };

	it("내가 제안한 건은 내가 수락·거절하지 못한다", () => {
		expect(canRespondToInterview(proposedByMe, "me")).toBe(false);
	});

	it("상대가 제안한 proposed 건만 응답할 수 있다", () => {
		expect(canRespondToInterview(proposedByThem, "me")).toBe(true);
	});

	it("이미 확정·완료된 건과 세션 미확정 상태에서는 응답 버튼을 막는다", () => {
		expect(
			canRespondToInterview(
				{ proposedByUserId: "them", status: "confirmed" },
				"me"
			)
		).toBe(false);
		expect(
			canRespondToInterview(
				{ proposedByUserId: "them", status: "completed" },
				"me"
			)
		).toBe(false);
		expect(canRespondToInterview(proposedByThem, undefined)).toBe(false);
	});
});
