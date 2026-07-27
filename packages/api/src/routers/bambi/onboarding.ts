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

import { protectedProcedure } from "../../index";
import { hasActiveAdExposure } from "../../services/bambi-advertiser";
import { isEmployerOrganizationVerified } from "../../services/bambi-authz";
import { resolveCommunityAccess } from "../../services/bambi-community-access";
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
import {
	fetchIdentityVerification,
	hashIdentityValue,
	isAdultBirth8,
	mapPortOneGender,
	toBirth8,
	UNDERAGE_MESSAGE,
} from "../../services/portone-identity";

const profileInput = z.object({
	gender: z.enum(["male", "female"]).optional(),
	phoneNumber: z.string().min(3).max(30).optional(),
});

// 현재 유효한 법적 문서 버전. 각 웹 페이지의 시행일과 일치시킨다 — 이용약관(/terms)은
// 2026-07-10, 개인정보 처리방침(/privacy)은 실제 처리 현황 반영 개정(수집항목 정정,
// 국외 이전·쿠키·안전성 확보조치·권익침해 구제 신설)으로 2026-07-27.
// 문서를 개정하면 해당 값을 올린다 — 재동의가 새 이력 행으로 쌓인다.
const LEGAL_CONSENT_VERSIONS = {
	terms_of_service: "2026-07-10",
	privacy_policy: "2026-07-27",
} as const;

// 표시명(닉네임)은 user.name 정본을 갱신하므로 프로필 입력이 아니라 이 갱신 입력에만 둔다.
const profileUpdateInput = profileInput.omit({ gender: true }).extend({
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
	region: z.string().min(1).max(80).optional(),
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
});

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

const createBambiProfile = async ({
	gender,
	phoneNumber,
	role,
	userId,
}: {
	gender?: "male" | "female";
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

	const [createdProfile] = await db
		.insert(bambiProfile)
		.values({
			userId,
			role,
			phoneNumber,
			gender,
		})
		.returning();

	return createdProfile;
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
			bambiProfile: profile ?? null,
			accountSanction,
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
				.select({ role: bambiProfile.role })
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
				await db
					.update(user)
					.set({ name: input.displayName })
					.where(eq(user.id, userId));
			}

			if (input.phoneNumber !== undefined) {
				await db
					.update(bambiProfile)
					.set({ phoneNumber: input.phoneNumber })
					.where(eq(bambiProfile.userId, userId));
			}

			const [updatedProfile] = await db
				.select()
				.from(bambiProfile)
				.where(eq(bambiProfile.userId, userId))
				.limit(1);

			return updatedProfile;
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

			const verification = await fetchIdentityVerification(
				apiSecret,
				input.identityVerificationId
			);
			if (verification.status !== "VERIFIED") {
				throw new ORPCError("BAD_REQUEST", {
					message: "본인인증이 완료되지 않았습니다. 다시 시도해 주세요.",
				});
			}
			const customer = verification.verifiedCustomer;
			const birth8 = toBirth8(customer?.birthDate);
			// 생년월일을 못 읽으면 성인임을 증명할 수 없으므로 거부한다(안전 기본값).
			if (!(birth8 && isAdultBirth8(birth8, new Date()))) {
				throw new ORPCError("FORBIDDEN", { message: UNDERAGE_MESSAGE });
			}
			if (!customer?.ci) {
				throw new ORPCError("BAD_REQUEST", {
					message: "인증 정보에 개인 식별값(CI)이 없습니다.",
				});
			}
			if (!customer.di) {
				throw new ORPCError("BAD_REQUEST", {
					message: "인증 정보에 중복확인 식별값(DI)이 없습니다.",
				});
			}

			// CI·DI 원문은 저장하지 않는다 — 해시로 중복 계정만 판별한다. 중복 판정의
			// 기준 축은 DI지만, 과거 CI만 저장된 계정과의 CI 충돌도 유니크 인덱스가
			// 유지되므로 저장 전에 함께 걸러 같은 안내로 막는다(안 그러면 저장 시
			// unique violation으로 터진다). 둘 중 하나라도 다른 계정과 겹치면 CONFLICT.
			const ciHash = await hashIdentityValue(customer.ci);
			const diHash = await hashIdentityValue(customer.di);
			const collisions = await db
				.select({ userId: bambiProfile.userId })
				.from(bambiProfile)
				.where(
					or(eq(bambiProfile.diHash, diHash), eq(bambiProfile.ciHash, ciHash))
				);
			if (collisions.some((row) => row.userId !== userId)) {
				throw new ORPCError("CONFLICT", {
					message: "이미 다른 계정에서 본인인증에 사용된 정보예요.",
				});
			}

			const [updatedProfile] = await db
				.update(bambiProfile)
				.set({
					phoneNumber: customer.phoneNumber,
					isPhoneVerified: true,
					// 실인증 결과가 신뢰 원천이므로 성별을 덮어쓴다(조회 실패 시 기존 유지).
					gender: mapPortOneGender(customer.gender) ?? existingProfile.gender,
					birthDate: birth8,
					ciHash,
					diHash,
				})
				.where(eq(bambiProfile.userId, userId))
				.returning();

			return updatedProfile;
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

			return updatedProfile;
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
			// 재가입이 바로 열린다). isNull 가드로 중복 호출을 no-op으로 만든다(멱등).
			await tx
				.update(user)
				.set({
					deletedAt: new Date(),
					email: `withdrawn-${userId}@invalid.bambi`,
					image: null,
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

			const [profile] = await db
				.insert(employerTeamProfile)
				.values(input)
				.onConflictDoUpdate({
					target: employerTeamProfile.teamId,
					set: {
						organizationId: input.organizationId,
						displayName: input.displayName,
						region: input.region,
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

			// 본인이 owner인 조직이 이미 있으면 그 조직 프로필을 갱신한다.
			// 단, 이미 인증(verified)된 조직이 업체명·사업자번호를 그대로 재제출한 경우
			// 재심사로 강등하지 않고 verified를 유지한다(변경이 있을 때만 pending 재심사).
			const [ownedOrg] = await db
				.select({
					organizationId: employerOrganizationProfile.organizationId,
					displayName: employerOrganizationProfile.displayName,
					businessRegistrationNumber:
						employerOrganizationProfile.businessRegistrationNumber,
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
						input.businessRegistrationNumber;

				// 인증 완료 상태에서 변경 없이 재제출한 경우: 상태를 건드리지 않고 유지한다.
				if (ownedOrg.verificationStatus === "verified" && isUnchanged) {
					return {
						organizationId: ownedOrg.organizationId,
						verificationStatus: "verified" as const,
					};
				}

				await db
					.update(employerOrganizationProfile)
					.set({
						displayName: input.displayName,
						businessRegistrationNumber: input.businessRegistrationNumber,
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
					verificationStatus: "pending",
				});
			});

			return { organizationId, verificationStatus: "pending" as const };
		}),
};
