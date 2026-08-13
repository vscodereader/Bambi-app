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
import { asc, eq } from "drizzle-orm";

import { notifyBambiNotification } from "./bambi-notifications";
import {
	acquireListingCapacityLock,
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
		// 정원 카운트→활성/대기 판정이 check-then-act라, 같은 섹션의 동시 승인·승격 틱과
		// 마지막 자리를 두고 경합하면 정원 초과 노출이 난다. 섹션 advisory xact lock으로
		// 직렬화한다(#3). 호출부(setJobPostPayment·bulkSetJobPostPayment)는 모두 tx 안이다.
		await acquireListingCapacityLock(executor, exposureType);
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

// 한 자리 승격 시도: 섹션 advisory xact lock 안에서 정원 재카운트→대기열 선두 선택(FOR UPDATE)→
// 활성화를 원자적으로 수행한다(#3). 승인 경로(resolveListingPaymentExposure)와 같은 키로
// 직렬화되므로 마지막 자리를 두고 틱과 승인이 동시에 통과할 수 없다. 선두 선택 WHERE에
// queuedListingWhere가 있고 FOR UPDATE가 잠금 후 조건을 재평가하므로(READ COMMITTED),
// 동시 취소로 대기열에서 빠진 행은 자연히 걸러진다 — 별도 재확인·skip 목록이 필요 없다.
type PromoteOutcome =
	| { kind: "stop" } // 정원 참 또는 대기열 비었음 — 이 섹션 종료
	| {
			head: {
				createdByUserId: string;
				exposureDurationDays: number | null;
				id: string;
				title: string;
			};
			kind: "promoted";
	  };

const promoteOneSlot = (
	type: CapacityListingExposureType,
	now: Date
): Promise<PromoteOutcome> =>
	db.transaction(async (tx) => {
		await acquireListingCapacityLock(tx, type);
		const [active, capacity] = await Promise.all([
			countActiveListings(tx, type, now),
			listingSectionCapacity(tx, type),
		]);
		if (active >= capacity) {
			return { kind: "stop" };
		}

		const [head] = await tx
			.select({
				createdByUserId: jobPost.createdByUserId,
				exposureDurationDays: jobPost.exposureDurationDays,
				id: jobPost.id,
				title: jobPost.title,
			})
			.from(jobPost)
			.where(queuedListingWhere(type))
			.orderBy(asc(jobPost.listingPaidAt), asc(jobPost.id))
			.limit(1)
			.for("update");
		if (!head) {
			return { kind: "stop" };
		}

		await tx
			.update(jobPost)
			.set({
				exposureEndsAt: listingExposureEndsAt(now, head.exposureDurationDays),
			})
			.where(eq(jobPost.id, head.id));
		return { head, kind: "promoted" };
	});

// 한 섹션(type)의 빈 자리를 대기열 선두부터 채운다. 승격 1건당 트랜잭션 1개라 락 점유가 짧고,
// 매 반복 정원을 재카운트해 정원까지만 승격한다. 알림은 커밋 뒤에 보낸다(롤백된 승격 통지 방지).
const promoteSectionToCapacity = async (
	type: CapacityListingExposureType,
	now: Date
): Promise<number> => {
	let promoted = 0;

	while (true) {
		const outcome = await promoteOneSlot(type, now);
		if (outcome.kind === "stop") {
			break;
		}
		promoted += 1;
		// 시스템 틱이라 액터가 없어 소유자를 액터로 기록한다(구인자 본인에게 노출 시작 통지).
		await notifyBambiNotification({
			actorUserId: outcome.head.createdByUserId,
			metadata: {
				action: "listing_activated",
				exposureDurationDays: outcome.head.exposureDurationDays,
				exposureType: type,
				jobPostTitle: outcome.head.title,
			},
			recipientUserId: outcome.head.createdByUserId,
			targetId: outcome.head.id,
			targetType: "job_post",
		});
	}

	return promoted;
};

// 리스팅 승격 틱: 매 호출마다 DB 기준으로 재계산한다(무상태·재진입 안전). runAutoBoostTick과
// 동일한 구조로, apps/server가 60초 Fastify 인터벌에 등록한다. 섹션별로 정원 대비 빈 자리를
// 대기열 선두(listing_paid_at asc, id asc)부터 채운다. 반환값은 이번 틱에서 승격한 공고 수.
//
// 개별 공고 실패는 삼켜 다음 섹션을 진행한다(틱이 서버를 죽이면 안 됨). 다음 틱이 캐치업한다.
//
// 섹션별 advisory xact lock(promoteOneSlot)으로 승인 경로와 직렬화된다 — 다중 인스턴스 동시
// 틱에도 정원을 넘지 않는다.
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
