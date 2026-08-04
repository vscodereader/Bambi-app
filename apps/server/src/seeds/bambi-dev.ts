// taxonomy: apps/web/src/lib/bambi-options.ts REGION_DISTRICTS와 값 정합 유지
import { randomBytes, scryptSync } from "node:crypto";
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
	type communityBoard,
	communityPost,
	contactRevealConsent,
	employerOrganizationProfile,
	employerTeamProfile,
	interviewSchedule,
	type jobIndustryCategory,
	jobPerformanceEvent,
	jobPost,
	jobPostMedia,
	jobPromotionCampaign,
	report,
	review,
} from "@bambi-app/db/schema/bambi";
import { eq, inArray } from "drizzle-orm";

const DEV_PASSWORD = "Bambi1234!";

const devUsers = [
	{
		key: "seeker",
		name: "밤비 구직자",
		email: "seeker@bambi.dev",
		role: "job_seeker",
		phoneNumber: "010-1000-0001",
	},
	{
		key: "owner",
		name: "클럽 루나 대표",
		email: "owner@bambi.dev",
		role: "employer",
		phoneNumber: "010-2000-0001",
	},
	{
		key: "staff",
		name: "클럽 루나 강남점 직원",
		email: "staff@bambi.dev",
		role: "employer",
		phoneNumber: "010-2000-0002",
	},
	{
		key: "pendingOwner",
		name: "네온 라운지 대표",
		email: "pending-owner@bambi.dev",
		role: "employer",
		phoneNumber: "010-3000-0001",
	},
	{
		key: "admin",
		name: "밤비 관리자",
		email: "admin@bambi.dev",
		role: "admin",
		phoneNumber: "010-9000-0001",
	},
	{
		key: "ownerMars",
		name: "라운지 마르스 대표",
		email: "mars-owner@bambi.dev",
		role: "employer",
		phoneNumber: "010-4000-0001",
	},
	{
		key: "ownerVelvet",
		name: "벨벳 바 대표",
		email: "velvet-owner@bambi.dev",
		role: "employer",
		phoneNumber: "010-4000-0002",
	},
	{
		key: "ownerHorizon",
		name: "호라이즌 클럽 대표",
		email: "horizon-owner@bambi.dev",
		role: "employer",
		phoneNumber: "010-4000-0003",
	},
	{
		key: "ownerSoda",
		name: "소다 카페 대표",
		email: "soda-owner@bambi.dev",
		role: "employer",
		phoneNumber: "010-4000-0004",
	},
	{
		key: "ownerPrism",
		name: "프리즘 대표",
		email: "prism-owner@bambi.dev",
		role: "employer",
		phoneNumber: "010-4000-0005",
	},
	{
		key: "seekerB",
		name: "밤비 구직자 B",
		email: "seeker-b@bambi.dev",
		role: "job_seeker",
		phoneNumber: "010-1000-0002",
	},
	{
		key: "seekerC",
		name: "밤비 구직자 C",
		email: "seeker-c@bambi.dev",
		role: "job_seeker",
		phoneNumber: "010-1000-0003",
	},
	{
		key: "seekerD",
		name: "밤비 구직자 D",
		email: "seeker-d@bambi.dev",
		role: "job_seeker",
		phoneNumber: "010-1000-0004",
	},
	{
		key: "seekerE",
		name: "밤비 구직자 E",
		email: "seeker-e@bambi.dev",
		role: "job_seeker",
		phoneNumber: "010-1000-0005",
	},
	{
		key: "ownerAqua",
		name: "아쿠아 라운지 대표",
		email: "aqua-owner@bambi.dev",
		role: "employer",
		phoneNumber: "010-4000-0006",
	},
	{
		key: "ownerEmber",
		name: "엠버 바 대표",
		email: "ember-owner@bambi.dev",
		role: "employer",
		phoneNumber: "010-4000-0007",
	},
	{
		key: "ownerNova",
		name: "노바 클럽 대표",
		email: "nova-owner@bambi.dev",
		role: "employer",
		phoneNumber: "010-4000-0008",
	},
	{
		key: "ownerLumi",
		name: "루미 노래방 대표",
		email: "lumi-owner@bambi.dev",
		role: "employer",
		phoneNumber: "010-4000-0009",
	},
	{
		key: "ownerComet",
		name: "코멧 라운지 대표",
		email: "comet-owner@bambi.dev",
		role: "employer",
		phoneNumber: "010-4000-0010",
	},
	{
		key: "seekerF",
		name: "밤비 구직자 F",
		email: "seeker-f@bambi.dev",
		role: "job_seeker",
		phoneNumber: "010-1000-0006",
	},
	{
		key: "seekerG",
		name: "밤비 구직자 G",
		email: "seeker-g@bambi.dev",
		role: "job_seeker",
		phoneNumber: "010-1000-0007",
	},
	{
		key: "seekerH",
		name: "밤비 구직자 H",
		email: "seeker-h@bambi.dev",
		role: "job_seeker",
		phoneNumber: "010-1000-0008",
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
	lunaPublishedJobCover: "99999999-9999-4999-8999-999999999901",
	lunaPublishedJobDetailOne: "99999999-9999-4999-8999-999999999902",
	lunaPublishedJobDetailTwo: "99999999-9999-4999-8999-999999999903",
	lunaTeamPublishedJobCover: "99999999-9999-4999-8999-999999999904",
	pendingReviewJobCover: "99999999-9999-4999-8999-999999999905",
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
type SeedJobPost = typeof jobPost.$inferInsert & { id: string };

/**
 * Deterministic UUID builder for the rich seed catalog. `segment` is the first
 * 8 hex chars (one per entity table so ids never collide across tables) and `n`
 * fills the final group, keeping the v4/variant-8 shape that the web client uses
 * to tell API-backed ids apart from local mock ids.
 */
const richId = (segment: string, n: number): string =>
	`${segment}-0000-4000-8000-${n.toString().padStart(12, "0")}`;

const jobPublishedAt = (n: number): Date =>
	new Date(
		`2026-06-${(10 + (n % 18)).toString().padStart(2, "0")}T09:00:00.000Z`
	);

interface RichOrg {
	businessRegistrationNumber: string;
	id: string;
	memberId: string;
	name: string;
	ownerKey: DevUserKey;
	profileId: string;
	region: string;
	slug: string;
}

const richOrganizations: RichOrg[] = [
	{
		id: "org_bambi_mars",
		name: "라운지 마르스",
		slug: "lounge-mars",
		ownerKey: "ownerMars",
		memberId: "member_bambi_mars_owner",
		profileId: richId("1a1a1a1a", 1),
		region: "서울 강남",
		businessRegistrationNumber: "211-22-33445",
	},
	{
		id: "org_bambi_velvet",
		name: "벨벳 바",
		slug: "velvet-bar",
		ownerKey: "ownerVelvet",
		memberId: "member_bambi_velvet_owner",
		profileId: richId("1a1a1a1a", 2),
		region: "서울 마포",
		businessRegistrationNumber: "312-33-44556",
	},
	{
		id: "org_bambi_horizon",
		name: "호라이즌 클럽",
		slug: "horizon-club",
		ownerKey: "ownerHorizon",
		memberId: "member_bambi_horizon_owner",
		profileId: richId("1a1a1a1a", 3),
		region: "서울 송파",
		businessRegistrationNumber: "413-44-55667",
	},
	{
		id: "org_bambi_soda",
		name: "소다 카페",
		slug: "soda-cafe",
		ownerKey: "ownerSoda",
		memberId: "member_bambi_soda_owner",
		profileId: richId("1a1a1a1a", 4),
		region: "인천 부평",
		businessRegistrationNumber: "514-55-66778",
	},
	{
		id: "org_bambi_prism",
		name: "프리즘",
		slug: "prism-host",
		ownerKey: "ownerPrism",
		memberId: "member_bambi_prism_owner",
		profileId: richId("1a1a1a1a", 5),
		region: "경기 부천",
		businessRegistrationNumber: "615-66-77889",
	},
	{
		id: "org_bambi_aqua",
		name: "아쿠아 라운지",
		slug: "aqua-lounge",
		ownerKey: "ownerAqua",
		memberId: "member_bambi_aqua_owner",
		profileId: richId("1a1a1a1a", 6),
		region: "부산 해운대",
		businessRegistrationNumber: "716-77-88990",
	},
	{
		id: "org_bambi_ember",
		name: "엠버 바",
		slug: "ember-bar",
		ownerKey: "ownerEmber",
		memberId: "member_bambi_ember_owner",
		profileId: richId("1a1a1a1a", 7),
		region: "경기 성남",
		businessRegistrationNumber: "817-88-99001",
	},
	{
		id: "org_bambi_nova",
		name: "노바 클럽",
		slug: "nova-club",
		ownerKey: "ownerNova",
		memberId: "member_bambi_nova_owner",
		profileId: richId("1a1a1a1a", 8),
		region: "부산 서면",
		businessRegistrationNumber: "918-99-00112",
	},
	{
		id: "org_bambi_lumi",
		name: "루미 노래방",
		slug: "lumi-karaoke",
		ownerKey: "ownerLumi",
		memberId: "member_bambi_lumi_owner",
		profileId: richId("1a1a1a1a", 9),
		region: "인천 남동",
		businessRegistrationNumber: "019-10-11223",
	},
	{
		id: "org_bambi_comet",
		name: "코멧 라운지",
		slug: "comet-lounge",
		ownerKey: "ownerComet",
		memberId: "member_bambi_comet_owner",
		profileId: richId("1a1a1a1a", 10),
		region: "경기 수원",
		businessRegistrationNumber: "120-21-22334",
	},
];

type RichJobStatus =
	| "published"
	| "hidden"
	| "pending_review"
	| "rejected"
	| "draft";

interface RichJobDef {
	beginner?: boolean;
	// 업종은 DB enum(job_industry_category) 확정 8종만 허용된다.
	category: (typeof jobIndustryCategory.enumValues)[number];
	desc: string;
	district: string;
	instant?: boolean;
	n: number;
	org: string;
	ownerKey: DevUserKey;
	pay: number;
	promo?: "premium" | "recommended" | "standard";
	region: string;
	rejectionReason?: string;
	schedule: string;
	status: RichJobStatus;
	title: string;
	unit: string;
}

const richJobs: RichJobDef[] = [
	{
		n: 1,
		org: "org_bambi_mars",
		ownerKey: "ownerMars",
		status: "published",
		category: "룸싸롱",
		region: "서울",
		district: "강남",
		pay: 3_200_000,
		unit: "월급",
		schedule: "주 5일, 19:00-03:00",
		title: "강남 프리미엄 라운지 매니저",
		desc: "홀 운영 총괄과 예약 관리, 직원 스케줄을 담당하는 정규직 매니저를 모집합니다. 업장 경력자를 우대합니다.",
		promo: "premium",
	},
	{
		n: 2,
		org: "org_bambi_mars",
		ownerKey: "ownerMars",
		status: "published",
		category: "룸싸롱",
		region: "서울",
		district: "강남",
		pay: 200_000,
		unit: "일급",
		schedule: "금/토, 20:00-02:00",
		title: "강남 라운지 주말 홀 스태프",
		desc: "주말 홀 응대와 테이블 세팅을 담당합니다. 친절한 분이면 누구나 환영합니다.",
		promo: "recommended",
		instant: true,
	},
	{
		n: 3,
		org: "org_bambi_mars",
		ownerKey: "ownerMars",
		status: "published",
		category: "룸싸롱",
		region: "서울",
		district: "강남",
		pay: 15_000,
		unit: "시급",
		schedule: "평일 18:00-23:00",
		title: "강남 라운지 초보 환영 서버",
		desc: "짧은 교육 후 바로 근무를 시작합니다. 첫 업장 경험을 친절하게 안내해 드립니다.",
		beginner: true,
	},
	{
		n: 4,
		org: "org_bambi_velvet",
		ownerKey: "ownerVelvet",
		status: "published",
		category: "BAR",
		region: "서울",
		district: "마포",
		pay: 190_000,
		unit: "일급",
		schedule: "수~일, 19:00-01:00",
		title: "마포 칵테일 바 바텐더",
		desc: "칵테일 제조와 바 응대를 담당합니다. 경력자는 우대하며 레시피 교육을 제공합니다.",
		promo: "recommended",
	},
	{
		n: 5,
		org: "org_bambi_velvet",
		ownerKey: "ownerVelvet",
		status: "published",
		category: "BAR",
		region: "서울",
		district: "마포",
		pay: 16_000,
		unit: "시급",
		schedule: "금/토, 20:00-02:00",
		title: "홍대 인근 바 주말 파트타임",
		desc: "주말 바 보조와 음료 서빙을 담당합니다. 활기찬 분위기에서 함께 일할 분을 찾습니다.",
		beginner: true,
		instant: true,
	},
	{
		n: 6,
		org: "org_bambi_velvet",
		ownerKey: "ownerVelvet",
		status: "published",
		category: "BAR",
		region: "서울",
		district: "마포",
		pay: 2_800_000,
		unit: "월급",
		schedule: "주 5일, 18:00-02:00",
		title: "마포 와인바 야간 매니저",
		desc: "와인 셀렉션 관리와 매장 운영을 책임지는 야간 매니저를 모집합니다.",
	},
	{
		n: 7,
		org: "org_bambi_horizon",
		ownerKey: "ownerHorizon",
		status: "published",
		category: "텐프로/쩜오",
		region: "서울",
		district: "송파",
		pay: 230_000,
		unit: "일급",
		schedule: "금/토, 21:00-05:00",
		title: "송파 클럽 VIP 응대 스태프",
		desc: "VIP 테이블 응대와 예약 관리를 담당합니다. 친화력 있는 분을 우대합니다.",
		promo: "premium",
	},
	{
		n: 8,
		org: "org_bambi_horizon",
		ownerKey: "ownerHorizon",
		status: "published",
		category: "텐프로/쩜오",
		region: "서울",
		district: "송파",
		pay: 180_000,
		unit: "일급",
		schedule: "토/일, 21:00-04:00",
		title: "잠실 클럽 주말 플로어 스태프",
		desc: "플로어 안내와 음료 전달을 담당합니다. 체력 좋은 분 환영합니다.",
		instant: true,
	},
	{
		n: 9,
		org: "org_bambi_horizon",
		ownerKey: "ownerHorizon",
		status: "published",
		category: "텐프로/쩜오",
		region: "서울",
		district: "송파",
		pay: 14_000,
		unit: "시급",
		schedule: "주 3일, 20:00-01:00",
		title: "송파 클럽 음향 보조",
		desc: "DJ 부스 음향 셋업과 장비 정리를 보조합니다. 음향에 관심 있는 분이면 좋습니다.",
		beginner: true,
	},
	{
		n: 10,
		org: "org_bambi_soda",
		ownerKey: "ownerSoda",
		status: "published",
		category: "다방",
		region: "인천",
		district: "부평",
		pay: 12_000,
		unit: "시급",
		schedule: "평일 09:00-15:00",
		title: "부평 카페 오전 바리스타",
		desc: "에스프레소 음료 제조와 매장 청결을 담당합니다. 바리스타 자격증 소지자 우대.",
		beginner: true,
		promo: "standard",
	},
	{
		n: 11,
		org: "org_bambi_soda",
		ownerKey: "ownerSoda",
		status: "published",
		category: "다방",
		region: "인천",
		district: "부평",
		pay: 110_000,
		unit: "일급",
		schedule: "주말 15:00-23:00",
		title: "인천 카페 주말 마감 담당",
		desc: "주말 마감과 재료 정리를 담당합니다. 책임감 있는 분을 찾습니다.",
		instant: true,
	},
	{
		n: 12,
		org: "org_bambi_soda",
		ownerKey: "ownerSoda",
		status: "hidden",
		category: "다방",
		region: "인천",
		district: "부평",
		pay: 11_500,
		unit: "시급",
		schedule: "평일 13:00-19:00",
		title: "부평 디저트 카페 평일 파트",
		desc: "디저트 진열과 포장을 담당합니다. 현재는 모집이 잠시 중단된 공고입니다.",
	},
	{
		n: 13,
		org: "org_bambi_prism",
		ownerKey: "ownerPrism",
		status: "published",
		category: "요정",
		region: "경기",
		district: "부천",
		pay: 250_000,
		unit: "일급",
		schedule: "수~토, 20:00-03:00",
		title: "부천 호스트바 신규 멤버 모집",
		desc: "고객 응대와 테이블 매니징을 담당합니다. 신입은 선배가 1:1로 안내합니다.",
		promo: "premium",
	},
	{
		n: 14,
		org: "org_bambi_prism",
		ownerKey: "ownerPrism",
		status: "published",
		category: "요정",
		region: "경기",
		district: "부천",
		pay: 170_000,
		unit: "일급",
		schedule: "주 4일, 19:00-01:00",
		title: "부천 라운지바 주중 스태프",
		desc: "주중 홀 응대와 예약 관리를 담당합니다. 성실한 분이면 누구나 지원 가능합니다.",
	},
	{
		n: 15,
		org: "org_bambi_prism",
		ownerKey: "ownerPrism",
		status: "pending_review",
		category: "요정",
		region: "경기",
		district: "부천",
		pay: 200_000,
		unit: "일급",
		schedule: "협의",
		title: "부천 신규 업장 오픈 멤버 (검수 대기)",
		desc: "신규 오픈 업장의 멤버를 모집합니다. 운영팀 검수가 완료되면 공개됩니다.",
	},
	{
		n: 16,
		org: "org_bambi_prism",
		ownerKey: "ownerPrism",
		status: "rejected",
		category: "요정",
		region: "경기",
		district: "부천",
		pay: 300_000,
		unit: "일급",
		schedule: "협의",
		title: "부천 고수익 보장 멤버 (반려됨)",
		desc: "과장된 수익 표현으로 운영팀에서 반려한 공고 샘플입니다.",
		rejectionReason: "검증되지 않은 고수익 보장 문구로 반려되었습니다.",
	},
	{
		n: 17,
		org: "org_bambi_aqua",
		ownerKey: "ownerAqua",
		status: "published",
		category: "룸싸롱",
		region: "부산",
		district: "해운대",
		pay: 3_000_000,
		unit: "월급",
		schedule: "주 5일, 19:00-03:00",
		title: "해운대 오션뷰 라운지 매니저",
		desc: "해운대 바다가 보이는 라운지의 홀 운영 매니저를 모집합니다. 업장 경력자를 우대합니다.",
		promo: "premium",
	},
	{
		n: 18,
		org: "org_bambi_aqua",
		ownerKey: "ownerAqua",
		status: "published",
		category: "룸싸롱",
		region: "부산",
		district: "해운대",
		pay: 190_000,
		unit: "일급",
		schedule: "금/토, 20:00-02:00",
		title: "해운대 라운지 주말 홀 스태프",
		desc: "주말 홀 응대와 예약 관리를 담당합니다. 바다 근처 분위기 좋은 매장입니다.",
		promo: "recommended",
	},
	{
		n: 19,
		org: "org_bambi_aqua",
		ownerKey: "ownerAqua",
		status: "published",
		category: "룸싸롱",
		region: "부산",
		district: "해운대",
		pay: 13_000,
		unit: "시급",
		schedule: "평일 18:00-23:00",
		title: "부산 라운지 평일 초보 서버",
		desc: "평일 저녁 서빙 보조를 담당합니다. 첫 업장 경험도 친절하게 안내합니다.",
		beginner: true,
	},
	{
		n: 20,
		org: "org_bambi_ember",
		ownerKey: "ownerEmber",
		status: "published",
		category: "BAR",
		region: "경기",
		district: "성남",
		pay: 185_000,
		unit: "일급",
		schedule: "수~일, 19:00-01:00",
		title: "성남 칵테일 바 바텐더",
		desc: "성남 중심가 칵테일 바의 바텐더를 모집합니다. 레시피 교육을 제공합니다.",
		promo: "recommended",
	},
	{
		n: 21,
		org: "org_bambi_ember",
		ownerKey: "ownerEmber",
		status: "published",
		category: "BAR",
		region: "경기",
		district: "성남",
		pay: 14_000,
		unit: "시급",
		schedule: "금/토, 20:00-02:00",
		title: "성남 바 주말 파트타임",
		desc: "주말 바 보조와 음료 서빙을 담당합니다. 활기찬 분위기를 좋아하는 분 환영합니다.",
		beginner: true,
	},
	{
		n: 22,
		org: "org_bambi_ember",
		ownerKey: "ownerEmber",
		status: "published",
		category: "BAR",
		region: "경기",
		district: "성남",
		pay: 2_700_000,
		unit: "월급",
		schedule: "주 5일, 18:00-02:00",
		title: "성남 와인바 야간 매니저",
		desc: "와인 셀렉션 관리와 매장 운영을 책임지는 야간 매니저를 모집합니다.",
	},
	{
		n: 23,
		org: "org_bambi_nova",
		ownerKey: "ownerNova",
		status: "published",
		category: "단란주점",
		region: "부산",
		district: "서면",
		pay: 220_000,
		unit: "일급",
		schedule: "금/토, 21:00-05:00",
		title: "서면 클럽 VIP 응대 스태프",
		desc: "VIP 테이블 응대와 예약 관리를 담당합니다. 친화력 있는 분을 우대합니다.",
		promo: "premium",
	},
	{
		n: 24,
		org: "org_bambi_nova",
		ownerKey: "ownerNova",
		status: "published",
		category: "단란주점",
		region: "부산",
		district: "서면",
		pay: 175_000,
		unit: "일급",
		schedule: "토/일, 21:00-04:00",
		title: "서면 클럽 주말 플로어 스태프",
		desc: "플로어 안내와 음료 전달을 담당합니다. 체력 좋은 분 환영합니다.",
	},
	{
		n: 25,
		org: "org_bambi_nova",
		ownerKey: "ownerNova",
		status: "published",
		category: "단란주점",
		region: "부산",
		district: "서면",
		pay: 13_500,
		unit: "시급",
		schedule: "주 3일, 20:00-01:00",
		title: "서면 클럽 음향 보조",
		desc: "DJ 부스 음향 셋업과 장비 정리를 보조합니다. 음향에 관심 있는 분이면 좋습니다.",
		beginner: true,
	},
	{
		n: 26,
		org: "org_bambi_lumi",
		ownerKey: "ownerLumi",
		status: "published",
		category: "노래주점",
		region: "인천",
		district: "남동",
		pay: 11_000,
		unit: "시급",
		schedule: "평일 16:00-22:00",
		title: "남동 노래방 카운터 직원",
		desc: "예약 관리와 룸 안내, 간단한 청소를 담당합니다. 초보자도 지원 가능합니다.",
		beginner: true,
	},
	{
		n: 27,
		org: "org_bambi_lumi",
		ownerKey: "ownerLumi",
		status: "published",
		category: "노래주점",
		region: "인천",
		district: "남동",
		pay: 130_000,
		unit: "일급",
		schedule: "금/토/일, 18:00-02:00",
		title: "남동 노래방 주말 매니저",
		desc: "주말 매장 운영과 직원 관리를 담당합니다. 서비스업 경력자를 우대합니다.",
		promo: "recommended",
	},
	{
		n: 28,
		org: "org_bambi_lumi",
		ownerKey: "ownerLumi",
		status: "published",
		category: "노래주점",
		region: "인천",
		district: "남동",
		pay: 10_500,
		unit: "시급",
		schedule: "평일 13:00-19:00",
		title: "남동 코인노래방 평일 파트",
		desc: "코인노래방 청소와 기기 점검을 담당합니다. 조용한 환경에서 일할 분을 찾습니다.",
	},
	{
		n: 29,
		org: "org_bambi_comet",
		ownerKey: "ownerComet",
		status: "published",
		category: "룸싸롱",
		region: "경기",
		district: "수원",
		pay: 175_000,
		unit: "일급",
		schedule: "수~일, 19:00-01:00",
		title: "수원 라운지 홀 스태프",
		desc: "수원 인계동 라운지의 홀 응대와 테이블 세팅을 담당합니다.",
		promo: "recommended",
	},
	{
		n: 30,
		org: "org_bambi_comet",
		ownerKey: "ownerComet",
		status: "published",
		category: "룸싸롱",
		region: "경기",
		district: "수원",
		pay: 13_000,
		unit: "시급",
		schedule: "평일 18:00-23:00",
		title: "수원 라운지 주중 초보 서버",
		desc: "평일 저녁 서빙 보조를 담당합니다. 짧은 교육 후 바로 시작합니다.",
		beginner: true,
	},
	{
		n: 31,
		org: "org_bambi_comet",
		ownerKey: "ownerComet",
		status: "published",
		category: "룸싸롱",
		region: "경기",
		district: "수원",
		pay: 2_900_000,
		unit: "월급",
		schedule: "주 5일, 18:00-02:00",
		title: "수원 라운지 야간 매니저",
		desc: "매장 운영 총괄과 직원 스케줄 관리를 담당하는 정규직 매니저를 모집합니다.",
		promo: "premium",
	},
	{
		n: 32,
		org: "org_bambi_mars",
		ownerKey: "ownerMars",
		status: "published",
		category: "룸싸롱",
		region: "서울",
		district: "강남",
		pay: 170_000,
		unit: "일급",
		schedule: "수/목, 19:00-01:00",
		title: "강남 라운지 평일 매니저 보조",
		desc: "평일 매니저 업무를 보조합니다. 라운지 경력자를 우대합니다.",
	},
	{
		n: 33,
		org: "org_bambi_velvet",
		ownerKey: "ownerVelvet",
		status: "published",
		category: "BAR",
		region: "서울",
		district: "마포",
		pay: 150_000,
		unit: "일급",
		schedule: "토/일, 18:00-24:00",
		title: "마포 와인바 주말 서버",
		desc: "주말 와인 서빙과 고객 안내를 담당합니다. 와인에 관심 있는 분 환영합니다.",
		beginner: true,
	},
	{
		n: 34,
		org: "org_bambi_horizon",
		ownerKey: "ownerHorizon",
		status: "published",
		category: "텐프로/쩜오",
		region: "서울",
		district: "송파",
		pay: 13_000,
		unit: "시급",
		schedule: "평일 20:00-01:00",
		title: "송파 클럽 평일 플로어 보조",
		desc: "평일 플로어 안내와 정리를 담당합니다. 체력 좋은 분 환영합니다.",
		beginner: true,
	},
	{
		n: 35,
		org: "org_bambi_soda",
		ownerKey: "ownerSoda",
		status: "published",
		category: "다방",
		region: "인천",
		district: "부평",
		pay: 12_500,
		unit: "시급",
		schedule: "평일 15:00-21:00",
		title: "부평 카페 오후 바리스타",
		desc: "오후 음료 제조와 매장 관리를 담당합니다. 바리스타 경험자를 우대합니다.",
	},
	{
		n: 36,
		org: "org_bambi_prism",
		ownerKey: "ownerPrism",
		status: "published",
		category: "요정",
		region: "경기",
		district: "부천",
		pay: 180_000,
		unit: "일급",
		schedule: "수~토, 20:00-02:00",
		title: "부천 라운지바 신규 멤버 추가 모집",
		desc: "신규 멤버를 추가 모집합니다. 선배가 1:1로 친절하게 안내합니다.",
	},
	{
		n: 37,
		org: "org_bambi_nova",
		ownerKey: "ownerNova",
		status: "pending_review",
		category: "단란주점",
		region: "부산",
		district: "서면",
		pay: 240_000,
		unit: "일급",
		schedule: "협의",
		title: "서면 신규 클럽 오픈 멤버 (검수 대기)",
		desc: "신규 오픈 클럽의 멤버를 모집합니다. 운영팀 검수가 완료되면 공개됩니다.",
	},
	{
		n: 38,
		org: "org_bambi_mars",
		ownerKey: "ownerMars",
		status: "draft",
		category: "룸싸롱",
		region: "서울",
		district: "강남",
		pay: 160_000,
		unit: "일급",
		schedule: "협의",
		title: "강남 라운지 임시저장 공고",
		desc: "작성 중인 임시저장 상태의 공고 샘플입니다.",
	},
];

interface RichRoomDef {
	employerKey: DevUserKey;
	jobPostId: string;
	messages: { senderKey: DevUserKey; body: string }[];
	n: number;
	organizationId: string;
	rating: number;
	reviewBody: string;
	seekerKey: DevUserKey;
	teamId: string | null;
}

const richRooms: RichRoomDef[] = [
	{
		n: 1,
		jobPostId: richId("2a2a2a2a", 2),
		organizationId: "org_bambi_mars",
		employerKey: "ownerMars",
		seekerKey: "seekerB",
		teamId: null,
		rating: 5,
		reviewBody: "면접도 친절했고 근무 환경이 깔끔했어요. 정산도 정확합니다.",
		messages: [
			{
				senderKey: "seekerB",
				body: "안녕하세요, 주말 홀 스태프 지원하고 싶어요.",
			},
			{
				senderKey: "ownerMars",
				body: "네 반갑습니다! 이번 주 토요일 오후 면접 가능하실까요?",
			},
			{ senderKey: "seekerB", body: "토요일 좋습니다. 시간 맞춰 방문할게요." },
		],
	},
	{
		n: 2,
		jobPostId: richId("2a2a2a2a", 4),
		organizationId: "org_bambi_velvet",
		employerKey: "ownerVelvet",
		seekerKey: "seekerC",
		teamId: null,
		rating: 4,
		reviewBody: "바텐딩 교육이 체계적이었어요. 페이는 약속대로 지급됐습니다.",
		messages: [
			{ senderKey: "seekerC", body: "바텐더 경력 1년 있는데 지원 가능할까요?" },
			{
				senderKey: "ownerVelvet",
				body: "경력자시면 환영입니다. 포트폴리오 있으시면 채팅으로 보내주세요.",
			},
		],
	},
	{
		n: 3,
		jobPostId: richId("2a2a2a2a", 8),
		organizationId: "org_bambi_horizon",
		employerKey: "ownerHorizon",
		seekerKey: "seekerD",
		teamId: null,
		rating: 5,
		reviewBody:
			"주말 단기였는데 매니저님이 일을 잘 알려주셨어요. 또 일하고 싶어요.",
		messages: [
			{
				senderKey: "seekerD",
				body: "이번 주말 플로어 스태프 자리 아직 있나요?",
			},
			{
				senderKey: "ownerHorizon",
				body: "네 모집 중입니다. 토요일 21시까지 오실 수 있나요?",
			},
			{ senderKey: "seekerD", body: "가능합니다. 복장은 어떻게 하면 될까요?" },
		],
	},
	{
		n: 4,
		jobPostId: richId("2a2a2a2a", 10),
		organizationId: "org_bambi_soda",
		employerKey: "ownerSoda",
		seekerKey: "seekerE",
		teamId: null,
		rating: 3,
		reviewBody:
			"일은 무난했는데 오픈 준비가 조금 바빴어요. 사장님은 친절하셨습니다.",
		messages: [
			{
				senderKey: "seekerE",
				body: "오전 바리스타 지원합니다. 주 며칠 근무인가요?",
			},
			{
				senderKey: "ownerSoda",
				body: "평일 주 5일 오전 타임이에요. 가능하실까요?",
			},
		],
	},
	{
		n: 5,
		jobPostId: richId("2a2a2a2a", 14),
		organizationId: "org_bambi_prism",
		employerKey: "ownerPrism",
		seekerKey: "seekerB",
		teamId: null,
		rating: 4,
		reviewBody: "신입도 배려해 주는 분위기였어요. 면접 때 안내가 정확했습니다.",
		messages: [
			{ senderKey: "seekerB", body: "주중 스태프 자리 문의드립니다." },
			{
				senderKey: "ownerPrism",
				body: "지원 감사합니다. 근무 가능한 요일 알려주실 수 있을까요?",
			},
		],
	},
	{
		n: 6,
		jobPostId: ids.lunaPublishedJob,
		organizationId: ids.lunaOrganization,
		employerKey: "owner",
		seekerKey: "seekerC",
		teamId: null,
		rating: 5,
		reviewBody: "클럽 루나는 응대 매뉴얼이 잘 잡혀 있어서 적응이 빨랐어요.",
		messages: [
			{
				senderKey: "seekerC",
				body: "홀 스태프 지원하고 싶어요. 초보도 괜찮을까요?",
			},
			{
				senderKey: "owner",
				body: "물론입니다. 교육 후 시작하니 편하게 지원하세요.",
			},
		],
	},
	{
		n: 7,
		jobPostId: ids.lunaOrganicPublishedJob,
		organizationId: ids.lunaOrganization,
		employerKey: "owner",
		seekerKey: "seekerD",
		teamId: null,
		rating: 4,
		reviewBody: "카운터 보조 업무가 명확했어요. 면접 장소 안내도 친절했습니다.",
		messages: [
			{ senderKey: "seekerD", body: "서초 카운터 보조 지원합니다." },
			{
				senderKey: "owner",
				body: "지원 감사합니다. 면접 시간 채팅으로 잡아드릴게요.",
			},
		],
	},
	{
		n: 8,
		jobPostId: richId("2a2a2a2a", 18),
		organizationId: "org_bambi_aqua",
		employerKey: "ownerAqua",
		seekerKey: "seekerF",
		teamId: null,
		rating: 5,
		reviewBody: "오션뷰 매장이라 분위기가 좋았어요. 페이 정산도 정확했습니다.",
		messages: [
			{ senderKey: "seekerF", body: "해운대 주말 홀 스태프 지원하고 싶어요." },
			{
				senderKey: "ownerAqua",
				body: "반갑습니다! 이번 주 토요일 오후 면접 가능하실까요?",
			},
			{ senderKey: "seekerF", body: "네 가능합니다. 시간 맞춰 갈게요." },
		],
	},
	{
		n: 9,
		jobPostId: richId("2a2a2a2a", 20),
		organizationId: "org_bambi_ember",
		employerKey: "ownerEmber",
		seekerKey: "seekerG",
		teamId: null,
		rating: 4,
		reviewBody: "바텐딩 교육이 꼼꼼했어요. 성남이라 접근성도 좋습니다.",
		messages: [
			{
				senderKey: "seekerG",
				body: "칵테일 바 바텐더 지원합니다. 경력 2년이에요.",
			},
			{
				senderKey: "ownerEmber",
				body: "경력자시면 환영입니다. 가능한 근무 요일 알려주세요.",
			},
		],
	},
	{
		n: 10,
		jobPostId: richId("2a2a2a2a", 24),
		organizationId: "org_bambi_nova",
		employerKey: "ownerNova",
		seekerKey: "seekerH",
		teamId: null,
		rating: 5,
		reviewBody: "주말 단기였는데 매니저님이 친절하게 알려주셨어요.",
		messages: [
			{ senderKey: "seekerH", body: "주말 플로어 스태프 자리 있나요?" },
			{
				senderKey: "ownerNova",
				body: "네 모집 중입니다. 토요일 21시까지 오실 수 있나요?",
			},
			{ senderKey: "seekerH", body: "가능합니다. 복장 안내 부탁드려요." },
		],
	},
	{
		n: 11,
		jobPostId: richId("2a2a2a2a", 27),
		organizationId: "org_bambi_lumi",
		employerKey: "ownerLumi",
		seekerKey: "seekerF",
		teamId: null,
		rating: 4,
		reviewBody: "노래방 매니저 업무가 깔끔했어요. 주말 페이도 좋았습니다.",
		messages: [
			{
				senderKey: "seekerF",
				body: "주말 매니저 지원합니다. 서비스업 경력 있어요.",
			},
			{
				senderKey: "ownerLumi",
				body: "지원 감사합니다. 면접 일정 채팅으로 잡아드릴게요.",
			},
		],
	},
	{
		n: 12,
		jobPostId: richId("2a2a2a2a", 29),
		organizationId: "org_bambi_comet",
		employerKey: "ownerComet",
		seekerKey: "seekerG",
		teamId: null,
		rating: 5,
		reviewBody: "인계동 라운지 분위기가 좋고 사장님이 친절하셨어요.",
		messages: [
			{ senderKey: "seekerG", body: "수원 홀 스태프 지원합니다." },
			{
				senderKey: "ownerComet",
				body: "반갑습니다. 근무 가능한 요일 알려주실 수 있을까요?",
			},
		],
	},
	{
		n: 13,
		jobPostId: richId("2a2a2a2a", 3),
		organizationId: "org_bambi_mars",
		employerKey: "ownerMars",
		seekerKey: "seekerH",
		teamId: null,
		rating: 3,
		reviewBody: "초보라 걱정했는데 교육이 있어서 적응했어요. 다소 바빴습니다.",
		messages: [
			{
				senderKey: "seekerH",
				body: "초보 환영 서버 지원합니다. 처음이라 떨려요.",
			},
			{
				senderKey: "ownerMars",
				body: "교육 후 시작하니 편하게 지원하세요. 친절히 안내드릴게요.",
			},
		],
	},
];

// 작성 시점 계정 유형 스냅샷(community_post.author_role)에 쓸 role 조회 맵.
const devUserRoleByKey = Object.fromEntries(
	devUsers.map((devUser) => [devUser.key, devUser.role])
) as Record<DevUserKey, DevUser["role"]>;

const COMMUNITY_KEY_LENGTH = 64;
const COMMUNITY_SALT_BYTES = 16;

// 커뮤니티 글 비밀번호 저장 형식("<salt hex>:<scrypt hash hex>") — packages/api의
// hashCommunityPassword와 동일 알고리즘을 seed 자체 완결성을 위해 인라인한다. 비밀글이
// 아닌 글은 빈 문자열을 저장한다(API 관례: verify가 항상 실패해 잠금 게이트가 자연 차단).
const hashCommunityPassword = (password: string): string => {
	const salt = randomBytes(COMMUNITY_SALT_BYTES).toString("hex");
	const hash = scryptSync(password, salt, COMMUNITY_KEY_LENGTH).toString("hex");
	return `${salt}:${hash}`;
};

interface CommunityPostDef {
	authorDisplayName: string;
	authorKey: DevUserKey;
	board: (typeof communityBoard.enumValues)[number];
	body: string;
	isLocked?: boolean;
	isPromotion?: boolean;
	n: number;
	// 비밀글(isLocked=true)일 때만 사용하는 평문 비밀번호. 저장 시 scrypt로 해싱한다.
	password?: string;
	title: string;
	viewCount?: number;
}

// 수다방(자유수다/밤문화 이야기) 시드 글. 구직자(여성·남성 혼합)와 구인자가 모두 작성한다.
// author_display_name은 글별 익명 표시명(계정 표시명 user.name과 별개), authorRole은
// 작성 시점 계정 유형 스냅샷이다.
const communityPosts: CommunityPostDef[] = [
	{
		n: 1,
		authorKey: "seeker",
		board: "free",
		authorDisplayName: "달빛토끼",
		title: "첫 라운지 알바 다녀온 후기 남겨요",
		body: "긴장 잔뜩 하고 갔는데 매니저님이 하나하나 알려주셔서 생각보다 금방 적응했어요. 처음이라 실수도 했지만 다들 편하게 대해주셔서 다행이었습니다. 첫 출근 앞두신 분들 너무 걱정 마세요!",
		viewCount: 132,
	},
	{
		n: 2,
		authorKey: "seekerB",
		board: "work_talk",
		authorDisplayName: "야간러버",
		title: "면접 볼 때 이건 꼭 물어보세요",
		body: "페이 정산 주기, 지각·결근 규정, 교통비 지원 여부는 면접에서 꼭 확인하세요. 나중에 말 바뀌는 곳도 있어서 채팅 기록 남겨두는 게 안전합니다. 다들 좋은 곳 만나시길!",
		viewCount: 208,
	},
	{
		n: 3,
		authorKey: "seekerC",
		board: "work_talk",
		authorDisplayName: "민트초코",
		title: "홀 알바 페이 정산 보통 언제 되나요?",
		body: "이번에 처음 일당제로 일하게 됐는데 보통 당일 정산인지 주급인지 궁금해요. 업장마다 다른 것 같은데 다들 어떻게 받으세요?",
		viewCount: 96,
	},
	{
		n: 4,
		authorKey: "seekerD",
		board: "free",
		authorDisplayName: "새벽감성",
		title: "야간 근무 체력 관리 어떻게들 하세요?",
		body: "낮밤이 바뀌니까 체력 관리가 제일 힘드네요. 저는 근무 끝나고 스트레칭하고 암막커튼 치고 자는데, 다들 각자 노하우 있으면 공유해주세요.",
		viewCount: 145,
	},
	{
		n: 5,
		authorKey: "seekerE",
		board: "work_talk",
		authorDisplayName: "레몬소다",
		title: "바텐더 준비 중인데 조언 부탁드려요",
		body: "칵테일 기본 레시피는 어느 정도 외웠는데, 실전에서 뭐가 제일 중요한지 궁금합니다. 현직에 계신 분들 팁 있으면 알려주세요!",
		viewCount: 74,
	},
	{
		n: 6,
		authorKey: "seekerF",
		board: "work_talk",
		authorDisplayName: "해운대갈매기",
		title: "부산 해운대 쪽 시급 요즘 어떤가요?",
		body: "해운대 근처에서 주말 홀 알바 알아보는 중인데 시급대가 궁금해요. 최근에 이 지역에서 일해보신 분 계시면 분위기도 같이 알려주시면 감사하겠습니다.",
		viewCount: 118,
	},
	{
		n: 7,
		authorKey: "seekerG",
		board: "free",
		authorDisplayName: "밤샘장인",
		title: "면접 노쇼 당했을 때 다들 어떻게 하세요",
		body: "약속 잡고 갔는데 담당자가 연락도 없이 안 나온 적 있어요. 시간 버린 게 너무 아깝더라고요. 이럴 때 후기 남기는 게 맞을까요?",
		viewCount: 161,
	},
	{
		n: 8,
		authorKey: "seekerH",
		board: "free",
		authorDisplayName: "코랄피치",
		title: "초보 서버 3개월차 소소한 팁 모음",
		body: "이제 겨우 3개월 됐지만 처음의 저 같은 분들께 도움이 될까 해서 적어요. 주문은 꼭 복창하고, 테이블 번호는 미리 외워두고, 모르면 바로 물어보는 게 제일 빠릅니다. 비밀글로 저장해봤어요.",
		isLocked: true,
		password: "bambi3month",
		viewCount: 53,
	},
	{
		n: 9,
		authorKey: "owner",
		board: "free",
		authorDisplayName: "루나운영팀",
		title: "저희 업장 채용 문화 짧게 공유합니다",
		body: "지원해주시는 분들이 편하게 오실 수 있게 면접은 근처 카페에서 가볍게 진행하고 있어요. 궁금한 점은 채팅으로 먼저 물어보셔도 됩니다. 좋은 인연 많이 만들고 싶습니다.",
		viewCount: 187,
	},
	{
		n: 10,
		authorKey: "ownerMars",
		board: "work_talk",
		authorDisplayName: "마르스대표",
		title: "구직자분들께: 이력서에 이것만 있어도 좋아요",
		body: "화려한 스펙보다 근무 가능한 요일과 시간, 연락이 잘 되는지가 제일 중요합니다. 짧게라도 자기소개 한 줄 있으면 채용하는 입장에서 훨씬 신뢰가 가요. 참고되셨으면 합니다.",
		viewCount: 224,
	},
	{
		n: 11,
		authorKey: "ownerVelvet",
		board: "work_talk",
		authorDisplayName: "벨벳바지기",
		title: "마포에서 칵테일바 운영하며 느낀 점",
		body: "손님 응대만큼이나 함께 일하는 스태프 분위기가 매장 전체를 좌우하더라고요. 그래서 저희는 교육에 시간을 넉넉히 씁니다. 오래 같이 갈 분들을 늘 찾고 있어요.",
		viewCount: 139,
	},
	{
		n: 12,
		authorKey: "ownerAqua",
		board: "free",
		authorDisplayName: "아쿠아라운지",
		title: "해운대 오션뷰 라운지에서 새 멤버 찾아요",
		body: "바다 보이는 매장에서 주말 홀 스태프로 함께하실 분을 모집합니다. 초보도 교육 후 시작하니 부담 없이 채팅 주세요. 분위기 정말 좋습니다!",
		isPromotion: true,
		viewCount: 176,
	},
	{
		n: 13,
		authorKey: "ownerLumi",
		board: "free",
		authorDisplayName: "루미노래방",
		title: "남동 노래방 주말 매니저 구합니다 (광고)",
		body: "서비스업 경력자 우대하고, 주말 위주 근무입니다. 페이 조건은 채팅으로 상세히 안내드릴게요. 성실하신 분이면 오래 함께하고 싶습니다.",
		isPromotion: true,
		viewCount: 92,
	},
	{
		n: 14,
		authorKey: "seekerC",
		board: "free",
		authorDisplayName: "민트초코",
		title: "여성 구직자분들 안전하게 일하는 팁",
		body: "면접 장소는 되도록 사람 많은 공개된 곳에서 잡고, 첫 근무 전에 업장 위치랑 담당자 정보 지인에게 공유해두세요. 조금만 신경 써도 훨씬 안심됩니다.",
		viewCount: 203,
	},
	{
		n: 15,
		authorKey: "owner",
		board: "work_talk",
		authorDisplayName: "루나운영팀",
		title: "사장 입장에서 생각하는 좋은 직원",
		body: "일 잘하는 것도 좋지만 결국 오래 남는 분들은 약속을 잘 지키는 분들이에요. 늦으면 미리 연락 주고, 못 나오면 대체를 같이 고민해주는 분. 그런 신뢰가 제일 큽니다.",
		viewCount: 158,
	},
];

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

// 로그인 아이디(login_id): dev 유저 key를 소문자로 정규화해 유니크하게 만든다.
// (seeker→"seeker", ownerMars→"ownermars"). username 플러그인이 signUpEmail에서
// 이 값을 login_id/login_id_display 컬럼으로 매핑하며, 소문자 정규화라 값도 소문자다.
const loginIdFor = (devUser: DevUser): string => devUser.key.toLowerCase();

const ensureAuthUser = async (devUser: DevUser): Promise<string> => {
	const loginId = loginIdFor(devUser);
	const [existingUser] = await db
		.select()
		.from(user)
		.where(eq(user.email, devUser.email))
		.limit(1);

	if (!existingUser) {
		const signupName =
			devUser.role === "admin" ? "밤비 운영 계정 준비중" : devUser.name;
		await auth.api.signUpEmail({
			body: {
				name: signupName,
				email: devUser.email,
				password: DEV_PASSWORD,
				username: loginId,
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

	// login_id/login_id_display를 명시적으로 재확정한다 — 기존 유저(가입 스킵) 경로에서도
	// 아이디 로그인(signIn.username)이 되도록 멱등하게 채운다. 값은 이미 소문자다.
	await db
		.update(user)
		.set({
			name: devUser.name,
			emailVerified: true,
			login_id: loginId,
			login_id_display: loginId,
			updatedAt: new Date(),
		})
		.where(eq(user.id, authUser.id));

	await assertDevPasswordWorks(devUser);
	await db.delete(session).where(eq(session.userId, authUser.id));

	return authUser.id;
};

// 구직자(개인회원)에 성별을 세팅해 gender 컬럼이 실제로 채워지도록 한다. 업소·관리자
// 계정은 개인 성별 개념이 없어 null로 둔다. 여성 구직자는 후속 수다방(#2) 입장 테스트에 쓰인다.
const seederGenderByKey: Partial<Record<DevUserKey, "female" | "male">> = {
	seeker: "female",
	seekerB: "male",
	seekerC: "female",
	seekerD: "female",
	seekerE: "male",
	seekerF: "female",
	seekerG: "male",
	seekerH: "female",
};

const ensureBambiProfile = async (
	devUser: DevUser,
	userId: string
): Promise<void> => {
	const gender = seederGenderByKey[devUser.key] ?? null;
	await db
		.insert(bambiProfile)
		.values({
			userId,
			role: devUser.role,
			status: "active",
			isPhoneVerified: true,
			phoneNumber: devUser.phoneNumber,
			gender,
		})
		.onConflictDoUpdate({
			target: bambiProfile.userId,
			set: {
				role: devUser.role,
				status: "active",
				isPhoneVerified: true,
				phoneNumber: devUser.phoneNumber,
				gender,
				updatedAt: new Date(),
			},
		});
};

const seedUsers = async (): Promise<Record<DevUserKey, string>> => {
	const userIds = {} as Record<DevUserKey, string>;

	for (const devUser of devUsers) {
		const userId = await ensureAuthUser(devUser);
		await ensureBambiProfile(devUser, userId);
		if (devUser.role === "admin") {
			await db
				.update(user)
				.set({ name: devUser.name })
				.where(eq(user.id, userId));
		}
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
	const seedJobIds = [
		ids.lunaPublishedJob,
		ids.lunaTeamPublishedJob,
		ids.pendingReviewJob,
		ids.lunaOrganicPublishedJob,
	];

	await db
		.delete(jobPerformanceEvent)
		.where(inArray(jobPerformanceEvent.jobPostId, seedJobIds));
	await db
		.delete(jobPostMedia)
		.where(inArray(jobPostMedia.jobPostId, seedJobIds));

	const baseJobs: SeedJobPost[] = [
		{
			id: ids.lunaPublishedJob,
			organizationId: ids.lunaOrganization,
			teamId: null,
			createdByUserId: userIds.owner,
			status: "published",
			industryCategory: "룸싸롱",
			region: "서울",
			district: "강남",
			payAmount: 180_000,
			payUnit: "일급",
			workSchedule: "주 3일, 20:00-02:00",
			title: "강남 라운지 홀 스태프 모집",
			description:
				"주요 업무\n\n고객 응대와 예약 관리, 홀 정리를 담당합니다.\n\n초보 지원 가능하며 담당자가 채팅으로 안내합니다.",
			descriptionBlocks: [
				{ id: "luna-main-heading", text: "주요 업무", type: "heading" },
				{
					id: "luna-main-body",
					text: "고객 응대와 예약 관리, 홀 정리를 담당합니다.",
					type: "paragraph",
				},
				{
					id: "luna-main-callout",
					text: "초보 지원 가능하며 담당자가 채팅으로 안내합니다.",
					type: "callout",
				},
			],
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
			industryCategory: "BAR",
			region: "서울",
			district: "강남",
			payAmount: 160_000,
			payUnit: "일급",
			workSchedule: "금/토, 19:00-01:00",
			title: "강남점 주말 파트타임 모집",
			description:
				"주말 업무\n\n바 좌석 정리\n예약 확인\n간단한 고객 안내\n\n근무 조건은 면접에서 확인합니다.",
			descriptionBlocks: [
				{ id: "luna-team-heading", text: "주말 업무", type: "heading" },
				{
					id: "luna-team-list",
					text: "바 좌석 정리\n예약 확인\n간단한 고객 안내",
					type: "bullet_list",
				},
				{
					id: "luna-team-note",
					text: "근무 조건은 면접에서 확인합니다.",
					type: "paragraph",
				},
			],
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
			industryCategory: "룸싸롱",
			region: "부산",
			district: "해운대",
			payAmount: 150_000,
			payUnit: "일급",
			workSchedule: "협의",
			title: "해운대 라운지 오픈 멤버 모집",
			description:
				"검수 확인 필요\n\n사업장 인증 심사 중인 공고입니다.\n\n미성년 지원 가능 여부를 운영팀이 확인해야 합니다.",
			descriptionBlocks: [
				{
					id: "pending-heading",
					text: "검수 확인 필요",
					type: "heading",
				},
				{
					id: "pending-body",
					text: "사업장 인증 심사 중인 공고입니다.",
					type: "paragraph",
				},
				{
					id: "pending-risk",
					text: "미성년 지원 가능 여부를 운영팀이 확인해야 합니다.",
					type: "callout",
				},
			],
			interviewNotes: "운영팀 심사 완료 후 면접 일정을 확정합니다.",
			riskFlags: ["risky_term"],
			publishedAt: null,
		},
		{
			id: ids.lunaOrganicPublishedJob,
			organizationId: ids.lunaOrganization,
			teamId: null,
			createdByUserId: userIds.owner,
			status: "published",
			industryCategory: "다방",
			region: "서울",
			district: "서초",
			payAmount: 140_000,
			payUnit: "일급",
			workSchedule: "평일 18:00-23:00",
			title: "서초 라운지 카운터 보조",
			description:
				"초보 지원자를 위한 짧은 교육 후 근무를 시작합니다. 상세 조건은 밤비 채팅에서 안내합니다.",
			descriptionBlocks: [],
			interviewNotes: "면접 장소는 채팅에서 확정합니다.",
			riskFlags: [],
			publishedAt,
		},
	];

	// 무료 공고 즉시 노출 정책: 게시(published) 공고는 결제완료(paid)로 시드해 마켓
	// 목록·상세에 바로 노출되게 한다. pending_review는 미결제로 결제관리 큐에 남는다.
	const jobs: SeedJobPost[] = baseJobs.map((job) => ({
		...job,
		paymentStatus: job.status === "published" ? "paid" : "unpaid",
	}));

	await db
		.insert(jobPost)
		.values(jobs)
		.onConflictDoUpdate({
			target: jobPost.id,
			set: {
				updatedAt: new Date(),
			},
		});

	for (const seedJob of jobs) {
		const { id, ...jobValues } = seedJob;

		await db
			.update(jobPost)
			.set({
				...jobValues,
				updatedAt: new Date(),
			})
			.where(eq(jobPost.id, id));
	}

	await db.insert(jobPostMedia).values([
		{
			id: ids.lunaPublishedJobCover,
			jobPostId: ids.lunaPublishedJob,
			organizationId: ids.lunaOrganization,
			uploadedByUserId: userIds.owner,
			usage: "cover",
			position: 0,
			fileName: "luna-cover.jpg",
			mimeType: "image/jpeg",
			byteSize: 512_000,
			storageKey: "bambi-job-post-media/org_bambi_luna/owner/luna-cover.jpg",
			altText: "클럽 루나 대표 이미지",
		},
		{
			id: ids.lunaPublishedJobDetailOne,
			jobPostId: ids.lunaPublishedJob,
			organizationId: ids.lunaOrganization,
			uploadedByUserId: userIds.owner,
			usage: "detail",
			position: 0,
			fileName: "luna-detail-hall.webp",
			mimeType: "image/webp",
			byteSize: 384_000,
			storageKey:
				"bambi-job-post-media/org_bambi_luna/owner/luna-detail-hall.webp",
			altText: "홀 근무 공간",
		},
		{
			id: ids.lunaPublishedJobDetailTwo,
			jobPostId: ids.lunaPublishedJob,
			organizationId: ids.lunaOrganization,
			uploadedByUserId: userIds.owner,
			usage: "detail",
			position: 1,
			fileName: "luna-detail-counter.webp",
			mimeType: "image/webp",
			byteSize: 392_000,
			storageKey:
				"bambi-job-post-media/org_bambi_luna/owner/luna-detail-counter.webp",
			altText: "카운터 안내 공간",
		},
		{
			id: ids.lunaTeamPublishedJobCover,
			jobPostId: ids.lunaTeamPublishedJob,
			organizationId: ids.lunaOrganization,
			uploadedByUserId: userIds.staff,
			usage: "cover",
			position: 0,
			fileName: "luna-team-cover.png",
			mimeType: "image/png",
			byteSize: 420_000,
			storageKey:
				"bambi-job-post-media/org_bambi_luna/staff/luna-team-cover.png",
			altText: "강남점 대표 이미지",
		},
		{
			id: ids.pendingReviewJobCover,
			jobPostId: ids.pendingReviewJob,
			organizationId: ids.pendingOrganization,
			uploadedByUserId: userIds.pendingOwner,
			usage: "cover",
			position: 0,
			fileName: "neon-pending-cover.jpg",
			mimeType: "image/jpeg",
			byteSize: 448_000,
			storageKey:
				"bambi-job-post-media/org_bambi_neon/owner/neon-pending-cover.jpg",
			altText: "네온 라운지 검수 이미지",
		},
	]);

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

	await db.delete(review).where(eq(review.chatRoomId, ids.chatRoom));

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

const seedRichOrganizations = async (
	userIds: Record<DevUserKey, string>,
	now: Date
): Promise<void> => {
	await db
		.insert(organization)
		.values(
			richOrganizations.map((org) => ({
				id: org.id,
				name: org.name,
				slug: org.slug,
				logo: null,
				metadata: JSON.stringify({ seed: "bambi-dev" }),
				createdAt: now,
			}))
		)
		.onConflictDoUpdate({
			target: organization.id,
			set: { metadata: JSON.stringify({ seed: "bambi-dev" }) },
		});

	for (const org of richOrganizations) {
		await db
			.insert(member)
			.values({
				id: org.memberId,
				organizationId: org.id,
				userId: userIds[org.ownerKey],
				role: "owner",
				createdAt: now,
			})
			.onConflictDoUpdate({
				target: member.id,
				set: {
					organizationId: org.id,
					userId: userIds[org.ownerKey],
					role: "owner",
				},
			});

		await db
			.insert(employerOrganizationProfile)
			.values({
				id: org.profileId,
				organizationId: org.id,
				displayName: org.name,
				businessRegistrationNumber: org.businessRegistrationNumber,
				verificationStatus: "verified",
				verificationNote: "개발 seed 인증 사업장",
			})
			.onConflictDoUpdate({
				target: employerOrganizationProfile.organizationId,
				set: {
					displayName: org.name,
					businessRegistrationNumber: org.businessRegistrationNumber,
					verificationStatus: "verified",
					verificationNote: "개발 seed 인증 사업장",
					updatedAt: now,
				},
			});
	}
};

const buildRichJobRow = (
	def: RichJobDef,
	userIds: Record<DevUserKey, string>
): SeedJobPost => {
	const id = richId("2a2a2a2a", def.n);
	const beginnerBlock = def.beginner
		? [
				{
					id: `${id}-c`,
					text: "초보자도 친절하게 안내해 드려요.",
					type: "callout" as const,
				},
			]
		: [];

	return {
		id,
		organizationId: def.org,
		teamId: null,
		createdByUserId: userIds[def.ownerKey],
		status: def.status,
		industryCategory: def.category,
		region: def.region,
		district: def.district,
		payAmount: def.pay,
		payUnit: def.unit,
		workSchedule: def.schedule,
		title: def.title,
		description: def.desc,
		descriptionBlocks: [
			{ id: `${id}-h`, text: "주요 업무", type: "heading" as const },
			{ id: `${id}-p`, text: def.desc, type: "paragraph" as const },
			...beginnerBlock,
		],
		interviewNotes: "면접 일정은 밤비 채팅에서 확정합니다.",
		beginnerFriendly: def.beginner ?? false,
		instantInterview: def.instant ?? false,
		rejectionReason: def.rejectionReason ?? null,
		riskFlags: def.status === "pending_review" ? ["needs_review"] : [],
		// 무료 공고 즉시 노출 정책: 게시 공고는 결제완료로 시드해 바로 노출되게 한다.
		paymentStatus: def.status === "published" ? "paid" : "unpaid",
		publishedAt: def.status === "published" ? jobPublishedAt(def.n) : null,
	};
};

const seedRichJobs = async (
	userIds: Record<DevUserKey, string>,
	now: Date
): Promise<void> => {
	const jobIds = richJobs.map((def) => richId("2a2a2a2a", def.n));

	await db
		.delete(jobPerformanceEvent)
		.where(inArray(jobPerformanceEvent.jobPostId, jobIds));
	await db.delete(jobPostMedia).where(inArray(jobPostMedia.jobPostId, jobIds));

	const jobRows = richJobs.map((def) => buildRichJobRow(def, userIds));

	await db
		.insert(jobPost)
		.values(jobRows)
		.onConflictDoUpdate({ target: jobPost.id, set: { updatedAt: now } });

	for (const row of jobRows) {
		const { id, ...rest } = row;
		await db
			.update(jobPost)
			.set({ ...rest, updatedAt: now })
			.where(eq(jobPost.id, id));
	}

	const mediaRows = richJobs
		.filter((def) => def.status === "published")
		.map((def) => ({
			id: richId("9a9a9a9a", def.n),
			jobPostId: richId("2a2a2a2a", def.n),
			organizationId: def.org,
			uploadedByUserId: userIds[def.ownerKey],
			usage: "cover" as const,
			position: 0,
			fileName: `${def.org}-${def.n}-cover.jpg`,
			mimeType: "image/jpeg",
			byteSize: 480_000,
			storageKey: `bambi-job-post-media/${def.org}/seed/${def.n}-cover.jpg`,
			altText: `${def.title} 대표 이미지`,
		}));

	if (mediaRows.length > 0) {
		await db.insert(jobPostMedia).values(mediaRows);
	}
};

type RichEvent = typeof jobPerformanceEvent.$inferInsert;

// 최근 7일 성과 profile — Hit 리본 데모용. n → 최근 7일 최종 총량(impressions/detailViews).
// Hit 여부는 boolean으로 저장하지 않고 이 metrics로만 계산한다.
const richJobHitProfiles: Record<
	number,
	{ detailViews: number; impressions: number }
> = {
	1: { detailViews: 100, impressions: 1000 }, // CTR 10% → 조건 A(detailViews>=100)로 Hit
	2: { detailViews: 24, impressions: 200 }, // CTR 12% → 조건 B로 Hit
	4: { detailViews: 23, impressions: 200 }, // CTR 11.5% → 비-Hit 대조군
};

const DAY_MS = 24 * 60 * 60 * 1000;

// now 기준 최근 7일(6일 이내)에 결정론적으로 분산된 createdAt. 고정 2026 날짜로
// 만료되는 구조를 피하기 위해 전달된 now에서 상대 오프셋으로 계산한다.
const recentPerformanceDate = (now: Date, k: number): Date =>
	new Date(now.getTime() - (k % 6) * DAY_MS - (k % 240) * 60 * 1000);

const buildPromotionEvents = (
	def: RichJobDef,
	userIds: Record<DevUserKey, string>,
	startSeq: number,
	now: Date
): RichEvent[] => {
	const jobPostId = richId("2a2a2a2a", def.n);
	const isPremium = def.promo === "premium";
	const profile = richJobHitProfiles[def.n];
	const events: RichEvent[] = [];
	let seq = startSeq;

	const defaultImpressions = isPremium ? 14 : 8;
	const defaultDetailViews = isPremium ? 5 : 3;
	const impressions = profile ? profile.impressions : defaultImpressions;
	for (let k = 0; k < impressions; k++) {
		events.push({
			id: richId("6a6a6a6a", seq),
			jobPostId,
			organizationId: def.org,
			actorUserId: null,
			eventType: "impression",
			createdAt: profile
				? recentPerformanceDate(now, k)
				: new Date(
						`2026-06-${(20 + (k % 8)).toString().padStart(2, "0")}T${(8 + (k % 10)).toString().padStart(2, "0")}:15:00.000Z`
					),
		});
		seq++;
	}

	const detailViews = profile ? profile.detailViews : defaultDetailViews;
	for (let k = 0; k < detailViews; k++) {
		events.push({
			id: richId("6a6a6a6a", seq),
			jobPostId,
			organizationId: def.org,
			actorUserId: userIds.seeker,
			eventType: "detail_view",
			createdAt: profile
				? recentPerformanceDate(now, k + 1)
				: new Date(
						`2026-06-${(21 + (k % 6)).toString().padStart(2, "0")}T13:${(10 + k).toString().padStart(2, "0")}:00.000Z`
					),
		});
		seq++;
	}

	events.push({
		id: richId("6a6a6a6a", seq),
		jobPostId,
		organizationId: def.org,
		actorUserId: userIds.seekerB,
		eventType: "chat_start",
		createdAt: new Date("2026-06-24T15:00:00.000Z"),
	});
	seq++;

	if (isPremium) {
		events.push({
			id: richId("6a6a6a6a", seq),
			jobPostId,
			organizationId: def.org,
			actorUserId: userIds.seekerB,
			eventType: "contact_reveal",
			createdAt: new Date("2026-06-25T16:00:00.000Z"),
		});
	}

	return events;
};

const seedRichPromotions = async (
	userIds: Record<DevUserKey, string>,
	now: Date
): Promise<void> => {
	const promotedJobs = richJobs.filter((def) => def.promo);
	const eventRows: RichEvent[] = [];

	for (const def of promotedJobs) {
		const tier = def.promo as "premium" | "recommended" | "standard";
		const isPremium = tier === "premium";

		await db
			.insert(jobPromotionCampaign)
			.values({
				id: richId("8a8a8a8a", def.n),
				jobPostId: richId("2a2a2a2a", def.n),
				organizationId: def.org,
				tier,
				status: "active",
				startsAt: new Date("2026-06-20T09:00:00.000Z"),
				endsAt: new Date("2026-07-20T09:00:00.000Z"),
				manualBoostsTotal: isPremium ? 5 : 3,
				manualBoostsUsed: isPremium ? 2 : 0,
				autoBoostsPerDay: isPremium ? 1 : 0,
				lastBoostedAt: isPremium ? new Date("2026-06-26T08:00:00.000Z") : null,
			})
			.onConflictDoUpdate({
				target: jobPromotionCampaign.id,
				set: {
					tier,
					status: "active",
					endsAt: new Date("2026-07-20T09:00:00.000Z"),
					updatedAt: now,
				},
			});

		eventRows.push(
			...buildPromotionEvents(def, userIds, eventRows.length + 1, now)
		);
	}

	if (eventRows.length > 0) {
		await db.insert(jobPerformanceEvent).values(eventRows);
	}
};

const seedRichConversations = async (
	userIds: Record<DevUserKey, string>,
	now: Date
): Promise<void> => {
	const roomIds = richRooms.map((room) => richId("3a3a3a3a", room.n));

	await db.delete(review).where(inArray(review.chatRoomId, roomIds));
	await db.delete(chatMessage).where(inArray(chatMessage.chatRoomId, roomIds));

	for (const room of richRooms) {
		const roomId = richId("3a3a3a3a", room.n);

		await db
			.insert(chatRoom)
			.values({
				id: roomId,
				jobPostId: room.jobPostId,
				organizationId: room.organizationId,
				teamId: room.teamId,
				employerUserId: userIds[room.employerKey],
				jobSeekerUserId: userIds[room.seekerKey],
				isBlocked: false,
			})
			.onConflictDoUpdate({
				target: chatRoom.id,
				set: { isBlocked: false, updatedAt: now },
			});

		const messageRows = room.messages.map((message, index) => ({
			id: richId("4a4a4a4a", room.n * 100 + index),
			chatRoomId: roomId,
			senderUserId: userIds[message.senderKey],
			body: message.body,
			riskFlags: [] as string[],
			createdAt: new Date(
				`2026-06-${(15 + room.n).toString().padStart(2, "0")}T0${index}:30:00.000Z`
			),
		}));
		await db.insert(chatMessage).values(messageRows);

		await db.insert(review).values({
			id: richId("5a5a5a5a", room.n),
			jobPostId: room.jobPostId,
			organizationId: room.organizationId,
			chatRoomId: roomId,
			reviewerUserId: userIds[room.seekerKey],
			rating: room.rating,
			body: room.reviewBody,
			status: "published",
			riskFlags: [],
		});
	}
};

const seedRichReports = async (
	userIds: Record<DevUserKey, string>,
	now: Date
): Promise<void> => {
	await db
		.insert(report)
		.values([
			{
				id: richId("7a7a7a7a", 1),
				reporterUserId: userIds.seekerC,
				targetType: "job_post",
				targetId: richId("2a2a2a2a", 16),
				reason: "고수익 보장 문구가 의심됩니다",
				details: "반려된 공고에 대한 추가 신고 샘플입니다.",
				status: "reviewing",
			},
			{
				id: richId("7a7a7a7a", 2),
				reporterUserId: userIds.seekerB,
				targetType: "chat_message",
				targetId: richId("4a4a4a4a", 500),
				reason: "외부 메신저 유도 의심",
				details: "개발 seed용 채팅 신고 샘플입니다.",
				status: "open",
			},
			{
				id: richId("7a7a7a7a", 3),
				reporterUserId: userIds.seekerF,
				targetType: "review",
				targetId: richId("5a5a5a5a", 9),
				reason: "허위 후기로 의심됩니다",
				details: "리뷰 신고 샘플입니다. 운영팀 확인이 필요합니다.",
				status: "open",
			},
			{
				id: richId("7a7a7a7a", 4),
				reporterUserId: userIds.seekerG,
				targetType: "job_post",
				targetId: richId("2a2a2a2a", 37),
				reason: "사업장 인증 전 공고로 보입니다",
				details: "검수 대기 공고에 대한 신고 샘플입니다.",
				status: "reviewing",
			},
			{
				id: richId("7a7a7a7a", 5),
				reporterUserId: userIds.seekerH,
				targetType: "user",
				targetId: userIds.pendingOwner,
				reason: "반복적인 부적절 응대 신고",
				details: "이미 처리 완료된 신고 샘플입니다.",
				status: "resolved",
			},
		])
		.onConflictDoUpdate({
			target: report.id,
			set: { updatedAt: now },
		});
};

// 수다방 글 createdAt: 결정론적 고정 날짜(2026-07). n이 클수록 최신.
const communityPostDate = (n: number): Date =>
	new Date(
		`2026-07-${(5 + n).toString().padStart(2, "0")}T${(9 + (n % 12)).toString().padStart(2, "0")}:00:00.000Z`
	);

const seedCommunityPosts = async (
	userIds: Record<DevUserKey, string>
): Promise<void> => {
	const rows = communityPosts.map((post) => {
		const createdAt = communityPostDate(post.n);
		return {
			id: richId("cacacaca", post.n),
			board: post.board,
			authorUserId: userIds[post.authorKey],
			authorDisplayName: post.authorDisplayName,
			passwordHash: post.password ? hashCommunityPassword(post.password) : "",
			isLocked: post.isLocked ?? false,
			authorRole: devUserRoleByKey[post.authorKey],
			isPromotion: post.isPromotion ?? false,
			title: post.title,
			body: post.body,
			viewCount: post.viewCount ?? 0,
			status: "published" as const,
			createdAt,
			updatedAt: createdAt,
		};
	});

	await db
		.insert(communityPost)
		.values(rows)
		.onConflictDoUpdate({
			target: communityPost.id,
			set: { updatedAt: new Date() },
		});

	// 배치 insert는 신규 행만 채운다. 재실행 시 변경된 본문·표시명 등을 반영하도록
	// id별로 개별 갱신한다(seedRichJobs와 동일 패턴). passwordHash는 salt가 매 실행
	// 달라지므로 갱신에서 제외해 재실행 시 값이 요동치지 않게 유지한다.
	for (const row of rows) {
		await db
			.update(communityPost)
			.set({
				board: row.board,
				authorDisplayName: row.authorDisplayName,
				isLocked: row.isLocked,
				authorRole: row.authorRole,
				isPromotion: row.isPromotion,
				title: row.title,
				body: row.body,
				viewCount: row.viewCount,
				status: row.status,
				updatedAt: row.updatedAt,
			})
			.where(eq(communityPost.id, row.id));
	}
};

const seedRichCatalog = async (
	userIds: Record<DevUserKey, string>
): Promise<void> => {
	const now = new Date();

	await seedRichOrganizations(userIds, now);
	await seedRichJobs(userIds, now);
	await seedRichPromotions(userIds, now);
	await seedRichConversations(userIds, now);
	await seedRichReports(userIds, now);
	await seedCommunityPosts(userIds);
};

const main = async (): Promise<void> => {
	const userIds = await seedUsers();
	await seedOrganizations(userIds);
	await seedEmployerProfiles();
	await seedJobs(userIds);
	await seedConversation(userIds);
	await seedRichCatalog(userIds);

	console.log("Bambi development seed completed.");
	console.log(`Password for all dev accounts: ${DEV_PASSWORD}`);
	for (const devUser of devUsers) {
		console.log(`- ${devUser.email} (${devUser.role})`);
	}
	console.log(`Verified organization: ${ids.lunaOrganization}`);
	console.log(`Pending organization: ${ids.pendingOrganization}`);
	console.log(
		`Rich catalog: ${richOrganizations.length} extra orgs, ${richJobs.length} extra job posts, ${richRooms.length} chat rooms with reviews, ${communityPosts.length} community posts.`
	);
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
