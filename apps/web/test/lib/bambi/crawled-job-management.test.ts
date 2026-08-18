import { describe, expect, it } from "vitest";
import {
	crawledJobImageEditHref,
	crawledJobListHref,
	parseCrawledJobListState,
	withCrawledJobListState,
} from "@/lib/bambi/crawled-job-management";

describe("수집 공고 관리 목록 위치", () => {
	it("상태와 페이지를 읽고 잘못된 값은 기본값으로 정규화한다", () => {
		expect(
			parseCrawledJobListState(
				new URLSearchParams("jobStatus=active&jobPage=5")
			)
		).toEqual({ page: 5, status: "active" });
		expect(
			parseCrawledJobListState(
				new URLSearchParams("jobStatus=unknown&jobPage=-2")
			)
		).toEqual({ page: 1, status: "all" });
	});

	it("편집 링크와 복귀 링크에 같은 목록 위치를 담는다", () => {
		const state = { page: 5, status: "active" } as const;
		expect(crawledJobImageEditHref("post-id", state)).toBe(
			"/moderator/crawler/jobs/post-id/edit?returnPage=5&returnStatus=active"
		);
		expect(crawledJobListHref(state)).toBe(
			"/moderator/crawler?jobPage=5&jobStatus=active"
		);
	});

	it("목록 위치를 바꿀 때 다른 검색 조건을 보존한다", () => {
		expect(
			withCrawledJobListState(new URLSearchParams("keep=value"), {
				page: 3,
				status: "needs_review",
			})
		).toBe("?keep=value&jobPage=3&jobStatus=needs_review");
	});
});
