import { ORPCError } from "@orpc/server";
import { describe, expect, it } from "vitest";

import { executeBulkModeration } from "@/services/bambi-moderation-bulk";

const expectOrpcCode = async (
	promise: Promise<unknown>,
	code: string
): Promise<void> => {
	await expect(promise).rejects.toMatchObject({ code });
};

describe("bambi moderation bulk service", () => {
	it("rejects empty target id arrays", async () => {
		await expectOrpcCode(
			executeBulkModeration({
				processTarget: () => Promise.resolve(),
				targetIds: [],
			}),
			"BAD_REQUEST"
		);
	});

	it("rejects requests over the bulk target limit", async () => {
		await expectOrpcCode(
			executeBulkModeration({
				processTarget: () => Promise.resolve(),
				targetIds: Array.from({ length: 51 }, (_, index) => `target-${index}`),
			}),
			"BAD_REQUEST"
		);
	});

	it("returns an itemized result for mixed successes and failures", async () => {
		const result = await executeBulkModeration({
			processTarget: (targetId) => {
				if (targetId === "missing") {
					throw new ORPCError("NOT_FOUND", {
						message: "Target was not found.",
					});
				}

				if (targetId === "broken") {
					throw new Error("Unexpected write failure.");
				}

				return Promise.resolve();
			},
			targetIds: ["ok", "missing", "broken"],
		});

		expect(result).toEqual({
			failed: 2,
			failures: [
				{
					code: "NOT_FOUND",
					message: "Target was not found.",
					targetId: "missing",
				},
				{
					code: "INTERNAL_SERVER_ERROR",
					message: "Unexpected write failure.",
					targetId: "broken",
				},
			],
			succeeded: 1,
			total: 3,
		});
	});
});
