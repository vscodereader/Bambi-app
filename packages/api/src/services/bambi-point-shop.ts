import type { db } from "@bambi-app/db";
import { sql } from "drizzle-orm";

// pg_advisory_xact_lock(int4, int4) 네임스페이스 키. 프리미엄(918_273_645)·리스팅
// (918_273_646·647)과 겹치지 않는 다음 값. 두 번째 인자는 hashtext(user_id) — 잔액이
// 원장 합산이라 FOR UPDATE를 걸 단일 행이 없어 계정 단위로 구매를 직렬화한다
// (attendance.ts adminAdjustPoints 주석이 예고한 "자동 차감" 케이스가 이것이다).
export const POINT_SHOP_LOCK_NAMESPACE = 918_273_648;

type QueryExecutor = Pick<typeof db, "execute">;

// xact 스코프라 반드시 트랜잭션 안에서 호출해야 커밋 시 해제된다(정원 락과 동일 패턴).
export const acquirePointShopUserLock = async (
	executor: QueryExecutor,
	userId: string
): Promise<void> => {
	await executor.execute(
		sql`select pg_advisory_xact_lock(${POINT_SHOP_LOCK_NAMESPACE}, hashtext(${userId}))`
	);
};

// 구매 가능 역할 허용 목록(attendance와 같은 화이트리스트 관례 — 새 역할은 기본 거부).
export const POINT_SHOP_PURCHASE_ROLES = new Set<string>([
	"job_seeker",
	"employer",
]);

export type PurchaseDenial = "inactive" | "insufficient";

// 순수: 아이템 노출 상태·잔액으로 구매 가부 판정.
export function resolvePurchase(args: {
	balance: number;
	isActive: boolean;
	pricePoints: number;
}): { ok: true } | { code: PurchaseDenial; ok: false } {
	if (!args.isActive) {
		return { code: "inactive", ok: false };
	}
	if (args.balance < args.pricePoints) {
		return { code: "insufficient", ok: false };
	}
	return { ok: true };
}

export const POINT_SHOP_ORDER_STATUSES = [
	"pending",
	"completed",
	"canceled",
] as const;
export type PointShopOrderStatus = (typeof POINT_SHOP_ORDER_STATUSES)[number];

// 순수: 주문 전이 가드 — pending에서만 완료/취소 가능. 취소는 환불 원장(+)을 동반한다.
// pending이 아니면 null(멱등 — 완료↔취소 재전이 금지).
export function resolveOrderTransition(
	current: string,
	action: "cancel" | "complete"
): { next: PointShopOrderStatus; refund: boolean } | null {
	if (current !== "pending") {
		return null;
	}
	if (action === "complete") {
		return { next: "completed", refund: false };
	}
	return { next: "canceled", refund: true };
}
