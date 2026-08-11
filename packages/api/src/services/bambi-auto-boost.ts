import { db } from "@bambi-app/db";
import {
	jobBoostEvent,
	jobBoostPurchase,
	jobPost,
} from "@bambi-app/db/schema/bambi";
import {
	and,
	count,
	eq,
	gt,
	gte,
	inArray,
	isNotNull,
	isNull,
	notInArray,
	or,
} from "drizzle-orm";

import {
	AD_BANNER_EXPOSURE_TYPES,
	LISTING_SECTION_EXPOSURE_TYPES,
} from "./bambi-ad-exposure";
import {
	type BoostPurchaseLike,
	countDueAutoBoostSlots,
	getAutoBoostSlotOffsetMs,
	getKstDayStart,
	sumActivePeriodBoostsPerDay,
} from "./bambi-job-boost";
import { CAPACITY_LISTING_EXPOSURE_TYPES } from "./bambi-premium-capacity";

// 한 틱에서 동시에 처리할 공고 트랜잭션 상한. 대규모 공고에서도 DB 커넥션·잠금 경합을
// 상한 안에 가두면서 순차 for-await보다 처리량을 끌어올린다(공유 인덱스 워커 풀).
const AUTO_BOOST_TICK_CONCURRENCY = 10;

// jobBoostPurchase 행에서 BoostPurchaseLike 판정에 필요한 칸만 뽑는 공통 셀렉션.
// 사전 필터(전역 조회)와 잠금 내 재조회가 같은 형태를 읽어 판정이 어긋나지 않게 한다.
const boostPurchaseColumns = {
	boostsPerDay: jobBoostPurchase.boostsPerDay,
	createdAt: jobBoostPurchase.createdAt,
	expiresAt: jobBoostPurchase.expiresAt,
	id: jobBoostPurchase.id,
	optionType: jobBoostPurchase.optionType,
	paymentStatus: jobBoostPurchase.paymentStatus,
	remainingCount: jobBoostPurchase.remainingCount,
} as const;

// 자동 끌어올리기 틱: 매 호출마다 DB 기준으로 재계산한다(무상태). 후보 공고 중
// 오늘 도래한 자동 슬롯 수보다 자동 발동이 덜 된 공고를 공고별 트랜잭션으로 1건씩 발동한다.
// 상태를 메모리에 두지 않아 서버 재시작에도 당일 내 캐치업되고, 이력·정렬이 수동 끌어올리기와
// 동일한 데이터 경로(jobBoostEvent + boostedAt)를 공유한다.
//
// 자동 발동 후보는 두 갈래의 합집합이다:
//   (a) 상품 번들 자동(autoBoostsPerDay>0) ∧ 리스팅형(스페셜·급구·추천).
//   (b) 활성 auto_period 옵션 구매 보유 공고 ∧ 배너형만 제외(standard 등 무료 공고 포함).
// 공고별 유효 자동 횟수 effectiveAutoPerDay = 번들 + Σ활성 auto_period boostsPerDay이며,
// 슬롯 도래·재확인 판정 모두 이 합산 횟수로 한다(자동 기간제는 차감 개념이 없다).
//
// 발동 대상은 동시 실행 상한이 있는 워커 풀로 병렬 처리한다(공고별 트랜잭션·잠금 내 재확인·
// 개별 실패 삼킴은 순차 구현과 동일 — 정확성 패턴 불변, 처리량만 확대).
//
// 반환값은 이번 틱에서 실제 발동한 공고 수다. 개별 공고 실패는 삼켜 다음 공고를 진행하며,
// 실패 목록은 호출자(플러그인)가 로그로 남긴다(틱이 서버를 죽이면 안 됨).
export const runAutoBoostTick = async (now: Date): Promise<number> => {
	const dayStart = getKstDayStart(now);

	// 활성 auto_period 구매(결제완료·미만료)를 공고별로 모은다. WHERE에서 이미 활성만 남겼지만,
	// 합산은 Task 2 헬퍼(sumActivePeriodBoostsPerDay)로 해 라우터 축과 판정 규칙을 공유한다.
	const autoPeriodRows = await db
		.select({ ...boostPurchaseColumns, jobPostId: jobBoostPurchase.jobPostId })
		.from(jobBoostPurchase)
		.where(
			and(
				eq(jobBoostPurchase.optionType, "auto_period"),
				eq(jobBoostPurchase.paymentStatus, "paid"),
				gt(jobBoostPurchase.expiresAt, now)
			)
		);
	const autoPeriodByJobId = new Map<string, BoostPurchaseLike[]>();
	for (const row of autoPeriodRows) {
		const list = autoPeriodByJobId.get(row.jobPostId) ?? [];
		list.push(row);
		autoPeriodByJobId.set(row.jobPostId, list);
	}
	const autoPeriodJobIds = [...autoPeriodByJobId.keys()];

	// 후보 = 공개 중(게시+결제완료) ∧ 노출 유효(무료 공고는 exposureEndsAt null이라 통과) ∧
	//   (a) 번들 자동 보유 ∧ 리스팅형  OR  (b) 활성 auto_period 보유 ∧ 배너형 제외.
	// auto_period 구매가 하나도 없으면 (b) 조건은 undefined라 or가 (a)만으로 축소된다.
	const autoPeriodBranch =
		autoPeriodJobIds.length > 0
			? and(
					inArray(jobPost.id, autoPeriodJobIds),
					notInArray(jobPost.exposureType, [...AD_BANNER_EXPOSURE_TYPES])
				)
			: undefined;

	const candidateRows = await db
		.select({
			autoBoostsPerDay: jobPost.autoBoostsPerDay,
			id: jobPost.id,
		})
		.from(jobPost)
		.where(
			and(
				eq(jobPost.status, "published"),
				eq(jobPost.paymentStatus, "paid"),
				or(isNull(jobPost.exposureEndsAt), gt(jobPost.exposureEndsAt, now)),
				// 대기열 리스팅(결제완료·exposureEndsAt null인 스페셜/추천)은 노출 전이라 자동 끌올 제외.
				or(
					notInArray(jobPost.exposureType, [
						...CAPACITY_LISTING_EXPOSURE_TYPES,
					]),
					isNotNull(jobPost.exposureEndsAt)
				),
				or(
					and(
						gt(jobPost.autoBoostsPerDay, 0),
						inArray(jobPost.exposureType, [...LISTING_SECTION_EXPOSURE_TYPES])
					),
					autoPeriodBranch
				)
			)
		);

	if (candidateRows.length === 0) {
		return 0;
	}

	// 공고별 유효 자동 횟수 = 번들 + 활성 auto_period 합산.
	const candidates = candidateRows.map((row) => ({
		effectiveAutoPerDay:
			row.autoBoostsPerDay +
			sumActivePeriodBoostsPerDay(
				autoPeriodByJobId.get(row.id) ?? [],
				"auto_period",
				now
			),
		id: row.id,
	}));

	// 오늘 이미 발동된 자동 이벤트 수를 공고별로 집계한다(수동 이벤트는 boostType 필터로 제외).
	const autoUsedRows = await db
		.select({ jobPostId: jobBoostEvent.jobPostId, used: count() })
		.from(jobBoostEvent)
		.where(
			and(
				eq(jobBoostEvent.boostType, "auto"),
				gte(jobBoostEvent.createdAt, dayStart)
			)
		)
		.groupBy(jobBoostEvent.jobPostId);
	const autoUsedByJobId = new Map(
		autoUsedRows.map((row) => [row.jobPostId, row.used])
	);

	const dueCandidates = candidates.filter((candidate) => {
		// 사전 필터도 이 공고의 오프셋을 반영해야 잠금 내 재확인과 판정이 일치한다(둘이 다르면 재확인 무의미).
		const offsetMs = getAutoBoostSlotOffsetMs(
			candidate.id,
			candidate.effectiveAutoPerDay
		);
		const dueCount = countDueAutoBoostSlots(
			candidate.effectiveAutoPerDay,
			now,
			offsetMs
		);
		const used = autoUsedByJobId.get(candidate.id) ?? 0;
		return used < dueCount;
	});

	// 공고 하나를 자기 트랜잭션에서 발동한다. jobPost 행 잠금이 동시 틱·다중 인스턴스의
	// 직렬화 지점이다. 잠금 안에서 상태·유효 자동 횟수를 재확인해 쿼터 초과 발동을 구조적으로 막는다.
	const fireCandidate = (candidate: (typeof dueCandidates)[number]) =>
		db.transaction(async (tx) => {
			const [locked] = await tx
				.select({
					autoBoostsPerDay: jobPost.autoBoostsPerDay,
					exposureEndsAt: jobPost.exposureEndsAt,
					exposureType: jobPost.exposureType,
					organizationId: jobPost.organizationId,
					paymentStatus: jobPost.paymentStatus,
					status: jobPost.status,
				})
				.from(jobPost)
				.where(eq(jobPost.id, candidate.id))
				.for("update");

			if (!locked) {
				return false;
			}

			// 잠금 안에서 이 공고의 auto_period 구매를 재조회해 사전 필터와 같은 유효 횟수로 판정한다
			// (사전 필터와 재확인 판정이 일치해야 재확인이 의미 있다).
			const purchases: BoostPurchaseLike[] = await tx
				.select(boostPurchaseColumns)
				.from(jobBoostPurchase)
				.where(eq(jobBoostPurchase.jobPostId, candidate.id));
			const optionAutoPerDay = sumActivePeriodBoostsPerDay(
				purchases,
				"auto_period",
				now
			);
			const effectiveAutoPerDay = locked.autoBoostsPerDay + optionAutoPerDay;

			// 후보 합집합(사전 필터)과 동일한 소속 판정:
			//   (a) 번들 자동 ∧ 리스팅형  OR  (b) 활성 auto_period ∧ 배너형 제외.
			const isBundleListing =
				locked.autoBoostsPerDay > 0 &&
				(LISTING_SECTION_EXPOSURE_TYPES as readonly string[]).includes(
					locked.exposureType
				);
			const isAutoPeriodNonBanner =
				optionAutoPerDay > 0 &&
				!(AD_BANNER_EXPOSURE_TYPES as readonly string[]).includes(
					locked.exposureType
				);

			if (
				locked.status !== "published" ||
				locked.paymentStatus !== "paid" ||
				(locked.exposureEndsAt !== null &&
					locked.exposureEndsAt.getTime() <= now.getTime()) ||
				!(isBundleListing || isAutoPeriodNonBanner)
			) {
				return false;
			}

			// 사전 필터와 동일하게 이 공고의 오프셋을 반영한 dueCount로 재확인한다.
			const offsetMs = getAutoBoostSlotOffsetMs(
				candidate.id,
				effectiveAutoPerDay
			);
			const dueCount = countDueAutoBoostSlots(
				effectiveAutoPerDay,
				now,
				offsetMs
			);
			const [usage] = await tx
				.select({ used: count() })
				.from(jobBoostEvent)
				.where(
					and(
						eq(jobBoostEvent.jobPostId, candidate.id),
						eq(jobBoostEvent.boostType, "auto"),
						gte(jobBoostEvent.createdAt, dayStart)
					)
				);
			const usedToday = usage?.used ?? 0;

			if (usedToday >= dueCount) {
				return false;
			}

			// 자동 발동엔 사람 액터가 없어 actorUserId는 null로 저장한다(boostType으로 구분).
			// 자동 기간제는 차감 개념이 없어 purchaseId도 남기지 않는다.
			await tx.insert(jobBoostEvent).values({
				actorUserId: null,
				boostType: "auto",
				jobPostId: candidate.id,
				organizationId: locked.organizationId,
			});
			await tx
				.update(jobPost)
				.set({ boostedAt: now })
				.where(eq(jobPost.id, candidate.id));

			return true;
		});

	// 동시 실행 상한이 있는 워커 풀: 공유 인덱스에서 다음 대상을 꺼내는 워커를
	// min(상한, 대상 수)개 띄우고 Promise.all로 대기한다(청크 Promise.all보다 슬롯 활용이 좋음).
	// JS 이벤트 루프는 단일 스레드라 nextIndex 소비·fired 증가에 경쟁 조건이 없다.
	let nextIndex = 0;
	let fired = 0;

	const worker = async (): Promise<void> => {
		while (true) {
			const index = nextIndex;
			nextIndex += 1;
			const candidate = dueCandidates[index];
			// 인덱스가 대상 수를 넘어서면 undefined — 워커를 종료한다.
			if (!candidate) {
				return;
			}

			try {
				const didFire = await fireCandidate(candidate);
				if (didFire) {
					fired += 1;
				}
			} catch {
				// 개별 공고 실패는 삼키고 다음 공고를 진행한다(다음 틱이 캐치업).
			}
		}
	};

	const workerCount = Math.min(
		AUTO_BOOST_TICK_CONCURRENCY,
		dueCandidates.length
	);
	await Promise.all(Array.from({ length: workerCount }, () => worker()));

	return fired;
};
