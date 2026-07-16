import { db } from "@bambi-app/db";
import { jobBoostEvent, jobPost } from "@bambi-app/db/schema/bambi";
import { and, count, eq, gt, gte, isNull, or } from "drizzle-orm";

import { countDueAutoBoostSlots, getKstDayStart } from "./bambi-job-boost";

// 자동 끌어올리기 틱: 매 호출마다 DB 기준으로 재계산한다(무상태). 후보 공고 중
// 오늘 도래한 자동 슬롯 수보다 자동 발동이 덜 된 공고를 공고별 트랜잭션으로 1건씩 발동한다.
// 상태를 메모리에 두지 않아 서버 재시작에도 당일 내 캐치업되고, 이력·정렬이 수동 끌어올리기와
// 동일한 데이터 경로(jobBoostEvent + boostedAt)를 공유한다.
//
// 반환값은 이번 틱에서 실제 발동한 공고 수다. 개별 공고 실패는 삼켜 다음 공고를 진행하며,
// 실패 목록은 호출자(플러그인)가 로그로 남긴다(틱이 서버를 죽이면 안 됨).
export const runAutoBoostTick = async (now: Date): Promise<number> => {
	const dayStart = getKstDayStart(now);

	// 후보: 자동 횟수 보유 AND 공개 중(게시+결제완료) AND 노출 유효(만료 안 됨).
	const candidates = await db
		.select({
			autoBoostsPerDay: jobPost.autoBoostsPerDay,
			id: jobPost.id,
			organizationId: jobPost.organizationId,
		})
		.from(jobPost)
		.where(
			and(
				gt(jobPost.autoBoostsPerDay, 0),
				eq(jobPost.status, "published"),
				eq(jobPost.paymentStatus, "paid"),
				or(isNull(jobPost.exposureEndsAt), gt(jobPost.exposureEndsAt, now))
			)
		);

	if (candidates.length === 0) {
		return 0;
	}

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
		const dueCount = countDueAutoBoostSlots(candidate.autoBoostsPerDay, now);
		const used = autoUsedByJobId.get(candidate.id) ?? 0;
		return used < dueCount;
	});

	let fired = 0;

	for (const candidate of dueCandidates) {
		try {
			// 공고별 트랜잭션: jobPost 행 잠금이 동시 틱·다중 인스턴스의 직렬화 지점이다.
			// 잠금 안에서 상태·자동 카운트를 재확인해 쿼터 초과 발동을 구조적으로 막는다.
			const didFire = await db.transaction(async (tx) => {
				const [locked] = await tx
					.select({
						autoBoostsPerDay: jobPost.autoBoostsPerDay,
						exposureEndsAt: jobPost.exposureEndsAt,
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

				if (
					locked.status !== "published" ||
					locked.paymentStatus !== "paid" ||
					(locked.exposureEndsAt !== null &&
						locked.exposureEndsAt.getTime() <= now.getTime())
				) {
					return false;
				}

				const dueCount = countDueAutoBoostSlots(locked.autoBoostsPerDay, now);
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

			if (didFire) {
				fired += 1;
			}
		} catch {
			// 개별 공고 실패는 삼키고 다음 공고를 진행한다(다음 틱이 캐치업).
		}
	}

	return fired;
};
