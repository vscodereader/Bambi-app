// 프리미엄 광고(배너 3종 통합 풀) 신청 정원·대기열의 단일 소스.
//
// 파생 큐 모델: 대기열을 별도 테이블/상태로 저장하지 않고 전부 기존 jobPost 컬럼에서 파생한다.
// - active(자리 점유·노출 중) = listAdBanners와 동일 조건(published + paid + 배너3종 + 미만료).
// - pending(자리 점유·입금 대기) = listJobsForPayment가 결제 대기로 취급하는 배너 미결제 공고.
// - remaining = max(0, 정원 − active − pending). 광고가 만료돼 active가 줄면 remaining이 자연히
//   늘고, pending 1순위가 "진행 가능"으로 파생 전환된다(별도 승격 쓰기·배치 불필요).

import type { db } from "@bambi-app/db";
import { jobPost } from "@bambi-app/db/schema/bambi";
import { ORPCError } from "@orpc/server";
import {
	and,
	asc,
	count,
	eq,
	gt,
	inArray,
	isNotNull,
	isNull,
	or,
	sql,
} from "drizzle-orm";

import {
	AD_BANNER_EXPOSURE_TYPES,
	EXPOSURE_TYPE_LABELS,
} from "./bambi-ad-exposure";

// 프리미엄 광고 신청 정원(전체 통합). 화면 표시 슬롯 수(bambi-ad-exposure.ts의
// SIDE_BANNER_MAX_SLOTS/PREMIUM_BANNER_MAX_SLOTS = 로테이션 링 칸 수)와는 전혀 다른
// 개념이다 — 이건 "동시에 받을 수 있는 프리미엄 광고 신청 총량"이다.
export const PREMIUM_AD_CAPACITY = 10;

// pg_advisory_xact_lock 고정 키. 승인(unpaid→paid)을 전역 직렬화하는 데만 쓴다.
export const PREMIUM_CAPACITY_LOCK_KEY = 918_273_645;

export const PREMIUM_CAPACITY_FULL_MESSAGE =
	"프리미엄 광고 정원(10자리)이 가득 차 승인할 수 없어요. 자리가 나면 다시 시도해 주세요.";

// 리스팅 섹션(스페셜/추천) 정원 코드 기본값. 운영자가 사이트 설정에서 조정하지 않았을(null)
// 때 폴백으로 쓰는 값이고, 정원 = 렌더 슬롯 수 불변식의 기준이다. 프리미엄(배너) 정원과 달리
// 섹션마다 다른 값이라 상수로 분리한다.
export const DEFAULT_SPECIAL_CAPACITY = 12;
export const DEFAULT_RECOMMENDED_CAPACITY = 20;

// 정원 게이트 대상이 되는 리스팅 노출 타입(스페셜/추천만). urgent는 섹션 자체를 숨기므로
// (설계 확정) 정원/대기열 대상이 아니다 — bambi-ad-exposure의 LISTING_SECTION_EXPOSURE_TYPES는
// urgent를 포함하지만 여기선 의도적으로 뺀다.
export const CAPACITY_LISTING_EXPOSURE_TYPES = [
	"special",
	"recommended",
] as const;
export type CapacityListingExposureType =
	(typeof CAPACITY_LISTING_EXPOSURE_TYPES)[number];

// pg_advisory_xact_lock 키를 노출 타입별로 분리한다. 프리미엄 키(PREMIUM_CAPACITY_LOCK_KEY)와도,
// 섹션끼리도 서로 다른 값이라 스페셜 승인이 추천/프리미엄 승인을 막지 않는다(섹션별 독립 직렬화).
export const LISTING_CAPACITY_LOCK_KEYS: Record<
	CapacityListingExposureType,
	number
> = {
	recommended: 918_273_647,
	special: 918_273_646,
};

// 섹션별 만석 메시지. enum 원값 대신 EXPOSURE_TYPE_LABELS로 사람이 읽는 라벨을 넣는다.
export const listingCapacityFullMessage = (
	exposureType: CapacityListingExposureType,
	capacity: number
): string =>
	`${EXPOSURE_TYPE_LABELS[exposureType]} 정원(${capacity}자리)이 가득 차 승인할 수 없어요. 자리가 나면 다시 시도해 주세요.`;

// db 또는 트랜잭션(tx) 어느 쪽이든 받는 최소 실행자 타입. 게이트는 tx로(advisory lock이
// xact 스코프라야 커밋 시 해제), 조회는 db로 호출한다.
type QueryExecutor = Pick<typeof db, "execute" | "select">;

const BANNER_EXPOSURE_TYPES = [...AD_BANNER_EXPOSURE_TYPES];

// active(자리 점유·노출 중). listAdBanners(jobs.ts)와 동일 조건 — 한쪽만 바뀌면 정원과 실제
// 노출이 어긋나므로 조건을 여기 한 곳에서 정의해 공유한다.
const activeBannerWhere = (now: Date) =>
	and(
		inArray(jobPost.status, ["published"]),
		eq(jobPost.paymentStatus, "paid"),
		inArray(jobPost.exposureType, BANNER_EXPOSURE_TYPES),
		or(isNull(jobPost.exposureEndsAt), gt(jobPost.exposureEndsAt, now))
	);

// pending(자리 점유·입금 대기). listJobsForPayment(moderation.ts)가 결제 대기로 취급하는
// 상태 조건(pending_review·published + adProductId 존재)과 어긋나지 않게 맞춘 배너 미결제 공고.
const pendingBannerWhere = () =>
	and(
		inArray(jobPost.status, ["pending_review", "published"]),
		eq(jobPost.paymentStatus, "unpaid"),
		inArray(jobPost.exposureType, BANNER_EXPOSURE_TYPES),
		isNotNull(jobPost.adProductId)
	);

// 리스팅 섹션 active(자리 점유·노출 중). 배너와 달리 단일 exposureType로 좁힌 것만 다르고
// 나머지(published + paid + 미만료) 조건은 동일하다.
const activeListingWhere = (type: CapacityListingExposureType, now: Date) =>
	and(
		inArray(jobPost.status, ["published"]),
		eq(jobPost.paymentStatus, "paid"),
		eq(jobPost.exposureType, type),
		or(isNull(jobPost.exposureEndsAt), gt(jobPost.exposureEndsAt, now))
	);

// 리스팅 섹션 pending(자리 점유·입금 대기). pendingBannerWhere를 단일 exposureType로 치환.
const pendingListingWhere = (type: CapacityListingExposureType) =>
	and(
		inArray(jobPost.status, ["pending_review", "published"]),
		eq(jobPost.paymentStatus, "unpaid"),
		eq(jobPost.exposureType, type),
		isNotNull(jobPost.adProductId)
	);

// active 카운트 조회의 공통 실행부. where만 배너/리스팅으로 갈린다.
const countActiveWhere = async (
	executor: QueryExecutor,
	where: ReturnType<typeof activeBannerWhere>
): Promise<number> => {
	const [row] = await executor
		.select({ value: count() })
		.from(jobPost)
		.where(where);
	return row?.value ?? 0;
};

export const countActivePremiumBanners = (
	executor: QueryExecutor,
	now: Date
): Promise<number> => countActiveWhere(executor, activeBannerWhere(now));

export interface PremiumCapacity {
	activeCount: number;
	capacity: number;
	pendingCount: number;
	remaining: number;
}

export interface PremiumQueueEntry {
	// 진행 가능(정원 내, 입금 확인 대기)인가. false면 대기열이다.
	progressable: boolean;
	// 대기열 순번(1-based). progressable이면 null.
	queuePosition: number | null;
	// pending 전체에서의 1-based 순번(createdAt asc, 동률 id asc).
	rank: number;
}

export interface PremiumQueue extends PremiumCapacity {
	ranksByJobId: Map<string, PremiumQueueEntry>;
}

// 정원·대기열 파생의 순수 로직(DB 미접촉). 정원은 파라미터로 받아 프리미엄(고정 10)·스페셜/추천
// (운영자 설정) 어느 쪽에도 쓴다. rank는 pending을 createdAt asc(동률 id asc)로 매긴 순번이고,
// progressableSlots = max(0, 정원 − active) 이하면 "진행 가능", 초과분은 대기열이다.
// pendingJobIdsOrdered는 이미 정렬된 pending 공고 id 목록이어야 한다.
export const computeCapacityQueue = (
	capacity: number,
	activeCount: number,
	pendingJobIdsOrdered: readonly string[]
): PremiumQueue => {
	const progressableSlots = Math.max(0, capacity - activeCount);
	const ranksByJobId = new Map<string, PremiumQueueEntry>();
	pendingJobIdsOrdered.forEach((jobPostId, index) => {
		const rank = index + 1;
		const progressable = rank <= progressableSlots;
		ranksByJobId.set(jobPostId, {
			progressable,
			queuePosition: progressable ? null : rank - progressableSlots,
			rank,
		});
	});

	const pendingCount = pendingJobIdsOrdered.length;
	return {
		activeCount,
		capacity,
		pendingCount,
		ranksByJobId,
		remaining: Math.max(0, capacity - activeCount - pendingCount),
	};
};

// 프리미엄(배너 통합 풀) 전용 얇은 래퍼 — 정원을 PREMIUM_AD_CAPACITY로 고정한다.
// 기존 시그니처(activeCount, pendingIds)와 반환을 그대로 보존한다.
export const computePremiumQueue = (
	activeCount: number,
	pendingJobIdsOrdered: readonly string[]
): PremiumQueue =>
	computeCapacityQueue(PREMIUM_AD_CAPACITY, activeCount, pendingJobIdsOrdered);

// 정원 집계와 pending 대기열 순번 파생을 조회로 묶는다. capacity 조회 프로시저와 listMyAds가
// 공유한다. active·pending은 전역(모든 조직에 걸친) 카운트다.
export const derivePremiumQueue = async (
	executor: QueryExecutor,
	now: Date
): Promise<PremiumQueue> => {
	const [activeCount, pendingRows] = await Promise.all([
		countActivePremiumBanners(executor, now),
		executor
			.select({ id: jobPost.id })
			.from(jobPost)
			.where(pendingBannerWhere())
			.orderBy(asc(jobPost.createdAt), asc(jobPost.id)),
	]);

	return computePremiumQueue(
		activeCount,
		pendingRows.map((row) => row.id)
	);
};

// derivePremiumQueue의 리스팅 섹션판. active·pending을 해당 exposureType으로 좁혀 카운트·정렬한
// 뒤 정원(운영자 설정) 기준으로 대기열을 파생한다. capacity 조회·listMyAds가 공유한다.
export const deriveListingQueue = async (
	executor: QueryExecutor,
	type: CapacityListingExposureType,
	capacity: number,
	now: Date
): Promise<PremiumQueue> => {
	const [activeCount, pendingRows] = await Promise.all([
		countActiveWhere(executor, activeListingWhere(type, now)),
		executor
			.select({ id: jobPost.id })
			.from(jobPost)
			.where(pendingListingWhere(type))
			.orderBy(asc(jobPost.createdAt), asc(jobPost.id)),
	]);

	return computeCapacityQueue(
		capacity,
		activeCount,
		pendingRows.map((row) => row.id)
	);
};

// 승인(unpaid→paid) 게이트. 대상이 배너형일 때만 트랜잭션 안에서 advisory lock으로 전역
// 직렬화한 뒤 active를 재카운트해 정원 초과 승인을 막는다. paid→unpaid는 게이트 불필요.
//
// ponytail: 게이트는 큐 순서를 강제하지 않는다(rank 무시). 무통장입금 도착 순서라는 현실을
// 반영한 의도적 단순화 — 순서 강제가 필요하면 여기서 rank ≤ progressableSlots를 추가로 검증한다.
export const assertPremiumApprovalWithinCapacity = async ({
	executor,
	existingExposureType,
	existingPaymentStatus,
	newPaymentStatus,
	now,
}: {
	executor: QueryExecutor;
	existingExposureType: string;
	existingPaymentStatus: string;
	newPaymentStatus: string;
	now: Date;
}): Promise<void> => {
	const isApproval =
		existingPaymentStatus === "unpaid" && newPaymentStatus === "paid";
	const isBanner = (BANNER_EXPOSURE_TYPES as readonly string[]).includes(
		existingExposureType
	);
	if (!(isApproval && isBanner)) {
		return;
	}

	// 전역 카운트라 잠글 단일 행이 없어 advisory xact lock으로 승인을 직렬화한다
	// (카운트→검증→전환이 한 번에 한 요청씩 진행, 커밋 시 자동 해제).
	await executor.execute(
		sql`select pg_advisory_xact_lock(${PREMIUM_CAPACITY_LOCK_KEY})`
	);
	const activeCount = await countActivePremiumBanners(executor, now);
	if (activeCount >= PREMIUM_AD_CAPACITY) {
		throw new ORPCError("CONFLICT", { message: PREMIUM_CAPACITY_FULL_MESSAGE });
	}
};

// assertPremiumApprovalWithinCapacity의 리스팅 섹션판. 승인(unpaid→paid)일 때만 exposureType별
// 고유 advisory lock 키로 직렬화한 뒤 active를 재카운트해 정원 초과 승인을 막는다. 정원은
// 운영자 설정에서 읽어 넘긴다. 락 키가 섹션마다 달라 스페셜/추천/프리미엄 승인이 서로 안 막는다.
//
// ponytail: 게이트는 큐 순서를 강제하지 않는다(rank 무시) — 프리미엄과 동일하게 입금 도착
// 순서라는 현실을 반영한 의도적 단순화. 순서 강제가 필요하면 rank ≤ progressableSlots를 덧붙인다.
export const assertListingApprovalWithinCapacity = async ({
	capacity,
	executor,
	exposureType,
	existingPaymentStatus,
	newPaymentStatus,
	now,
}: {
	capacity: number;
	executor: QueryExecutor;
	exposureType: CapacityListingExposureType;
	existingPaymentStatus: string;
	newPaymentStatus: string;
	now: Date;
}): Promise<void> => {
	const isApproval =
		existingPaymentStatus === "unpaid" && newPaymentStatus === "paid";
	if (!isApproval) {
		return;
	}

	// 섹션별 고유 키로 승인을 직렬화한다(카운트→검증→전환이 한 번에 한 요청씩, 커밋 시 자동 해제).
	await executor.execute(
		sql`select pg_advisory_xact_lock(${LISTING_CAPACITY_LOCK_KEYS[exposureType]})`
	);
	const activeCount = await countActiveWhere(
		executor,
		activeListingWhere(exposureType, now)
	);
	if (activeCount >= capacity) {
		throw new ORPCError("CONFLICT", {
			message: listingCapacityFullMessage(exposureType, capacity),
		});
	}
};
