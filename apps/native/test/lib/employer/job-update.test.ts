import { describe, expect, it } from "vitest";

import type { NativeJobPostInput } from "@/src/lib/bambi-native";
import type { JobMediaUploadItem } from "@/src/lib/employer/job-media";
import {
	buildJobUpdateData,
	type EditableMediaItem,
	toInitialMedia,
} from "@/src/lib/employer/job-update";

const banner = (storageKey: string): JobMediaUploadItem => ({
	altText: "",
	byteSize: 10,
	fileName: "b.gif",
	mimeType: "image/gif",
	storageKey,
});

const adSource = {
	adProductId: "ad1",
	exposureAmount: 50_000,
	exposureDurationDays: 30,
	paymentMethod: "card" as const,
};

const base: NativeJobPostInput = {
	description: "충분히 긴 상세 설명",
	industryCategory: "BAR",
	organizationId: "o1",
	payAmount: 12_000,
	payUnit: "시급",
	regionCode: "1111000000",
	title: "공고",
	workSchedule: "주 5일",
};

describe("buildJobUpdateData", () => {
	it("광고가 없는 공고(adProductId null)는 입력을 그대로 둔다", () => {
		const result = buildJobUpdateData(base, {
			adProductId: null,
			exposureAmount: null,
			exposureDurationDays: null,
			paymentMethod: null,
		});

		expect(result.adProductId).toBeUndefined();
		expect(result).toEqual(base);
	});

	it("광고가 붙은 공고는 광고 4필드를 패스스루한다", () => {
		const result = buildJobUpdateData(base, {
			adProductId: "ad1",
			exposureAmount: 50_000,
			exposureDurationDays: 30,
			paymentMethod: "card",
		});

		expect(result.adProductId).toBe("ad1");
		expect(result.exposureDurationDays).toBe(30);
		expect(result.exposureAmount).toBe(50_000);
		expect(result.paymentMethod).toBe("card");
		// 표준 필드는 보존
		expect(result.title).toBe("공고");
	});

	it("배너(가로·세로)가 있으면 media에 실어 보존한다(GIF mime 유지)", () => {
		const result = buildJobUpdateData(
			{ ...base, media: { detail: [] } },
			adSource,
			{ adHorizontal: banner("h"), adVertical: banner("v") }
		);

		expect(result.media?.adHorizontal?.storageKey).toBe("h");
		expect(result.media?.adVertical?.storageKey).toBe("v");
		expect(result.media?.adHorizontal?.mimeType).toBe("image/gif");
	});

	it("배너가 없으면 media에 배너 키를 넣지 않는다", () => {
		const result = buildJobUpdateData(
			{ ...base, media: { detail: [] } },
			adSource,
			{ adHorizontal: null, adVertical: null }
		);

		expect(result.media && "adHorizontal" in result.media).toBe(false);
		expect(result.media && "adVertical" in result.media).toBe(false);
	});
});

const editableItem = (
	overrides: Partial<EditableMediaItem> & { storageKey: string }
): EditableMediaItem => ({
	altText: null,
	byteSize: 100,
	fileName: `${overrides.storageKey}.jpg`,
	height: 800,
	mimeType: "image/jpeg",
	sliceGroupId: null,
	sliceIndex: null,
	width: 600,
	...overrides,
});

const hasNoNullValue = (item: Record<string, unknown>): boolean =>
	Object.values(item).every((value) => value !== null);

describe("toInitialMedia → buildJobUpdateData 왕복", () => {
	// getEditableById 형태: 커버 + 2조각 detail 그룹 + 조각 메타 없는 detail + 배너 가로·세로.
	const editableMedia = {
		adHorizontal: editableItem({ fileName: "h.gif", storageKey: "banner-h" }),
		adVertical: editableItem({ fileName: "v.gif", storageKey: "banner-v" }),
		cover: editableItem({ storageKey: "cover-1" }),
		detail: [
			editableItem({
				sliceGroupId: "grp",
				sliceIndex: 0,
				storageKey: "d-slice-0",
			}),
			editableItem({
				sliceGroupId: "grp",
				sliceIndex: 1,
				storageKey: "d-slice-1",
			}),
			editableItem({ storageKey: "d-single" }),
		],
	};

	it("커버·조각 메타·배너를 보존하고 null 키를 남기지 않는다", () => {
		const { banners, cover, detail, previews } = toInitialMedia(
			editableMedia,
			"https://cdn.example.com/"
		);

		const input: NativeJobPostInput = {
			...base,
			media: { cover: cover ?? undefined, detail },
		};
		const result = buildJobUpdateData(input, adSource, banners);
		const media = result.media;

		// 커버 보존
		expect(media?.cover?.storageKey).toBe("cover-1");

		// detail 3행 모두 + 조각 메타 보존
		const rows = media?.detail ?? [];
		expect(rows.map((row) => row.storageKey)).toEqual([
			"d-slice-0",
			"d-slice-1",
			"d-single",
		]);
		expect(rows[0].sliceGroupId).toBe("grp");
		expect(rows[0].sliceIndex).toBe(0);
		expect(rows[1].sliceIndex).toBe(1);
		// 조각 아님 → 슬라이스 키 자체가 없다(null 아님, 생략)
		expect("sliceGroupId" in rows[2]).toBe(false);
		expect("sliceIndex" in rows[2]).toBe(false);

		// 배너 보존
		expect(media?.adHorizontal?.storageKey).toBe("banner-h");
		expect(media?.adVertical?.storageKey).toBe("banner-v");

		// null 값을 실은 키가 없다(altText null→"", 슬라이스 null→생략)
		const items: (JobMediaUploadItem | undefined)[] = [
			media?.cover,
			media?.adHorizontal,
			media?.adVertical,
			...rows,
		];
		for (const item of items) {
			expect(item).toBeDefined();
			expect(hasNoNullValue(item as unknown as Record<string, unknown>)).toBe(
				true
			);
		}
		expect((media?.cover as JobMediaUploadItem).altText).toBe("");

		// 미리보기는 base URL + storageKey로 조립된다(env 미주입 시 폴백은 화면이 처리)
		expect(previews["cover-1"]).toBe("https://cdn.example.com/cover-1");
	});
});
