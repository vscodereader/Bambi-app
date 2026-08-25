import { db } from "@bambi-app/db";
import {
	bambiCommentMilestone,
	bambiCommentMilestoneAward,
	bambiMemberGrade,
	bambiPointTransaction,
	bambiProfile,
	bambiSiteSettings,
	communityBoard,
} from "@bambi-app/db/schema/bambi";
import { and, asc, eq, inArray, lte, ne, notInArray, sql } from "drizzle-orm";

import { lockMemberPoints } from "./bambi-point-ledger";
import { resolveGradeIconUrl } from "./bambi-storage";

// site_settings 단일 행 고정 키(site-settings.ts SETTINGS_ROW_ID와 같은 값).
const SITE_SETTINGS_ROW_ID = "default";

export interface MemberGrade {
	color: string | null;
	iconStorageKey?: string | null;
	id: string;
	minPoints: number;
	name: string;
}

export interface GradeBadge {
	color: string | null;
	iconUrl: string | null;
	name: string;
}

// 원장 reason(현재 text). 미래의 채팅/채용 적립도 여기 키만 추가해 재사용한다.
export const POINT_REASONS = {
	post: { award: "community_post", revoke: "community_post_revoke" },
	comment: { award: "community_comment", revoke: "community_comment_revoke" },
	commentBonus: {
		award: "community_comment_bonus",
		revoke: "community_comment_bonus_revoke",
	},
} as const;

// 댓글 수 마일스톤 보너스 원장 reason. 회수 없음(단조 누적)이라 award 하나만 둔다.
export const COMMENT_MILESTONE_REASON = "community_comment_milestone";

// 포인트몰 구매·환불 reason. 등급 계산에서 제외한다 — 구매(−)·환불(+)이 등급에 중립이어야
// 하고, 글/댓글 회수(*_revoke, 음수)는 기존대로 등급에서 빠진다("양수만 합산"이면 회수가
// 등급에 반영되지 않는 함정이 있어 reason 제외 방식을 쓴다).
export const POINT_SHOP_REASONS = {
	purchase: "point_shop_purchase",
	refund: "point_shop_refund",
} as const;

const GRADE_EXCLUDED_REASONS = [
	POINT_SHOP_REASONS.purchase,
	POINT_SHOP_REASONS.refund,
];

// 순수: 현재 적립 스냅샷과 목표 적립액으로 원장 델타·새 스냅샷을 계산한다.
// 목표는 caller가 (회원 && 게시판 포인트)일 때만 양수로, 그 외엔 0으로 넘긴다.
export function reconcilePoints(
	currentAwarded: number,
	targetAmount: number
): { delta: number; nextAwarded: number } {
	const target = Math.max(0, targetAmount);
	return { delta: target - currentAwarded, nextAwarded: target };
}

// 순수: 댓글 적립 목표액. 게스트(userId null)와 자기 글에 자기가 단 댓글은 0(셀프 적립 방지),
// 그 외 회원 댓글은 게시판 댓글 포인트. postAuthorUserId가 null(수집 글 등 작성자 없음)이면 셀프가 아니다.
export function resolveCommentAward(
	commentAuthorUserId: string | null,
	postAuthorUserId: string | null,
	boardCommentPoints: number
): number {
	if (commentAuthorUserId === null) {
		return 0;
	}
	if (commentAuthorUserId === postAuthorUserId) {
		return 0;
	}
	return boardCommentPoints;
}

// 순수: 댓글 랜덤 보너스 당첨액. 비활성·기본 적립 0(꽝인 게스트/셀프)·확률 0 이하면 0. random()*100이
// chancePercent 미만이면 당첨 → min~max 균등 정수, 그 외 꽝(0). random 주입으로 결정적 테스트가 된다.
// min>max·음수는 방어한다(min=max(0,min), max=max(min,max)) — 운영자 오입력에도 음수·역구간이 안 나온다.
export function rollCommentBonus(
	settings: {
		enabled: boolean;
		chancePercent: number;
		minPoints: number;
		maxPoints: number;
	},
	baseAward: number,
	random: () => number = Math.random
): number {
	if (baseAward <= 0 || !settings.enabled || settings.chancePercent <= 0) {
		return 0;
	}
	if (random() * 100 >= settings.chancePercent) {
		return 0;
	}
	const min = Math.max(0, settings.minPoints);
	const max = Math.max(min, settings.maxPoints);
	return min + Math.floor(random() * (max - min + 1));
}

// 순수: 적립 델타를 회원 누적 상한 여유분까지만 반영한다. cap null(무제한)이거나 회수(delta<=0)면
// 그대로 둔다. currentBalance는 이 적립을 반영하기 전의 회원 순합계다.
export function applyPointsCap(
	delta: number,
	currentBalance: number,
	cap: number | null
): number {
	if (cap === null || delta <= 0) {
		return delta;
	}
	const room = Math.max(0, cap - currentBalance);
	return Math.min(delta, room);
}

// 순수: 회원 포인트 상한 저장 가드. null(무제한)은 항상 허용하고, 값이면 최고 등급 기준 포인트
// 이상이어야 한다 — 상한이 그보다 낮으면 그 등급이 영원히 도달 불가가 되기 때문이다.
export function isPointsCapAllowed(
	cap: number | null,
	topGradeMinPoints: number
): boolean {
	return cap === null || cap >= topGradeMinPoints;
}

// 순수: 잔액(순합계)에 해당하는 최상위 등급. grades는 minPoints 오름차순 전제.
export function resolveGrade(
	balance: number,
	grades: MemberGrade[]
): MemberGrade | null {
	let result: MemberGrade | null = grades[0] ?? null;
	for (const grade of grades) {
		if (grade.minPoints <= balance) {
			result = grade;
		} else {
			break;
		}
	}
	return result;
}

// 순수: 잔액보다 높은 첫 등급(다음 목표). 없으면 null(최고 등급).
export function nextGrade(
	balance: number,
	grades: MemberGrade[]
): MemberGrade | null {
	return grades.find((grade) => grade.minPoints > balance) ?? null;
}

// 순수: 기본(min_points=0) 등급이 마지막 하나면 삭제하면 안 된다(모든 회원의 등급이 사라짐).
export function assertGradeDeletable(
	grade: { minPoints: number },
	zeroPointGradeCount: number
): boolean {
	if (grade.minPoints === 0 && zeroPointGradeCount <= 1) {
		return false;
	}
	return true;
}

type TxHandle = Parameters<Parameters<typeof db.transaction>[0]>[0];

// DB: 회원의 현재 포인트 순합계(같은 트랜잭션 안에서 조회). 상한을 적용하려면 이 적립 이전의
// 잔액을 알아야 여유분(cap - balance)을 계산할 수 있다.
async function getMemberBalanceTx(
	tx: TxHandle,
	userId: string
): Promise<number> {
	const [row] = await tx
		.select({
			balance: sql<number>`coalesce(sum(${bambiPointTransaction.amount}), 0)::int`,
		})
		.from(bambiPointTransaction)
		.where(eq(bambiPointTransaction.userId, userId));
	return row?.balance ?? 0;
}

// DB: 상태 전이에서 원장 델타 한 행을 쌓고 새 스냅샷을 돌려준다. userId 없으면(게스트)·델타 0이면
// 원장은 건드리지 않는다. reason은 델타 부호로 적립/회수를 가른다. 적립(delta>0)은 회원 누적
// 상한(cap)을 넘지 않게 잘라 반영하고, 잘린 만큼이 스냅샷에도 남아 이후 회수가 정확히 맞는다.
export async function reconcileContentPoints(
	tx: TxHandle,
	args: {
		userId: string | null;
		currentAwarded: number;
		targetAmount: number;
		reasons: { award: string; revoke: string };
	}
): Promise<number> {
	const { delta } = reconcilePoints(args.currentAwarded, args.targetAmount);
	if (delta === 0 || !args.userId) {
		return args.currentAwarded + delta;
	}
	await lockMemberPoints(tx, args.userId);
	// 적립만 상한으로 자른다 — 회수(delta<0)는 상한과 무관하다.
	let appliedDelta = delta;
	const balance = await getMemberBalanceTx(tx, args.userId);
	if (delta > 0) {
		const cap = await getMemberPointsCap();
		if (cap !== null) {
			appliedDelta = applyPointsCap(delta, balance, cap);
		}
	}
	if (appliedDelta !== 0) {
		await tx.insert(bambiPointTransaction).values({
			amount: appliedDelta,
			balanceAfter: balance + appliedDelta,
			reason: appliedDelta > 0 ? args.reasons.award : args.reasons.revoke,
			userId: args.userId,
		});
	}
	return args.currentAwarded + appliedDelta;
}

// DB: 도달한 댓글 수 마일스톤 중 이 회원에게 아직 안 준 것을 전부 지급한다(멱등). award 행을
// onConflictDoNothing으로 넣어 실제 삽입된 건만 원장에 쌓으므로 경합에서도 중복 지급이 없다.
// 마일스톤은 회수 없음(단조 누적)이라 적립만 하고, cap을 넘지 않게 잘라 반영한다. bonusPoints는
// 실제 반영된 금액(cap에 걸리면 그만큼 줄고, 다 막히면 0)이며, award 행은 그래도 남아 재지급하지 않는다.
export async function awardCommentMilestones(
	tx: TxHandle,
	userId: string,
	totalCommentCount: number
): Promise<Array<{ commentCount: number; bonusPoints: number }>> {
	// 이미 지급받은 마일스톤은 제외하고 도달한 것만 오름차순으로 훑는다.
	const awardedIds = tx
		.select({ milestoneId: bambiCommentMilestoneAward.milestoneId })
		.from(bambiCommentMilestoneAward)
		.where(eq(bambiCommentMilestoneAward.userId, userId));
	const milestones = await tx
		.select({
			id: bambiCommentMilestone.id,
			commentCount: bambiCommentMilestone.commentCount,
			bonusPoints: bambiCommentMilestone.bonusPoints,
		})
		.from(bambiCommentMilestone)
		.where(
			and(
				lte(bambiCommentMilestone.commentCount, totalCommentCount),
				notInArray(bambiCommentMilestone.id, awardedIds)
			)
		)
		.orderBy(asc(bambiCommentMilestone.commentCount));
	if (milestones.length === 0) {
		return [];
	}
	await lockMemberPoints(tx, userId);
	const cap = await getMemberPointsCap();
	const awarded: Array<{ commentCount: number; bonusPoints: number }> = [];
	for (const milestone of milestones) {
		// award 행이 실제로 생긴 경우에만 지급한다 — 동시 실행이 같은 마일스톤을 노려도 unique
		// 충돌로 두 번째는 스킵돼 중복 지급이 없다(출석 적립과 같은 가드).
		const inserted = await tx
			.insert(bambiCommentMilestoneAward)
			.values({ userId, milestoneId: milestone.id })
			.onConflictDoNothing()
			.returning({ id: bambiCommentMilestoneAward.id });
		if (inserted.length === 0) {
			continue;
		}
		// 잔액은 매 지급마다 다시 읽는다(직전 지급으로 늘어 cap 여유가 줄기 때문).
		const balance = await getMemberBalanceTx(tx, userId);
		const appliedDelta =
			cap === null
				? milestone.bonusPoints
				: applyPointsCap(milestone.bonusPoints, balance, cap);
		if (appliedDelta > 0) {
			await tx.insert(bambiPointTransaction).values({
				amount: appliedDelta,
				balanceAfter: balance + appliedDelta,
				reason: COMMENT_MILESTONE_REASON,
				userId,
			});
		}
		awarded.push({
			commentCount: milestone.commentCount,
			bonusPoints: appliedDelta,
		});
	}
	return awarded;
}

// DB: 게시판의 글/댓글 적립 금액. 없으면 0/0. 설정 읽기라 트랜잭션 밖 db로 충분하다.
export async function getBoardContentPoints(
	board: string
): Promise<{ postPoints: number; commentPoints: number }> {
	const [row] = await db
		.select({
			postPoints: communityBoard.postPoints,
			commentPoints: communityBoard.commentPoints,
		})
		.from(communityBoard)
		.where(eq(communityBoard.key, board))
		.limit(1);
	return {
		postPoints: row?.postPoints ?? 0,
		commentPoints: row?.commentPoints ?? 0,
	};
}

// DB: 회원 누적 포인트 상한(cap). 미설정(null)이면 상한 없음. 설정 읽기라 트랜잭션 밖 db로 충분하다.
export async function getMemberPointsCap(): Promise<number | null> {
	const [row] = await db
		.select({ cap: bambiSiteSettings.maxMemberPoints })
		.from(bambiSiteSettings)
		.where(eq(bambiSiteSettings.id, SITE_SETTINGS_ROW_ID))
		.limit(1);
	return row?.cap ?? null;
}

// DB: 댓글 랜덤 보너스 설정(단일 행). 미조회 시 스키마 기본값과 같은 안전값으로 폴백한다.
export async function getCommentBonusSettings(): Promise<{
	enabled: boolean;
	chancePercent: number;
	minPoints: number;
	maxPoints: number;
}> {
	const [row] = await db
		.select({
			enabled: bambiSiteSettings.commentBonusEnabled,
			chancePercent: bambiSiteSettings.commentBonusChancePercent,
			minPoints: bambiSiteSettings.commentBonusMinPoints,
			maxPoints: bambiSiteSettings.commentBonusMaxPoints,
		})
		.from(bambiSiteSettings)
		.where(eq(bambiSiteSettings.id, SITE_SETTINGS_ROW_ID))
		.limit(1);
	return {
		enabled: row?.enabled ?? false,
		chancePercent: row?.chancePercent ?? 0,
		minPoints: row?.minPoints ?? 0,
		maxPoints: row?.maxPoints ?? 0,
	};
}

// DB: 여러 회원의 포인트 잔액(순합계). 결과에 없는 userId는 0으로 취급한다.
export async function getPointBalances(
	userIds: string[]
): Promise<Map<string, number>> {
	const map = new Map<string, number>();
	const unique = [...new Set(userIds)];
	if (unique.length === 0) {
		return map;
	}
	const rows = await db
		.select({
			userId: bambiPointTransaction.userId,
			balance: sql<number>`coalesce(sum(${bambiPointTransaction.amount}), 0)::int`,
		})
		.from(bambiPointTransaction)
		.where(inArray(bambiPointTransaction.userId, unique))
		.groupBy(bambiPointTransaction.userId);
	for (const row of rows) {
		map.set(row.userId, row.balance);
	}
	return map;
}

// DB: 여러 회원의 등급 기준 포인트 = 포인트몰 reason 제외 원장 합계. 잔액(전체 합계)과
// 구분된다. 결과에 없는 userId는 0으로 취급한다.
export async function getGradeBasisPoints(
	userIds: string[]
): Promise<Map<string, number>> {
	const map = new Map<string, number>();
	const unique = [...new Set(userIds)];
	if (unique.length === 0) {
		return map;
	}
	const rows = await db
		.select({
			userId: bambiPointTransaction.userId,
			basis: sql<number>`coalesce(sum(${bambiPointTransaction.amount}), 0)::int`,
		})
		.from(bambiPointTransaction)
		.where(
			and(
				inArray(bambiPointTransaction.userId, unique),
				notInArray(bambiPointTransaction.reason, GRADE_EXCLUDED_REASONS)
			)
		)
		.groupBy(bambiPointTransaction.userId);
	for (const row of rows) {
		map.set(row.userId, row.basis);
	}
	return map;
}

// DB: 여러 회원의 등급 뱃지(이름·색). 등급표를 한 번 읽고 등급 기준 합계→등급으로 매핑한다.
export async function loadGradeBadges(
	userIds: string[]
): Promise<Map<string, GradeBadge>> {
	const badges = new Map<string, GradeBadge>();
	const unique = [...new Set(userIds)];
	if (unique.length === 0) {
		return badges;
	}
	const eligibleRows = await db
		.select({ userId: bambiProfile.userId })
		.from(bambiProfile)
		.where(
			and(inArray(bambiProfile.userId, unique), ne(bambiProfile.role, "admin"))
		);
	const eligibleUserIds = eligibleRows.map((row) => row.userId);
	if (eligibleUserIds.length === 0) {
		return badges;
	}
	const [grades, basisPoints] = await Promise.all([
		db
			.select({
				id: bambiMemberGrade.id,
				name: bambiMemberGrade.name,
				minPoints: bambiMemberGrade.minPoints,
				color: bambiMemberGrade.color,
				iconStorageKey: bambiMemberGrade.iconStorageKey,
			})
			.from(bambiMemberGrade)
			.orderBy(asc(bambiMemberGrade.minPoints)),
		getGradeBasisPoints(eligibleUserIds),
	]);
	if (grades.length === 0) {
		return badges;
	}
	for (const userId of eligibleUserIds) {
		const grade = resolveGrade(basisPoints.get(userId) ?? 0, grades);
		if (grade) {
			badges.set(userId, {
				color: grade.color,
				iconUrl: resolveGradeIconUrl(grade.iconStorageKey ?? null),
				name: grade.name,
			});
		}
	}
	return badges;
}
