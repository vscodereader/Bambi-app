// 리스팅 섹션(스페셜/추천) 유료 대기열의 승격·승인 노출 계산 소스.
//
// 정책 전환: 스페셜/추천은 정원이 차면 승인을 거부(게이트)하지 않고, 결제는 통과시키되
// "대기열(QUEUED)"에 넣는다. 대기열 = 결제완료지만 노출이 시작되지 않은(exposureEndsAt IS NULL)
// 공고이고, FIFO 키는 listing_paid_at(결제된 순간)이다. 자리가 나면 이 파일의 틱이 대기열
// 선두를 노출로 승격한다 — 노출 시계(exposureEndsAt)는 승인이 아니라 "승격(활성화)" 시점에 시작한다.
//
// 프리미엄(배너)·standard/urgent는 이 파일과 무관하다(기존 로직 유지).

import { db } from "@bambi-app/db";
import { jobPost } from "@bambi-app/db/schema/bambi";
import { and, asc, eq, notInArray } from "drizzle-orm";

import { notifyBambiNotification } from "./bambi-notifications";
import {
	CAPACITY_LISTING_EXPOSURE_TYPES,
	type CapacityListingExposureType,
	countActiveListings,
	listingSectionCapacity,
	queuedListingWhere,
} from "./bambi-premium-capacity";

export const MS_PER_DAY = 24 * 60 * 60 * 1000;

// now + days를 노출 종료 시각으로 환산. days가 없으면(무기한 성격) 0일로 취급해 즉시 만료
// 처리한다 — 리스팅 상품은 항상 기간이 있으므로 실무상 null 분기는 방어값이다.
const listingExposureEndsAt = (
	now: Date,
	exposureDurationDays: number | null
) => new Date(now.getTime() + (exposureDurationDays ?? 0) * MS_PER_DAY);

const isListingExposureType = (
	exposureType: string
): exposureType is CapacityListingExposureType =>
	(CAPACITY_LISTING_EXPOSURE_TYPES as readonly string[]).includes(exposureType);

// db 또는 트랜잭션(tx) 어느 쪽이든 받는 최소 실행자 타입. moderation 라우터가 승인 트랜잭션
// 안에서 호출해 같은 tx의 직전 활성화까지 반영된 카운트를 보게 하려면 executor를 받아야 한다.
type QueryExecutor = Pick<typeof db, "execute" | "select">;

// 단일 공고의 결제 상태 변경(승인/취소)에 대한 노출 계산. 반환값을 그대로 jobPost에 set한다.
// 리스팅형이면 활성 자리 여부로 즉시 활성화(exposureEndsAt 설정) vs 대기열(exposureEndsAt null)을
// 가르고, 어느 쪽이든 listingPaidAt=now를 찍는다(FIFO 키). 비리스팅형은 기존 규칙 그대로.
export const resolveListingPaymentExposure = async ({
	executor,
	exposureType,
	exposureDurationDays,
	newPaymentStatus,
	now,
}: {
	executor: QueryExecutor;
	exposureType: string;
	exposureDurationDays: number | null;
	newPaymentStatus: string;
	now: Date;
}): Promise<{ exposureEndsAt: Date | null; listingPaidAt: Date | null }> => {
	// 결제완료가 아니면(취소·미결제) 노출·FIFO 키를 모두 비운다 — 대기열에서도 빠진다.
	if (newPaymentStatus !== "paid") {
		return { exposureEndsAt: null, listingPaidAt: null };
	}

	if (isListingExposureType(exposureType)) {
		const [active, capacity] = await Promise.all([
			countActiveListings(executor, exposureType, now),
			listingSectionCapacity(executor, exposureType),
		]);
		// 자리가 있으면 즉시 활성화(시계 시작), 없으면 대기열(시계는 승격 시 시작). 둘 다 결제 순간 기록.
		return {
			exposureEndsAt:
				active < capacity
					? listingExposureEndsAt(now, exposureDurationDays)
					: null,
			listingPaidAt: now,
		};
	}

	// 비리스팅형(배너/premium·standard/urgent): 기존 규칙 — 결제완료+기간 있으면 now+기간, 아니면 null.
	// listingPaidAt은 리스팅 대기열 전용이므로 항상 null.
	return {
		exposureEndsAt:
			exposureDurationDays == null
				? null
				: listingExposureEndsAt(now, exposureDurationDays),
		listingPaidAt: null,
	};
};

// 대기열 선두(FIFO)를 잠금 안에서 재확인한 뒤 노출로 승격한다. 잠금·재확인이 있어야 동시 틱·
// 다중 인스턴스가 같은 행을 이중 승격하거나 이미 취소된 행을 되살리지 않는다(auto-boost와 동일 패턴).
// 반환: 실제로 승격했으면 true, 이미 대기열이 아니면 false(다음 후보로 넘어감).
const activateQueuedHead = (
	headId: string,
	exposureDurationDays: number | null,
	now: Date
): Promise<boolean> =>
	db.transaction(async (tx) => {
		const [locked] = await tx
			.select({
				exposureEndsAt: jobPost.exposureEndsAt,
				exposureType: jobPost.exposureType,
				paymentStatus: jobPost.paymentStatus,
				status: jobPost.status,
			})
			.from(jobPost)
			.where(eq(jobPost.id, headId))
			.for("update");

		if (!locked) {
			return false;
		}
		// 잠금 안에서 여전히 QUEUED(게시+결제완료+리스팅형+exposureEndsAt null)인지 재확인.
		if (
			locked.status !== "published" ||
			locked.paymentStatus !== "paid" ||
			locked.exposureEndsAt !== null ||
			!isListingExposureType(locked.exposureType)
		) {
			return false;
		}

		await tx
			.update(jobPost)
			.set({ exposureEndsAt: listingExposureEndsAt(now, exposureDurationDays) })
			.where(eq(jobPost.id, headId));
		return true;
	});

// 한 섹션(type)의 빈 자리를 대기열 선두부터 채운다. 매 반복마다 active를 재카운트해 정원까지만
// 승격한다. 승격 실패(경합으로 이미 대기열 이탈 등)한 id는 skipIds로 제외해 같은 선두에서
// 무한 루프에 빠지지 않게 한다(이번 틱에서만 건너뛰고, 다음 틱이 다시 시도).
const promoteSectionToCapacity = async (
	type: CapacityListingExposureType,
	now: Date
): Promise<number> => {
	const capacity = await listingSectionCapacity(db, type);
	const skipIds = new Set<string>();
	let promoted = 0;

	while (true) {
		const active = await countActiveListings(db, type, now);
		if (active >= capacity) {
			break;
		}

		const [head] = await db
			.select({
				createdByUserId: jobPost.createdByUserId,
				exposureDurationDays: jobPost.exposureDurationDays,
				id: jobPost.id,
				title: jobPost.title,
			})
			.from(jobPost)
			.where(
				skipIds.size > 0
					? and(queuedListingWhere(type), notInArray(jobPost.id, [...skipIds]))
					: queuedListingWhere(type)
			)
			.orderBy(asc(jobPost.listingPaidAt), asc(jobPost.id))
			.limit(1);

		if (!head) {
			break;
		}

		const didActivate = await activateQueuedHead(
			head.id,
			head.exposureDurationDays,
			now
		);
		if (didActivate) {
			promoted += 1;
			// 시스템 틱이라 액터가 없어 소유자를 액터로 기록한다(구인자 본인에게 노출 시작 통지).
			await notifyBambiNotification({
				actorUserId: head.createdByUserId,
				metadata: {
					action: "listing_activated",
					exposureDurationDays: head.exposureDurationDays,
					exposureType: type,
					jobPostTitle: head.title,
				},
				recipientUserId: head.createdByUserId,
				targetId: head.id,
				targetType: "job_post",
			});
		} else {
			// 잠금 재확인에서 대기열이 아니었던 행 — 이번 틱에선 다시 뽑지 않는다.
			skipIds.add(head.id);
		}
	}

	return promoted;
};

// 리스팅 승격 틱: 매 호출마다 DB 기준으로 재계산한다(무상태·재진입 안전). runAutoBoostTick과
// 동일한 구조로, apps/server가 60초 Fastify 인터벌에 등록한다. 섹션별로 정원 대비 빈 자리를
// 대기열 선두(listing_paid_at asc, id asc)부터 채운다. 반환값은 이번 틱에서 승격한 공고 수.
//
// 개별 공고 실패는 삼켜 다음 섹션을 진행한다(틱이 서버를 죽이면 안 됨). 다음 틱이 캐치업한다.
//
// ponytail: 전역 정원 락은 없다 — apps/server 단일 인터벌 전제의 의도적 단순화. 다중 인스턴스가
// 동시에 돌면 순간적으로 정원을 살짝 넘겨 승격할 수 있다. 필요하면 섹션별 advisory xact lock
// (LISTING_CAPACITY_LOCK_KEYS)으로 틱 전체를 직렬화한다.
export const runListingPromotionTick = async (now: Date): Promise<number> => {
	let promoted = 0;

	for (const type of CAPACITY_LISTING_EXPOSURE_TYPES) {
		try {
			promoted += await promoteSectionToCapacity(type, now);
		} catch {
			// 섹션 단위 실패는 삼키고 다음 섹션을 진행한다(다음 틱이 캐치업).
		}
	}

	return promoted;
};
