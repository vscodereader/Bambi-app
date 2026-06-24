import { auth } from "@bambi-app/auth";
import { db } from "@bambi-app/db";
import {
	member,
	organization,
	session,
	team,
	teamMember,
	user,
} from "@bambi-app/db/schema/auth";
import {
	bambiProfile,
	chatMessage,
	chatRoom,
	contactRevealConsent,
	employerOrganizationProfile,
	employerTeamProfile,
	interviewSchedule,
	jobPost,
	jobPromotionCampaign,
	report,
} from "@bambi-app/db/schema/bambi";
import { eq, inArray } from "drizzle-orm";

const DEV_PASSWORD = "Bambi1234!";

const devUsers = [
	{
		key: "seeker",
		name: "밤비 구직자",
		email: "seeker@bambi.dev",
		role: "job_seeker",
		displayName: "익명 구직자 A",
		phoneNumber: "010-1000-0001",
	},
	{
		key: "owner",
		name: "클럽 루나 대표",
		email: "owner@bambi.dev",
		role: "employer",
		displayName: "루나 대표",
		phoneNumber: "010-2000-0001",
	},
	{
		key: "staff",
		name: "클럽 루나 강남점 직원",
		email: "staff@bambi.dev",
		role: "employer",
		displayName: "강남점 채용담당",
		phoneNumber: "010-2000-0002",
	},
	{
		key: "pendingOwner",
		name: "네온 라운지 대표",
		email: "pending-owner@bambi.dev",
		role: "employer",
		displayName: "네온 대표",
		phoneNumber: "010-3000-0001",
	},
	{
		key: "admin",
		name: "밤비 관리자",
		email: "admin@bambi.dev",
		role: "admin",
		displayName: "운영 관리자",
		phoneNumber: "010-9000-0001",
	},
] as const;

const ids = {
	lunaOrganization: "org_bambi_luna",
	lunaGangnamTeam: "team_bambi_luna_gangnam",
	pendingOrganization: "org_bambi_neon",
	lunaOrganizationProfile: "11111111-1111-4111-8111-111111111101",
	lunaGangnamTeamProfile: "11111111-1111-4111-8111-111111111102",
	pendingOrganizationProfile: "11111111-1111-4111-8111-111111111103",
	lunaOwnerMember: "member_bambi_luna_owner",
	lunaStaffMember: "member_bambi_luna_staff",
	pendingOwnerMember: "member_bambi_neon_owner",
	lunaStaffTeamMember: "team_member_bambi_luna_staff",
	lunaPublishedJob: "22222222-2222-4222-8222-222222222201",
	lunaTeamPublishedJob: "22222222-2222-4222-8222-222222222202",
	pendingReviewJob: "22222222-2222-4222-8222-222222222203",
	lunaOrganicPublishedJob: "22222222-2222-4222-8222-222222222204",
	premiumPromotionCampaign: "88888888-8888-4888-8888-888888888801",
	recommendedPromotionCampaign: "88888888-8888-4888-8888-888888888802",
	expiredPromotionCampaign: "88888888-8888-4888-8888-888888888803",
	chatRoom: "33333333-3333-4333-8333-333333333301",
	seekerMessage: "44444444-4444-4444-8444-444444444401",
	employerMessage: "44444444-4444-4444-8444-444444444402",
	interview: "55555555-5555-4555-8555-555555555501",
	seekerContactConsent: "66666666-6666-4666-8666-666666666601",
	employerContactConsent: "66666666-6666-4666-8666-666666666602",
	report: "77777777-7777-4777-8777-777777777701",
} as const;

type DevUser = (typeof devUsers)[number];
type DevUserKey = DevUser["key"];

const assertDevPasswordWorks = async (devUser: DevUser): Promise<void> => {
	try {
		await auth.api.signInEmail({
			body: {
				email: devUser.email,
				password: DEV_PASSWORD,
				rememberMe: false,
			},
		});
	} catch (error) {
		throw new Error(
			`Dev user ${devUser.email} exists but cannot sign in with the seed password. Remove that local user or reset its Better Auth credential account before running the seed again.`,
			{ cause: error }
		);
	}
};

const ensureAuthUser = async (devUser: DevUser): Promise<string> => {
	const [existingUser] = await db
		.select()
		.from(user)
		.where(eq(user.email, devUser.email))
		.limit(1);

	if (!existingUser) {
		await auth.api.signUpEmail({
			body: {
				name: devUser.name,
				email: devUser.email,
				password: DEV_PASSWORD,
			},
		});
	}

	const [authUser] = await db
		.select()
		.from(user)
		.where(eq(user.email, devUser.email))
		.limit(1);

	if (!authUser) {
		throw new Error(`Failed to create dev user: ${devUser.email}`);
	}

	await db
		.update(user)
		.set({
			name: devUser.name,
			emailVerified: true,
			updatedAt: new Date(),
		})
		.where(eq(user.id, authUser.id));

	await assertDevPasswordWorks(devUser);
	await db.delete(session).where(eq(session.userId, authUser.id));

	return authUser.id;
};

const ensureBambiProfile = async (
	devUser: DevUser,
	userId: string
): Promise<void> => {
	await db
		.insert(bambiProfile)
		.values({
			userId,
			role: devUser.role,
			status: "active",
			isPhoneVerified: true,
			phoneNumber: devUser.phoneNumber,
			displayName: devUser.displayName,
		})
		.onConflictDoUpdate({
			target: bambiProfile.userId,
			set: {
				role: devUser.role,
				status: "active",
				isPhoneVerified: true,
				phoneNumber: devUser.phoneNumber,
				displayName: devUser.displayName,
				updatedAt: new Date(),
			},
		});
};

const seedUsers = async (): Promise<Record<DevUserKey, string>> => {
	const userIds = {} as Record<DevUserKey, string>;

	for (const devUser of devUsers) {
		const userId = await ensureAuthUser(devUser);
		await ensureBambiProfile(devUser, userId);
		userIds[devUser.key] = userId;
	}

	return userIds;
};

const seedOrganizations = async (
	userIds: Record<DevUserKey, string>
): Promise<void> => {
	const now = new Date();

	await db
		.insert(organization)
		.values([
			{
				id: ids.lunaOrganization,
				name: "클럽 루나",
				slug: "club-luna",
				logo: null,
				metadata: JSON.stringify({ seed: "bambi-dev" }),
				createdAt: now,
			},
			{
				id: ids.pendingOrganization,
				name: "네온 라운지",
				slug: "neon-lounge",
				logo: null,
				metadata: JSON.stringify({ seed: "bambi-dev" }),
				createdAt: now,
			},
		])
		.onConflictDoUpdate({
			target: organization.id,
			set: {
				metadata: JSON.stringify({ seed: "bambi-dev" }),
			},
		});

	const members = [
		{
			id: ids.lunaOwnerMember,
			organizationId: ids.lunaOrganization,
			userId: userIds.owner,
			role: "owner",
			createdAt: now,
		},
		{
			id: ids.lunaStaffMember,
			organizationId: ids.lunaOrganization,
			userId: userIds.staff,
			role: "member",
			createdAt: now,
		},
		{
			id: ids.pendingOwnerMember,
			organizationId: ids.pendingOrganization,
			userId: userIds.pendingOwner,
			role: "owner",
			createdAt: now,
		},
	] as const;

	for (const organizationMember of members) {
		await db
			.insert(member)
			.values(organizationMember)
			.onConflictDoUpdate({
				target: member.id,
				set: {
					organizationId: organizationMember.organizationId,
					userId: organizationMember.userId,
					role: organizationMember.role,
				},
			});
	}

	await db
		.insert(team)
		.values({
			id: ids.lunaGangnamTeam,
			name: "강남점",
			organizationId: ids.lunaOrganization,
			createdAt: now,
			updatedAt: now,
		})
		.onConflictDoUpdate({
			target: team.id,
			set: {
				name: "강남점",
				organizationId: ids.lunaOrganization,
				updatedAt: now,
			},
		});

	await db
		.insert(teamMember)
		.values({
			id: ids.lunaStaffTeamMember,
			teamId: ids.lunaGangnamTeam,
			userId: userIds.staff,
			createdAt: now,
		})
		.onConflictDoUpdate({
			target: teamMember.id,
			set: {
				teamId: ids.lunaGangnamTeam,
				userId: userIds.staff,
			},
		});
};

const seedEmployerProfiles = async (): Promise<void> => {
	const organizationProfiles = [
		{
			id: ids.lunaOrganizationProfile,
			organizationId: ids.lunaOrganization,
			displayName: "클럽 루나",
			businessRegistrationNumber: "123-45-67890",
			verificationStatus: "verified",
			verificationNote: "개발 seed 인증 사업장",
		},
		{
			id: ids.pendingOrganizationProfile,
			organizationId: ids.pendingOrganization,
			displayName: "네온 라운지",
			businessRegistrationNumber: "987-65-43210",
			verificationStatus: "pending",
			verificationNote: "개발 seed 심사 대기 사업장",
		},
	] as const;

	for (const profile of organizationProfiles) {
		await db
			.insert(employerOrganizationProfile)
			.values(profile)
			.onConflictDoUpdate({
				target: employerOrganizationProfile.organizationId,
				set: {
					displayName: profile.displayName,
					businessRegistrationNumber: profile.businessRegistrationNumber,
					verificationStatus: profile.verificationStatus,
					verificationNote: profile.verificationNote,
					updatedAt: new Date(),
				},
			});
	}

	await db
		.insert(employerTeamProfile)
		.values({
			id: ids.lunaGangnamTeamProfile,
			organizationId: ids.lunaOrganization,
			teamId: ids.lunaGangnamTeam,
			displayName: "클럽 루나 강남점",
			region: "서울 강남구",
		})
		.onConflictDoUpdate({
			target: employerTeamProfile.teamId,
			set: {
				displayName: "클럽 루나 강남점",
				region: "서울 강남구",
				updatedAt: new Date(),
			},
		});
};

const seedJobs = async (userIds: Record<DevUserKey, string>): Promise<void> => {
	const publishedAt = new Date("2026-06-12T09:00:00.000Z");

	await db
		.insert(jobPost)
		.values([
			{
				id: ids.lunaPublishedJob,
				organizationId: ids.lunaOrganization,
				teamId: null,
				createdByUserId: userIds.owner,
				status: "published",
				industryCategory: "라운지",
				region: "서울 강남구",
				payAmount: 180_000,
				payUnit: "일급",
				workSchedule: "주 3일, 20:00-02:00",
				title: "강남 라운지 홀 스태프 모집",
				description:
					"면접 후 근무 요일을 조율합니다. 초보 지원 가능하며 담당자가 채팅으로 안내합니다.",
				interviewNotes: "확정된 면접 일정 전까지 연락처 공개는 선택입니다.",
				riskFlags: [],
				publishedAt,
			},
			{
				id: ids.lunaTeamPublishedJob,
				organizationId: ids.lunaOrganization,
				teamId: ids.lunaGangnamTeam,
				createdByUserId: userIds.staff,
				status: "published",
				industryCategory: "바",
				region: "서울 강남구",
				payAmount: 160_000,
				payUnit: "일급",
				workSchedule: "금/토, 19:00-01:00",
				title: "강남점 주말 파트타임 모집",
				description:
					"강남점 담당자와 1:1 채팅 후 면접 일정을 정합니다. 근무 조건은 면접에서 확인합니다.",
				interviewNotes: "매장 인근 카페에서 사전 면접 가능합니다.",
				riskFlags: [],
				publishedAt,
			},
			{
				id: ids.pendingReviewJob,
				organizationId: ids.pendingOrganization,
				teamId: null,
				createdByUserId: userIds.pendingOwner,
				status: "pending_review",
				industryCategory: "라운지",
				region: "부산 해운대구",
				payAmount: 150_000,
				payUnit: "일급",
				workSchedule: "협의",
				title: "해운대 라운지 오픈 멤버 모집",
				description:
					"사업장 인증 심사 중인 공고입니다. 승인 후 상단 노출과 공개 탐색에 반영됩니다.",
				interviewNotes: "운영팀 심사 완료 후 면접 일정을 확정합니다.",
				riskFlags: [],
				publishedAt: null,
			},
			{
				id: ids.lunaOrganicPublishedJob,
				organizationId: ids.lunaOrganization,
				teamId: null,
				createdByUserId: userIds.owner,
				status: "published",
				industryCategory: "카페",
				region: "서울 서초구",
				payAmount: 140_000,
				payUnit: "일급",
				workSchedule: "평일 18:00-23:00",
				title: "서초 라운지 카운터 보조",
				description:
					"초보 지원자를 위한 짧은 교육 후 근무를 시작합니다. 상세 조건은 밤비 채팅에서 안내합니다.",
				interviewNotes: "면접 장소는 채팅에서 확정합니다.",
				riskFlags: [],
				publishedAt,
			},
		])
		.onConflictDoUpdate({
			target: jobPost.id,
			set: {
				updatedAt: new Date(),
			},
		});

	await db
		.update(jobPost)
		.set({
			publishedAt,
			status: "published",
			updatedAt: new Date(),
		})
		.where(
			inArray(jobPost.id, [
				ids.lunaPublishedJob,
				ids.lunaTeamPublishedJob,
				ids.lunaOrganicPublishedJob,
			])
		);
	await db
		.update(jobPost)
		.set({
			publishedAt: null,
			status: "pending_review",
			updatedAt: new Date(),
		})
		.where(eq(jobPost.id, ids.pendingReviewJob));

	await db
		.insert(jobPromotionCampaign)
		.values([
			{
				id: ids.premiumPromotionCampaign,
				jobPostId: ids.lunaPublishedJob,
				organizationId: ids.lunaOrganization,
				tier: "premium",
				status: "active",
				startsAt: new Date("2026-06-20T09:00:00.000Z"),
				endsAt: new Date("2026-07-20T09:00:00.000Z"),
				manualBoostsTotal: 5,
				manualBoostsUsed: 1,
				autoBoostsPerDay: 1,
				lastBoostedAt: new Date("2026-06-24T08:00:00.000Z"),
			},
			{
				id: ids.recommendedPromotionCampaign,
				jobPostId: ids.lunaTeamPublishedJob,
				organizationId: ids.lunaOrganization,
				tier: "recommended",
				status: "active",
				startsAt: new Date("2026-06-21T09:00:00.000Z"),
				endsAt: new Date("2026-07-05T09:00:00.000Z"),
				manualBoostsTotal: 3,
				manualBoostsUsed: 0,
				autoBoostsPerDay: 0,
				lastBoostedAt: null,
			},
			{
				id: ids.expiredPromotionCampaign,
				jobPostId: ids.lunaOrganicPublishedJob,
				organizationId: ids.lunaOrganization,
				tier: "standard",
				status: "expired",
				startsAt: new Date("2026-05-01T09:00:00.000Z"),
				endsAt: new Date("2026-05-10T09:00:00.000Z"),
				manualBoostsTotal: 1,
				manualBoostsUsed: 1,
				autoBoostsPerDay: 0,
				lastBoostedAt: new Date("2026-05-05T09:00:00.000Z"),
			},
		])
		.onConflictDoUpdate({
			target: jobPromotionCampaign.id,
			set: {
				status: "active",
				updatedAt: new Date(),
			},
		});

	await db
		.update(jobPromotionCampaign)
		.set({
			autoBoostsPerDay: 1,
			endsAt: new Date("2026-07-20T09:00:00.000Z"),
			lastBoostedAt: new Date("2026-06-24T08:00:00.000Z"),
			manualBoostsTotal: 5,
			manualBoostsUsed: 1,
			startsAt: new Date("2026-06-20T09:00:00.000Z"),
			status: "active",
			tier: "premium",
			updatedAt: new Date(),
		})
		.where(eq(jobPromotionCampaign.id, ids.premiumPromotionCampaign));
	await db
		.update(jobPromotionCampaign)
		.set({
			autoBoostsPerDay: 0,
			endsAt: new Date("2026-07-05T09:00:00.000Z"),
			lastBoostedAt: null,
			manualBoostsTotal: 3,
			manualBoostsUsed: 0,
			startsAt: new Date("2026-06-21T09:00:00.000Z"),
			status: "active",
			tier: "recommended",
			updatedAt: new Date(),
		})
		.where(eq(jobPromotionCampaign.id, ids.recommendedPromotionCampaign));
	await db
		.update(jobPromotionCampaign)
		.set({
			autoBoostsPerDay: 0,
			endsAt: new Date("2026-05-10T09:00:00.000Z"),
			lastBoostedAt: new Date("2026-05-05T09:00:00.000Z"),
			manualBoostsTotal: 1,
			manualBoostsUsed: 1,
			startsAt: new Date("2026-05-01T09:00:00.000Z"),
			status: "expired",
			tier: "standard",
			updatedAt: new Date(),
		})
		.where(eq(jobPromotionCampaign.id, ids.expiredPromotionCampaign));
};

const seedConversation = async (
	userIds: Record<DevUserKey, string>
): Promise<void> => {
	const now = new Date();

	await db
		.insert(chatRoom)
		.values({
			id: ids.chatRoom,
			jobPostId: ids.lunaTeamPublishedJob,
			organizationId: ids.lunaOrganization,
			teamId: ids.lunaGangnamTeam,
			employerUserId: userIds.staff,
			jobSeekerUserId: userIds.seeker,
			isBlocked: false,
		})
		.onConflictDoUpdate({
			target: chatRoom.id,
			set: {
				isBlocked: false,
				updatedAt: now,
			},
		});

	await db
		.insert(chatMessage)
		.values([
			{
				id: ids.seekerMessage,
				chatRoomId: ids.chatRoom,
				senderUserId: userIds.seeker,
				body: "안녕하세요. 주말 파트타임 면접 가능할까요?",
				riskFlags: [],
			},
			{
				id: ids.employerMessage,
				chatRoomId: ids.chatRoom,
				senderUserId: userIds.staff,
				body: "네, 토요일 오후 면접 가능합니다. 일정 제안드릴게요.",
				riskFlags: [],
			},
		])
		.onConflictDoUpdate({
			target: chatMessage.id,
			set: {
				riskFlags: [],
			},
		});

	await db
		.insert(interviewSchedule)
		.values({
			id: ids.interview,
			chatRoomId: ids.chatRoom,
			proposedByUserId: userIds.staff,
			status: "confirmed",
			scheduledAt: new Date("2026-06-16T10:00:00.000Z"),
			locationNote: "강남역 인근 카페",
		})
		.onConflictDoUpdate({
			target: interviewSchedule.id,
			set: {
				status: "confirmed",
				scheduledAt: new Date("2026-06-16T10:00:00.000Z"),
				locationNote: "강남역 인근 카페",
				updatedAt: now,
			},
		});

	const contactConsents = [
		{
			id: ids.seekerContactConsent,
			interviewScheduleId: ids.interview,
			userId: userIds.seeker,
			contactMethod: "phone",
			contactValue: "010-1000-0001",
		},
		{
			id: ids.employerContactConsent,
			interviewScheduleId: ids.interview,
			userId: userIds.staff,
			contactMethod: "phone",
			contactValue: "010-2000-0002",
		},
	] as const;

	for (const consent of contactConsents) {
		await db
			.insert(contactRevealConsent)
			.values(consent)
			.onConflictDoUpdate({
				target: [
					contactRevealConsent.interviewScheduleId,
					contactRevealConsent.userId,
					contactRevealConsent.contactMethod,
				],
				set: {
					contactValue: consent.contactValue,
				},
			});
	}

	await db
		.insert(report)
		.values({
			id: ids.report,
			reporterUserId: userIds.seeker,
			targetType: "job_post",
			targetId: ids.pendingReviewJob,
			reason: "사업장 인증 전 공고 확인 요청",
			details: "개발 seed용 신고 샘플입니다.",
			status: "open",
		})
		.onConflictDoUpdate({
			target: report.id,
			set: {
				status: "open",
				updatedAt: now,
			},
		});
};

const main = async (): Promise<void> => {
	const userIds = await seedUsers();
	await seedOrganizations(userIds);
	await seedEmployerProfiles();
	await seedJobs(userIds);
	await seedConversation(userIds);

	console.log("Bambi development seed completed.");
	console.log(`Password for all dev accounts: ${DEV_PASSWORD}`);
	for (const devUser of devUsers) {
		console.log(`- ${devUser.email} (${devUser.role})`);
	}
	console.log(`Verified organization: ${ids.lunaOrganization}`);
	console.log(`Pending organization: ${ids.pendingOrganization}`);
};

main()
	.then(() => {
		process.exit(0);
	})
	.catch((error: unknown) => {
		console.error("Bambi development seed failed.");
		console.error(error);
		process.exit(1);
	});
