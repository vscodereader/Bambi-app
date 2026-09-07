import type { db } from "@bambi-app/db";
import { sql } from "drizzle-orm";

// 순수 판정·상수는 bambi-point-shop-rules.ts가 정본이다(native가 그 파일을 직접 import해야
// 해서 drizzle이 RN 번들에 딸려 가지 않게 갈랐다). 여기에는 db가 필요한 것만 남기고,
// 기존 소비처의 import 경로를 유지하기 위해 순수 심볼을 그대로 재수출한다.
// biome-ignore lint/performance/noBarrelFile: 정본(bambi-point-shop-rules) 분리에 따른 경로 호환용 재수출.
export {
	audienceAllowsRole,
	benefitTypeToBoostOptionType,
	buildBoostPurchaseValues,
	type CancelDenial,
	type ItemSpecError,
	isExpiringSoon,
	isItemSoldOut,
	isJobPostUsableForBenefit,
	isUsableBenefit,
	type OwnedUsageDenial,
	POINT_SHOP_AUDIENCES,
	POINT_SHOP_BENEFIT_TYPES,
	POINT_SHOP_ORDER_STATUSES,
	POINT_SHOP_PURCHASE_ROLES,
	type PointShopAudience,
	type PointShopBenefitType,
	type PointShopOrderStatus,
	type PurchaseDenial,
	resolveOrderCancellation,
	resolveOrderTransition,
	resolveOwnedUsage,
	resolvePurchase,
	shouldRestoreItemStock,
	validateItemBenefitSpec,
} from "./bambi-point-shop-rules";

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

// 조건부 원자 차감. RETURNING 행이 있으면 성공, 없으면 품절(잔여 0). read-then-write 금지.
export const decrementItemStock = async (
	executor: QueryExecutor,
	itemId: string
): Promise<boolean> => {
	const result = await executor.execute(
		sql`update bambi_point_shop_item
			set stock_quantity = stock_quantity - 1
			where id = ${itemId} and stock_quantity > 0
			returning stock_quantity`
	);
	return (result as { rows: unknown[] }).rows.length > 0;
};

// 취소·환불 시 복원. 무제한(null) 아이템엔 no-op.
export const restoreItemStock = async (
	executor: QueryExecutor,
	itemId: string
): Promise<void> => {
	await executor.execute(
		sql`update bambi_point_shop_item
			set stock_quantity = stock_quantity + 1
			where id = ${itemId} and stock_quantity is not null`
	);
};

// 광고 연장 원자 갱신 — read-modify-write 금지. exposure_ends_at 없는 공고는 갱신 안 함.
export const extendJobPostExposureAtomic = async (
	executor: QueryExecutor,
	jobPostId: string,
	days: number
): Promise<Date | null> => {
	const result = await executor.execute(
		sql`update job_post
			set exposure_ends_at = exposure_ends_at + make_interval(days => ${days})
			where id = ${jobPostId} and exposure_ends_at is not null
			returning exposure_ends_at`
	);
	const [row] = (result as unknown as { rows: { exposure_ends_at: Date }[] })
		.rows;
	return row ? row.exposure_ends_at : null;
};

// 만료 임박 알림 각인(멱등). 이미 발송됐으면 0행 → false.
export const markOrderExpiryNotified = async (
	executor: QueryExecutor,
	orderId: string
): Promise<boolean> => {
	const result = await executor.execute(
		sql`update bambi_point_shop_order
			set expiry_notified_at = now()
			where id = ${orderId} and expiry_notified_at is null
			returning id`
	);
	return (result as { rows: unknown[] }).rows.length > 0;
};
