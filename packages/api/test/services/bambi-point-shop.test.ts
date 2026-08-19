import { describe, expect, it, vi } from "vitest";
import {
	acquirePointShopUserLock,
	POINT_SHOP_LOCK_NAMESPACE,
	resolveOrderTransition,
	resolvePurchase,
} from "../../src/services/bambi-point-shop";

describe("resolvePurchase", () => {
	it("잔액이 가격 이상이고 노출 중이면 허용한다", () => {
		expect(
			resolvePurchase({ balance: 100, isActive: true, pricePoints: 100 })
		).toEqual({ ok: true });
	});
	it("비노출 아이템은 잔액과 무관하게 거부한다", () => {
		expect(
			resolvePurchase({ balance: 999, isActive: false, pricePoints: 10 })
		).toEqual({ code: "inactive", ok: false });
	});
	it("잔액 부족이면 거부한다", () => {
		expect(
			resolvePurchase({ balance: 99, isActive: true, pricePoints: 100 })
		).toEqual({ code: "insufficient", ok: false });
	});
});

describe("resolveOrderTransition", () => {
	it("pending → complete는 환불 없이 completed", () => {
		expect(resolveOrderTransition("pending", "complete")).toEqual({
			next: "completed",
			refund: false,
		});
	});
	it("pending → cancel은 환불 동반 canceled", () => {
		expect(resolveOrderTransition("pending", "cancel")).toEqual({
			next: "canceled",
			refund: true,
		});
	});
	it("이미 처리된 주문은 재전이를 거부한다(멱등 가드)", () => {
		expect(resolveOrderTransition("completed", "cancel")).toBeNull();
		expect(resolveOrderTransition("canceled", "complete")).toBeNull();
	});
});

describe("acquirePointShopUserLock", () => {
	it("네임스페이스+사용자 해시 2-인자 advisory lock SQL을 실행한다", async () => {
		const execute = vi.fn().mockResolvedValue(undefined);
		await acquirePointShopUserLock({ execute }, "user-1");
		expect(execute).toHaveBeenCalledTimes(1);
		const [call] = execute.mock.calls;
		const sqlText = JSON.stringify(call?.[0]);
		expect(sqlText).toContain("pg_advisory_xact_lock");
		expect(sqlText).toContain("hashtext");
		expect(sqlText).toContain(String(POINT_SHOP_LOCK_NAMESPACE));
	});
});
