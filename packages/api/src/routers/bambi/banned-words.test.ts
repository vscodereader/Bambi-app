import { randomUUID } from "node:crypto";

import { createProcedureClient } from "@orpc/server";
import dotenv from "dotenv";
import { eq, inArray } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import type { Context } from "../../context";

dotenv.config({
	path: "../../apps/server/.env",
});

const [{ db }, authSchema, bambiSchema, { bannedWordsRouter }] =
	await Promise.all([
		import("@bambi-app/db"),
		import("@bambi-app/db/schema/auth"),
		import("@bambi-app/db/schema/bambi"),
		import("./banned-words"),
	]);

const { user } = authSchema;
const { bambiProfile, bannedWord } = bambiSchema;

const createContextForUser = (userId: string): Context =>
	({
		auth: null,
		session: {
			user: {
				id: userId,
			},
		},
	}) as Context;

const makeEmail = (prefix: string): string =>
	`${prefix}-${randomUUID()}@bambi.test`;

// 정규화(소문자·공백/구두점 제거)해도 알파벳/숫자는 남으므로 UUID 기반 term은
// 실 DB 데이터와 충돌하지 않는 고유값이 된다.
const makeUniqueBase = (): string => `bw${randomUUID().replaceAll("-", "")}`;

interface UserFixture {
	userId: string;
}

const createUserFixture = async (
	role: "admin" | "job_seeker"
): Promise<UserFixture> => {
	const userId = `user_test_${role}_${randomUUID()}`;
	await db.insert(user).values({
		email: makeEmail(role),
		id: userId,
		name: role === "admin" ? "운영자" : "일반 사용자",
	});
	await db.insert(bambiProfile).values({
		isPhoneVerified: true,
		role,
		status: "active",
		userId,
	});
	return { userId };
};

const cleanupUserFixture = async (fixture: UserFixture): Promise<void> => {
	await db.delete(bambiProfile).where(eq(bambiProfile.userId, fixture.userId));
	await db.delete(user).where(eq(user.id, fixture.userId));
};

const cleanupTerms = async (terms: string[]): Promise<void> => {
	if (terms.length === 0) {
		return;
	}
	await db.delete(bannedWord).where(inArray(bannedWord.term, terms));
};

const expectOrpcCode = async (
	promise: Promise<unknown>,
	code: string
): Promise<void> => {
	await expect(promise).rejects.toMatchObject({ code });
};

describe("bambi banned words createMany", () => {
	it("inserts new terms and reports the added count", async () => {
		const admin = await createUserFixture("admin");
		const base = makeUniqueBase();
		const terms = [`${base}a`, `${base}b`, `${base}c`];

		try {
			const createMany = createProcedureClient(bannedWordsRouter.createMany, {
				context: createContextForUser(admin.userId),
				path: ["bambi", "bannedWords", "createMany"],
			});

			const result = await createMany({ terms });

			expect(result).toEqual({ added: 3, skipped: [] });

			const rows = await db
				.select({ term: bannedWord.term })
				.from(bannedWord)
				.where(inArray(bannedWord.term, terms));

			expect(rows).toHaveLength(3);
		} finally {
			await cleanupTerms(terms);
			await cleanupUserFixture(admin);
		}
	});

	it("skips terms that normalize to a duplicate within the batch", async () => {
		const admin = await createUserFixture("admin");
		const base = makeUniqueBase();
		// 공백을 끼워도 정규화하면 base와 같아진다(중복).
		const dupWithSpace = `${base.slice(0, 4)} ${base.slice(4)}`;
		const fresh = `${base}fresh`;
		const terms = [base, dupWithSpace, fresh];

		try {
			const createMany = createProcedureClient(bannedWordsRouter.createMany, {
				context: createContextForUser(admin.userId),
				path: ["bambi", "bannedWords", "createMany"],
			});

			const result = await createMany({ terms });

			expect(result.added).toBe(2);
			expect(result.skipped).toEqual([
				{ reason: "duplicate", term: dupWithSpace },
			]);
		} finally {
			await cleanupTerms(terms);
			await cleanupUserFixture(admin);
		}
	});

	it("skips terms that normalize to an empty string", async () => {
		const admin = await createUserFixture("admin");
		const base = makeUniqueBase();
		const terms = ["!!!", base];

		try {
			const createMany = createProcedureClient(bannedWordsRouter.createMany, {
				context: createContextForUser(admin.userId),
				path: ["bambi", "bannedWords", "createMany"],
			});

			const result = await createMany({ terms });

			expect(result.added).toBe(1);
			expect(result.skipped).toEqual([{ reason: "empty", term: "!!!" }]);
		} finally {
			await cleanupTerms(terms);
			await cleanupUserFixture(admin);
		}
	});

	it("rejects non-admin callers with FORBIDDEN", async () => {
		const seeker = await createUserFixture("job_seeker");
		const terms = [makeUniqueBase()];

		try {
			const createMany = createProcedureClient(bannedWordsRouter.createMany, {
				context: createContextForUser(seeker.userId),
				path: ["bambi", "bannedWords", "createMany"],
			});

			await expectOrpcCode(createMany({ terms }), "FORBIDDEN");
		} finally {
			await cleanupTerms(terms);
			await cleanupUserFixture(seeker);
		}
	});
});

// removeAll은 테이블을 통째로 비우므로 개발 DB의 실제 금칙어까지 지운다. 격리할 방법이
// 없어 테스트하지 않는다 — 대신 선택 삭제(inArray)만 고정한다.
describe("bambi banned words remove", () => {
	it("deletes only the selected ids and reports the count", async () => {
		const admin = await createUserFixture("admin");
		const base = makeUniqueBase();
		const terms = [`${base}a`, `${base}b`, `${base}c`];

		try {
			const context = createContextForUser(admin.userId);
			const createMany = createProcedureClient(bannedWordsRouter.createMany, {
				context,
				path: ["bambi", "bannedWords", "createMany"],
			});
			const remove = createProcedureClient(bannedWordsRouter.remove, {
				context,
				path: ["bambi", "bannedWords", "remove"],
			});

			await createMany({ terms });

			const rows = await db
				.select({ id: bannedWord.id, term: bannedWord.term })
				.from(bannedWord)
				.where(inArray(bannedWord.term, terms));
			const doomed = rows.filter((row) => row.term !== `${base}c`);

			const result = await remove({ ids: doomed.map((row) => row.id) });

			expect(result).toEqual({ removed: 2 });

			const survivors = await db
				.select({ term: bannedWord.term })
				.from(bannedWord)
				.where(inArray(bannedWord.term, terms));

			expect(survivors).toEqual([{ term: `${base}c` }]);
		} finally {
			await cleanupTerms(terms);
			await cleanupUserFixture(admin);
		}
	});

	it("rejects non-admin callers with FORBIDDEN", async () => {
		const seeker = await createUserFixture("job_seeker");

		try {
			const remove = createProcedureClient(bannedWordsRouter.remove, {
				context: createContextForUser(seeker.userId),
				path: ["bambi", "bannedWords", "remove"],
			});

			await expectOrpcCode(remove({ ids: [randomUUID()] }), "FORBIDDEN");
		} finally {
			await cleanupUserFixture(seeker);
		}
	});
});
