import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
	buildIndexNowRequest,
	communityPostPingPaths,
	jobLandingPingPaths,
	pingCommunityPost,
	pingIndexNow,
} from "@/services/bambi-indexnow";

describe("jobLandingPingPaths", () => {
	it("지역·업종이 모두 있으면 인덱스+지역+지역×업종 3경로", () => {
		expect(
			jobLandingPingPaths({
				industryCategory: "룸싸롱",
				regionCode: "1100000000",
			})
		).toEqual(["/jobs", "/jobs/seoul", "/jobs/seoul/room-salon"]);
	});

	it("지역만 있으면 인덱스+지역 2경로(업종 세그먼트 없음)", () => {
		expect(
			jobLandingPingPaths({ industryCategory: null, regionCode: "2600000000" })
		).toEqual(["/jobs", "/jobs/busan"]);
	});

	it("지역이 없거나 랜딩 표에 없는 코드면 인덱스만", () => {
		expect(
			jobLandingPingPaths({ industryCategory: "BAR", regionCode: null })
		).toEqual(["/jobs"]);
		expect(
			jobLandingPingPaths({
				industryCategory: "BAR",
				regionCode: "9999999999",
			})
		).toEqual(["/jobs"]);
	});

	it("지역은 있으나 업종이 표에 없으면 지역까지만", () => {
		expect(
			jobLandingPingPaths({
				industryCategory: "없는업종",
				regionCode: "5000000000",
			})
		).toEqual(["/jobs", "/jobs/jeju"]);
	});
});

describe("communityPostPingPaths", () => {
	it("공개 게시판은 글 상세+목록(슬러그 변환: work_talk→work-talk)", () => {
		expect(
			communityPostPingPaths({ board: "work_talk", postId: "p1" })
		).toEqual(["/board/work-talk/p1", "/board/work-talk"]);
		expect(communityPostPingPaths({ board: "free", postId: "p2" })).toEqual([
			"/board/free/p2",
			"/board/free",
		]);
	});

	it("비공개 게시판(secret·legal·market 등)은 빈 배열(핑 안 함)", () => {
		expect(communityPostPingPaths({ board: "legal", postId: "p3" })).toEqual(
			[]
		);
		expect(communityPostPingPaths({ board: "secret", postId: "p4" })).toEqual(
			[]
		);
	});
});

describe("buildIndexNowRequest (no-op 가드)", () => {
	const base = "https://bambialba.com";

	it("키가 없으면 null(no-op)", () => {
		expect(
			buildIndexNowRequest({ base, key: undefined, paths: ["/jobs"] })
		).toBeNull();
		expect(
			buildIndexNowRequest({ base, key: "", paths: ["/jobs"] })
		).toBeNull();
	});

	it("대상 경로가 없으면 null(no-op)", () => {
		expect(buildIndexNowRequest({ base, key: "abc", paths: [] })).toBeNull();
	});

	it("host·key·keyLocation·절대 urlList를 담은 페이로드를 만든다", () => {
		const request = buildIndexNowRequest({
			base,
			key: "abc123",
			paths: ["/jobs", "/jobs/seoul"],
		});
		expect(request).not.toBeNull();
		const payload = JSON.parse(request?.body ?? "{}");
		expect(payload).toEqual({
			host: "bambialba.com",
			key: "abc123",
			keyLocation: "https://bambialba.com/abc123.txt",
			urlList: [
				"https://bambialba.com/jobs",
				"https://bambialba.com/jobs/seoul",
			],
		});
	});

	it("중복 경로는 urlList에서 제거한다", () => {
		const request = buildIndexNowRequest({
			base: "https://bambialba.com/",
			key: "k",
			paths: ["/jobs", "/jobs"],
		});
		const payload = JSON.parse(request?.body ?? "{}");
		expect(payload.urlList).toEqual(["https://bambialba.com/jobs"]);
	});
});

describe("실발송 가드(pingIndexNow·pingCommunityPost)", () => {
	const originalEnv = process.env;

	beforeEach(() => {
		process.env = {
			...originalEnv,
			CORS_ORIGIN: "https://bambialba.com",
			INDEXNOW_KEY: "k",
		};
		vi.stubGlobal(
			"fetch",
			vi.fn(() => Promise.resolve({ ok: true }))
		);
	});

	afterEach(() => {
		process.env = originalEnv;
		vi.unstubAllGlobals();
	});

	it("production이 아니면 키·경로가 있어도 fetch를 호출하지 않는다", () => {
		process.env.NODE_ENV = "test";
		pingIndexNow(["/jobs"]);
		expect(fetch).not.toHaveBeenCalled();
	});

	it("production이면 키·경로가 있을 때 fetch를 1회 호출한다", () => {
		process.env.NODE_ENV = "production";
		pingIndexNow(["/jobs"]);
		expect(fetch).toHaveBeenCalledTimes(1);
	});

	it("잠금 글은 production이어도 핑하지 않는다(공개 URL이 없음)", () => {
		process.env.NODE_ENV = "production";
		pingCommunityPost({ board: "free", id: "p1", isLocked: true });
		expect(fetch).not.toHaveBeenCalled();
	});

	it("공개 게시판 비잠금 글은 production에서 핑한다", () => {
		process.env.NODE_ENV = "production";
		pingCommunityPost({ board: "free", id: "p1", isLocked: false });
		expect(fetch).toHaveBeenCalledTimes(1);
	});
});
