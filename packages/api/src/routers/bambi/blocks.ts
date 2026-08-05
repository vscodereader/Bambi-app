import { db } from "@bambi-app/db";
import { user } from "@bambi-app/db/schema/auth";
import { userBlock } from "@bambi-app/db/schema/bambi";
import { ORPCError } from "@orpc/server";
import { and, desc, eq } from "drizzle-orm";
import z from "zod";

import { protectedProcedure } from "../../index";
import { requireActiveBambiProfile } from "../../services/bambi-authz";
import { resolveVisibleDisplayName } from "../../services/bambi-withdrawn-display";

// 차단 라이프사이클. 차단은 특정 방이 아니라 상대(사용자)에 대해 적용된다 —
// throwIfChatBlocked(chats.ts)가 userBlock row를 양방향으로 확인하므로, row 하나가
// 두 사람의 모든 공유 채팅방을 막는다. chatRoomId는 차단이 시작된 맥락 기록용(선택).
export const blocksRouter = {
	blockUser: protectedProcedure
		.input(
			z.object({
				blockedUserId: z.string().min(1),
				chatRoomId: z.string().uuid().optional(),
			})
		)
		.handler(async ({ context, input }) => {
			const profile = await requireActiveBambiProfile(context.session);

			if (input.blockedUserId === profile.userId) {
				throw new ORPCError("BAD_REQUEST", {
					message: "자기 자신은 차단할 수 없어요.",
				});
			}

			await db
				.insert(userBlock)
				.values({
					blockerUserId: profile.userId,
					blockedUserId: input.blockedUserId,
					chatRoomId: input.chatRoomId ?? null,
				})
				.onConflictDoNothing({
					target: [userBlock.blockerUserId, userBlock.blockedUserId],
				});

			return { ok: true };
		}),

	unblockUser: protectedProcedure
		.input(z.object({ blockedUserId: z.string().min(1) }))
		.handler(async ({ context, input }) => {
			const profile = await requireActiveBambiProfile(context.session);

			await db
				.delete(userBlock)
				.where(
					and(
						eq(userBlock.blockerUserId, profile.userId),
						eq(userBlock.blockedUserId, input.blockedUserId)
					)
				);

			return { ok: true };
		}),

	// 내가 차단한 사용자 목록. 상대 표시 이름은 user.name(표시명 정본)이되, 탈퇴한 상대는
	// 표시 계층에서 "탈퇴한 회원"으로 바꾼다 — 탈퇴는 마커만 남기므로 원본 닉네임이 그대로 있다.
	listMine: protectedProcedure.handler(async ({ context }) => {
		const profile = await requireActiveBambiProfile(context.session);

		const rows = await db
			.select({
				blockedUserId: userBlock.blockedUserId,
				userName: user.name,
				deletedAt: user.deletedAt,
				createdAt: userBlock.createdAt,
			})
			.from(userBlock)
			.leftJoin(user, eq(user.id, userBlock.blockedUserId))
			.where(eq(userBlock.blockerUserId, profile.userId))
			.orderBy(desc(userBlock.createdAt));

		return rows.map((row) => ({
			blockedUserId: row.blockedUserId,
			name: resolveVisibleDisplayName(
				{ deletedAt: row.deletedAt, name: row.userName },
				"알 수 없는 사용자"
			),
			createdAt: row.createdAt,
		}));
	}),
};
