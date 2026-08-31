import { randomUUID } from "node:crypto";

import { auth } from "@bambi-app/auth";
import {
	getLoginIdErrorMessage,
	LOGIN_ID_TAKEN_MESSAGE,
	normalizeLoginId,
} from "@bambi-app/auth/login-id";
import {
	PASSWORD_MIN_LENGTH,
	passwordMinimumMessage,
} from "@bambi-app/auth/password-policy";
import { db } from "@bambi-app/db";
import { account, user } from "@bambi-app/db/schema/auth";
import {
	adminModerationAction,
	bambiProfile,
} from "@bambi-app/db/schema/bambi";
import { ORPCError } from "@orpc/server";
import { eq } from "drizzle-orm";

import { assertDisplayNameAllowed } from "./bambi-display-name-policy";
import {
	normalizeTestAccountPhone,
	TEST_ACCOUNT_AUDIT_ACTION,
	type TEST_ACCOUNT_GENDERS,
	TEST_ACCOUNT_PHONE_ERROR,
	type TEST_ACCOUNT_ROLES,
} from "./bambi-test-account-policy";
import {
	hashIdentityValue,
	isAdultBirth8,
	toBirth8,
	UNDERAGE_MESSAGE,
} from "./portone-identity";

const INTERNAL_EMAIL_DOMAIN = "admin-test.invalid";
const TEST_CI_NAMESPACE = "admin-test-ci";
const TEST_DI_NAMESPACE = "admin-test-di";
const CREDENTIAL_PROVIDER_ID = "credential";
const CREATE_TEST_ACCOUNT_REASON = "운영자 가계정 생성";
const LOGIN_ID_UNIQUE_CONSTRAINT = "user_login_id_unique";

export type TestAccountRole = (typeof TEST_ACCOUNT_ROLES)[number];
export type TestAccountGender = (typeof TEST_ACCOUNT_GENDERS)[number];

export interface CreateTestAccountInput {
	birthDate: string;
	gender: TestAccountGender;
	loginId: string;
	nickname: string;
	password: string;
	phoneNumber: string;
	role: TestAccountRole;
}

export interface CreateTestAccountResult {
	isPhoneVerified: true;
	loginId: string;
	nickname: string;
	role: TestAccountRole;
	userId: string;
}

interface PreparedTestAccount {
	adminUserId: string;
	birthDate: string;
	ciHash: string;
	diHash: string;
	email: string;
	gender: TestAccountGender;
	loginId: string;
	nickname: string;
	passwordHash: string;
	phoneNumber: string;
	role: TestAccountRole;
	userId: string;
}

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

const badRequest = (message: string): never => {
	throw new ORPCError("BAD_REQUEST", { message });
};

const normalizeTestBirthDate = (value: string): string => {
	const birthDate = toBirth8(value);
	if (!birthDate) {
		return badRequest("올바른 생년월일을 입력해 주세요.");
	}
	const year = Number(birthDate.slice(0, 4));
	const month = Number(birthDate.slice(4, 6));
	const day = Number(birthDate.slice(6, 8));
	const calendarDate = new Date(Date.UTC(year, month - 1, day));
	if (
		calendarDate.getUTCFullYear() !== year ||
		calendarDate.getUTCMonth() !== month - 1 ||
		calendarDate.getUTCDate() !== day
	) {
		return badRequest("올바른 생년월일을 입력해 주세요.");
	}
	if (!isAdultBirth8(birthDate, new Date())) {
		throw new ORPCError("FORBIDDEN", {
			message: UNDERAGE_MESSAGE,
		});
	}
	return birthDate;
};

const postgresDetails = (
	error: unknown
): { code?: string; constraint?: string } | null => {
	if (!(error && typeof error === "object")) {
		return null;
	}
	const candidate = error as {
		cause?: unknown;
		code?: string;
		constraint?: string;
	};
	if (candidate.code || candidate.constraint) {
		return { code: candidate.code, constraint: candidate.constraint };
	}
	return postgresDetails(candidate.cause);
};

const isLoginIdUniqueViolation = (error: unknown): boolean => {
	const details = postgresDetails(error);
	return (
		details?.code === "23505" &&
		details.constraint === LOGIN_ID_UNIQUE_CONSTRAINT
	);
};

export const insertTestAccountRecords = async (
	tx: Transaction,
	prepared: PreparedTestAccount
): Promise<void> => {
	const createdAt = new Date();
	await tx.insert(user).values({
		createdAt,
		email: prepared.email,
		emailVerified: false,
		id: prepared.userId,
		login_id: prepared.loginId,
		login_id_display: prepared.loginId,
		name: prepared.nickname,
		updatedAt: createdAt,
	});
	await tx.insert(account).values({
		accountId: prepared.userId,
		createdAt,
		id: randomUUID(),
		password: prepared.passwordHash,
		providerId: CREDENTIAL_PROVIDER_ID,
		updatedAt: createdAt,
		userId: prepared.userId,
	});
	await tx.insert(bambiProfile).values({
		birthDate: prepared.birthDate,
		ciHash: prepared.ciHash,
		diHash: prepared.diHash,
		gender: prepared.gender,
		isAdvertiser: false,
		isPhoneVerified: true,
		phoneNumber: prepared.phoneNumber,
		role: prepared.role,
		status: "active",
		userId: prepared.userId,
	});
	await tx.insert(adminModerationAction).values({
		action: TEST_ACCOUNT_AUDIT_ACTION,
		adminUserId: prepared.adminUserId,
		metadata: {
			gender: prepared.gender,
			loginId: prepared.loginId,
			role: prepared.role,
		},
		reason: CREATE_TEST_ACCOUNT_REASON,
		targetId: prepared.userId,
		targetType: "user",
	});
};

export const createTestAccount = async (
	adminUserId: string,
	input: CreateTestAccountInput
): Promise<CreateTestAccountResult> => {
	const nickname = input.nickname.trim();
	if (nickname.length < 2) {
		return badRequest("닉네임을 2자 이상 입력해 주세요.");
	}
	await assertDisplayNameAllowed(nickname, { isAdmin: false });

	const rawLoginId = input.loginId.trim();
	const loginIdError = getLoginIdErrorMessage(rawLoginId);
	if (loginIdError) {
		return badRequest(loginIdError);
	}
	const loginId = normalizeLoginId(rawLoginId);
	const [existing] = await db
		.select({ id: user.id })
		.from(user)
		.where(eq(user.login_id, loginId))
		.limit(1);
	if (existing) {
		return badRequest(LOGIN_ID_TAKEN_MESSAGE);
	}
	if (input.password.length < PASSWORD_MIN_LENGTH) {
		return badRequest(passwordMinimumMessage());
	}

	const birthDate = normalizeTestBirthDate(input.birthDate);
	const phoneNumber = normalizeTestAccountPhone(input.phoneNumber);
	if (!phoneNumber) {
		return badRequest(TEST_ACCOUNT_PHONE_ERROR);
	}
	const userId = randomUUID();
	const [ciHash, diHash, authContext] = await Promise.all([
		hashIdentityValue(`${TEST_CI_NAMESPACE}:${randomUUID()}`),
		hashIdentityValue(`${TEST_DI_NAMESPACE}:${randomUUID()}`),
		auth.$context,
	]);
	const passwordHash = await authContext.password.hash(input.password);
	const prepared: PreparedTestAccount = {
		adminUserId,
		birthDate,
		ciHash,
		diHash,
		email: `${randomUUID()}@${INTERNAL_EMAIL_DOMAIN}`,
		gender: input.gender,
		loginId,
		nickname,
		passwordHash,
		phoneNumber,
		role: input.role,
		userId,
	};

	try {
		await db.transaction((tx) => insertTestAccountRecords(tx, prepared));
	} catch (error) {
		if (isLoginIdUniqueViolation(error)) {
			return badRequest(LOGIN_ID_TAKEN_MESSAGE);
		}
		throw new ORPCError("INTERNAL_SERVER_ERROR", {
			message: "가계정을 생성하지 못했습니다. 잠시 후 다시 시도해 주세요.",
		});
	}

	return {
		isPhoneVerified: true,
		loginId,
		nickname,
		role: input.role,
		userId,
	};
};
