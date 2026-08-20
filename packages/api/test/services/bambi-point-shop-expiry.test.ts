import { describe, expect, it } from "vitest";
import { selectExpiringCandidates } from "../../src/services/bambi-point-shop-expiry";

describe("selectExpiringCandidates", () => {
	const now = new Date("2026-08-19T00:00:00Z");

	it("owned·미알림·3일 이내 미래만 남긴다", () => {
		const rows = [
			{
				expiryNotifiedAt: null,
				id: "keep",
				itemName: "A",
				status: "owned",
				usableUntil: new Date("2026-08-21T00:00:00Z"),
				userId: "u1",
			},
			{
				expiryNotifiedAt: now,
				id: "sent",
				itemName: "B",
				status: "owned",
				usableUntil: new Date("2026-08-21T00:00:00Z"),
				userId: "u1",
			},
			{
				expiryNotifiedAt: null,
				id: "past",
				itemName: "C",
				status: "owned",
				usableUntil: new Date("2026-08-18T00:00:00Z"),
				userId: "u1",
			},
			{
				expiryNotifiedAt: null,
				id: "used",
				itemName: "D",
				status: "used",
				usableUntil: new Date("2026-08-21T00:00:00Z"),
				userId: "u1",
			},
		];
		expect(selectExpiringCandidates(rows, now).map((r) => r.id)).toEqual([
			"keep",
		]);
	});
});
