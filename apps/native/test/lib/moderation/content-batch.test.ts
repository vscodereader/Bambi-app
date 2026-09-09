import { expect, it, vi } from "vitest";
import { runContentBatch } from "../../../src/lib/moderation/content-batch";

it("retains only failed targets and deduplicates destructive requests", async () => {
	const request = vi.fn((id: string) => {
		if (id === "bad") {
			return Promise.reject(new Error("권한 없음"));
		}
		return Promise.resolve();
	});
	expect(await runContentBatch(["ok", "bad", "ok"], request)).toEqual({
		succeeded: 1,
		failed: ["bad"],
		errors: ["권한 없음"],
	});
	expect(request).toHaveBeenCalledTimes(2);
});
it("includes synchronous failure without losing the other results", async () => {
	const result = await runContentBatch(["bad", "ok"], (id) => {
		if (id === "bad") {
			throw new Error("삭제 불가");
		}
		return Promise.resolve();
	});
	expect(result.succeeded).toBe(1);
	expect(result.failed).toEqual(["bad"]);
});
it("does not repeat successful targets when retrying failures", async () => {
	const request = vi
		.fn()
		.mockResolvedValueOnce({})
		.mockRejectedValueOnce(new Error("network"))
		.mockResolvedValueOnce({});
	const first = await runContentBatch(["a", "b"], request);
	await runContentBatch(first.failed, request);
	expect(request.mock.calls.map(([id]) => id)).toEqual(["a", "b", "b"]);
});
