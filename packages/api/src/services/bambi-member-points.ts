import { db } from "@bambi-app/db";
import {
	bambiMemberGrade,
	bambiPointTransaction,
	bambiSiteSettings,
	communityBoard,
} from "@bambi-app/db/schema/bambi";
import { asc, eq, inArray, sql } from "drizzle-orm";

// site_settings 단일 행 고정 키(site-settings.ts SETTINGS_ROW_ID와 같은 값).
const SITE_SETTINGS_ROW_ID = "default";

export interface MemberGrade {
	color: string | null;
	id: string;
	minPoints: number;
	name: string;
}

export interface GradeBadge {
	color: string | null;
	name: string;
}

// 원장 reason(현재 text). 미래의 채팅/채용 적립도 여기 키만 추가해 재사용한다.
export const POINT_REASONS = {
	post: { award: "community_post", revoke: "community_post_revoke" },
	comment: { award: "community_comment", revoke: "community_comment_revoke" },
} as const;

// 순수: 현재 적립 스냅샷과 목표 적립액으로 원장 델타·새 스냅샷을 계산한다.
// 목표는 caller가 (회원 && 게시판 포인트)일 때만 양수로, 그 외엔 0으로 넘긴다.
export function reconcilePoints(
	currentAwarded: number,
	targetAmount: number
): { delta: number; nextAwarded: number } {
	const target = Math.max(0, targetAmount);
	return { delta: target - currentAwarded, nextAwarded: target };
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
	// 적립만 상한으로 자른다 — 회수(delta<0)는 상한과 무관하다.
	let appliedDelta = delta;
	if (delta > 0) {
		const cap = await getMemberPointsCap();
		if (cap !== null) {
			const balance = await getMemberBalanceTx(tx, args.userId);
			appliedDelta = applyPointsCap(delta, balance, cap);
		}
	}
	if (appliedDelta !== 0) {
		await tx.insert(bambiPointTransaction).values({
			amount: appliedDelta,
			reason: appliedDelta > 0 ? args.reasons.award : args.reasons.revoke,
			userId: args.userId,
		});
	}
	return args.currentAwarded + appliedDelta;
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

// DB: 여러 회원의 등급 뱃지(이름·색). 등급표를 한 번 읽고 잔액→등급으로 매핑한다.
export async function loadGradeBadges(
	userIds: string[]
): Promise<Map<string, GradeBadge>> {
	const badges = new Map<string, GradeBadge>();
	const unique = [...new Set(userIds)];
	if (unique.length === 0) {
		return badges;
	}
	const [grades, balances] = await Promise.all([
		db
			.select({
				id: bambiMemberGrade.id,
				name: bambiMemberGrade.name,
				minPoints: bambiMemberGrade.minPoints,
				color: bambiMemberGrade.color,
			})
			.from(bambiMemberGrade)
			.orderBy(asc(bambiMemberGrade.minPoints)),
		getPointBalances(unique),
	]);
	if (grades.length === 0) {
		return badges;
	}
	for (const userId of unique) {
		const grade = resolveGrade(balances.get(userId) ?? 0, grades);
		if (grade) {
			badges.set(userId, { name: grade.name, color: grade.color });
		}
	}
	return badges;
}
