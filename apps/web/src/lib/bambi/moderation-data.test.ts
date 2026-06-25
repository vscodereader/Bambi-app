import { describe, expect, it } from "vitest";
import { getVisibleModerationData } from "./moderation-data";

describe("getVisibleModerationData", () => {
	it("uses empty API data instead of falling back to preview data", () => {
		const result = getVisibleModerationData({
			apiData: [],
			hasApiData: true,
			previewData: [{ id: "preview" }],
		});

		expect(result).toEqual([]);
	});

	it("uses an empty list when the API query succeeded without array data", () => {
		const result = getVisibleModerationData({
			apiData: undefined,
			hasApiData: true,
			previewData: [{ id: "preview" }],
		});

		expect(result).toEqual([]);
	});

	it("falls back to preview data before the API returns", () => {
		const previewData = [{ id: "preview" }];

		const result = getVisibleModerationData({
			apiData: undefined,
			hasApiData: false,
			previewData,
		});

		expect(result).toBe(previewData);
	});
});
