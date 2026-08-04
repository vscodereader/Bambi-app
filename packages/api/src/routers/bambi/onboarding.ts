import { randomUUID } from "node:crypto";

import { db } from "@bambi-app/db";
import {
	account,
	member,
	organization,
	session as sessionTable,
	team,
	teamMember,
	user,
} from "@bambi-app/db/schema/auth";
import {
	adminModerationAction,
	bambiLegalConsent,
	bambiProfile,
	employerOrganizationProfile,
	employerTeamProfile,
} from "@bambi-app/db/schema/bambi";
import { env } from "@bambi-app/env/server";
import { ORPCError } from "@orpc/server";
import { and, desc, eq, inArray, isNull, ne, or } from "drizzle-orm";
import z from "zod";

import {
	protectedProcedure,
	publicProcedure,
	rateLimitedPublicProcedure,
} from "../../index";
import { hasActiveAdExposure } from "../../services/bambi-advertiser";
import { isEmployerOrganizationVerified } from "../../services/bambi-authz";
import { resolveCommunityAccess } from "../../services/bambi-community-access";
import { assertDisplayNameAllowed } from "../../services/bambi-display-name-policy";
import {
	resolveVerifiedIdentity,
	type VerifiedIdentity,
} from "../../services/bambi-identity";
import {
	assertIdentityVerificationUsable,
	consumeIdentityVerification,
	issueIdentityVerificationId,
} from "../../services/bambi-identity-ticket";
import {
	getJobPostingScopes,
	ORGANIZATION_WIDE_POSTING_ROLES,
} from "../../services/bambi-job-access";
import {
	assertCanCreateBambiProfile,
	assertCanManageEmployerProfile,
	assertCanUpdateOwnBambiProfile,
	type BambiProfileRole,
	deriveEmployerApprovalStatus,
	type OrganizationRole,
} from "../../services/bambi-onboarding";
import { resolveOptionalRegion } from "../../services/bambi-region";
import {
	type BiznumValidation,
	validateBiznum,
} from "../../services/nts-biznum";
import {
	isAdultBirth8,
	UNDERAGE_MESSAGE,
} from "../../services/portone-identity";
import { takeRateLimit } from "../../services/rate-limit";

// 포트원 테스트 채널은 통신사 대조를 하지 않아 아무 생년월일·주민번호 뒷자리나 통과시킨다.
// 개발에서만 허용하고 프로덕션에서는 거부한다(판정은 여기서 하고 서비스에 옵션으로 넘긴다 —
// bambi-identity는 env에 의존하지 않는 순수 모듈이다).
// TODO(임시): KCP 실계약 전 테스트 흐름 확인을 위해 프로덕션에서도 테스트 채널을 허용 중.
// 실연동 채널 전환 시 `env.NODE_ENV !== "production"` 판정으로 반드시 되돌릴 것.
const identityChannelOptions = {
	allowTestChannel: true,
};

const profileInput = z.object({
	gender: z.enum(["male", "female"]).optional(),
	// 가입 직전에 마친 포트원 본인인증 건. 있으면 서버가 다시 조회해 프로필에
	// 인증 결과(번호·생년월일·성별·CI/DI 해시)를 함께 기록한다.
	identityVerificationId: z.string().min(1).optional(),
	phoneNumber: z.string().min(3).max(30).optional(),
});

// 현재 유효한 법적 문서 버전. 각 웹 페이지의 시행일과 일치시킨다 — 두 문서 모두
// 실제 서비스 현황 반영 개정으로 2026-07-27이다(처리방침: 수집항목 정정과 국외
// 이전·쿠키·안전성 확보조치·권익침해 구제 신설, 약관: 미구현 조항 정리와 커뮤니티
// 이용자격·모니터링 조항 신설).
// 문서를 개정하면 해당 값을 올린다 — 재동의가 새 이력 행으로 쌓인다.
const LEGAL_CONSENT_VERSIONS = {
	terms_of_service: "2026-07-27",
	privacy_policy: "2026-07-27",
} as const;

// 표시명(닉네임)은 user.name 정본을 갱신하므로 프로필 입력이 아니라 이 갱신 입력에만 둔다.
// 인증 건은 가입 시점에만 반영하므로 갱신 입력에서는 뺀다(받아놓고 무시하지 않는다).
const profileUpdateInput = profileInput
	.omit({ gender: true, identityVerificationId: true })
	.extend({
		displayName: z.string().min(1).max(80).optional(),
		role: z.enum(["job_seeker", "employer", "admin"]).optional(),
	});

// 목(mock) 휴대폰 본인인증 입력 — 포트원 미구성 개발 환경 전용(핸들러에서 잠근다).
// gender는 커뮤니티 게이팅용 불변값이라 아직 없을 때만 채운다.
const mockPhoneVerificationInput = z.object({
	phoneNumber: z.string().min(3).max(30),
	gender: z.enum(["male", "female"]).optional(),
	birthDate: z
		.string()
		.regex(/^\d{8}$/, "생년월일은 8자리(YYYYMMDD)여야 합니다.")
		.optional(),
});

// 실인증 입력 — 인증창(SDK)이 완료한 본인인증 건의 식별자. 값 자체는 신뢰하지 않고
// 서버가 포트원 단건조회로 진위를 확인한다.
const phoneVerificationInput = z.object({
	identityVerificationId: z.string().min(1).max(120),
});

const organizationProfileInput = z.object({
	organizationId: z.string().min(1),
	displayName: z.string().min(1).max(120),
	businessRegistrationNumber: z.string().min(1).max(40).optional(),
});

const teamProfileInput = z.object({
	organizationId: z.string().min(1),
	teamId: z.string().min(1),
	displayName: z.string().min(1).max(120),
	// 공고·팀 입력과 같은 축이다 — 지역은 마스터 코드로 받고 표시용 문자열은 서버가 채운다.
	regionCode: z.string().length(10).optional(),
	districtCode: z.string().length(10).optional(),
});

const requestEmployerVerificationInput = z.object({
	organizationId: z.string().min(1),
});

const submitEmployerBusinessInfoInput = z.object({
	displayName: z.string().min(1).max(120),
	businessRegistrationNumber: z
		.string()
		.regex(
			/^\d{3}-\d{2}-\d{5}$/,
			"사업자등록번호는 000-00-00000 형식이어야 합니다."
		),
	// 국세청 진위확인은 사업자번호만으로는 안 되고 대표자명·개업일자가 함께 있어야 한다.
	// 상호(displayName)는 대조 항목이 아니다 — 지점명 등으로 등록증과 어긋나는 일이 잦다.
	representativeName: z.string().trim().min(1).max(60),
	// 웹 date input 값 그대로 받고(YYYY-MM-DD) 저장·전송 시에만 8자리로 줄인다.
	businessStartDate: z
		.string()
		.regex(/^\d{4}-\d{2}-\d{2}$/, "개업일자는 YYYY-MM-DD 형식이어야 합니다."),
});

const BIZNUM_MISMATCH_MESSAGE =
	"국세청에 등록된 사업자등록정보와 일치하지 않습니다. 사업자등록번호·대표자 성명·개업일자를 사업자등록증에 적힌 그대로 입력했는지 확인해 주세요. 최근 개업했다면 국세청 반영까지 1~2일 걸릴 수 있습니다.";

// 제출 1회당 국세청 API를 1회 부르므로 반복 제출을 그대로 태우지 않는다. 사용자당 시간당
// 10회 — 오타를 고쳐 다시 넣는 정상 사용자는 몇 회면 끝난다.
const BIZNUM_RATE_LIMIT = 10;
const BIZNUM_RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;

// 국세청 대조 결과를 프로필에 기록할 형태로. 키 미설정(개발)이나 국세청 장애·타임아웃은
// "미확인"(둘 다 null)으로 통과시킨다 — 국세청이 죽었다고 정상 사업자를 막으면 안 되고,
// 뒤에 운영자 수동 심사가 그대로 남아 있다. 불일치·휴폐업만 제출을 거부한다.
const checkBiznum = async (input: {
	businessRegistrationNumber: string;
	businessStartDate: string;
	representativeName: string;
}): Promise<{
	biznumCheckedAt: Date | null;
	biznumStatusCode: string | null;
}> => {
	const unchecked = { biznumCheckedAt: null, biznumStatusCode: null };
	if (!env.NTS_SERVICE_KEY) {
		return unchecked;
	}

	let result: BiznumValidation;
	try {
		result = await validateBiznum(env.NTS_SERVICE_KEY, {
			bNo: input.businessRegistrationNumber.replaceAll("-", ""),
			pNm: input.representativeName,
			startDt: input.businessStartDate,
		});
	} catch {
		return unchecked;
	}

	if (!result.matched) {
		throw new ORPCError("BAD_REQUEST", { message: BIZNUM_MISMATCH_MESSAGE });
	}
	if (result.statusCode !== "01") {
		throw new ORPCError("BAD_REQUEST", {
			message: `국세청에 ${result.statusCode === "02" ? "휴업" : "폐업"} 상태로 등록된 사업자등록번호입니다. 정상 영업 중인 사업자등록번호로 제출해 주세요.`,
		});
	}
	return { biznumCheckedAt: new Date(), biznumStatusCode: result.statusCode };
};

const toOrganizationSlug = (name: string): string => {
	const base = name
		.toLowerCase()
		.replace(/[^a-z0-9가-힣]+/g, "-")
		.replace(/(^-|-$)/g, "")
		.slice(0, 40);
	return `${base || "org"}-${randomUUID().slice(0, 8)}`;
};

const ORGANIZATION_ROLES = new Set<OrganizationRole>([
	"owner",
	"admin",
	"member",
]);

const toOrganizationRole = (role: string | null | undefined) =>
	ORGANIZATION_ROLES.has(role as OrganizationRole)
		? (role as OrganizationRole)
		: null;

const requireManageableOrganizationRole = async ({
	organizationId,
	userId,
}: {
	organizationId: string;
	userId: string;
}): Promise<void> => {
	const [organizationMember] = await db
		.select({ role: member.role })
		.from(member)
		.where(
			and(eq(member.userId, userId), eq(member.organizationId, organizationId))
		)
		.limit(1);

	const organizationRole = toOrganizationRole(organizationMember?.role);
	assertCanManageEmployerProfile({ organizationRole });
};

const requireEmployerBambiProfile = async (userId: string) => {
	const [profile] = await db
		.select()
		.from(bambiProfile)
		.where(eq(bambiProfile.userId, userId))
		.limit(1);

	if (!profile || profile.role === "job_seeker") {
		throw new ORPCError("FORBIDDEN", {
			message: "Employer Bambi profile is required.",
		});
	}

	return profile;
};

// 다른 계정이 같은 사람으로 인증했는지 본다. 판정 축은 DI지만, 과거 CI만 저장된
// 계정과의 충돌도 유니크 인덱스가 유지되므로 함께 걸러 같은 안내로 막는다.
const findIdentityCollision = async (
	identity: VerifiedIdentity,
	excludeUserId?: string
): Promise<boolean> => {
	const collisions = await db
		.select({ userId: bambiProfile.userId })
		.from(bambiProfile)
		.where(
			or(
				eq(bambiProfile.diHash, identity.diHash),
				eq(bambiProfile.ciHash, identity.ciHash)
			)
		);
	return collisions.some((row) => row.userId !== excludeUserId);
};

const IDENTITY_CONFLICT_MESSAGE =
	"이미 다른 계정에서 본인인증에 사용된 정보예요.";

// 본인확인 결과에서 파생된 CI·DI 해시를 응답에서 걷어낸다. 무염 SHA-256이라 값 자체가
// 서비스 간 연결이 가능한 고정 식별자로 기능하므로 브라우저(개발자도구)에 내려가면 안 된다.
// 서버 내부는 중복 판정(findIdentityCollision)·재가입 차단에 계속 해시를 쓰므로 DB 조회를
// 좁히지 않고, 클라이언트로 나가는 경계에서만 제거한다 — 프로필을 돌려주는 모든 프로시저가
// 이 한 곳을 지나게 해 새 노출 지점이 생기지 않게 한다.
const toClientProfile = <
	T extends { ciHash: string | null; diHash: string | null },
>(
	profile: T | null | undefined
): Omit<T, "ciHash" | "diHash"> | null => {
	if (!profile) {
		return null;
	}
	const { ciHash: _ciHash, diHash: _diHash, ...clientProfile } = profile;
	return clientProfile;
};

const createBambiProfile = async ({
	gender,
	identityVerificationId,
	phoneNumber,
	role,
	userId,
}: {
	gender?: "male" | "female";
	identityVerificationId?: string;
	phoneNumber?: string;
	role: BambiProfileRole;
	userId: string;
}) => {
	const [existingProfile] = await db
		.select({ role: bambiProfile.role })
		.from(bambiProfile)
		.where(eq(bambiProfile.userId, userId))
		.limit(1);

	assertCanCreateBambiProfile({ existingRole: existingProfile?.role });

	const apiSecret = env.PORTONE_API_SECRET;
	// 포트원이 구성된 환경에서는 본인인증 없이 가입할 수 없다. 미구성 개발 환경만
	// 목 흐름을 위해 인증 없는 가입을 허용한다.
	if (apiSecret && !identityVerificationId) {
		throw new ORPCError("BAD_REQUEST", {
			message: "본인인증을 먼저 완료해 주세요.",
		});
	}

	let identity: VerifiedIdentity | null = null;
	if (apiSecret && identityVerificationId) {
		identity = await resolveVerifiedIdentity(
			apiSecret,
			identityVerificationId,
			identityChannelOptions
		);
		// 폼 진입 전에 checkIdentityForSignup이 대부분 걸러내지만, 두 사람이 동시에
		// 가입하는 경합을 위해 최종 방어선으로 한 번 더 본다.
		if (await findIdentityCollision(identity, userId)) {
			throw new ORPCError("CONFLICT", { message: IDENTITY_CONFLICT_MESSAGE });
		}
		// 인증 건의 최종 소비 지점. 여기를 지나면 같은 ID로는 다시 가입할 수 없다
		// (앞선 checkIdentityForSignup·/api/guest는 검증만 하고 소진시키지 않는다).
		await consumeIdentityVerification(identityVerificationId);
	}

	const [createdProfile] = await db
		.insert(bambiProfile)
		.values({
			userId,
			role,
			phoneNumber: identity?.phoneNumber ?? phoneNumber,
			// 실인증 결과가 신뢰 원천이므로 클라이언트가 보낸 성별을 덮어쓴다.
			gender: identity?.gender ?? gender,
			birthDate: identity?.birth8,
			ciHash: identity?.ciHash,
			diHash: identity?.diHash,
			isPhoneVerified: identity !== null,
		})
		.returning();

	return toClientProfile(createdProfile);
};

// 본인이 소유자인 조직에 본인 외 멤버가 남아 있으면 true. 탈퇴 차단 판정과
// 웹의 탈퇴 버튼 사전 비활성화가 같은 규칙을 공유하도록 한 곳에 둔다.
const hasRemainingMembersInOwnedOrganizations = async (
	userId: string
): Promise<boolean> => {
	const ownedOrganizationIds = (
		await db
			.select({ organizationId: member.organizationId })
			.from(member)
			.where(and(eq(member.userId, userId), eq(member.role, "owner")))
	).map((row) => row.organizationId);
	if (ownedOrganizationIds.length === 0) {
		return false;
	}
	const [remainingMember] = await db
		.select({ userId: member.userId })
		.from(member)
		.where(
			and(
				inArray(member.organizationId, ownedOrganizationIds),
				ne(member.userId, userId)
			)
		)
		.limit(1);
	return Boolean(remainingMember);
};

export const onboardingRouter = {
	getMine: protectedProcedure.handler(async ({ context }) => {
		const userId = context.session.user.id;
		const [profile] = await db
			.select()
			.from(bambiProfile)
			.where(eq(bambiProfile.userId, userId))
			.limit(1);

		const now = new Date();
		const isAdvertiser = profile
			? await hasActiveAdExposure({ now, userId })
			: false;
		const community = resolveCommunityAccess({
			gender: profile?.gender ?? null,
			isAdvertiser,
			role: profile?.role ?? "job_seeker",
			status: profile?.status ?? "active",
		});

		// 계정이 경고·정지 상태면 대상 사용자 화면에 안내 배너를 띄우기 위한 최신 제재 사유를
		// 함께 내려준다. 별도 알림 테이블 없이 운영자 감사 로그(admin_moderation_action)의
		// 가장 최근 set_status 기록을 조회한다(정상 계정은 쿼리하지 않음).
		const accountSanction =
			profile && (profile.status === "warned" || profile.status === "suspended")
				? await (async () => {
						const [latestAction] = await db
							.select({
								reason: adminModerationAction.reason,
								createdAt: adminModerationAction.createdAt,
							})
							.from(adminModerationAction)
							.where(
								and(
									eq(adminModerationAction.targetType, "user"),
									eq(adminModerationAction.targetId, userId),
									eq(
										adminModerationAction.action,
										`set_status:${profile.status}`
									)
								)
							)
							.orderBy(desc(adminModerationAction.createdAt))
							.limit(1);

						return {
							status: profile.status,
							reason: latestAction?.reason ?? null,
							createdAt: latestAction?.createdAt ?? null,
						};
					})()
				: null;

		const organizationProfiles = await db
			.select({
				id: employerOrganizationProfile.id,
				organizationId: employerOrganizationProfile.organizationId,
				role: member.role,
				displayName: employerOrganizationProfile.displayName,
				businessRegistrationNumber:
					employerOrganizationProfile.businessRegistrationNumber,
				representativeName: employerOrganizationProfile.representativeName,
				businessStartDate: employerOrganizationProfile.businessStartDate,
				biznumCheckedAt: employerOrganizationProfile.biznumCheckedAt,
				biznumStatusCode: employerOrganizationProfile.biznumStatusCode,
				verificationStatus: employerOrganizationProfile.verificationStatus,
				verificationNote: employerOrganizationProfile.verificationNote,
				createdAt: employerOrganizationProfile.createdAt,
				updatedAt: employerOrganizationProfile.updatedAt,
			})
			.from(employerOrganizationProfile)
			.innerJoin(
				member,
				and(
					eq(member.organizationId, employerOrganizationProfile.organizationId),
					eq(member.userId, userId)
				)
			);

		const teamProfileColumns = {
			id: employerTeamProfile.id,
			organizationId: employerTeamProfile.organizationId,
			teamId: employerTeamProfile.teamId,
			displayName: employerTeamProfile.displayName,
			region: employerTeamProfile.region,
			regionCode: employerTeamProfile.regionCode,
			districtCode: employerTeamProfile.districtCode,
			createdAt: employerTeamProfile.createdAt,
			updatedAt: employerTeamProfile.updatedAt,
		};
		const teamProfiles = await db
			.select(teamProfileColumns)
			.from(employerTeamProfile)
			.innerJoin(
				teamMember,
				and(
					eq(teamMember.teamId, employerTeamProfile.teamId),
					eq(teamMember.userId, userId)
				)
			);

		// owner/admin(조직 전체 공고를 낼 수 있는 역할)인 조직의 팀은 본인이
		// teamMember인지와 무관하게 공고 등록 범위에 노출한다.
		const organizationWidePostingOrganizationIds = organizationProfiles
			.filter(({ role }) => ORGANIZATION_WIDE_POSTING_ROLES.has(role))
			.map(({ organizationId }) => organizationId);
		const organizationWideTeamProfiles =
			organizationWidePostingOrganizationIds.length > 0
				? await db
						.select(teamProfileColumns)
						.from(employerTeamProfile)
						.where(
							inArray(
								employerTeamProfile.organizationId,
								organizationWidePostingOrganizationIds
							)
						)
				: [];

		// 내 공고 팀 프로필(teamMember 기준)과 owner/admin 조직 전체 팀을 합쳐
		// teamId 기준으로 중복을 제거한다. 공고 등록 범위 계산과 라벨 조회에 쓴다.
		const teamProfileById = new Map(
			[...teamProfiles, ...organizationWideTeamProfiles].map((teamProfile) => [
				teamProfile.teamId,
				teamProfile,
			])
		);
		const postingScopeTeamProfiles = [...teamProfileById.values()];

		const postingScopes = getJobPostingScopes({
			organizationMemberships: organizationProfiles.map(
				({ organizationId, role }) => ({
					organizationId,
					role,
				})
			),
			teamMemberships: postingScopeTeamProfiles.map(
				({ organizationId, teamId }) => ({
					organizationId,
					teamId,
				})
			),
		});
		const organizationProfileById = new Map(
			organizationProfiles.map((organizationProfile) => [
				organizationProfile.organizationId,
				organizationProfile,
			])
		);

		return {
			bambiProfile: toClientProfile(profile),
			accountSanction,
			// 국세청 진위확인 서비스키가 있어야 제출 때 대조가 돈다. 없으면 전 건이 "미확인"으로
			// 접수되므로, 화면이 "미확인" 대신 "곧 준비될 기능" 안내를 띄우도록 여부만 내려준다.
			biznumCheckEnabled: Boolean(env.NTS_SERVICE_KEY),
			community,
			employerOrganizationProfiles: organizationProfiles,
			// teamMember 기준 팀에 더해 owner/admin 조직 전체 팀까지 포함해야
			// owner가 본인이 멤버가 아닌 팀으로 낸 공고도 팀명 라벨을 조회할 수 있다.
			employerTeamProfiles: postingScopeTeamProfiles,
			employerJobPostingScopes: postingScopes.map((scope) => {
				const organizationProfile = organizationProfileById.get(
					scope.organizationId
				);
				const teamProfile = scope.teamId
					? teamProfileById.get(scope.teamId)
					: undefined;

				return {
					organizationDisplayName:
						organizationProfile?.displayName ?? scope.organizationId,
					organizationId: scope.organizationId,
					scopeType: scope.scopeType,
					teamDisplayName: teamProfile?.displayName ?? null,
					teamId: scope.teamId ?? null,
				};
			}),
		};
	}),

	getMyRouting: protectedProcedure.handler(async ({ context }) => {
		const userId = context.session.user.id;
		const [profile] = await db
			.select({ role: bambiProfile.role })
			.from(bambiProfile)
			.where(eq(bambiProfile.userId, userId))
			.limit(1);

		if (!profile) {
			return { role: null, employerApprovalStatus: "none" as const };
		}

		if (profile.role !== "employer") {
			return { role: profile.role, employerApprovalStatus: "none" as const };
		}

		const orgProfiles = await db
			.select({
				verificationStatus: employerOrganizationProfile.verificationStatus,
			})
			.from(employerOrganizationProfile)
			.innerJoin(
				member,
				and(
					eq(member.organizationId, employerOrganizationProfile.organizationId),
					eq(member.userId, userId)
				)
			);

		return {
			role: profile.role,
			employerApprovalStatus: deriveEmployerApprovalStatus(
				orgProfiles.map((row) => row.verificationStatus)
			),
		};
	}),

	updateMyProfile: protectedProcedure
		.input(profileUpdateInput)
		.handler(async ({ context, input }) => {
			const userId = context.session.user.id;
			const [existingProfile] = await db
				.select({
					phoneNumber: bambiProfile.phoneNumber,
					role: bambiProfile.role,
				})
				.from(bambiProfile)
				.where(eq(bambiProfile.userId, userId))
				.limit(1);

			assertCanUpdateOwnBambiProfile({
				existingRole: existingProfile?.role,
				hasPersonalProfileChanges:
					input.displayName !== undefined || input.phoneNumber !== undefined,
				requestedRole: input.role,
			});

			// 표시명(닉네임)은 user.name 정본을 갱신한다(프로필 아님).
			if (input.displayName !== undefined) {
				await assertDisplayNameAllowed(input.displayName, {
					isAdmin: existingProfile?.role === "admin",
				});
				await db
					.update(user)
					.set({ name: input.displayName })
					.where(eq(user.id, userId));
			}

			// 여기서 들어오는 번호는 본인확인을 거치지 않은 자기신고 값이다. 그대로 덮어쓰면서
			// isPhoneVerified를 true로 두면 본인확인 결과정보가 사후 변조되고 화면이 그것을
			// "인증된 번호"로 표시하게 되므로, 번호를 바꿀 때는 인증 상태도 함께 내린다
			// (다시 인증받아야 인증된 번호가 된다).
			// 같은 번호 재제출은 아예 건드리지 않는다 — 네이티브 프로필 폼이 기존 번호를 미리
			// 채워두므로, 표시명만 고쳐 저장해도 인증이 풀리면 안 된다.
			if (
				input.phoneNumber !== undefined &&
				input.phoneNumber !== existingProfile?.phoneNumber
			) {
				await db
					.update(bambiProfile)
					.set({ phoneNumber: input.phoneNumber, isPhoneVerified: false })
					.where(eq(bambiProfile.userId, userId));
			}

			const [updatedProfile] = await db
				.select()
				.from(bambiProfile)
				.where(eq(bambiProfile.userId, userId))
				.limit(1);

			return toClientProfile(updatedProfile);
		}),

	// 본인인증 건 발급 — 클라이언트는 이 ID로만 포트원 인증창을 연다. 가입 전(계정 없는
	// 방문자)에도 인증을 시작하므로 publicProcedure다. 서버가 발급 시각을 기록해야
	// "우리가 시작시킨 인증인지 · 유효시간 안인지 · 이미 썼는지"를 나중에 판정할 수 있다.
	// 무인증 삽입이라 남용되면 표가 부풀 수 있어 IP 레이트리밋을 건다.
	startIdentityVerification: rateLimitedPublicProcedure.handler(async () => ({
		identityVerificationId: await issueIdentityVerificationId(),
	})),

	// 가입 전 본인인증 확인 — 계정이 없는 상태에서 부르므로 publicProcedure다.
	// 개인정보는 돌려주지 않는다(성별과 가입 여부 불리언만). 인증 자체는 이미
	// 끝난 뒤이고 포트원 단건조회는 무료라, 임의 ID로 두드려도 얻을 게 없다
	// (identityVerificationId는 UUID라 추측이 불가능하다).
	checkIdentityForSignup: publicProcedure
		.input(phoneVerificationInput)
		.handler(async ({ input }) => {
			const apiSecret = env.PORTONE_API_SECRET;
			if (!apiSecret) {
				throw new ORPCError("INTERNAL_SERVER_ERROR", {
					message: "본인인증이 아직 구성되지 않았습니다.",
				});
			}
			// 검증만 하고 소진시키지 않는다 — 이 호출 뒤에 /api/guest와 프로필 생성이
			// 같은 인증 건을 이어서 쓴다(소진은 프로필 생성이 한다).
			await assertIdentityVerificationUsable(input.identityVerificationId);
			const identity = await resolveVerifiedIdentity(
				apiSecret,
				input.identityVerificationId,
				identityChannelOptions
			);
			return {
				gender: identity.gender,
				hasAccount: await findIdentityCollision(identity),
			};
		}),

	// 실 휴대폰 본인인증(포트원 인증창) — 클라이언트가 보낸 identityVerificationId를
	// 포트원 단건조회로 검증하고, 조회 결과(번호·성별·생년월일·CI·DI)를 프로필에 저장한다.
	// 만 19세 미만은 법적 요건상 무조건 거부한다. DI 해시 유니크로 중복 계정 인증을 막는다.
	verifyMyPhone: protectedProcedure
		.input(phoneVerificationInput)
		.handler(async ({ context, input }) => {
			const apiSecret = env.PORTONE_API_SECRET;
			if (!apiSecret) {
				throw new ORPCError("INTERNAL_SERVER_ERROR", {
					message: "본인인증이 아직 구성되지 않았습니다.",
				});
			}
			const userId = context.session.user.id;
			const [existingProfile] = await db
				.select({ gender: bambiProfile.gender })
				.from(bambiProfile)
				.where(eq(bambiProfile.userId, userId))
				.limit(1);
			if (!existingProfile) {
				throw new ORPCError("NOT_FOUND", {
					message: "프로필을 찾을 수 없습니다.",
				});
			}

			const identity = await resolveVerifiedIdentity(
				apiSecret,
				input.identityVerificationId,
				identityChannelOptions
			);
			if (await findIdentityCollision(identity, userId)) {
				throw new ORPCError("CONFLICT", { message: IDENTITY_CONFLICT_MESSAGE });
			}
			// 재인증의 최종 소비 지점 — 같은 인증 건으로 두 번 번호를 갈아끼울 수 없다.
			await consumeIdentityVerification(input.identityVerificationId);

			const [updatedProfile] = await db
				.update(bambiProfile)
				.set({
					phoneNumber: identity.phoneNumber,
					isPhoneVerified: true,
					// 실인증 결과가 신뢰 원천이므로 성별을 덮어쓴다(조회 실패 시 기존 유지).
					gender: identity.gender ?? existingProfile.gender,
					birthDate: identity.birth8,
					ciHash: identity.ciHash,
					diHash: identity.diHash,
				})
				.where(eq(bambiProfile.userId, userId))
				.returning();

			return toClientProfile(updatedProfile);
		}),

	// 목 휴대폰 본인인증 — 포트원 미구성 개발 환경 전용. 프로덕션·포트원 구성 시에는
	// 잠긴다(클라이언트도 같은 조건으로 목 폼을 숨기지만, 서버에서도 이중으로 막는다).
	verifyMyPhoneMock: protectedProcedure
		.input(mockPhoneVerificationInput)
		.handler(async ({ context, input }) => {
			if (env.PORTONE_API_SECRET || env.NODE_ENV === "production") {
				throw new ORPCError("FORBIDDEN", {
					message:
						"목 인증은 포트원 미구성 개발 환경에서만 사용할 수 있습니다.",
				});
			}
			// 실인증과 동일한 연령 기준을 적용해 개발에서도 차단 UX를 검증할 수 있게 한다.
			if (input.birthDate && !isAdultBirth8(input.birthDate, new Date())) {
				throw new ORPCError("FORBIDDEN", { message: UNDERAGE_MESSAGE });
			}
			const userId = context.session.user.id;
			const [existingProfile] = await db
				.select({ gender: bambiProfile.gender })
				.from(bambiProfile)
				.where(eq(bambiProfile.userId, userId))
				.limit(1);

			if (!existingProfile) {
				throw new ORPCError("NOT_FOUND", {
					message: "프로필을 찾을 수 없습니다.",
				});
			}

			const [updatedProfile] = await db
				.update(bambiProfile)
				.set({
					phoneNumber: input.phoneNumber,
					isPhoneVerified: true,
					gender: existingProfile.gender ?? input.gender,
					birthDate: input.birthDate,
				})
				.where(eq(bambiProfile.userId, userId))
				.returning();

			return toClientProfile(updatedProfile);
		}),

	createJobSeekerProfile: protectedProcedure
		.input(profileInput)
		.handler(async ({ context, input }) =>
			createBambiProfile({
				...input,
				role: "job_seeker",
				userId: context.session.user.id,
			})
		),

	createEmployerProfile: protectedProcedure
		.input(profileInput)
		.handler(async ({ context, input }) =>
			createBambiProfile({
				...input,
				role: "employer",
				userId: context.session.user.id,
			})
		),

	// 회원가입 시 이용약관·개인정보 처리방침 동의 이력을 저장한다. 현재 유효한 두 문서
	// 버전에 대한 동의를 남기며, 같은 버전 중복 저장은 unique index로 무시한다(재호출 안전).
	recordLegalConsent: protectedProcedure.handler(async ({ context }) => {
		const userId = context.session.user.id;
		const rows = (
			Object.entries(LEGAL_CONSENT_VERSIONS) as [
				"terms_of_service" | "privacy_policy",
				string,
			][]
		).map(([document, version]) => ({ userId, document, version }));

		await db.insert(bambiLegalConsent).values(rows).onConflictDoNothing();

		return { recorded: rows.length };
	}),

	// 탈퇴 가능 여부 조회(입력 없음). 웹은 이 값으로 탈퇴 버튼을 사전 비활성화한다 —
	// 최종 가드는 withdrawMyAccount의 서버 검사다.
	getWithdrawEligibility: protectedProcedure.handler(async ({ context }) => ({
		blockedByTeamMembers: await hasRemainingMembersInOwnedOrganizations(
			context.session.user.id
		),
	})),

	// 회원 탈퇴. 본인이 소유한 조직에 다른 멤버가 남아 있으면 차단한다 —
	// 팀 관리에서 멤버를 모두 정리한 뒤 탈퇴할 수 있다(혼자 남은 소유자는 그대로 탈퇴 가능).
	//
	// 개인정보 보호법 제21조제1항은 목적 달성 시 "지체 없이" 파기하도록 하고, 그 단서의
	// 예외는 "다른 법령에 따라 보존하여야 하는 경우"뿐이다. 부정 재가입 차단은 법령상
	// 보존 사유가 아니므로 탈퇴 시점에 PII를 즉시 파기하고, 그 목적에 꼭 필요한 최소
	// 식별값인 CI·DI 해시만 보존기간 동안 남긴다. 남은 해시는 보존기간 경과 후 운영자
	// 배치(moderation.purgeWithdrawnAccounts)가 파기한다.
	// user 행 자체는 지우지 않는다 — 채팅·리뷰·신고 등 상대방 데이터가 onDelete 미지정
	// (RESTRICT) FK로 물려 있어 행 삭제는 실패하거나 상대방 기록까지 깨진다.
	withdrawMyAccount: protectedProcedure.handler(async ({ context }) => {
		const userId = context.session.user.id;

		// 본인이 소유자인 조직에 본인 외 멤버가 남아 있으면 탈퇴 차단.
		if (await hasRemainingMembersInOwnedOrganizations(userId)) {
			throw new ORPCError("CONFLICT", {
				message:
					"팀에 다른 멤버가 남아 있어 탈퇴할 수 없어요. 팀 관리에서 멤버를 모두 정리한 뒤 다시 시도해 주세요.",
			});
		}

		await db.transaction(async (tx) => {
			// 이메일은 notNull·unique라 지울 수 없어 tombstone으로 치환한다(원 이메일
			// 재가입이 바로 열린다). 로그인 아이디는 nullable이라 그대로 비워 파기하며,
			// 같은 아이디를 다른 사람이 다시 쓸 수 있게 된다(Postgres unique는 NULL 다중
			// 허용). isNull 가드로 중복 호출을 no-op으로 만든다(멱등).
			await tx
				.update(user)
				.set({
					deletedAt: new Date(),
					email: `withdrawn-${userId}@invalid.bambi`,
					image: null,
					login_id: null,
					login_id_display: null,
					name: "탈퇴한 회원",
				})
				.where(and(eq(user.id, userId), isNull(user.deletedAt)));
			// 비밀번호 등 자격증명 즉시 파기.
			await tx.delete(account).where(eq(account.userId, userId));
			// 연락처·본인인증 정보 즉시 파기. ciHash·diHash는 부정 재가입 차단에 필요해
			// 보존기간 동안만 남기고, 파기 배치가 보존기간 경과 후 지운다.
			await tx
				.update(bambiProfile)
				.set({
					birthDate: null,
					gender: null,
					isPhoneVerified: false,
					phoneNumber: null,
				})
				.where(eq(bambiProfile.userId, userId));
			await tx.delete(teamMember).where(eq(teamMember.userId, userId));
			await tx.delete(member).where(eq(member.userId, userId));
			// 전 기기 세션을 지워 즉시 접근을 끊는다. 재로그인은 auth 훅이 차단.
			await tx.delete(sessionTable).where(eq(sessionTable.userId, userId));
		});

		return { ok: true } as const;
	}),

	upsertEmployerOrganizationProfile: protectedProcedure
		.input(organizationProfileInput)
		.handler(async ({ context, input }) => {
			const userId = context.session.user.id;

			await requireManageableOrganizationRole({
				organizationId: input.organizationId,
				userId,
			});
			const employerProfile = await requireEmployerBambiProfile(userId);

			if (
				employerProfile.role !== "admin" &&
				!(await isEmployerOrganizationVerified(input.organizationId))
			) {
				throw new ORPCError("FORBIDDEN", {
					message: "운영자 승인 후 조직 설정을 변경할 수 있습니다.",
				});
			}

			const [profile] = await db
				.insert(employerOrganizationProfile)
				.values(input)
				.onConflictDoUpdate({
					target: employerOrganizationProfile.organizationId,
					set: {
						displayName: input.displayName,
						businessRegistrationNumber: input.businessRegistrationNumber,
						updatedAt: new Date(),
					},
				})
				.returning();

			return profile;
		}),

	upsertEmployerTeamProfile: protectedProcedure
		.input(teamProfileInput)
		.handler(async ({ context, input }) => {
			const userId = context.session.user.id;

			await requireManageableOrganizationRole({
				organizationId: input.organizationId,
				userId,
			});
			const employerProfile = await requireEmployerBambiProfile(userId);

			if (
				employerProfile.role !== "admin" &&
				!(await isEmployerOrganizationVerified(input.organizationId))
			) {
				throw new ORPCError("FORBIDDEN", {
					message: "운영자 승인 후 팀 설정을 변경할 수 있습니다.",
				});
			}

			const [selectedTeam] = await db
				.select({ id: team.id })
				.from(team)
				.where(
					and(
						eq(team.id, input.teamId),
						eq(team.organizationId, input.organizationId)
					)
				)
				.limit(1);

			if (!selectedTeam) {
				throw new ORPCError("FORBIDDEN", {
					message: "Selected team must belong to the organization.",
				});
			}

			const regionSelection = await resolveOptionalRegion(input);
			const [profile] = await db
				.insert(employerTeamProfile)
				.values({
					displayName: input.displayName,
					organizationId: input.organizationId,
					teamId: input.teamId,
					...regionSelection,
				})
				.onConflictDoUpdate({
					target: employerTeamProfile.teamId,
					set: {
						organizationId: input.organizationId,
						displayName: input.displayName,
						...regionSelection,
						updatedAt: new Date(),
					},
				})
				.returning();

			return profile;
		}),

	requestEmployerVerification: protectedProcedure
		.input(requestEmployerVerificationInput)
		.handler(async ({ context, input }) => {
			await requireManageableOrganizationRole({
				organizationId: input.organizationId,
				userId: context.session.user.id,
			});

			const [profile] = await db
				.select()
				.from(employerOrganizationProfile)
				.where(
					eq(employerOrganizationProfile.organizationId, input.organizationId)
				)
				.limit(1);

			if (!profile) {
				throw new ORPCError("NOT_FOUND");
			}

			if (profile.verificationStatus === "verified") {
				return profile;
			}

			const [updatedProfile] = await db
				.update(employerOrganizationProfile)
				.set({
					verificationStatus: "pending",
					updatedAt: new Date(),
				})
				.where(
					eq(employerOrganizationProfile.organizationId, input.organizationId)
				)
				.returning();

			return updatedProfile;
		}),

	submitEmployerBusinessInfo: protectedProcedure
		.input(submitEmployerBusinessInfoInput)
		.handler(async ({ context, input }) => {
			const userId = context.session.user.id;
			await requireEmployerBambiProfile(userId);

			if (
				!takeRateLimit({
					key: `submitEmployerBusinessInfo:${userId}`,
					limit: BIZNUM_RATE_LIMIT,
					now: Date.now(),
					windowMs: BIZNUM_RATE_LIMIT_WINDOW_MS,
				})
			) {
				throw new ORPCError("TOO_MANY_REQUESTS", {
					message: "요청이 너무 많아요. 잠시 후 다시 시도해 주세요.",
				});
			}

			// 개업일자는 8자리로 저장한다(국세청 전송 형식과 같게 둬 변환 지점을 하나로).
			const businessStartDate = input.businessStartDate.replaceAll("-", "");

			// 본인이 owner인 조직이 이미 있으면 그 조직 프로필을 갱신한다.
			// 단, 이미 인증(verified)된 조직이 사업자정보를 그대로 재제출한 경우
			// 재심사로 강등하지 않고 verified를 유지한다(변경이 있을 때만 pending 재심사).
			const [ownedOrg] = await db
				.select({
					organizationId: employerOrganizationProfile.organizationId,
					displayName: employerOrganizationProfile.displayName,
					businessRegistrationNumber:
						employerOrganizationProfile.businessRegistrationNumber,
					representativeName: employerOrganizationProfile.representativeName,
					businessStartDate: employerOrganizationProfile.businessStartDate,
					verificationStatus: employerOrganizationProfile.verificationStatus,
				})
				.from(employerOrganizationProfile)
				.innerJoin(
					member,
					and(
						eq(
							member.organizationId,
							employerOrganizationProfile.organizationId
						),
						eq(member.userId, userId),
						eq(member.role, "owner")
					)
				)
				.limit(1);

			if (ownedOrg) {
				const isUnchanged =
					ownedOrg.displayName === input.displayName &&
					ownedOrg.businessRegistrationNumber ===
						input.businessRegistrationNumber &&
					ownedOrg.representativeName === input.representativeName &&
					ownedOrg.businessStartDate === businessStartDate;

				// 인증 완료 상태에서 변경 없이 재제출한 경우: 상태를 건드리지 않고 유지한다.
				if (ownedOrg.verificationStatus === "verified" && isUnchanged) {
					return {
						organizationId: ownedOrg.organizationId,
						verificationStatus: "verified" as const,
					};
				}

				const biznumCheck = await checkBiznum({ ...input, businessStartDate });

				await db
					.update(employerOrganizationProfile)
					.set({
						displayName: input.displayName,
						businessRegistrationNumber: input.businessRegistrationNumber,
						representativeName: input.representativeName,
						businessStartDate,
						...biznumCheck,
						verificationStatus: "pending",
						updatedAt: new Date(),
					})
					.where(
						eq(
							employerOrganizationProfile.organizationId,
							ownedOrg.organizationId
						)
					);

				return {
					organizationId: ownedOrg.organizationId,
					verificationStatus: "pending" as const,
				};
			}

			const biznumCheck = await checkBiznum({ ...input, businessStartDate });
			const organizationId = `org_${randomUUID()}`;
			const now = new Date();

			await db.transaction(async (tx) => {
				await tx.insert(organization).values({
					id: organizationId,
					name: input.displayName,
					slug: toOrganizationSlug(input.displayName),
					createdAt: now,
				});
				await tx.insert(member).values({
					id: `member_${randomUUID()}`,
					organizationId,
					userId,
					role: "owner",
					createdAt: now,
				});
				await tx.insert(employerOrganizationProfile).values({
					organizationId,
					displayName: input.displayName,
					businessRegistrationNumber: input.businessRegistrationNumber,
					representativeName: input.representativeName,
					businessStartDate,
					...biznumCheck,
					verificationStatus: "pending",
				});
			});

			return { organizationId, verificationStatus: "pending" as const };
		}),
};
