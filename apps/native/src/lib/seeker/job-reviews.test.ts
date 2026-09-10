import { describe, expect, it } from "vitest";
import { mergeReviewPages, reviewStars } from "./job-reviews";

describe("job reviews", () => {
	it("페이지 사이 중복 후기를 한 번만 남긴다", () => {
		expect(
			mergeReviewPages([
				{ items: [{ id: "a" }, { id: "b" }] },
				{ items: [{ id: "b" }, { id: "c" }] },
			]).map((item) => item.id)
		).toEqual(["a", "b", "c"]);
	});
	it("별점을 5칸으로 표시한다", () => {
		expect(reviewStars(3)).toBe("★★★☆☆");
	});
});
