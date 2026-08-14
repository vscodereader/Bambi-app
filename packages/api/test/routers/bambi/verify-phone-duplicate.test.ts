import { randomUUID } from "node:crypto";
import { createProcedureClient } from "@orpc/server";
import dotenv from "dotenv";
import { eq, inArray } from "drizzle-orm";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import type { Context } from "@/context";

const SHA256_HEX = /^[0-9a-f]{64}$/;
// 발급 기록 없음·소진·유효시간 초과를 한 문구로 안내한다(bambi-identity-ticket).
const REUSED = /만료되었거나 이미 사용/;

dotenv.config({ path: "../../apps/server/.env" });
// 실인증 핸들러는 PORTONE_API_SECRET이 있어야 목 폴백을 건너뛰고 실경로를 탄다.
// 개발 .env엔 없으므로 테스트에서 주입한다(env 모듈 로드 전에 설정해야 반영된다).
process.env.PORTONE_API_SECRET = "test-secret";

const [{ db }, authSchema, bambiSchema, { onboardingRouter }, portone, ticket] =
	await Promise.all([
		import("@bambi-app/db"),
		import("@bambi-app/db/schema/auth"),
		import("@bambi-app/db/schema/bambi"),
		import("@/routers/bambi/onboarding"),
		import("@/services/portone-identity"),
		import("@/services/bambi-identity-ticket"),
	]);

const { user } = authSchema;
const { bambiIdentityVerification, bambiProfile } = bambiSchema;
const { hashIdentityValue } = portone;
const {
	assertIdentityVerificationUsable,
	IDENTITY_VERIFICATION_TTL_MINUTES,
	issueIdentityVerificationId,
} = ticket;

// 포트원 단건조회는 전역 fetch로 나간다 — DB는 소켓을 쓰므로 fetch만 스텁하면 된다.
let nextVerification: unknown = null;
beforeAll(() => {
	global.fetch = (async () => ({
		ok: true,
		json: async () => nextVerification,
	})) as unknown as typeof fetch;
});

const createdUserIds: string[] = [];
const issuedIds: string[] = [];
afterEach(async () => {
	for (const id of createdUserIds.splice(0)) {
		await db.delete(user).where(eq(user.id, id));
	}
	const usedIds = issuedIds.splice(0);
	if (usedIds.length > 0) {
		await db
			.delete(bambiIdentityVerification)
			.where(inArray(bambiIdentityVerification.id, usedIds));
	}
});

// 서버가 발급한 인증 건. 실인증 경로는 발급 기록이 없는 ID를 거부하므로, 테스트도
// 실제 발급 절차를 그대로 탄다.
const issueId = async () => {
	const identityVerificationId = await issueIdentityVerificationId();
	issuedIds.push(identityVerificationId);
	return identityVerificationId;
};

const ctx = (userId: string): Context =>
	({ auth: null, session: { user: { id: userId } } }) as Context;

const verifyClient = (userId: string) =>
	createProcedureClient(onboardingRouter.verifyMyPhone, {
		context: ctx(userId),
		path: ["bambi", "onboarding", "verifyMyPhone"],
	});

const updateClient = (userId: string) =>
	createProcedureClient(onboardingRouter.updateMyProfile, {
		context: ctx(userId),
		path: ["bambi", "onboarding", "updateMyProfile"],
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

// CI·DI 해시는 클라이언트 응답에서 제외되므로(무염 해시라 브라우저 노출 금지) 저장
// 여부는 프로시저 반환값이 아니라 DB를 직접 읽어 확인한다.
const readProfile = async (userId: string) => {
	const [profile] = await db
		.select()
		.from(bambiProfile)
		.where(eq(bambiProfile.userId, userId))
		.limit(1);
	return profile;
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

const runVerify = async (userId: string) =>
	verifyClient(userId)({ identityVerificationId: await issueId() });

describe("verifyMyPhone 중복 가입 체크", () => {
	it("고유한 CI·DI면 인증에 성공하고 diHash를 저장한다", async () => {
		const userId = await seedUserWithProfile();
		setVerification(`ci-${randomUUID()}`, `di-${randomUUID()}`);

		const updated = await runVerify(userId);
		if (!updated) {
			throw new Error("프로필 갱신 결과가 없습니다.");
		}
		expect(updated.isPhoneVerified).toBe(true);
		// 응답에는 해시가 없어야 하고, DB에는 저장돼 있어야 한다.
		expect(updated).not.toHaveProperty("ciHash");
		expect(updated).not.toHaveProperty("diHash");
		const stored = await readProfile(userId);
		expect(stored?.diHash).toMatch(SHA256_HEX);
		expect(stored?.ciHash).toMatch(SHA256_HEX);
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

const checkClient = createProcedureClient(
	onboardingRouter.checkIdentityForSignup,
	{
		context: { auth: null, session: null } as unknown as Context,
		path: ["bambi", "onboarding", "checkIdentityForSignup"],
	}
);

describe("checkIdentityForSignup 가입 전 중복 확인", () => {
	it("처음 보는 사람이면 hasAccount:false와 성별을 돌려준다", async () => {
		setVerification(`ci-${randomUUID()}`, `di-${randomUUID()}`);
		const result = await checkClient({
			identityVerificationId: await issueId(),
		});
		expect(result).toEqual({ gender: "male", hasAccount: false });
	});

	it("이미 인증에 쓰인 DI면 hasAccount:true", async () => {
		const sharedDi = `di-${randomUUID()}`;
		const existingUser = await seedUserWithProfile();
		setVerification(`ci-${randomUUID()}`, sharedDi);
		await runVerify(existingUser);

		setVerification(`ci-${randomUUID()}`, sharedDi);
		const result = await checkClient({
			identityVerificationId: await issueId(),
		});
		expect(result.hasAccount).toBe(true);
	});

	it("미성년이면 거부한다", async () => {
		nextVerification = {
			status: "VERIFIED",
			verifiedCustomer: {
				ci: `ci-${randomUUID()}`,
				di: `di-${randomUUID()}`,
				birthDate: "2015-01-01",
				phoneNumber: "010-1234-5678",
				gender: "FEMALE",
			},
		};
		await expect(
			checkClient({ identityVerificationId: await issueId() })
		).rejects.toThrow();
	});
});

describe("가입 시 인증 결과 반영", () => {
	it("createJobSeekerProfile이 인증 결과를 프로필에 기록한다", async () => {
		const userId = `user_signup_${randomUUID()}`;
		createdUserIds.push(userId);
		await db.insert(user).values({
			id: userId,
			name: "신규가입",
			email: `${userId}@bambi.test`,
		});

		setVerification(`ci-${randomUUID()}`, `di-${randomUUID()}`);
		const created = await createProcedureClient(
			onboardingRouter.createJobSeekerProfile,
			{
				context: ctx(userId),
				path: ["bambi", "onboarding", "createJobSeekerProfile"],
			}
		)({ identityVerificationId: await issueId() });

		expect(created?.isPhoneVerified).toBe(true);
		expect(created?.birthDate).toBe("20000101");
		expect(created?.gender).toBe("male");
		expect(created).not.toHaveProperty("diHash");
		expect((await readProfile(userId))?.diHash).toMatch(SHA256_HEX);
	});

	it("다른 계정이 쓴 DI로는 가입하지 못한다", async () => {
		const sharedDi = `di-${randomUUID()}`;
		const existingUser = await seedUserWithProfile();
		setVerification(`ci-${randomUUID()}`, sharedDi);
		await runVerify(existingUser);

		const userId = `user_signup_${randomUUID()}`;
		createdUserIds.push(userId);
		await db.insert(user).values({
			id: userId,
			name: "중복가입",
			email: `${userId}@bambi.test`,
		});
		setVerification(`ci-${randomUUID()}`, sharedDi);
		await expect(
			createProcedureClient(onboardingRouter.createJobSeekerProfile, {
				context: ctx(userId),
				path: ["bambi", "onboarding", "createJobSeekerProfile"],
			})({ identityVerificationId: await issueId() })
		).rejects.toThrow("이미 다른 계정에서 본인인증에 사용된 정보예요.");
	});
});

// 프로필 갱신은 본인확인을 거치지 않은 자기신고 번호를 받는다. 인증 상태를 그대로 둔 채
// 번호만 갈아끼우면 본인확인 결과정보가 사후 변조되고 화면이 "인증된 번호"로 표시하게 된다.
describe("updateMyProfile 인증 번호 보호", () => {
	const seedVerifiedUser = async () => {
		const userId = await seedUserWithProfile();
		setVerification(`ci-${randomUUID()}`, `di-${randomUUID()}`);
		await runVerify(userId);
		return userId;
	};

	it("번호를 바꾸면 인증 상태가 풀린다", async () => {
		const userId = await seedVerifiedUser();

		await updateClient(userId)({ phoneNumber: "010-9999-0000" });

		const stored = await readProfile(userId);
		expect(stored?.phoneNumber).toBe("010-9999-0000");
		expect(stored?.isPhoneVerified).toBe(false);
	});

	it("같은 번호를 다시 보내면 인증이 유지된다", async () => {
		const userId = await seedVerifiedUser();

		// 네이티브 프로필 폼은 기존 번호를 미리 채워 보낸다 — 표시명만 고쳐 저장해도
		// 인증이 풀리면 안 된다.
		await updateClient(userId)({ phoneNumber: "010-1234-5678" });

		const stored = await readProfile(userId);
		expect(stored?.isPhoneVerified).toBe(true);
	});
});

// 본인확인서비스 이용기관 취약점 자체점검 항목 4 — 과거에 수집된 인증정보(거래번호)를
// 재사용하지 못하게 막는다. 서버가 발급하지 않았거나 · 이미 소진됐거나 · 발급 후
// 유효시간을 넘긴 인증 건은 전부 거부해야 한다.
describe("본인인증 건 재사용 차단", () => {
	const seedSignupUser = async () => {
		const userId = `user_reuse_${randomUUID()}`;
		createdUserIds.push(userId);
		await db.insert(user).values({
			id: userId,
			name: "재사용검증",
			email: `${userId}@bambi.test`,
		});
		return userId;
	};

	const createProfile = (userId: string, identityVerificationId: string) =>
		createProcedureClient(onboardingRouter.createJobSeekerProfile, {
			context: ctx(userId),
			path: ["bambi", "onboarding", "createJobSeekerProfile"],
		})({ identityVerificationId });

	// 발급 시각을 임의로 지정한 인증 건(유효시간 초과 상황 재현용).
	const issueIdAt = async (issuedAt: Date) => {
		const identityVerificationId = `iv-${randomUUID()}`;
		issuedIds.push(identityVerificationId);
		await db
			.insert(bambiIdentityVerification)
			.values({ id: identityVerificationId, issuedAt });
		return identityVerificationId;
	};

	it("가입에 쓴 인증 건은 소진되어 다시 쓸 수 없다", async () => {
		const identityVerificationId = await issueId();
		setVerification(`ci-${randomUUID()}`, `di-${randomUUID()}`);
		await createProfile(await seedSignupUser(), identityVerificationId);

		// 같은 인증 건으로 두 번째 가입 시도 — 소진 기록에서 걸려야 한다.
		setVerification(`ci-${randomUUID()}`, `di-${randomUUID()}`);
		await expect(
			createProfile(await seedSignupUser(), identityVerificationId)
		).rejects.toThrow(REUSED);
		// 가입 전 확인(비소진 관문)도 같은 이유로 거부한다.
		await expect(checkClient({ identityVerificationId })).rejects.toThrow(
			REUSED
		);
	});

	it("재인증(verifyMyPhone)에 쓴 인증 건도 소진된다", async () => {
		const identityVerificationId = await issueId();
		const userId = await seedUserWithProfile();
		setVerification(`ci-${randomUUID()}`, `di-${randomUUID()}`);
		await verifyClient(userId)({ identityVerificationId });

		setVerification(`ci-${randomUUID()}`, `di-${randomUUID()}`);
		await expect(
			verifyClient(userId)({ identityVerificationId })
		).rejects.toThrow(REUSED);
	});

	it("발급 후 유효시간을 넘긴 인증 건은 거부한다", async () => {
		const identityVerificationId = await issueIdAt(
			new Date(Date.now() - (IDENTITY_VERIFICATION_TTL_MINUTES + 1) * 60 * 1000)
		);
		setVerification(`ci-${randomUUID()}`, `di-${randomUUID()}`);

		await expect(checkClient({ identityVerificationId })).rejects.toThrow(
			REUSED
		);
		await expect(
			createProfile(await seedSignupUser(), identityVerificationId)
		).rejects.toThrow(REUSED);
	});

	it("서버가 발급한 적 없는 인증 건은 거부한다", async () => {
		// 예전처럼 클라이언트가 스스로 만든 ID — 발급 기록이 없다.
		const identityVerificationId = `iv-${randomUUID()}`;
		setVerification(`ci-${randomUUID()}`, `di-${randomUUID()}`);

		await expect(checkClient({ identityVerificationId })).rejects.toThrow(
			REUSED
		);
		await expect(
			createProfile(await seedSignupUser(), identityVerificationId)
		).rejects.toThrow(REUSED);
	});

	it("정상 가입 1회는 같은 인증 건을 세 번 써도 통과한다", async () => {
		const identityVerificationId = await issueId();
		setVerification(`ci-${randomUUID()}`, `di-${randomUUID()}`);

		// 1) 가입 전 확인 2) 게스트 쿠키 발급(web /api/guest → 서버 검증 관문)
		// 3) 실제 가입. 앞의 둘은 소진시키지 않아야 한다.
		const check = await checkClient({ identityVerificationId });
		expect(check.hasAccount).toBe(false);
		await assertIdentityVerificationUsable(identityVerificationId);
		const created = await createProfile(
			await seedSignupUser(),
			identityVerificationId
		);

		expect(created?.isPhoneVerified).toBe(true);
	});
});
