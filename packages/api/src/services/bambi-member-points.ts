import { db } from "@bambi-app/db";
import {
	bambiMemberGrade,
	bambiPointTransaction,
	communityBoard,
} from "@bambi-app/db/schema/bambi";
import { asc, eq, inArray, sql } from "drizzle-orm";

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

// DB: 상태 전이에서 원장 델타 한 행을 쌓고 새 스냅샷을 돌려준다. userId 없으면(게스트)·델타 0이면
// 원장은 건드리지 않는다. reason은 델타 부호로 적립/회수를 가른다.
export async function reconcileContentPoints(
	tx: TxHandle,
	args: {
		userId: string | null;
		currentAwarded: number;
		targetAmount: number;
		reasons: { award: string; revoke: string };
	}
): Promise<number> {
	const { delta, nextAwarded } = reconcilePoints(
		args.currentAwarded,
		args.targetAmount
	);
	if (delta !== 0 && args.userId) {
		await tx.insert(bambiPointTransaction).values({
			amount: delta,
			reason: delta > 0 ? args.reasons.award : args.reasons.revoke,
			userId: args.userId,
		});
	}
	return nextAwarded;
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
