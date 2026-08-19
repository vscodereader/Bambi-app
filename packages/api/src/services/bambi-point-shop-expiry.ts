import { bambiPointShopOrder } from "@bambi-app/db/schema/bambi";
import { and, eq, isNotNull, isNull } from "drizzle-orm";
import { logBambiNotificationError } from "./bambi-notification-stream";
import { createBambiNotification } from "./bambi-notifications";
import { isExpiringSoon, markOrderExpiryNotified } from "./bambi-point-shop";

interface ExpiringRow {
	expiryNotifiedAt: Date | null;
	id: string;
	itemName: string;
	status: string;
	usableUntil: Date | null;
	userId: string;
}

// 순수: 배치 대상 선별(테스트 대상).
export function selectExpiringCandidates(
	rows: ExpiringRow[],
	now: Date
): ExpiringRow[] {
	return rows.filter((row) =>
		isExpiringSoon({
			expiryNotifiedAt: row.expiryNotifiedAt,
			now,
			status: row.status,
			usableUntil: row.usableUntil,
		})
	);
}

// 틱 진입점. 후보를 뽑아, 알림 insert가 커밋된 뒤에만 각인한다 — insert가 실패하면
// 각인을 남기지 않아 다음 틱에서 재시도된다(각인-선행의 영구 유실·카운트 과다 제거).
export async function runPointShopExpiryNotifyTick(
	now: Date = new Date()
): Promise<{ notifiedCount: number }> {
	// 순수 선별 함수를 env 없이 단위 테스트할 수 있게 db는 지연 로드한다
	// (bambi-notifications.ts와 같은 관례 — 모듈 로드 시 env 검증을 트리거하지 않는다).
	const { db } = await import("@bambi-app/db");
	const rows = await db
		.select({
			expiryNotifiedAt: bambiPointShopOrder.expiryNotifiedAt,
			id: bambiPointShopOrder.id,
			itemName: bambiPointShopOrder.itemName,
			status: bambiPointShopOrder.status,
			usableUntil: bambiPointShopOrder.usableUntil,
			userId: bambiPointShopOrder.userId,
		})
		.from(bambiPointShopOrder)
		.where(
			and(
				eq(bambiPointShopOrder.status, "owned"),
				isNull(bambiPointShopOrder.expiryNotifiedAt),
				isNotNull(bambiPointShopOrder.usableUntil)
			)
		);
	const candidates = selectExpiringCandidates(rows, now);
	let notifiedCount = 0;
	for (const order of candidates) {
		// 알림 생성이 성공(예외 없이 행 반환)한 뒤에만 각인한다. createBambiNotification은
		// 실패 시 throw하므로 best-effort 래퍼(notifyBambiNotification) 대신 직접 호출해
		// 성공 여부를 판별한다. 실패하면 각인 없이 넘겨 다음 틱에서 다시 걸리게 둔다.
		let notificationId: null | string;
		try {
			notificationId = await createBambiNotification({
				metadata: { action: "expiry_soon", itemName: order.itemName },
				recipientUserId: order.userId,
				targetId: order.id,
				targetType: "point_shop_order",
			});
		} catch (error) {
			logBambiNotificationError(error, "point shop expiry notify failed");
			continue;
		}
		if (!notificationId) {
			continue;
		}
		await markOrderExpiryNotified(db, order.id);
		notifiedCount += 1;
	}
	return { notifiedCount };
}
