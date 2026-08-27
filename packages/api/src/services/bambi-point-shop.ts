import type { db } from "@bambi-app/db";
import { sql } from "drizzle-orm";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

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

export const POINT_SHOP_BENEFIT_TYPES = [
	"none",
	"coupon",
	"boost_manual_period",
	"boost_manual_count",
	"boost_auto_period",
	"ad_extend",
	"draw_ticket",
	"attendance_restore_ticket",
] as const;
export type PointShopBenefitType = (typeof POINT_SHOP_BENEFIT_TYPES)[number];

export const POINT_SHOP_QUANTITY_ITEM_BENEFIT_TYPES = [
	"draw_ticket",
	"attendance_restore_ticket",
] as const satisfies readonly PointShopBenefitType[];

export const POINT_SHOP_AUDIENCES = ["all", "employer", "job_seeker"] as const;
export type PointShopAudience = (typeof POINT_SHOP_AUDIENCES)[number];

export function audienceAllowsRole(
	audience: PointShopAudience,
	role: string
): boolean {
	if (audience === "all") {
		return true;
	}
	return audience === role;
}

export function isUsableBenefit(benefitType: PointShopBenefitType): boolean {
	return (
		benefitType === "boost_manual_period" ||
		benefitType === "boost_manual_count" ||
		benefitType === "boost_auto_period" ||
		benefitType === "ad_extend"
	);
}

export function isQuantityItemBenefit(
	benefitType: PointShopBenefitType
): benefitType is "attendance_restore_ticket" | "draw_ticket" {
	return POINT_SHOP_QUANTITY_ITEM_BENEFIT_TYPES.some(
		(quantityType) => quantityType === benefitType
	);
}

const isExpired = (usableUntil: Date | null, now: Date): boolean =>
	usableUntil !== null && usableUntil.getTime() <= now.getTime();

export type PurchaseDenial =
	| "audience"
	| "identity"
	| "inactive"
	| "insufficient"
	| "soldout";

// 순수: 노출>자격>본인인증(쿠폰)>품절>잔액 순으로 구매 가부 판정.
export function resolvePurchase(args: {
	audience: PointShopAudience;
	balance: number;
	benefitType: PointShopBenefitType;
	isActive: boolean;
	isPhoneVerified: boolean;
	pricePoints: number;
	role: string;
	soldOut: boolean;
}): { ok: true } | { code: PurchaseDenial; ok: false } {
	if (!args.isActive) {
		return { code: "inactive", ok: false };
	}
	if (!audienceAllowsRole(args.audience, args.role)) {
		return { code: "audience", ok: false };
	}
	// 혜택형(끌올·연장)은 공고를 가진 구인 주체만 사용할 수 있다. audience=all이라도 구직
	// 회원이 사면 사용 시점에 requireEmployerPostingAccess·공고 부재로 영원히 거부돼
	// 취소·환불 외 출구가 없는 dead-end 구매가 된다 — 여기서 서버가 먼저 막는다.
	if (isUsableBenefit(args.benefitType) && args.role === "job_seeker") {
		return { code: "audience", ok: false };
	}
	if (
		args.benefitType === "attendance_restore_ticket" &&
		args.role !== "job_seeker"
	) {
		return { code: "audience", ok: false };
	}
	if (args.benefitType === "coupon" && !args.isPhoneVerified) {
		return { code: "identity", ok: false };
	}
	if (args.soldOut) {
		return { code: "soldout", ok: false };
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
	"owned",
	"used",
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

export type CancelDenial = "already_used" | "expired" | "not_cancelable";

// 순수: 취소·환불 가드. 수동·쿠폰은 pending, 끌올·연장은 owned ∧ 미사용 ∧ 미만료.
export function resolveOrderCancellation(args: {
	benefitType: PointShopBenefitType;
	now: Date;
	status: string;
	usableUntil: Date | null;
	usedAt: Date | null;
}): { ok: true } | { code: CancelDenial; ok: false } {
	if (isUsableBenefit(args.benefitType)) {
		if (args.status !== "owned") {
			return { code: "not_cancelable", ok: false };
		}
		if (args.usedAt !== null) {
			return { code: "already_used", ok: false };
		}
		if (isExpired(args.usableUntil, args.now)) {
			return { code: "expired", ok: false };
		}
		return { ok: true };
	}
	if (args.status !== "pending") {
		return { code: "not_cancelable", ok: false };
	}
	return { ok: true };
}

export type OwnedUsageDenial =
	| "already_used"
	| "expired"
	| "not_owned"
	| "not_usable_type";

// 순수: 사용 가드(끌올·연장 전용). 상태·유형·만료만 본다(대상 공고 적격은 별도 판정).
export function resolveOwnedUsage(args: {
	benefitType: PointShopBenefitType;
	now: Date;
	status: string;
	usableUntil: Date | null;
	usedAt: Date | null;
}): { ok: true } | { code: OwnedUsageDenial; ok: false } {
	if (!isUsableBenefit(args.benefitType)) {
		return { code: "not_usable_type", ok: false };
	}
	// usedAt(사용 각인)을 status보다 먼저 본다 — 사용 완료 주문(status "used")은
	// not_owned가 아니라 already_used로 거부돼야 한다.
	if (args.usedAt !== null) {
		return { code: "already_used", ok: false };
	}
	if (args.status !== "owned") {
		return { code: "not_owned", ok: false };
	}
	if (isExpired(args.usableUntil, args.now)) {
		return { code: "expired", ok: false };
	}
	return { ok: true };
}

export type ItemSpecError =
	| "audience_conflict"
	| "missing_spec"
	| "unexpected_spec";

type SpecField = "boostCount" | "boostsPerDay" | "durationDays" | "extendDays";

const SPEC_FIELDS: readonly SpecField[] = [
	"boostsPerDay",
	"durationDays",
	"boostCount",
	"extendDays",
];

// 유형별 필수 스펙 필드. 목록에 없는 필드는 해당 유형에서 금지(있으면 unexpected_spec).
// none·coupon은 전부 금지, 기간제는 boostsPerDay·durationDays, 횟수권은 boostCount,
// 광고 연장은 extendDays만.
const REQUIRED_SPEC_FIELDS: Record<PointShopBenefitType, readonly SpecField[]> =
	{
		ad_extend: ["extendDays"],
		attendance_restore_ticket: [],
		boost_auto_period: ["boostsPerDay", "durationDays"],
		boost_manual_count: ["boostCount"],
		boost_manual_period: ["boostsPerDay", "durationDays"],
		coupon: [],
		draw_ticket: [],
		none: [],
	};

// 순수: 유형별 스펙 필드 필수/금지 + 혜택형 job_seeker 단독 audience 금지.
export function validateItemBenefitSpec(args: {
	audience: PointShopAudience;
	benefitType: PointShopBenefitType;
	boostCount: number | null;
	boostsPerDay: number | null;
	durationDays: number | null;
	extendDays: number | null;
}): { ok: true } | { code: ItemSpecError; ok: false } {
	if (isUsableBenefit(args.benefitType) && args.audience === "job_seeker") {
		return { code: "audience_conflict", ok: false };
	}
	if (
		args.benefitType === "attendance_restore_ticket" &&
		args.audience !== "job_seeker"
	) {
		return { code: "audience_conflict", ok: false };
	}
	const values: Record<SpecField, number | null> = {
		boostCount: args.boostCount,
		boostsPerDay: args.boostsPerDay,
		durationDays: args.durationDays,
		extendDays: args.extendDays,
	};
	const required = REQUIRED_SPEC_FIELDS[args.benefitType];
	for (const field of required) {
		if (values[field] === null) {
			return { code: "missing_spec", ok: false };
		}
	}
	for (const field of SPEC_FIELDS) {
		if (!required.includes(field) && values[field] !== null) {
			return { code: "unexpected_spec", ok: false };
		}
	}
	return { ok: true };
}

// 순수: 사용 대상 공고 적격(게시 중·paid·비배너, 광고 연장은 미만료 종료일 有).
export function isJobPostUsableForBenefit(args: {
	benefitType: PointShopBenefitType;
	exposureEndsAt: Date | null;
	isBannerExposure: boolean;
	now: Date;
	paymentStatus: string;
	status: string;
}): boolean {
	if (args.status !== "published" || args.paymentStatus !== "paid") {
		return false;
	}
	if (args.isBannerExposure) {
		return false;
	}
	// 광고 연장은 "아직 살아 있는" 노출만 대상. 만료(과거)·무기한(null) 공고는 배제한다 —
	// 만료 공고에 쓰면 노출 부활 없이 혜택만 소진되거나, 과거+N일이 미래로 넘어가며
	// 스페셜/추천 정원(FIFO) 검사를 우회해 재활성될 수 있다(bambi-listing-promotion 미경유).
	if (
		args.benefitType === "ad_extend" &&
		(args.exposureEndsAt === null ||
			args.exposureEndsAt.getTime() <= args.now.getTime())
	) {
		return false;
	}
	return true;
}

// 순수: 취소 시 재고 복원 여부 — 구매 시 실제 차감(stock_decremented)된 주문만 복원한다.
// 구매 후 무제한↔유한 재고 전환이 있어도 현재 재고가 아닌 구매 시점 사실로 판정한다.
export function shouldRestoreItemStock(order: {
	itemId: string | null;
	stockDecremented: boolean;
}): order is { itemId: string; stockDecremented: true } {
	return order.itemId !== null && order.stockDecremented;
}

// 순수: 품절 파생. stock 0이면 품절, 무제한(null)·미설정은 품절 없음(전 유형 동일).
export function isItemSoldOut(args: { stockQuantity: number | null }): boolean {
	return args.stockQuantity !== null && args.stockQuantity <= 0;
}

// 순수: 만료 임박 배치 대상 판정(기본 창 3일, 끌올·연장 owned).
export function isExpiringSoon(args: {
	expiryNotifiedAt: Date | null;
	now: Date;
	status: string;
	usableUntil: Date | null;
	windowDays?: number;
}): boolean {
	if (args.status !== "owned" || args.expiryNotifiedAt !== null) {
		return false;
	}
	if (args.usableUntil === null) {
		return false;
	}
	const remaining = args.usableUntil.getTime() - args.now.getTime();
	const windowMs = (args.windowDays ?? 3) * MS_PER_DAY;
	return remaining > 0 && remaining <= windowMs;
}

export function benefitTypeToBoostOptionType(
	benefitType: PointShopBenefitType
): "auto_period" | "manual_count" | "manual_period" | null {
	if (benefitType === "boost_manual_period") {
		return "manual_period";
	}
	if (benefitType === "boost_manual_count") {
		return "manual_count";
	}
	if (benefitType === "boost_auto_period") {
		return "auto_period";
	}
	return null;
}

// 순수: 주문 스냅샷 → job_boost_purchase insert 값(활성/paid). 끌올 옵션
// confirmPurchasePayment(boost-options.ts L496-512)와 같은 활성 형태.
export function buildBoostPurchaseValues(args: {
	benefitType: PointShopBenefitType;
	boostCount: number | null;
	boostsPerDay: number | null;
	durationDays: number | null;
	now: Date;
}): {
	activatedAt: Date;
	amount: 0;
	boostCount: number | null;
	boostsPerDay: number | null;
	durationDays: number | null;
	expiresAt: Date | null;
	optionType: "auto_period" | "manual_count" | "manual_period";
	paymentMethod: null;
	paymentStatus: "paid";
	purchaseSource: "point_shop";
	remainingCount: number | null;
} {
	const optionType = benefitTypeToBoostOptionType(args.benefitType);
	if (optionType === null) {
		throw new Error(`끌올 혜택이 아닌 유형입니다: ${args.benefitType}`);
	}
	const isCount = optionType === "manual_count";
	return {
		activatedAt: args.now,
		amount: 0,
		boostCount: args.boostCount,
		boostsPerDay: args.boostsPerDay,
		durationDays: args.durationDays,
		expiresAt: isCount
			? null
			: new Date(args.now.getTime() + (args.durationDays ?? 0) * MS_PER_DAY),
		optionType,
		paymentMethod: null,
		paymentStatus: "paid",
		purchaseSource: "point_shop",
		remainingCount: isCount ? args.boostCount : null,
	};
}

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
