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
import { and, asc, eq, inArray, ne, sql } from "drizzle-orm";

import { lockMemberPoints } from "./bambi-point-ledger";
import { SITE_SETTINGS_ROW_ID } from "./bambi-point-settings";
import { resolveGradeIconUrl } from "./bambi-storage";

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

const JOB_PAYMENT_POINT_REFUND_REASON_FAMILY_PREFIX = "공고 취소 포인트 환급";
const JOB_PAYMENT_POINT_REASON_PREFIXES = {
	refund: `${JOB_PAYMENT_POINT_REFUND_REASON_FAMILY_PREFIX}: `,
	refundForfeited: `${JOB_PAYMENT_POINT_REFUND_REASON_FAMILY_PREFIX} 완료(상한 소멸): `,
	use: "공고 등록 포인트 사용: ",
} as const;

export const JOB_PAYMENT_POINT_REASONS = {
	refund: (jobPostId: string): string =>
		`${JOB_PAYMENT_POINT_REASON_PREFIXES.refund}${jobPostId}`,
	refundForfeited: (jobPostId: string): string =>
		`${JOB_PAYMENT_POINT_REASON_PREFIXES.refundForfeited}${jobPostId}`,
	use: (jobPostId: string): string =>
		`${JOB_PAYMENT_POINT_REASON_PREFIXES.use}${jobPostId}`,
} as const;

export const JOB_PAYMENT_POINT_REASON_PATTERNS = {
	refund: `${JOB_PAYMENT_POINT_REFUND_REASON_FAMILY_PREFIX}%`,
	use: `${JOB_PAYMENT_POINT_REASON_PREFIXES.use}%`,
} as const;

export const isJobPaymentPointRefundReason = (reason: string): boolean =>
	reason.startsWith(JOB_PAYMENT_POINT_REFUND_REASON_FAMILY_PREFIX);

export const isJobPaymentPointUseReason = (reason: string): boolean =>
	reason.startsWith(JOB_PAYMENT_POINT_REASON_PREFIXES.use);

const GRADE_EXCLUDED_EXACT_REASONS = [
	POINT_SHOP_REASONS.purchase,
	POINT_SHOP_REASONS.refund,
] as const;

const GRADE_EXCLUDED_REASON_PREFIXES = Object.values(
	JOB_PAYMENT_POINT_REASON_PREFIXES
);

export function isGradeExcludedPointReason(reason: string): boolean {
	return (
		GRADE_EXCLUDED_EXACT_REASONS.some((excluded) => excluded === reason) ||
		GRADE_EXCLUDED_REASON_PREFIXES.some((prefix) => reason.startsWith(prefix))
	);
}

// 잔액과 달리 등급은 소비에 중립이다. 포인트몰은 고정 reason, 공고 결제는 기존 원장과의
// 호환을 위해 공고 ID가 뒤에 붙는 접두사로 제외한다. 본인 요약과 여러 회원 배지가 같은 SQL을
// 재사용해야 화면별 등급이 갈리지 않는다.
export const gradeBasisPointsSql = sql<number>`coalesce(sum(${bambiPointTransaction.amount}) filter (where ${bambiPointTransaction.reason} not in (${sql.join(
	GRADE_EXCLUDED_EXACT_REASONS.map((reason) => sql`${reason}`),
	sql`, `
)}) and ${bambiPointTransaction.reason} not like ${`${JOB_PAYMENT_POINT_REASON_PREFIXES.use}%`} and ${bambiPointTransaction.reason} not like ${`${JOB_PAYMENT_POINT_REASON_PREFIXES.refund}%`} and ${bambiPointTransaction.reason} not like ${`${JOB_PAYMENT_POINT_REASON_PREFIXES.refundForfeited}%`}), 0)::int`;

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

// DB: 전역 선착 마일스톤. 사이트 전체 통산 댓글 수가 이번 댓글로 정확히 어느 회차와 일치하면,
// 그 댓글을 단 회원이 보너스를 가져간다. milestone_id UNIQUE + onConflictDoNothing이 마일스톤당
// 1회·경합 이중지급을 막는다. award 행에 당첨 댓글(commentId)을 기록해 배지 렌더의 근거로 쓴다.
//
// 정확 일치(== )만 지급한다 — 지나간 회차는 소급 지급하지 않는다(전역 모델에서 catch-up은 배포
// 직후 미지급분을 한 회원이 싹쓸이하는 사고가 된다). 이미 지나간 회차 행은 영원히 미달성으로 남는다.
// ponytail: count 경합으로 두 댓글이 같은 순번을 읽거나 서로의 삽입 사이에 끼면 그 회차를 아무도
// 못 받고 넘어갈 수 있다 — 전역 정확 일치의 알려진 한계. 정합이 필요하면 순번을 원장으로 직렬화.
export async function awardCommentMilestones(
	tx: TxHandle,
	userId: string,
	totalCommentCount: number,
	commentId: string
): Promise<Array<{ commentCount: number; bonusPoints: number }>> {
	// comment_count는 UNIQUE라 정확 일치는 최대 한 행이다.
	const [milestone] = await tx
		.select({
			id: bambiCommentMilestone.id,
			commentCount: bambiCommentMilestone.commentCount,
			bonusPoints: bambiCommentMilestone.bonusPoints,
		})
		.from(bambiCommentMilestone)
		.where(eq(bambiCommentMilestone.commentCount, totalCommentCount))
		.limit(1);
	if (!milestone) {
		return [];
	}
	// award 행이 실제로 생긴 경우에만 지급한다 — 동시 실행이 같은 마일스톤을 노려도 unique
	// 충돌로 두 번째는 스킵돼 중복 지급이 없다(출석 적립과 같은 가드).
	const inserted = await tx
		.insert(bambiCommentMilestoneAward)
		.values({ userId, milestoneId: milestone.id, commentId })
		.onConflictDoNothing()
		.returning({ id: bambiCommentMilestoneAward.id });
	if (inserted.length === 0) {
		return [];
	}
	await lockMemberPoints(tx, userId);
	const cap = await getMemberPointsCap();
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
	return [{ commentCount: milestone.commentCount, bonusPoints: appliedDelta }];
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
			basis: gradeBasisPointsSql,
		})
		.from(bambiPointTransaction)
		.where(inArray(bambiPointTransaction.userId, unique))
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
