import { randomUUID } from "node:crypto";
import { createProcedureClient } from "@orpc/server";
import dotenv from "dotenv";
import { eq, inArray } from "drizzle-orm";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Context } from "@/context";
import { resetRateLimits } from "@/services/rate-limit";

// 발급 기록 없음·소진·유효시간 초과를 한 문구로 안내한다(bambi-identity-ticket).
const REUSED = /만료되었거나 이미 사용/;
const NEW_PASSWORD = "newpassword123";

dotenv.config({ path: "../../apps/server/.env" });
// 계정 복구는 실인증 전용 경로다(목 인증에는 CI/DI가 없어 계정을 특정할 수 없다).
// 시크릿이 없으면 프로시저가 즉시 거부하므로 env 모듈 로드 전에 주입한다.
process.env.PORTONE_API_SECRET = "test-secret";

const [
	{ db },
	authSchema,
	bambiSchema,
	{ accountRecoveryRouter },
	{ auth },
	portone,
	ticket,
] = await Promise.all([
	import("@bambi-app/db"),
	import("@bambi-app/db/schema/auth"),
	import("@bambi-app/db/schema/bambi"),
	import("@/routers/bambi/account-recovery"),
	import("@bambi-app/auth"),
	import("@/services/portone-identity"),
	import("@/services/bambi-identity-ticket"),
]);

const { account, session, user } = authSchema;
const { bambiIdentityVerification, bambiProfile } = bambiSchema;
const { hashIdentityValue } = portone;
const { issueIdentityVerificationId } = ticket;

// 포트원 단건조회는 전역 fetch로 나간다 — DB는 소켓을 쓰므로 fetch만 스텁하면 된다.
let nextVerification: unknown = null;
beforeAll(() => {
	global.fetch = (async () => ({
		ok: true,
		json: async () => nextVerification,
	})) as unknown as typeof fetch;
});

// 복구 프로시저에는 IP당 시간당 10회 레이트리밋이 걸려 있고, 테스트 컨텍스트는 clientIp가
// 없어 전 테스트가 한 버킷을 공유한다. 비우지 않으면 테스트를 몇 개 더 붙이는 순간
// 본래 검증과 무관하게 429로 깨진다.
beforeEach(resetRateLimits);

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

const publicContext = { auth: null, session: null } as unknown as Context;

const lookupClient = createProcedureClient(
	accountRecoveryRouter.lookupAccountByIdentity,
	{
		context: publicContext,
		path: ["bambi", "accountRecovery", "lookupAccountByIdentity"],
	}
);

const resetClient = createProcedureClient(
	accountRecoveryRouter.resetPasswordByIdentity,
	{
		context: publicContext,
		path: ["bambi", "accountRecovery", "resetPasswordByIdentity"],
	}
);

// 인증창이 돌려준 것으로 가장할 CI·DI 원문. 프로필에는 이 값의 해시가 들어간다.
const nextIdentity = () => ({
	ci: `ci-${randomUUID()}`,
	di: `di-${randomUUID()}`,
});

const setVerification = ({ ci, di }: { ci: string; di: string }) => {
	nextVerification = {
		status: "VERIFIED",
		verifiedCustomer: {
			ci,
			di,
			birthDate: "1995-03-02",
			phoneNumber: "010-1234-5678",
			gender: "FEMALE",
		},
	};
};

// 로그인 아이디는 better-auth username 플러그인의 기본 검증(3~30자, 영숫자·언더스코어·점,
// 소문자 정규화)을 통과해야 로그인 테스트가 성립한다 — UUID의 하이픈은 쓸 수 없다.
const newLoginId = () => `rec${randomUUID().replaceAll("-", "").slice(0, 20)}`;

const seedAccount = async ({
	ci,
	deleted = false,
	di,
	loginId,
	withCredential = true,
}: {
	ci: string;
	deleted?: boolean;
	di: string;
	loginId: string | null;
	withCredential?: boolean;
}) => {
	const userId = `user_recovery_${randomUUID()}`;
	createdUserIds.push(userId);
	await db.insert(user).values({
		id: userId,
		name: "복구대상",
		email: `${userId}@bambi.test`,
		login_id: loginId,
		login_id_display: loginId,
		deletedAt: deleted ? new Date() : null,
	});
	await db.insert(bambiProfile).values({
		userId,
		role: "job_seeker",
		ciHash: await hashIdentityValue(ci),
		diHash: await hashIdentityValue(di),
		isPhoneVerified: true,
	});
	if (withCredential) {
		// 기존 비밀번호 자격증명. updatedAt은 기본값이 없어 수동 지정이 필요하다.
		await db.insert(account).values({
			id: `account_${randomUUID()}`,
			accountId: userId,
			providerId: "credential",
			userId,
			password: "old-hash",
			updatedAt: new Date(),
		});
	}
	return userId;
};

// session.updatedAt·expiresAt은 기본값이 없어 수동 지정이 필요하다.
const seedSession = async (userId: string) => {
	await db.insert(session).values({
		id: `session_${randomUUID()}`,
		token: `token_${randomUUID()}`,
		userId,
		expiresAt: new Date(Date.now() + 60 * 60 * 1000),
		updatedAt: new Date(),
	});
};

const countSessions = async (userId: string) =>
	(await db.select().from(session).where(eq(session.userId, userId))).length;

describe("lookupAccountByIdentity 아이디 찾기", () => {
	it("본인인증에 쓰인 CI·DI를 가진 계정의 아이디를 돌려준다", async () => {
		const identity = nextIdentity();
		const loginId = newLoginId();
		await seedAccount({ ...identity, loginId });
		setVerification(identity);

		const result = await lookupClient({
			identityVerificationId: await issueId(),
		});

		expect(result).toEqual({ found: true, loginId });
	});

	it("가입한 적 없는 사람이면 found:false", async () => {
		setVerification(nextIdentity());

		const result = await lookupClient({
			identityVerificationId: await issueId(),
		});

		expect(result).toEqual({ found: false, loginId: null });
	});

	it("아이디 없이 이메일로만 가입한 계정은 found:true·loginId:null", async () => {
		const identity = nextIdentity();
		await seedAccount({ ...identity, loginId: null });
		setVerification(identity);

		const result = await lookupClient({
			identityVerificationId: await issueId(),
		});

		expect(result).toEqual({ found: true, loginId: null });
	});

	it("탈퇴한 계정은 찾지 못한다", async () => {
		const identity = nextIdentity();
		await seedAccount({ ...identity, deleted: true, loginId: newLoginId() });
		setVerification(identity);

		const result = await lookupClient({
			identityVerificationId: await issueId(),
		});

		expect(result).toEqual({ found: false, loginId: null });
	});

	// 비밀번호 찾기는 같은 인증 건에 두 번 닿는다(계정 확인 → 변경). 조회가 소진시키면
	// 그 흐름이 통째로 깨지므로, 조회는 검증만 한다.
	it("인증 건을 소진하지 않아 두 번 조회해도 통과한다", async () => {
		const identity = nextIdentity();
		const loginId = newLoginId();
		await seedAccount({ ...identity, loginId });
		setVerification(identity);
		const identityVerificationId = await issueId();

		const first = await lookupClient({ identityVerificationId });
		const second = await lookupClient({ identityVerificationId });

		expect(first).toEqual({ found: true, loginId });
		expect(second).toEqual({ found: true, loginId });
	});
});

describe("resetPasswordByIdentity 비밀번호 찾기", () => {
	it("변경한 비밀번호로 로그인할 수 있다", async () => {
		const identity = nextIdentity();
		const loginId = newLoginId();
		const userId = await seedAccount({ ...identity, loginId });
		setVerification(identity);

		const result = await resetClient({
			identityVerificationId: await issueId(),
			newPassword: NEW_PASSWORD,
		});
		expect(result).toEqual({ success: true });

		const signedIn = await auth.api.signInUsername({
			body: { username: loginId, password: NEW_PASSWORD },
		});
		expect(signedIn?.user.id).toBe(userId);
	});

	// 소셜 전용 등 credential 행이 없는 계정은 갱신할 대상이 없다 — 새로 만들어야
	// 비밀번호 로그인이 열린다(better-auth의 재설정 절차와 동일).
	it("비밀번호 자격증명이 없던 계정에는 자격증명을 만들어 준다", async () => {
		const identity = nextIdentity();
		const loginId = newLoginId();
		const userId = await seedAccount({
			...identity,
			loginId,
			withCredential: false,
		});
		setVerification(identity);

		await resetClient({
			identityVerificationId: await issueId(),
			newPassword: NEW_PASSWORD,
		});

		const signedIn = await auth.api.signInUsername({
			body: { username: loginId, password: NEW_PASSWORD },
		});
		expect(signedIn?.user.id).toBe(userId);
	});

	it("기존 세션을 모두 끊는다", async () => {
		const identity = nextIdentity();
		const userId = await seedAccount({ ...identity, loginId: newLoginId() });
		await seedSession(userId);
		await seedSession(userId);
		expect(await countSessions(userId)).toBe(2);
		setVerification(identity);

		await resetClient({
			identityVerificationId: await issueId(),
			newPassword: NEW_PASSWORD,
		});

		expect(await countSessions(userId)).toBe(0);
	});

	it("가입된 계정이 없으면 NOT_FOUND", async () => {
		setVerification(nextIdentity());

		await expect(
			resetClient({
				identityVerificationId: await issueId(),
				newPassword: NEW_PASSWORD,
			})
		).rejects.toThrow("본인인증 정보와 일치하는 계정을 찾을 수 없어요.");
	});

	it("탈퇴한 계정의 비밀번호는 바꾸지 못한다", async () => {
		const identity = nextIdentity();
		await seedAccount({ ...identity, deleted: true, loginId: newLoginId() });
		setVerification(identity);

		await expect(
			resetClient({
				identityVerificationId: await issueId(),
				newPassword: NEW_PASSWORD,
			})
		).rejects.toThrow("본인인증 정보와 일치하는 계정을 찾을 수 없어요.");
	});

	it("한 번 쓴 인증 건으로는 다시 바꾸지 못한다", async () => {
		const identity = nextIdentity();
		await seedAccount({ ...identity, loginId: newLoginId() });
		setVerification(identity);
		const identityVerificationId = await issueId();

		await resetClient({ identityVerificationId, newPassword: NEW_PASSWORD });

		await expect(
			resetClient({ identityVerificationId, newPassword: "anotherpass123" })
		).rejects.toThrow(REUSED);
	});

	it("8자 미만 비밀번호는 거부한다", async () => {
		const identity = nextIdentity();
		await seedAccount({ ...identity, loginId: newLoginId() });
		setVerification(identity);

		await expect(
			resetClient({
				identityVerificationId: await issueId(),
				newPassword: "short",
			})
		).rejects.toThrow();
	});
});
