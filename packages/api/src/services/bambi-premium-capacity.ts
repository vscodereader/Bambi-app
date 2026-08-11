// 프리미엄 광고(배너 3종 통합 풀) 신청 정원·대기열의 단일 소스.
//
// 파생 큐 모델: 대기열을 별도 테이블/상태로 저장하지 않고 전부 기존 jobPost 컬럼에서 파생한다.
// - active(자리 점유·노출 중) = listAdBanners와 동일 조건(published + paid + 배너3종 + 미만료).
// - pending(자리 점유·입금 대기) = listJobsForPayment가 결제 대기로 취급하는 배너 미결제 공고.
// - remaining = max(0, 정원 − active − pending). 광고가 만료돼 active가 줄면 remaining이 자연히
//   늘고, pending 1순위가 "진행 가능"으로 파생 전환된다(별도 승격 쓰기·배치 불필요).

import type { db } from "@bambi-app/db";
import { bambiSiteSettings, jobPost } from "@bambi-app/db/schema/bambi";
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
	notInArray,
	or,
	type SQL,
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

// 리스팅 섹션 active(자리 점유·노출 중). 유료 큐 모델에서 리스팅은 exposureEndsAt이 활성화
// 시점에 세팅되므로, null exposureEndsAt은 더 이상 "무기한 활성"이 아니라 "결제됨·미활성(대기중)"을
// 뜻한다. 그래서 배너(or(isNull, gt))와 달리 여기선 exposureEndsAt IS NOT NULL AND > now만 active로 센다.
const activeListingWhere = (type: CapacityListingExposureType, now: Date) =>
	and(
		inArray(jobPost.status, ["published"]),
		eq(jobPost.paymentStatus, "paid"),
		eq(jobPost.exposureType, type),
		isNotNull(jobPost.exposureEndsAt),
		gt(jobPost.exposureEndsAt, now)
	);

// 결제완료됐지만 아직 활성화(노출) 전인 대기 공고. exposureEndsAt이 아직 안 찍혀(null) 자리를
// 기다리는 FIFO 큐의 원소들이다.
export const queuedListingWhere = (type: CapacityListingExposureType) =>
	and(
		inArray(jobPost.status, ["published"]),
		eq(jobPost.paymentStatus, "paid"),
		eq(jobPost.exposureType, type),
		isNull(jobPost.exposureEndsAt)
	);

// "리스팅 대기 행이 아니다". published/paid가 이미 걸린 공개 쿼리의 and(...)에 붙여, 결제됨·미활성
// (exposureEndsAt null인 스페셜/추천) 대기 공고만 노출에서 뺀다. 대기 대상이 아닌 타입은 통과시키고,
// 스페셜/추천이라도 활성화(exposureEndsAt 세팅)됐으면 통과시킨다. queuedListingWhere의 역(逆) 조건이다.
export const notQueuedListingFilter = (): SQL<unknown> => {
	// or()의 반환 타입은 SQL | undefined지만 인자가 항상 2개라 undefined일 수 없다 — 좁혀서 반환한다.
	const filter = or(
		notInArray(jobPost.exposureType, [...CAPACITY_LISTING_EXPOSURE_TYPES]),
		isNotNull(jobPost.exposureEndsAt)
	);
	if (!filter) {
		throw new Error("notQueuedListingFilter: unreachable");
	}
	return filter;
};

export interface ListingQueuePositionEntry {
	exposureType: CapacityListingExposureType;
	position: number; // 1-based FIFO
}

// 양 섹션(스페셜·추천)의 대기 행 전체를 한 쿼리로 뽑아 jobPost.id → {섹션, 순번} 맵으로 돌려준다.
// 순번은 섹션별로 독립된 1-based FIFO(listing_paid_at asc, 동률 id asc). 목록 API가 요청당 1회만
// 호출해 각 행에 listingQueuePosition을 부착하는 용도다.
export const getListingQueuePositions = async (
	executor: QueryExecutor
): Promise<Map<string, ListingQueuePositionEntry>> => {
	const rows = await executor
		.select({ exposureType: jobPost.exposureType, id: jobPost.id })
		.from(jobPost)
		.where(or(queuedListingWhere("special"), queuedListingWhere("recommended")))
		.orderBy(asc(jobPost.listingPaidAt), asc(jobPost.id));

	const positions = new Map<string, ListingQueuePositionEntry>();
	// 섹션별 카운터로 1-based 순번을 매긴다(where가 스페셜/추천만 남기므로 캐스팅이 안전).
	const counters: Record<CapacityListingExposureType, number> = {
		recommended: 0,
		special: 0,
	};
	for (const row of rows) {
		const exposureType = row.exposureType as CapacityListingExposureType;
		counters[exposureType] += 1;
		positions.set(row.id, { exposureType, position: counters[exposureType] });
	}
	return positions;
};

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

// 리스팅 섹션의 active(자리 점유·노출 중) 카운트. activeListingWhere 재사용.
export const countActiveListings = (
	executor: QueryExecutor,
	type: CapacityListingExposureType,
	now: Date
): Promise<number> => countActiveWhere(executor, activeListingWhere(type, now));

// 리스팅 섹션 정원. 운영자가 사이트 설정(bambiSiteSettings, 단일 행 id="default")에서
// 조정한 값을 읽고, 아직 미설정(null)이면 코드 기본값으로 폴백한다.
export const listingSectionCapacity = async (
	executor: QueryExecutor,
	type: CapacityListingExposureType
): Promise<number> => {
	const [row] = await executor
		.select({
			recommendedCapacity: bambiSiteSettings.recommendedCapacity,
			specialCapacity: bambiSiteSettings.specialCapacity,
		})
		.from(bambiSiteSettings)
		.where(eq(bambiSiteSettings.id, "default"));
	if (type === "recommended") {
		return row?.recommendedCapacity ?? DEFAULT_RECOMMENDED_CAPACITY;
	}
	return row?.specialCapacity ?? DEFAULT_SPECIAL_CAPACITY;
};

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

// derivePremiumQueue의 리스팅 섹션판. 유료 큐 모델에서 대기열은 "결제완료됐지만 아직 미활성
// (exposureEndsAt=null)"인 리스팅 공고들이며, listing_paid_at 오름차순(동률 id asc) FIFO로 정렬한다.
// active는 activeListingWhere(미만료) 기준으로 카운트하고 정원(운영자 설정)으로 대기열을 파생한다.
export const deriveListingQueue = async (
	executor: QueryExecutor,
	type: CapacityListingExposureType,
	capacity: number,
	now: Date
): Promise<PremiumQueue> => {
	const [activeCount, queuedRows] = await Promise.all([
		countActiveListings(executor, type, now),
		executor
			.select({ id: jobPost.id })
			.from(jobPost)
			.where(queuedListingWhere(type))
			.orderBy(asc(jobPost.listingPaidAt), asc(jobPost.id)),
	]);

	return computeCapacityQueue(
		capacity,
		activeCount,
		queuedRows.map((row) => row.id)
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
