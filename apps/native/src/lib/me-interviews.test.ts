import { describe, expect, it } from "vitest";

import {
	canCancelInterview,
	canRespondToInterview,
	canSubmitReview,
	interviewStatusErrorMessage,
	interviewStatusLabel,
	interviewStatusTone,
	reviewBodyError,
	reviewErrorMessage,
	reviewStatusLabel,
	reviewStatusTone,
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

describe("canCancelInterview", () => {
	it("proposed·confirmed만 취소할 수 있다(제안자 여부와 무관)", () => {
		expect(
			["proposed", "confirmed", "declined", "canceled", "completed"].map(
				(status) => canCancelInterview({ status })
			)
		).toEqual([true, true, false, false, false]);
	});

	// 거절과 취소는 결과가 같아(둘 다 목록에서 사라지고 되돌릴 수 없다) 한 카드에 겹쳐
	// 내지 않는다 — 화면은 이 두 헬퍼의 AND NOT 조합으로 취소 버튼을 그린다.
	it("수락·거절이 가능한 카드에는 취소를 겹쳐 내지 않는다", () => {
		const proposedByThem = { proposedByUserId: "them", status: "proposed" };
		const proposedByMe = { proposedByUserId: "me", status: "proposed" };
		const confirmed = { proposedByUserId: "them", status: "confirmed" };
		const showsCancel = (interview: {
			proposedByUserId: string;
			status: string;
		}) =>
			canCancelInterview(interview) && !canRespondToInterview(interview, "me");

		expect(showsCancel(proposedByThem)).toBe(false);
		expect(showsCancel(proposedByMe)).toBe(true);
		expect(showsCancel(confirmed)).toBe(true);
	});
});

describe("interviewStatusErrorMessage", () => {
	it("oRPC 영어 기본 문구 대신 코드별 한국어를 낸다", () => {
		expect(
			interviewStatusErrorMessage({ code: "FORBIDDEN", message: "Forbidden" })
		).toBe(
			"지금은 처리할 수 없는 면접이에요. 상대가 먼저 상태를 바꿨을 수 있어요."
		);
		expect(
			interviewStatusErrorMessage({ code: "NOT_FOUND", message: "Not found" })
		).toBe("채팅방을 나가서 이 면접은 처리할 수 없어요.");
		expect(interviewStatusErrorMessage({ code: "CONFLICT" })).toBe(
			"면접 상태가 바뀌었어요. 목록을 새로고침했어요."
		);
	});

	it("FORBIDDEN 문구는 수락·거절 경로에도 쓰이므로 특정 동작을 지목하지 않는다", () => {
		expect(interviewStatusErrorMessage({ code: "FORBIDDEN" })).not.toContain(
			"취소"
		);
	});

	it("모르는 코드·코드 없음은 폴백", () => {
		expect(interviewStatusErrorMessage({ code: "TEAPOT" })).toBe(
			"잠시 후 다시 시도해 주세요."
		);
		expect(interviewStatusErrorMessage({})).toBe("잠시 후 다시 시도해 주세요.");
	});

	it("차단 사유가 실린 FORBIDDEN은 서버 한국어 문구를 그대로 살린다", () => {
		expect(
			interviewStatusErrorMessage({
				code: "FORBIDDEN",
				data: { chatBlockReason: "blocked_by_me" },
				message: "내가 차단한 상대예요.",
			})
		).toBe("내가 차단한 상대예요.");
	});
});

describe("reviewBodyError", () => {
	it("trim 기준 20자 미만은 막는다", () => {
		expect(reviewBodyError(`   ${"가".repeat(19)}   `)).toBe(
			"후기는 20자 이상 작성해 주세요."
		);
		expect(reviewBodyError("가".repeat(20))).toBeNull();
	});

	it("1000자 초과는 막는다", () => {
		expect(reviewBodyError("가".repeat(1000))).toBeNull();
		expect(reviewBodyError("가".repeat(1001))).toBe(
			"후기는 1000자 이하로 작성해 주세요."
		);
	});
});

describe("canSubmitReview", () => {
	const body = "가".repeat(20);

	it("별점 미선택(0)·범위 밖·소수는 막는다", () => {
		expect(canSubmitReview({ body, rating: 0 })).toBe(false);
		expect(canSubmitReview({ body, rating: 6 })).toBe(false);
		expect(canSubmitReview({ body, rating: 3.5 })).toBe(false);
	});

	it("본문이 짧으면 별점이 있어도 막는다", () => {
		expect(canSubmitReview({ body: "짧아요", rating: 5 })).toBe(false);
	});

	it("1~5 정수 별점 + 20자 이상 본문이면 통과", () => {
		expect(canSubmitReview({ body, rating: 1 })).toBe(true);
		expect(canSubmitReview({ body, rating: 5 })).toBe(true);
	});
});

describe("reviewErrorMessage", () => {
	it("CONFLICT는 채팅방이 아니라 공고 기준으로 안내한다(서버 중복 검사가 jobPostId 기준)", () => {
		expect(reviewErrorMessage("CONFLICT")).toBe(
			"이미 이 공고의 후기를 등록했어요."
		);
	});

	it("주요 코드와 폴백을 덮는다", () => {
		expect(reviewErrorMessage("BAD_REQUEST")).toBe(
			"별점과 후기 내용을 다시 확인해 주세요."
		);
		expect(reviewErrorMessage("FORBIDDEN")).toBe(
			"완료된 면접에만 후기를 남길 수 있어요."
		);
		expect(reviewErrorMessage("UNAUTHORIZED")).toBe(
			"로그인 후 다시 시도해 주세요."
		);
		expect(reviewErrorMessage("")).toBe(
			"후기를 등록하지 못했어요. 잠시 후 다시 시도해 주세요."
		);
	});
});

describe("reviewStatusLabel", () => {
	it("후기 상태 enum을 원값 대신 한국어로 낸다", () => {
		expect(reviewStatusLabel("pending_review")).toBe("검수 중");
		expect(reviewStatusLabel("published")).toBe("등록 완료");
		expect(reviewStatusLabel("hidden")).toBe("숨김 처리됨");
		expect(reviewStatusLabel("deleted")).toBe("상태 미확인");
		expect(reviewStatusTone("hidden")).toBe("danger");
		expect(reviewStatusTone("pending_review")).toBe("warning");
		expect(reviewStatusTone("published")).toBe("success");
		expect(reviewStatusTone("deleted")).toBe("neutral");
	});
});
