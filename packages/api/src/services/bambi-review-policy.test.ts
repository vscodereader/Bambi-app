import { describe, expect, it } from "vitest";

import { validateReviewInput } from "./bambi-review-policy";

const VALID_BODY =
	"면접 일정과 근무 조건 안내가 명확했고, 실제 현장 분위기도 공고 내용과 크게 다르지 않았어요.";

describe("bambi review policy", () => {
	it("publishes a clean review with a valid rating and body", () => {
		expect(
			validateReviewInput({
				body: VALID_BODY,
				rating: 5,
			})
		).toEqual({
			ok: true,
			riskFlags: [],
			status: "published",
		});
	});

	it("rejects ratings outside the 1 to 5 integer range", () => {
		expect(
			validateReviewInput({
				body: VALID_BODY,
				rating: 0,
			})
		).toEqual({ code: "invalid_rating", ok: false });

		expect(
			validateReviewInput({
				body: VALID_BODY,
				rating: 4.5,
			})
		).toEqual({ code: "invalid_rating", ok: false });
	});

	it("rejects bodies shorter than 20 characters", () => {
		expect(
			validateReviewInput({
				body: "좋았어요",
				rating: 4,
			})
		).toEqual({ code: "body_too_short", minLength: 20, ok: false });
	});

	it("routes phone numbers to review", () => {
		expect(
			validateReviewInput({
				body: `${VALID_BODY} 연락은 010-1234-5678로 하라고 안내받았어요.`,
				rating: 3,
			})
		).toEqual({
			ok: true,
			riskFlags: ["phone_number"],
			status: "pending_review",
		});
	});

	it("routes external messenger IDs to review", () => {
		expect(
			validateReviewInput({
				body: `${VALID_BODY} 이후 카톡 아이디로 다시 연락하라는 안내가 있었어요.`,
				rating: 3,
			})
		).toEqual({
			ok: true,
			riskFlags: ["external_messenger"],
			status: "pending_review",
		});
	});
});
