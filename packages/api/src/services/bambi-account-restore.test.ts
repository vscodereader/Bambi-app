import { describe, expect, it } from "vitest";

import {
	ACCOUNT_RESTORE_BLOCK_MESSAGES,
	resolveAccountRestoreDecision,
} from "./bambi-account-restore";

const WITHDRAWN_AT = new Date("2026-07-01T00:00:00Z");
const PURGED_AT = new Date("2026-08-01T00:00:00Z");

describe("resolveAccountRestoreDecision", () => {
	it("보존기간 안의 탈퇴 계정은 복구할 수 있다", () => {
		expect(
			resolveAccountRestoreDecision({
				deletedAt: WITHDRAWN_AT,
				purgedAt: null,
			})
		).toEqual({ canRestore: true });
	});

	it("탈퇴하지 않은 계정은 복구 대상이 아니다", () => {
		expect(
			resolveAccountRestoreDecision({ deletedAt: null, purgedAt: null })
		).toEqual({
			canRestore: false,
			message: ACCOUNT_RESTORE_BLOCK_MESSAGES.already_active,
			reason: "already_active",
		});
	});

	it("파기가 끝난 계정은 복구할 수 없다", () => {
		expect(
			resolveAccountRestoreDecision({
				deletedAt: WITHDRAWN_AT,
				purgedAt: PURGED_AT,
			})
		).toEqual({
			canRestore: false,
			message: ACCOUNT_RESTORE_BLOCK_MESSAGES.purged,
			reason: "purged",
		});
	});

	it("파기 판정이 탈퇴 판정보다 앞선다 — 파기 계정도 deletedAt이 남아 있다", () => {
		const decision = resolveAccountRestoreDecision({
			deletedAt: null,
			purgedAt: PURGED_AT,
		});
		expect(decision.canRestore).toBe(false);
		expect(decision.canRestore === false && decision.reason).toBe("purged");
	});

	it("undefined(컬럼 미선택)는 값 없음과 같게 다룬다", () => {
		expect(
			resolveAccountRestoreDecision({
				deletedAt: undefined,
				purgedAt: undefined,
			}).canRestore
		).toBe(false);
	});
});
