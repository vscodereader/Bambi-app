import { db } from "@bambi-app/db";
import { bannedWord } from "@bambi-app/db/schema/bambi";
import { ORPCError } from "@orpc/server";
import { asc, eq } from "drizzle-orm";
import z from "zod";

import { adminProcedure } from "../../index";
import { requireAdminProfile } from "../../services/bambi-authz";
import {
	invalidateBannedWordCache,
	normalizeForMatch,
} from "../../services/bambi-banned-words";

const TERM_MAX = 100;

const listBannedWordsInput = z.object({
	includeInactive: z.boolean().default(false),
});

const createBannedWordInput = z.object({
	term: z.string().trim().min(1).max(TERM_MAX),
});

const bannedWordIdInput = z.object({
	id: z.string().uuid(),
});

const setBannedWordActiveInput = bannedWordIdInput.extend({
	isActive: z.boolean(),
});

export const bannedWordsRouter = {
	list: adminProcedure
		.input(listBannedWordsInput)
		.handler(async ({ input }) => {
			const rows = await db
				.select()
				.from(bannedWord)
				.orderBy(asc(bannedWord.term));

			const items = input.includeInactive
				? rows
				: rows.filter((row) => row.isActive);

			return { items };
		}),

	create: adminProcedure
		.input(createBannedWordInput)
		.handler(async ({ context, input }) => {
			const profile = await requireAdminProfile(context.session);
			const normalizedTerm = normalizeForMatch(input.term);

			if (normalizedTerm.length === 0) {
				throw new ORPCError("BAD_REQUEST", {
					message: "금칙어는 공백·특수문자만으로 등록할 수 없습니다.",
				});
			}

			const [existing] = await db
				.select({ id: bannedWord.id })
				.from(bannedWord)
				.where(eq(bannedWord.normalizedTerm, normalizedTerm))
				.limit(1);

			if (existing) {
				throw new ORPCError("CONFLICT", {
					message: "이미 등록된 금칙어입니다.",
				});
			}

			const [created] = await db
				.insert(bannedWord)
				.values({
					term: input.term,
					normalizedTerm,
					createdByUserId: profile.userId,
				})
				.returning({ id: bannedWord.id });

			if (!created) {
				throw new ORPCError("INTERNAL_SERVER_ERROR", {
					message: "Banned word could not be created.",
				});
			}

			invalidateBannedWordCache();

			return { id: created.id };
		}),

	setActive: adminProcedure
		.input(setBannedWordActiveInput)
		.handler(async ({ input }) => {
			await db
				.update(bannedWord)
				.set({ isActive: input.isActive, updatedAt: new Date() })
				.where(eq(bannedWord.id, input.id));

			invalidateBannedWordCache();

			return { ok: true };
		}),

	remove: adminProcedure.input(bannedWordIdInput).handler(async ({ input }) => {
		await db.delete(bannedWord).where(eq(bannedWord.id, input.id));

		invalidateBannedWordCache();

		return { ok: true };
	}),
};
