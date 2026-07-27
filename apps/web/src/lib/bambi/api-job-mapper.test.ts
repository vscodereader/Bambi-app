import { describe, expect, it } from "vitest";

// api-job-mapper는 @bambi-app/env/web를 import 시점에 검증한다. 테스트 러너에는 .env가
// 없으므로 동적 import 전에 최소 환경을 채운다(GCS base URL을 주면 URL이 샘플 폴백이 아니라
// 결정적 공개 URL이 돼 단언이 명확해진다).
process.env.NEXT_PUBLIC_SERVER_URL = "http://localhost:3000";
process.env.NEXT_PUBLIC_GCS_PUBLIC_BASE_URL = "https://cdn.bambi.test";

const { toAdBannerItem } = await import("./api-job-mapper");

const createMedia = (usage: string, storageKey: string) => ({
	altText: "",
	byteSize: 1024,
	fileName: `${usage}.png`,
	mimeType: "image/png",
	storageKey,
	usage,
});

const createBannerJob = (
	media: Partial<{
		adHorizontal: unknown;
		adVertical: unknown;
		coverImage: unknown;
	}>
) =>
	({
		id: "11111111-1111-4111-8111-111111111111",
		teamDisplayName: "배너 테스트 업체",
		title: "배너 공고",
		...media,
	}) as Parameters<typeof toAdBannerItem>[0];

describe("toAdBannerItem", () => {
	it("uses the uploaded horizontal banner for horizontal slots", () => {
		const item = toAdBannerItem(
			createBannerJob({
				adHorizontal: createMedia("ad_horizontal", "banner-h.png"),
				coverImage: createMedia("cover", "cover.png"),
			}),
			"ad_horizontal"
		);

		expect(item.imageUrl).toBe("https://cdn.bambi.test/banner-h.png");
	});

	it("uses the uploaded vertical banner for vertical slots", () => {
		const item = toAdBannerItem(
			createBannerJob({
				adHorizontal: createMedia("ad_horizontal", "banner-h.png"),
				adVertical: createMedia("ad_vertical", "banner-v.png"),
				coverImage: createMedia("cover", "cover.png"),
			}),
			"ad_vertical"
		);

		// 슬롯 규격이 4:9라 가로 배너를 잘못 집으면 광고가 찌그러진다 — 세로만 골라야 한다.
		expect(item.imageUrl).toBe("https://cdn.bambi.test/banner-v.png");
	});

	it("falls back to the cover image when no banner was uploaded", () => {
		const item = toAdBannerItem(
			createBannerJob({ coverImage: createMedia("cover", "cover.png") }),
			"ad_horizontal"
		);

		// 배너 업로드 전에 팔린 기존 공고도 슬롯이 비지 않아야 한다.
		expect(item.imageUrl).toBe("https://cdn.bambi.test/cover.png");
	});

	it("falls back to a deterministic sample cover when the job has no media", () => {
		const item = toAdBannerItem(createBannerJob({}), "ad_vertical");

		expect(item.imageUrl.length).toBeGreaterThan(0);
	});

	it("carries the layout through to both slots", () => {
		// 슬롯별로 잘라내지 않는다 — 렌더러가 슬롯을 보고 가로·세로 중 하나를 고른다.
		const layout = {
			horizontal: {
				background: { type: "image" as const },
				scrim: { enabled: true, opacity: 65 },
				texts: [
					{
						align: "center" as const,
						animation: "blur" as const,
						color: "#ffffff",
						content: "주말 알바 급구",
						fontSize: 8,
						id: "block-1",
						weight: "bold" as const,
						width: 60,
						x: 50,
						y: 50,
					},
				],
			},
			version: 1 as const,
			vertical: {
				background: { type: "image" as const },
				scrim: { enabled: true, opacity: 65 },
				texts: [],
			},
		};
		const job = { id: "job-1", layout, title: "홀서빙" };

		expect(toAdBannerItem(job, "ad_horizontal").layout).toEqual(layout);
		expect(toAdBannerItem(job, "ad_vertical").layout).toEqual(layout);
	});

	it("carries no layout for jobs that were never edited", () => {
		// 배너를 편집하지 않은 공고는 null이라 예전처럼 이미지만 나와야 한다.
		const item = toAdBannerItem(
			{ id: "job-1", title: "홀서빙" },
			"ad_horizontal"
		);

		expect(item.layout).toBeNull();
	});
});
