import { describe, expect, it, vi } from "vitest";
import { createFollowupAction } from "../../../src/lib/moderation/followup-action";

describe("moderation partial success", () => {
	it("retries only report resolution after the sanction succeeds", async () => {
		const action = createFollowupAction();
		const primary = vi.fn().mockResolvedValue({});
		const followup = vi
			.fn()
			.mockRejectedValueOnce(new Error("network"))
			.mockResolvedValue(true);
		const onPrimaryDone = vi.fn();
		await expect(
			action.run({ primary, followup, onPrimaryDone })
		).rejects.toThrow("network");
		expect(await action.run({ primary, followup, onPrimaryDone })).toBe(true);
		expect(primary).toHaveBeenCalledTimes(1);
		expect(onPrimaryDone).toHaveBeenCalledTimes(1);
		expect(followup).toHaveBeenCalledTimes(2);
	});
	it("does not resolve a report if its primary action failed", async () => {
		const action = createFollowupAction();
		const primary = vi
			.fn()
			.mockRejectedValueOnce(new Error("forbidden"))
			.mockResolvedValue({});
		const followup = vi.fn().mockResolvedValue(true);
		const onPrimaryDone = vi.fn();
		await expect(
			action.run({ primary, followup, onPrimaryDone })
		).rejects.toThrow("forbidden");
		expect(followup).not.toHaveBeenCalled();
		await action.run({ primary, followup, onPrimaryDone });
		expect(primary).toHaveBeenCalledTimes(2);
	});
	it("keeps different reports independent", async () => {
		const primary = vi.fn().mockResolvedValue({});
		const followup = vi.fn().mockResolvedValue(true);
		const onPrimaryDone = vi.fn();
		await createFollowupAction().run({ primary, followup, onPrimaryDone });
		await createFollowupAction().run({ primary, followup, onPrimaryDone });
		expect(primary).toHaveBeenCalledTimes(2);
	});
});
