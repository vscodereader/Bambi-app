import { randomUUID } from "node:crypto";

import { db } from "@bambi-app/db";
import {
	invitation,
	member,
	team,
	teamMember,
	user,
} from "@bambi-app/db/schema/auth";
import { bambiProfile, employerTeamProfile } from "@bambi-app/db/schema/bambi";
import { ORPCError } from "@orpc/server";
import {
	and,
	asc,
	count,
	eq,
	ilike,
	inArray,
	notInArray,
	or,
} from "drizzle-orm";
import z from "zod";

import { protectedProcedure } from "../../index";
import {
	isEmployerOrganizationVerified,
	requireActiveBambiProfile,
} from "../../services/bambi-authz";
import {
	canInviteMembers,
	canManageOrganization,
	normalizeOrganizationManagementRole,
	type OrganizationManagementRole,
	type OrganizationMembership,
} from "../../services/bambi-organization-authz";
import { resolveOptionalRegion } from "../../services/bambi-region";

const organizationRoleSchema = z.enum(["owner", "manager", "staff"]);

const organizationIdInput = z.object({
	organizationId: z.string().min(1),
});

const createTeamInput = organizationIdInput.extend({
	displayName: z.string().min(1).max(120),
	name: z.string().min(1).max(120).optional(),
	// 지역은 마스터 코드로 받는다(공고 입력과 같은 축). 표시용 region 문자열은 저장 시
	// 서버가 마스터 라벨에서 복사한다.
	regionCode: z.string().length(10).optional(),
	districtCode: z.string().length(10).optional(),
});

const updateTeamInput = createTeamInput.extend({
	teamId: z.string().min(1),
});

const teamActionInput = organizationIdInput.extend({
	teamId: z.string().min(1),
});

const setMemberTeamsInput = organizationIdInput.extend({
	memberId: z.string().min(1),
	teamIds: z.array(z.string().min(1)),
});

const inviteMemberInput = organizationIdInput.extend({
	email: z.string().email().max(320),
	role: organizationRoleSchema,
	teamId: z.string().min(1).optional(),
});

const setMemberRoleInput = organizationIdInput.extend({
	memberId: z.string().min(1),
	role: organizationRoleSchema,
});

const transferOwnershipInput = organizationIdInput.extend({
	memberId: z.string().min(1),
});

const removeMemberInput = organizationIdInput.extend({
	memberId: z.string().min(1),
});

const searchEmployerInviteesInput = organizationIdInput.extend({
	query: z.string().max(320).optional(),
});

const invitationActionInput = organizationIdInput.extend({
	invitationId: z.string().min(1),
});

const forbidden = (message: string) => new ORPCError("FORBIDDEN", { message });

// 승인(verified)되지 않은 조직은 팀 관리 조작을 막는다. admin(bambi role)은 예외.
const assertOrganizationVerified = async ({
	organizationId,
	profile,
}: {
	organizationId: string;
	profile: { role: string };
}): Promise<void> => {
	if (
		profile.role !== "admin" &&
		!(await isEmployerOrganizationVerified(organizationId))
	) {
		throw forbidden("운영자 승인 후 팀을 관리할 수 있습니다.");
	}
};

const requireEmployerLikeProfile = async (
	session: Parameters<typeof requireActiveBambiProfile>[0]
) => {
	const profile = await requireActiveBambiProfile(session);

	if (profile.role === "job_seeker") {
		throw forbidden("Employer Bambi profile is required.");
	}

	return profile;
};

const getOrganizationMemberships = async (
	userId: string
): Promise<OrganizationMembership[]> =>
	await db
		.select({
			organizationId: member.organizationId,
			role: member.role,
		})
		.from(member)
		.where(eq(member.userId, userId));

const requireOrganizationTeamManagementAccess = async ({
	organizationId,
	session,
}: {
	organizationId: string;
	session: Parameters<typeof requireActiveBambiProfile>[0];
}) => {
	const profile = await requireEmployerLikeProfile(session);
	const organizationMemberships = await getOrganizationMemberships(
		profile.userId
	);

	if (!canInviteMembers({ organizationId, organizationMemberships })) {
		throw forbidden("Organization owner or manager access is required.");
	}

	return { organizationMemberships, profile };
};

const requireOrganizationOwnerAccess = async ({
	organizationId,
	session,
}: {
	organizationId: string;
	session: Parameters<typeof requireActiveBambiProfile>[0];
}) => {
	const profile = await requireEmployerLikeProfile(session);
	const organizationMemberships = await getOrganizationMemberships(
		profile.userId
	);

	if (!canManageOrganization({ organizationId, organizationMemberships })) {
		throw forbidden("Organization owner access is required.");
	}

	return { organizationMemberships, profile };
};

const assertTeamBelongsToOrganization = async ({
	organizationId,
	teamId,
}: {
	organizationId: string;
	teamId: string;
}): Promise<void> => {
	const [selectedTeam] = await db
		.select({ id: team.id })
		.from(team)
		.where(and(eq(team.id, teamId), eq(team.organizationId, organizationId)))
		.limit(1);

	if (!selectedTeam) {
		throw forbidden("Selected team must belong to the organization.");
	}
};

const getExpiresAt = () => {
	const expiresAt = new Date();
	expiresAt.setDate(expiresAt.getDate() + 14);
	return expiresAt;
};

const toStoredRole = (
	role: OrganizationManagementRole
): OrganizationManagementRole => role;

export const teamsRouter = {
	list: protectedProcedure
		.input(organizationIdInput)
		.handler(async ({ context, input }) => {
			await requireOrganizationTeamManagementAccess({
				organizationId: input.organizationId,
				session: context.session,
			});

			const teams = await db
				.select({
					createdAt: team.createdAt,
					displayName: employerTeamProfile.displayName,
					id: team.id,
					organizationId: team.organizationId,
					region: employerTeamProfile.region,
					regionCode: employerTeamProfile.regionCode,
					districtCode: employerTeamProfile.districtCode,
					teamId: team.id,
					updatedAt: team.updatedAt,
				})
				.from(team)
				.leftJoin(employerTeamProfile, eq(employerTeamProfile.teamId, team.id))
				.where(eq(team.organizationId, input.organizationId))
				.orderBy(asc(team.name));

			if (teams.length === 0) {
				return teams.map((row) => ({ ...row, memberCount: 0 }));
			}

			// 팀별 소속 멤버 수(teamMember 행 수) — 삭제 가드 UI에 쓴다.
			const memberCounts = await db
				.select({ teamId: teamMember.teamId, value: count() })
				.from(teamMember)
				.where(
					inArray(
						teamMember.teamId,
						teams.map((row) => row.id)
					)
				)
				.groupBy(teamMember.teamId);
			const memberCountByTeamId = new Map(
				memberCounts.map((row) => [row.teamId, Number(row.value)])
			);

			return teams.map((row) => ({
				...row,
				memberCount: memberCountByTeamId.get(row.id) ?? 0,
			}));
		}),

	create: protectedProcedure
		.input(createTeamInput)
		.handler(async ({ context, input }) => {
			const { profile } = await requireOrganizationTeamManagementAccess({
				organizationId: input.organizationId,
				session: context.session,
			});
			await assertOrganizationVerified({
				organizationId: input.organizationId,
				profile,
			});

			const regionSelection = await resolveOptionalRegion(input);
			const now = new Date();
			const teamId = `team_${randomUUID()}`;
			const teamName = input.name ?? input.displayName;

			return await db.transaction(async (tx) => {
				const [createdTeam] = await tx
					.insert(team)
					.values({
						createdAt: now,
						id: teamId,
						name: teamName,
						organizationId: input.organizationId,
						updatedAt: now,
					})
					.returning();
				const [createdProfile] = await tx
					.insert(employerTeamProfile)
					.values({
						displayName: input.displayName,
						organizationId: input.organizationId,
						...regionSelection,
						teamId,
					})
					.returning();

				return { ...createdProfile, name: createdTeam?.name, teamId };
			});
		}),

	update: protectedProcedure
		.input(updateTeamInput)
		.handler(async ({ context, input }) => {
			const { profile } = await requireOrganizationTeamManagementAccess({
				organizationId: input.organizationId,
				session: context.session,
			});
			await assertOrganizationVerified({
				organizationId: input.organizationId,
				profile,
			});
			await assertTeamBelongsToOrganization({
				organizationId: input.organizationId,
				teamId: input.teamId,
			});

			const regionSelection = await resolveOptionalRegion(input);

			return await db.transaction(async (tx) => {
				const [updatedTeam] = await tx
					.update(team)
					.set({
						name: input.name ?? input.displayName,
						updatedAt: new Date(),
					})
					.where(eq(team.id, input.teamId))
					.returning();
				const [updatedProfile] = await tx
					.update(employerTeamProfile)
					.set({
						displayName: input.displayName,
						...regionSelection,
					})
					.where(eq(employerTeamProfile.teamId, input.teamId))
					.returning();

				if (!(updatedTeam && updatedProfile)) {
					throw new ORPCError("NOT_FOUND");
				}

				return { ...updatedProfile, name: updatedTeam.name };
			});
		}),

	inviteMember: protectedProcedure
		.input(inviteMemberInput)
		.handler(async ({ context, input }) => {
			const { profile } = await requireOrganizationTeamManagementAccess({
				organizationId: input.organizationId,
				session: context.session,
			});
			await assertOrganizationVerified({
				organizationId: input.organizationId,
				profile,
			});

			if (input.teamId) {
				await assertTeamBelongsToOrganization({
					organizationId: input.organizationId,
					teamId: input.teamId,
				});
			}

			// 초대 대상은 현재 employer로 가입된 계정만 허용한다.
			const normalizedEmail = input.email.toLowerCase();
			const [invitee] = await db
				.select({ role: bambiProfile.role })
				.from(user)
				.innerJoin(bambiProfile, eq(bambiProfile.userId, user.id))
				.where(eq(user.email, normalizedEmail))
				.limit(1);

			if (invitee?.role !== "employer") {
				throw forbidden("구인자로 가입된 계정만 초대할 수 있습니다.");
			}

			const [created] = await db
				.insert(invitation)
				.values({
					email: normalizedEmail,
					expiresAt: getExpiresAt(),
					id: `invitation_${randomUUID()}`,
					inviterId: profile.userId,
					organizationId: input.organizationId,
					role: toStoredRole(input.role),
					status: "pending",
					teamId: input.teamId,
				})
				.returning();

			return created;
		}),

	resubmitInvitation: protectedProcedure
		.input(invitationActionInput)
		.handler(async ({ context, input }) => {
			const { profile } = await requireOrganizationTeamManagementAccess({
				organizationId: input.organizationId,
				session: context.session,
			});
			await assertOrganizationVerified({
				organizationId: input.organizationId,
				profile,
			});

			const [existing] = await db
				.select({ status: invitation.status })
				.from(invitation)
				.where(
					and(
						eq(invitation.id, input.invitationId),
						eq(invitation.organizationId, input.organizationId)
					)
				)
				.limit(1);

			if (!existing) {
				throw new ORPCError("NOT_FOUND");
			}

			if (existing.status !== "rejected") {
				throw new ORPCError("CONFLICT", {
					message: "반려된 초대만 재제출할 수 있습니다.",
				});
			}

			const [updated] = await db
				.update(invitation)
				.set({
					expiresAt: getExpiresAt(),
					inviterId: profile.userId,
					rejectionReason: null,
					status: "pending",
				})
				.where(eq(invitation.id, input.invitationId))
				.returning();

			return updated;
		}),

	deleteInvitation: protectedProcedure
		.input(invitationActionInput)
		.handler(async ({ context, input }) => {
			await requireOrganizationTeamManagementAccess({
				organizationId: input.organizationId,
				session: context.session,
			});

			const [existing] = await db
				.select({ status: invitation.status })
				.from(invitation)
				.where(
					and(
						eq(invitation.id, input.invitationId),
						eq(invitation.organizationId, input.organizationId)
					)
				)
				.limit(1);

			if (!existing) {
				throw new ORPCError("NOT_FOUND");
			}

			if (existing.status !== "rejected") {
				throw new ORPCError("CONFLICT", {
					message: "반려된 초대만 삭제할 수 있습니다.",
				});
			}

			await db.delete(invitation).where(eq(invitation.id, input.invitationId));

			return { success: true };
		}),

	searchEmployerInvitees: protectedProcedure
		.input(searchEmployerInviteesInput)
		.handler(async ({ context, input }) => {
			const { profile } = await requireOrganizationTeamManagementAccess({
				organizationId: input.organizationId,
				session: context.session,
			});

			// 검색어가 비어 있으면 전체 구인자를 노출하지 않고 빈 결과를 반환한다.
			if (!input.query?.trim()) {
				return [];
			}

			// 제외 대상: 이미 이 조직의 멤버인 유저.
			const existingMembers = await db
				.select({ userId: member.userId })
				.from(member)
				.where(eq(member.organizationId, input.organizationId));
			const excludedUserIds = [
				profile.userId,
				...existingMembers
					.map((row) => row.userId)
					.filter((id): id is string => Boolean(id)),
			];

			// 제외 대상: 이미 pending 초대가 있는 이메일.
			const pendingInvites = await db
				.select({ email: invitation.email })
				.from(invitation)
				.where(
					and(
						eq(invitation.organizationId, input.organizationId),
						eq(invitation.status, "pending")
					)
				);
			const pendingEmails = pendingInvites.map((row) =>
				row.email.toLowerCase()
			);
			// 빈 배열이면 notInArray가 안전하지 않으므로 조건 자체를 생략한다.
			const pendingEmailFilter =
				pendingEmails.length > 0
					? notInArray(user.email, pendingEmails)
					: undefined;

			const trimmed = input.query?.trim();
			const searchFilter = trimmed
				? or(
						ilike(user.email, `%${trimmed}%`),
						ilike(user.name, `%${trimmed}%`)
					)
				: undefined;

			// pending 초대 이메일 제외를 SQL WHERE로 넣어 LIMIT 10이 완전히
			// 필터된 집합에 적용되게 한다(이름순 자른 뒤 후처리로 버리지 않음).
			return await db
				.select({
					userId: user.id,
					email: user.email,
					name: user.name,
				})
				.from(bambiProfile)
				.innerJoin(user, eq(user.id, bambiProfile.userId))
				.where(
					and(
						eq(bambiProfile.role, "employer"),
						notInArray(user.id, excludedUserIds),
						searchFilter,
						pendingEmailFilter
					)
				)
				.orderBy(asc(user.name))
				.limit(10);
		}),

	setMemberRole: protectedProcedure
		.input(setMemberRoleInput)
		.handler(async ({ context, input }) => {
			const { profile } = await requireOrganizationOwnerAccess({
				organizationId: input.organizationId,
				session: context.session,
			});
			await assertOrganizationVerified({
				organizationId: input.organizationId,
				profile,
			});

			const [targetMember] = await db
				.select({ id: member.id, role: member.role })
				.from(member)
				.where(
					and(
						eq(member.id, input.memberId),
						eq(member.organizationId, input.organizationId)
					)
				)
				.limit(1);

			if (!targetMember) {
				throw new ORPCError("NOT_FOUND");
			}

			// 소유자(owner)의 권한은 변경할 수 없다. 실수로 소유권을 잃는 것을 막는다.
			if (normalizeOrganizationManagementRole(targetMember.role) === "owner") {
				throw forbidden("소유자의 권한은 변경할 수 없습니다.");
			}

			const normalizedRole = normalizeOrganizationManagementRole(input.role);

			if (!normalizedRole) {
				throw new ORPCError("BAD_REQUEST", {
					message: "Invalid organization role.",
				});
			}

			// 실수로 인한 소유권 상실·논란을 막기 위해, 일반 역할 변경으로는 소유자
			// 승격을 허용하지 않는다. 소유권은 별도의 '소유권 이전' 절차로만 넘긴다.
			if (normalizedRole === "owner") {
				throw forbidden("소유권은 '소유권 이전'으로만 넘길 수 있습니다.");
			}

			const [updated] = await db
				.update(member)
				.set({
					role: toStoredRole(normalizedRole),
					updatedAt: new Date(),
				})
				.where(eq(member.id, input.memberId))
				.returning();

			return updated;
		}),

	// 소유권 이전: 현재 소유자(요청자)를 매니저로 강등하고 대상 멤버를 소유자로
	// 승격하는 단일 트랜잭션. '조직당 소유자 1명' 불변식을 유지하며, 실수한 승격을
	// 되돌릴 수 있는 유일한 소유권 변경 경로다.
	transferOwnership: protectedProcedure
		.input(transferOwnershipInput)
		.handler(async ({ context, input }) => {
			const { profile } = await requireOrganizationOwnerAccess({
				organizationId: input.organizationId,
				session: context.session,
			});
			await assertOrganizationVerified({
				organizationId: input.organizationId,
				profile,
			});

			// 요청자(현재 소유자)의 멤버 행.
			const [ownerMember] = await db
				.select({ id: member.id })
				.from(member)
				.where(
					and(
						eq(member.organizationId, input.organizationId),
						eq(member.userId, profile.userId)
					)
				)
				.limit(1);

			if (!ownerMember) {
				throw new ORPCError("NOT_FOUND");
			}

			// 소유권을 넘길 대상 멤버.
			const [targetMember] = await db
				.select({ id: member.id, status: member.status })
				.from(member)
				.where(
					and(
						eq(member.id, input.memberId),
						eq(member.organizationId, input.organizationId)
					)
				)
				.limit(1);

			if (!targetMember) {
				throw new ORPCError("NOT_FOUND");
			}

			if (targetMember.id === ownerMember.id) {
				throw forbidden("이미 소유자입니다.");
			}

			// 초대 대기 등 비활성 멤버에게는 소유권을 넘길 수 없다.
			if (targetMember.status !== "active") {
				throw forbidden("활성 멤버에게만 소유권을 이전할 수 있습니다.");
			}

			await db.transaction(async (tx) => {
				const now = new Date();
				await tx
					.update(member)
					.set({ role: toStoredRole("manager"), updatedAt: now })
					.where(eq(member.id, ownerMember.id));
				await tx
					.update(member)
					.set({ role: toStoredRole("owner"), updatedAt: now })
					.where(eq(member.id, targetMember.id));
			});

			return { success: true };
		}),

	removeMember: protectedProcedure
		.input(removeMemberInput)
		.handler(async ({ context, input }) => {
			const { profile } = await requireOrganizationOwnerAccess({
				organizationId: input.organizationId,
				session: context.session,
			});
			await assertOrganizationVerified({
				organizationId: input.organizationId,
				profile,
			});

			const [targetMember] = await db
				.select({ role: member.role, userId: member.userId })
				.from(member)
				.where(
					and(
						eq(member.id, input.memberId),
						eq(member.organizationId, input.organizationId)
					)
				)
				.limit(1);

			if (!targetMember) {
				throw new ORPCError("NOT_FOUND");
			}

			// 소유자(owner)는 내보낼 수 없다.
			if (normalizeOrganizationManagementRole(targetMember.role) === "owner") {
				throw forbidden("소유자는 내보낼 수 없습니다.");
			}

			await db.transaction(async (tx) => {
				if (targetMember.userId) {
					const orgTeams = await tx
						.select({ id: team.id })
						.from(team)
						.where(eq(team.organizationId, input.organizationId));
					const teamIds = orgTeams.map((row) => row.id);

					if (teamIds.length > 0) {
						await tx
							.delete(teamMember)
							.where(
								and(
									eq(teamMember.userId, targetMember.userId),
									inArray(teamMember.teamId, teamIds)
								)
							);
					}
				}

				await tx.delete(member).where(eq(member.id, input.memberId));
			});

			return { success: true };
		}),

	// 멤버의 팀 소속을 교체한다. 이 조직의 팀들에 대한 teamMember 행만 지우고 다시
	// 넣으므로, 같은 유저가 다른 조직의 팀에 든 소속은 건드리지 않는다. teamIds 빈
	// 배열이면 무소속 처리.
	setMemberTeams: protectedProcedure
		.input(setMemberTeamsInput)
		.handler(async ({ context, input }) => {
			const { profile } = await requireOrganizationTeamManagementAccess({
				organizationId: input.organizationId,
				session: context.session,
			});
			await assertOrganizationVerified({
				organizationId: input.organizationId,
				profile,
			});

			const [targetMember] = await db
				.select({ status: member.status, userId: member.userId })
				.from(member)
				.where(
					and(
						eq(member.id, input.memberId),
						eq(member.organizationId, input.organizationId)
					)
				)
				.limit(1);

			if (!targetMember) {
				throw new ORPCError("NOT_FOUND");
			}

			if (targetMember.status !== "active" || !targetMember.userId) {
				throw forbidden("활성 멤버의 팀 소속만 변경할 수 있습니다.");
			}

			// 중복 제거 후 모든 팀이 이 조직 소속인지 검증한다.
			const teamIds = [...new Set(input.teamIds)];
			for (const teamId of teamIds) {
				await assertTeamBelongsToOrganization({
					organizationId: input.organizationId,
					teamId,
				});
			}

			const { userId } = targetMember;

			await db.transaction(async (tx) => {
				const orgTeams = await tx
					.select({ id: team.id })
					.from(team)
					.where(eq(team.organizationId, input.organizationId));
				const orgTeamIds = orgTeams.map((row) => row.id);

				if (orgTeamIds.length > 0) {
					await tx
						.delete(teamMember)
						.where(
							and(
								eq(teamMember.userId, userId),
								inArray(teamMember.teamId, orgTeamIds)
							)
						);
				}

				if (teamIds.length > 0) {
					const now = new Date();
					await tx.insert(teamMember).values(
						teamIds.map((teamId) => ({
							createdAt: now,
							id: `tm_${randomUUID()}`,
							teamId,
							userId,
						}))
					);
				}
			});

			return { success: true };
		}),

	// 팀 삭제. 팀에 멤버(teamMember)나 진행 중(pending) 초대가 남아 있으면 CONFLICT로
	// 막는다. jobPost.teamId·chatRoom.teamId는 FK onDelete=set null이라 공고·채팅방은
	// 삭제되지 않고 팀 연결만 끊긴다. 종료 상태 초대의 teamId(FK 없음)는 수동으로 null 처리.
	deleteTeam: protectedProcedure
		.input(teamActionInput)
		.handler(async ({ context, input }) => {
			const { profile } = await requireOrganizationTeamManagementAccess({
				organizationId: input.organizationId,
				session: context.session,
			});
			await assertOrganizationVerified({
				organizationId: input.organizationId,
				profile,
			});
			await assertTeamBelongsToOrganization({
				organizationId: input.organizationId,
				teamId: input.teamId,
			});

			const [remainingMember] = await db
				.select({ id: teamMember.id })
				.from(teamMember)
				.where(eq(teamMember.teamId, input.teamId))
				.limit(1);

			if (remainingMember) {
				throw new ORPCError("CONFLICT", {
					message:
						"팀에 멤버가 남아 있어 삭제할 수 없어요. 멤버를 모두 정리한 뒤 삭제할 수 있어요.",
				});
			}

			const [pendingInvitation] = await db
				.select({ id: invitation.id })
				.from(invitation)
				.where(
					and(
						eq(invitation.teamId, input.teamId),
						eq(invitation.status, "pending")
					)
				)
				.limit(1);

			if (pendingInvitation) {
				throw new ORPCError("CONFLICT", {
					message:
						"이 팀으로 진행 중인 초대가 있어 삭제할 수 없어요. 초대가 처리된 뒤 삭제할 수 있어요.",
				});
			}

			await db.transaction(async (tx) => {
				// 종료 상태 초대가 가리키던 팀 참조를 정리한다(invitation.teamId는 FK가
				// 없어 팀 삭제 후에도 값이 남는다).
				await tx
					.update(invitation)
					.set({ teamId: null })
					.where(eq(invitation.teamId, input.teamId));
				await tx
					.delete(employerTeamProfile)
					.where(eq(employerTeamProfile.teamId, input.teamId));
				await tx.delete(team).where(eq(team.id, input.teamId));
			});

			return { success: true };
		}),
};
