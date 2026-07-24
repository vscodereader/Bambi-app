import { randomUUID } from "node:crypto";
import { createProcedureClient } from "@orpc/server";
import dotenv from "dotenv";
import { eq } from "drizzle-orm";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import type { Context } from "../../context";

const SHA256_HEX = /^[0-9a-f]{64}$/;

dotenv.config({ path: "../../apps/server/.env" });
// 실인증 핸들러는 PORTONE_API_SECRET이 있어야 목 폴백을 건너뛰고 실경로를 탄다.
// 개발 .env엔 없으므로 테스트에서 주입한다(env 모듈 로드 전에 설정해야 반영된다).
process.env.PORTONE_API_SECRET = "test-secret";

const [{ db }, authSchema, bambiSchema, { onboardingRouter }, portone] =
	await Promise.all([
		import("@bambi-app/db"),
		import("@bambi-app/db/schema/auth"),
		import("@bambi-app/db/schema/bambi"),
		import("./onboarding"),
		import("../../services/portone-identity"),
	]);

const { user } = authSchema;
const { bambiProfile } = bambiSchema;
const { hashIdentityValue } = portone;

// 포트원 단건조회는 전역 fetch로 나간다 — DB는 소켓을 쓰므로 fetch만 스텁하면 된다.
let nextVerification: unknown = null;
beforeAll(() => {
	global.fetch = (async () => ({
		ok: true,
		json: async () => nextVerification,
	})) as unknown as typeof fetch;
});

const createdUserIds: string[] = [];
afterEach(async () => {
	for (const id of createdUserIds.splice(0)) {
		await db.delete(user).where(eq(user.id, id));
	}
});

const ctx = (userId: string): Context =>
	({ auth: null, session: { user: { id: userId } } }) as Context;

const verifyClient = (userId: string) =>
	createProcedureClient(onboardingRouter.verifyMyPhone, {
		context: ctx(userId),
		path: ["bambi", "onboarding", "verifyMyPhone"],
	});

const seedUserWithProfile = async (
	values: Partial<{ ciHash: string; diHash: string }> = {}
) => {
	const userId = `user_verify_${randomUUID()}`;
	createdUserIds.push(userId);
	await db.insert(user).values({
		id: userId,
		name: "인증대상",
		email: `${userId}@bambi.test`,
	});
	await db
		.insert(bambiProfile)
		.values({ userId, role: "job_seeker", ...values });
	return userId;
};

const setVerification = (ci: string, di: string) => {
	nextVerification = {
		status: "VERIFIED",
		verifiedCustomer: {
			ci,
			di,
			birthDate: "2000-01-01",
			phoneNumber: "010-1234-5678",
			gender: "MALE",
		},
	};
};

const runVerify = (userId: string) =>
	verifyClient(userId)({ identityVerificationId: `iv_${randomUUID()}` });

describe("verifyMyPhone 중복 가입 체크", () => {
	it("고유한 CI·DI면 인증에 성공하고 diHash를 저장한다", async () => {
		const userId = await seedUserWithProfile();
		setVerification(`ci-${randomUUID()}`, `di-${randomUUID()}`);

		const updated = await runVerify(userId);
		if (!updated) {
			throw new Error("프로필 갱신 결과가 없습니다.");
		}
		expect(updated.isPhoneVerified).toBe(true);
		expect(updated.diHash).toMatch(SHA256_HEX);
		expect(updated.ciHash).toMatch(SHA256_HEX);
	});

	it("다른 계정의 diHash와 겹치면 CONFLICT", async () => {
		const sharedDi = `di-${randomUUID()}`;
		const firstUser = await seedUserWithProfile();
		setVerification(`ci-${randomUUID()}`, sharedDi);
		await runVerify(firstUser);

		const secondUser = await seedUserWithProfile();
		// CI는 다르지만 DI가 같은 사람 → 같은 사람의 다른 계정으로 판정한다.
		setVerification(`ci-${randomUUID()}`, sharedDi);
		await expect(runVerify(secondUser)).rejects.toThrow(
			"이미 다른 계정에서 본인인증에 사용된 정보예요."
		);
	});

	it("과거 CI만 저장된 계정과 ciHash만 겹쳐도 CONFLICT", async () => {
		const legacyCi = `ci-${randomUUID()}`;
		// diHash 없이 ciHash만 가진 레거시 프로필(과거 CI 기반 저장).
		await seedUserWithProfile({ ciHash: await hashIdentityValue(legacyCi) });

		const newUser = await seedUserWithProfile();
		// DI는 고유하지만 CI가 레거시 계정과 겹치면 저장 시 unique violation이 나므로
		// 사전 체크에서 같은 안내로 막아야 한다.
		setVerification(legacyCi, `di-${randomUUID()}`);
		await expect(runVerify(newUser)).rejects.toThrow(
			"이미 다른 계정에서 본인인증에 사용된 정보예요."
		);
	});
});
