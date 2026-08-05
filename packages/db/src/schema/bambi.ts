import { relations, sql } from "drizzle-orm";
import {
	type AnyPgColumn,
	boolean,
	check,
	index,
	integer,
	jsonb,
	pgEnum,
	pgTable,
	text,
	timestamp,
	uniqueIndex,
	uuid,
	varchar,
} from "drizzle-orm/pg-core";

import { organization, team, user } from "./auth";

// guest는 계정이 없는 비회원 작성자(성인인증 통과 게스트 토큰)를 가리키는 스냅샷 값이며
// user.role로는 저장되지 않는다 — 수다방 글·댓글의 author_role에만 쓰인다.
// 마이그레이션 호환을 위해 새 값은 항상 목록 끝에 덧붙인다(ALTER TYPE ... ADD VALUE).
export const bambiUserRole = pgEnum("bambi_user_role", [
	"job_seeker",
	"employer",
	"admin",
	"guest",
	// 무료 법률 자문 게시판(legal) 전용 계정. 운영자가 구직자 계정을 지정·해제하며
	// 해당 게시판의 잠금글만 열람·답변할 수 있다(다른 보드 잠금글은 일반 회원과 동일).
	"legal_advisor",
]);

export const accountStatus = pgEnum("account_status", [
	"active",
	"warned",
	"suspended",
]);

// 성별. 휴대폰 본인인증 결과로 채워진다(1남/2여 → male/female). 게스트는 프로필이
// 없어 쿠키에만 남고, 정식 회원은 이 컬럼에 저장된다. 여성/광고 업소 회원만 입장하는
// 수다방 접근 판정에 쓰인다.
export const bambiGender = pgEnum("bambi_gender", ["male", "female"]);

export const employerVerificationStatus = pgEnum(
	"employer_verification_status",
	["none", "pending", "verified", "rejected"]
);

// on_hold(검수 보류)는 hidden(운영자 강제 숨김)과 구분되는 검수 축 상태다 — 둘을 같은
// hidden으로 저장하면 구인자 목록에 "숨김"으로 보여 보류 사유를 알 수 없다.
// 마이그레이션 호환을 위해 새 값은 항상 목록 끝에 덧붙인다(ALTER TYPE ... ADD VALUE).
export const jobPostStatus = pgEnum("job_post_status", [
	"draft",
	"pending_review",
	"published",
	"hidden",
	"rejected",
	"on_hold",
]);

// 업종 카테고리. 운영이 확정한 9종으로 고정하며, 값 자체가 화면 표기(한국어·BAR)다 —
// 별도 라벨 맵 없이 그대로 렌더한다. 표기를 바꿀 일이 생기면 ALTER TYPE ... RENAME VALUE로
// 값 자체를 바꾼다(자유 입력이던 기존 text 컬럼을 enum으로 좁혀 오타·비표준 값을 차단).
// "기타"는 맨 끝에 둔다 — 원본 사이트가 "기타 - 기타업종"으로 내보내는 공고를 받는 자리이고,
// 목록·Select에서도 구체 업종 뒤에 오는 게 자연스럽다.
export const jobIndustryCategory = pgEnum("job_industry_category", [
	"룸싸롱",
	"텐프로/쩜오",
	"노래주점",
	"단란주점",
	"다방",
	"BAR",
	"마사지",
	"요정",
	"기타",
]);

export const jobExposureType = pgEnum("job_exposure_type", [
	"premium-banner",
	"left-banner",
	"right-banner",
	"special",
	"urgent",
	"recommended",
	"standard",
]);

export const jobPaymentMethod = pgEnum("job_payment_method", [
	"card",
	"bank_transfer",
]);

export const jobPaymentStatus = pgEnum("job_payment_status", [
	"unpaid",
	"paid",
]);

export const interviewStatus = pgEnum("interview_status", [
	"proposed",
	"confirmed",
	"declined",
	"canceled",
	"completed",
]);

export const reportStatus = pgEnum("report_status", [
	"open",
	"reviewing",
	"resolved",
	"dismissed",
]);

export const reviewStatus = pgEnum("review_status", [
	"published",
	"pending_review",
	"hidden",
]);

export const moderationTargetType = pgEnum("moderation_target_type", [
	"job_post",
	"chat_room",
	"chat_message",
	"review",
	"user",
	"community_post",
	"community_comment",
	"support_inquiry",
	"support_inquiry_message",
	"team_invitation",
]);

// 수다방 게시판. 베스트글은 저장 컬럼이 아니라 추천수 큐레이션 가상 게시판이다.
// notice(공지사항)는 admin만 작성 가능(API 강제).
export const communityBoard = pgEnum("community_board", [
	"free",
	"work_talk",
	"market",
	"notice",
	// 무료 법률 자문. 글이 전부 잠금(비밀번호 필수)이라 목록에는 마스킹 제목만 보인다.
	// 마이그레이션 호환을 위해 새 값은 항상 끝에 덧붙인다.
	"legal",
]);

// 글·댓글 공용 상태. 삭제는 소프트(deleted), hidden은 후속 운영자 숨김용 예약값.
export const communityContentStatus = pgEnum("community_content_status", [
	"published",
	"hidden",
	"deleted",
]);

// 고객센터 문의 분류. FAQ도 같은 분류를 재사용한다(사용자가 같은 기준으로 찾게).
export const supportInquiryCategory = pgEnum("support_inquiry_category", [
	"account",
	"job_post",
	"payment",
	"report",
	"etc",
]);

// 문의 진행 상태. 운영 조치 상태(community_content_status)와는 별개 축이다 —
// answered면서 hidden일 수 있다.
export const supportInquiryStatus = pgEnum("support_inquiry_status", [
	"open",
	"answered",
	"closed",
]);

export const promotionTier = pgEnum("promotion_tier", [
	"premium",
	"recommended",
	"standard",
]);

export const promotionStatus = pgEnum("promotion_status", [
	"draft",
	"pending_payment",
	"active",
	"paused",
	"expired",
	"canceled",
]);

export const adPlacementKind = pgEnum("ad_placement_kind", [
	"listing",
	"banner",
]);

export const adPreviewTemplate = pgEnum("ad_preview_template", [
	"premium-top",
	"special-list",
	"urgent-list",
	"recommended-list",
	"side-vertical",
	"side-horizontal",
	"none",
]);

export const jobPerformanceEventType = pgEnum("job_performance_event_type", [
	"impression",
	"detail_view",
	"chat_start",
	"contact_reveal",
]);

// cover = 목록 카드 썸네일, detail = 상세 이미지.
// ad_horizontal(7:3) = 좌측·프리미엄 슬롯, ad_vertical(4:9) = 우측 사이드 슬롯.
// 광고 배너는 광고 상품을 신청·결제한 공고만 노출되지만, 이미지는 공고 등록 시 함께 받는다.
export const jobPostMediaUsage = pgEnum("job_post_media_usage", [
	"cover",
	"detail",
	"ad_horizontal",
	"ad_vertical",
]);

export const chatAttachmentCategory = pgEnum("chat_attachment_category", [
	"image",
	"pdf",
]);

// 크롤링 대상 사이트. 파서가 사이트마다 하나씩이라 값이 곧 파서 선택 키다.
// queenalba는 사이트 전체가 KCB 본인확인 기반 성인인증 게이트(/okname/phone_popup2.php,
// /okname/ipin2.php) 뒤에 있어, 운영자가 본인 인증 세션의 쿠키를 넣어줘야 목록·상세가 열린다.
// enum 값은 두되 실제 수집기(파서·쿠키 주입)는 아직 미구현이라, 운영자가 이 사이트를 골라도
// 수집기는 "준비 중"으로 회차를 만들지 않고 빠져나온다(빈 응답을 만료로 오해하지 않게).
export const crawlSourceSite = pgEnum("crawl_source_site", [
	"foxalba",
	"queenalba",
]);

// 수집 데이터 종류. 공고는 crawled_job_post, 커뮤니티(게시판)는 crawled_community_topic로
// 각각 다른 파서·테이블로 간다. 운영자가 사이트와 함께 이 값을 골라, 한 회차에 한 종류만 긁는다.
export const crawlContentType = pgEnum("crawl_content_type", [
	"job_post",
	"community",
]);

// job_post의 출처. 크롤링 원본은 job_post가 아니라 crawled_job_post에 살기 때문에
// 여기에는 "crawled"가 없다 — 크롤링 공고가 job_post로 넘어오는 유일한 경로가 전환이다.
// 이 경계 덕분에 결제·부스트·채팅·리뷰가 "크롤링이면 예외" 분기를 달지 않아도 된다.
export const jobPostSource = pgEnum("job_post_source", [
	"original",
	"converted",
]);

// 수집 공고의 생애. needs_review는 원본 업종이 우리 8종 enum에 매핑되지 않아 운영자가
// 손으로 이어줘야 하는 상태다(매핑 실패를 버리지 않고 남긴다).
//
// removed는 운영자가 내린 공고다. 행을 실제로 지우지 않는 이유는 원본 사이트에 글이 살아
// 있는 한 다음 회차 upsert가 같은 (사이트, 원본ID)로 행을 되살리기 때문이다 — 삭제는
// 재수집을 견디는 톰스톤이어야 한다. 그래서 이 값은 upsert·만료 스윕이 절대 덮지 않는다
// (bambi-crawl-ingest.ts).
export const crawledPostStatus = pgEnum("crawled_post_status", [
	"active",
	"needs_review",
	"expired",
	"removed",
]);

// 수집 회차 결과. aborted_low_yield는 파싱 성공률이 임계치 아래여서 아무것도 커밋하지 않고
// 중단한 경우다 — 상대가 마크업을 바꿔 0건이 파싱된 것을 "공고가 사라졌다"로 오해해
// 전량 만료시키는 사고를 막는 장치다.
export const crawlRunStatus = pgEnum("crawl_run_status", [
	"running",
	"success",
	"failed",
	"aborted_low_yield",
]);

export const jobDescriptionBlockTypes = [
	"paragraph",
	"heading",
	"bullet_list",
	"callout",
] as const;

export type JobDescriptionBlockType = (typeof jobDescriptionBlockTypes)[number];

export interface JobDescriptionBlock {
	id: string;
	text: string;
	type: JobDescriptionBlockType;
}

// 본인인증 건 발급 기록. 인증창에 넘길 identityVerificationId를 서버가 발급하면서
// 한 행을 남기고, 그 뒤로는 "우리가 시작시킨 인증인가 · 아직 안 썼는가 · 발급 후
// 유효시간 안인가"를 이 표로 판정한다. 예전에는 클라이언트가 ID를 직접 만들어서
// 서버가 발급 사실을 몰랐고, 같은 ID를 몇 번이든 다시 쓸 수 있었다
// (본인확인서비스 이용기관 취약점 자체점검 항목 4 — 인증정보 재사용 차단).
// 개인정보는 담지 않는다 — 인증 결과는 프로필로만 들어간다.
export const bambiIdentityVerification = pgTable(
	"bambi_identity_verification",
	{
		// 서버가 만든 `iv-<uuid>` 값. 포트원 인증 건 식별자와 동일한 값이라 PK로 쓴다.
		id: text("id").primaryKey(),
		issuedAt: timestamp("issued_at").defaultNow().notNull(),
		// 최종 소비(가입·재인증 완료) 시각. null이면 아직 쓰이지 않은 인증 건이다.
		consumedAt: timestamp("consumed_at"),
	},
	(table) => [
		// 만료·소진된 오래된 행 정리(운영 배치)용. 발급 시각 범위 조회를 받쳐 준다.
		index("bambi_identity_verification_issued_at_idx").on(table.issuedAt),
	]
);

// 본인인증 수집 로그. 실인증이 확인될 때마다 생년월일·번호·성별과 구분(비회원/구직자/
// 구인자)을 사람당 1행으로 남긴다 — (birth_date, phone_number)가 사람 식별 upsert 키.
// 같은 사람이 재인증하면(포트원 인증 건 ID는 매번 새로 발급) 기존 행을 갱신한다.
// 이름은 담지 않는다(PII 최소화).
// 개발자 SQL 전용 표다 — 조회 프로시저·관리자 화면을 만들지 않는다(쓰기 코드만 존재).
// bambi_identity_verification(발급 기록)에 FK를 걸지 않는다: 그쪽은 만료 행을 정리하는
// 대상이라 cascade로 수집 로그까지 사라지면 안 된다.
export const bambiIdentityVerificationLog = pgTable(
	"bambi_identity_verification_log",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		// 이 행을 마지막으로 갱신한 포트원 인증 건 ID(최근 인증 건 추적용).
		identityVerificationId: text("identity_verification_id").notNull(),
		phoneNumber: text("phone_number"),
		// YYYYMMDD 8자리(bambi_profile.birth_date와 같은 컨벤션).
		birthDate: varchar("birth_date", { length: 8 }).notNull(),
		gender: bambiGender("gender"),
		// 구분 — guest/job_seeker/employer. 가입 전 인증은 아직 모르므로 null이고,
		// 가입이 끝나면 그 역할로 덮어쓴다.
		kind: bambiUserRole("kind"),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at")
			.defaultNow()
			.$onUpdate(() => /* @__PURE__ */ new Date())
			.notNull(),
	},
	(table) => [
		index("bambi_identity_verification_log_iv_id_idx").on(
			table.identityVerificationId
		),
		// 사람 식별 upsert 키. phone_number가 null인 행은 사람을 특정할 수 없어 제외.
		uniqueIndex("bambi_identity_verification_log_person_uidx")
			.on(table.birthDate, table.phoneNumber)
			.where(sql`${table.phoneNumber} IS NOT NULL`),
	]
);

export const bambiProfile = pgTable(
	"bambi_profile",
	{
		userId: text("user_id")
			.primaryKey()
			.references(() => user.id, { onDelete: "cascade" }),
		role: bambiUserRole("role").notNull(),
		status: accountStatus("status").default("active").notNull(),
		isPhoneVerified: boolean("is_phone_verified").default(false).notNull(),
		phoneNumber: text("phone_number"),
		gender: bambiGender("gender"),
		// 본인인증 시 입력받는 생년월일. 목 인증 폼과 동일하게 8자리 YYYYMMDD 문자열로 저장한다.
		birthDate: text("birth_date"),
		// 본인인증 CI(연계정보)의 SHA-256 해시. 원문은 저장하지 않는다. 유니크 인덱스로
		// 같은 사람이 여러 계정에서 인증하는 것을 막는다(null 다중 허용 — 미인증 계정).
		ciHash: text("ci_hash"),
		// 본인인증 DI(사이트별 중복확인정보)의 SHA-256 해시. 원문은 저장하지 않는다.
		// 중복 가입 판정의 기준 축이며, 유니크 인덱스로 같은 사람이 여러 계정에서
		// 인증하는 것을 막는다(null 다중 허용 — 미인증 계정).
		diHash: text("di_hash"),
		// 광고(프로모션) 중인 업소(owner/admin) 표시 캐시. 진실값은 조회 시 캠페인 조인으로
		// 파생 계산하며(bambi-advertiser), 이 컬럼은 activate/pause 이벤트에서 동기화된다.
		isAdvertiser: boolean("is_advertiser").default(false).notNull(),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at")
			.defaultNow()
			.$onUpdate(() => /* @__PURE__ */ new Date())
			.notNull(),
	},
	(table) => [
		index("bambi_profile_role_idx").on(table.role),
		index("bambi_profile_status_idx").on(table.status),
		uniqueIndex("bambi_profile_ci_hash_unique").on(table.ciHash),
		uniqueIndex("bambi_profile_di_hash_unique").on(table.diHash),
	]
);

export const employerOrganizationProfile = pgTable(
	"employer_organization_profile",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		organizationId: text("organization_id")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		displayName: text("display_name").notNull(),
		businessRegistrationNumber: text("business_registration_number"),
		verificationStatus: employerVerificationStatus("verification_status")
			.default("none")
			.notNull(),
		verificationNote: text("verification_note"),
		// 국세청 진위확인 입력값 — 사업자번호만으로는 대조가 안 되고 대표자명·개업일자가 함께
		// 필요하다. 기능 도입 전 행에는 값이 없어 null 허용이다.
		representativeName: text("representative_name"),
		// 개업일자 YYYYMMDD 8자리(본인인증 birth8과 같은 컨벤션 — 시각이 없는 날짜라 text).
		businessStartDate: text("business_start_date"),
		// 국세청 대조 성공 시각·납세자 상태 코드(b_stt_cd 원값). 둘 다 null이면 운영자에게는
		// "미확인"이다(키 미설정·국세청 장애로 판정하지 못한 제출).
		biznumCheckedAt: timestamp("biznum_checked_at"),
		biznumStatusCode: text("biznum_status_code"),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at")
			.defaultNow()
			.$onUpdate(() => /* @__PURE__ */ new Date())
			.notNull(),
	},
	(table) => [
		uniqueIndex("employer_organization_profile_organization_id_uidx").on(
			table.organizationId
		),
		index("employer_organization_profile_verification_status_idx").on(
			table.verificationStatus
		),
	]
);

// 지역 마스터. 시/도 행(sigungu = null)과 그 아래 시/군/구 행이 한 테이블에 같이 산다 —
// 두 테이블로 쪼개면 공고의 region_code·district_code가 서로 다른 테이블을 가리켜 FK가
// 두 벌이 되고, "이 코드가 어느 레벨인가"를 컬럼 이름으로만 알게 된다.
//
// PK는 법정동코드 10자리(시도 2 + 시군구 3 + 00000)다. 우리가 만든 일련번호가 아니라
// 정부 표준 코드라 외부 데이터(주소 API·통계)와 나중에 그대로 이어붙는다.
//
// label은 **표출용 약칭**이라 법정동 원문과 다르다("서울특별시"가 아니라 "서울"). 화면에
// 그대로 나가는 값이고, 같은 label을 공유하는 시군구 행들이 그 시/도의 자식이 된다.
export const region = pgTable("region", {
	code: varchar("code", { length: 10 }).primaryKey(),
	label: text("label").notNull(),
	// null이면 시/도 행이다. 값이 있으면 같은 label 아래의 시/군/구 행.
	sigungu: text("sigungu"),
	// 시/도 행은 지역 노출 순서(1~16), 시/군/구 행은 같은 label 안에서의 순서다.
	sortOrder: integer("sort_order").notNull(),
	// 운영이 특정 지역을 목록에서 내릴 때 쓴다. 행을 지우면 그 코드를 참조하는 공고가
	// 통째로 막히므로 삭제 대신 이 플래그로만 내린다(그래서 FK에 onDelete를 두지 않았다).
	isActive: boolean("is_active").default(true).notNull(),
});
// 인덱스를 따로 두지 않는다 — 전체가 245행이고 유일한 조회가 "활성 행 전량"이라 PK 외에
// 어떤 인덱스도 플래너가 쓰지 않는다. 참조 무결성 검사는 PK로 끝난다.

export const employerTeamProfile = pgTable(
	"employer_team_profile",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		organizationId: text("organization_id")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		teamId: text("team_id")
			.notNull()
			.references(() => team.id, { onDelete: "cascade" }),
		displayName: text("display_name").notNull(),
		// 표시용 지역 문자열. region_code가 붙은 뒤로는 파생값(라벨 복사본)이며, 코드가 없는
		// 구 데이터의 폴백으로 남겨둔다.
		region: text("region"),
		regionCode: varchar("region_code", { length: 10 }).references(
			() => region.code
		),
		districtCode: varchar("district_code", { length: 10 }).references(
			() => region.code
		),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at")
			.defaultNow()
			.$onUpdate(() => /* @__PURE__ */ new Date())
			.notNull(),
	},
	(table) => [
		uniqueIndex("employer_team_profile_team_id_uidx").on(table.teamId),
		index("employer_team_profile_organization_id_idx").on(table.organizationId),
	]
);

// 외부 사이트에서 수집한 공고 원본. job_post와 한 테이블에 섞지 않는 이유는 소유자가 없기
// 때문이다 — job_post는 organization_id와 created_by_user_id가 NOT NULL이라 크롤링 행에
// 붙일 주인이 없고, 억지로 합성 계정을 붙이면 그 조직이 업소 목록·검색·채팅·통계 전반에
// 유령으로 섞인다. 업체가 실제로 가입해 전환될 때만 job_post 행이 생긴다.
export interface CrawledJobEditedImageAsset {
	dataUrl: string;
	height: number;
	id: string;
	width: number;
}

export interface CrawledJobEditedImageItem {
	assetId: string;
	displayHeightPx: number | null;
	displayWidthPx: number | null;
	id: string;
}

export interface CrawledJobEditedImageDocument {
	assets: CrawledJobEditedImageAsset[];
	items: CrawledJobEditedImageItem[];
	version: 1;
}

export const crawledJobPost = pgTable(
	"crawled_job_post",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		sourceSite: crawlSourceSite("source_site").notNull(),
		// 상세 URL에서 뽑은 원본 식별자(foxalba o_idx, queenalba num). 사이트와 묶어 유니크라
		// 재수집이 멱등이 된다.
		sourceExternalId: text("source_external_id").notNull(),
		sourceUrl: text("source_url").notNull(),
		title: text("title").notNull(),
		// 공고에 내걸린 업소 표시명(원본 "닉네임/업소명"). 사업자등록 상호인 biz_name과 다른
		// 축이라 따로 둔다 — 이쪽은 간판이라 공개해도 되고, biz_name은 운영자 전용 리드다.
		shopName: text("shop_name"),
		// 정규화 본문. 연락처 마스킹을 적용한 뒤 저장한다 — 유흥 공고는 본문에 연락처를
		// 대문짝만하게 박아두기 때문에, 필드만 가리고 본문을 그대로 두면 아무것도 가린 게 아니다.
		// 원문 HTML은 보관하지 않는다(Cheditor 산출물이라 스크립트·인라인 스타일이 섞여 있다).
		body: text("body").notNull(),
		// 원본이 준 지역 문자열("서울" / "강남구"). 아래 코드 두 칸은 이 문자열을 지역
		// 마스터에 대조해 해석한 결과이고, 대조에 실패하면 코드만 null로 남고 원문은 그대로
		// 보존된다 — 원본 표기가 우리 표준과 어긋난다고 공고를 버리지는 않는다.
		region: text("region"),
		district: text("district"),
		regionCode: varchar("region_code", { length: 10 }).references(
			() => region.code
		),
		districtCode: varchar("district_code", { length: 10 }).references(
			() => region.code
		),
		// 원본 업종 문자열. 우리 8종 enum에 매핑되지 않아도 버리지 않고 남겨서
		// 운영자가 손으로 잇게 한다(status = needs_review).
		industryRaw: text("industry_raw"),
		industryCategory: jobIndustryCategory("industry_category"),
		// 파싱 전 급여 원문("일 15만원", "협의"). 파싱 결과가 틀렸을 때 근거로 되짚는다.
		payRaw: text("pay_raw"),
		payAmount: integer("pay_amount"),
		payUnit: text("pay_unit"),
		workSchedule: text("work_schedule"),
		gender: text("gender"),
		ageRange: text("age_range"),
		// 운영자 전용 영업 리드. 공개 API의 select에서 제외한다 — 원본 사이트에 연락처를 올린
		// 담당자는 그 사이트 이용자에게 연락받는 데 동의했을 뿐 다른 서비스에서의 재공개에
		// 동의한 적이 없고, 업종 특성상 통제 못 하는 확산은 실제 피해로 이어진다.
		contactName: text("contact_name"),
		// 예외. 2026-07-30 사용자 결정으로 공개 상세에 자동 노출한다(순수 공고 상세와 같은 구성) —
		// 원본 사이트에서도 구직자에게 그대로 공개돼 있던 번호다. 나머지 리드 컬럼은 위 원칙 그대로다.
		contactPhone: text("contact_phone"),
		contactKakao: text("contact_kakao"),
		bizName: text("biz_name"),
		address: text("address"),
		// 정규화 필드 전체의 해시. 값이 같으면 재수집 시 last_seen_at만 갱신하고 UPDATE를 건너뛴다.
		contentHash: text("content_hash").notNull(),
		status: crawledPostStatus("status").default("active").notNull(),
		firstSeenAt: timestamp("first_seen_at").defaultNow().notNull(),
		// 목록에서 이 공고를 마지막으로 본 시각. 원본에서 사라져도 즉시 지우지 않고 이 값이
		// 낡으면 expired로 넘긴다(일시 장애로 전량이 날아가는 사고 방어).
		lastSeenAt: timestamp("last_seen_at").defaultNow().notNull(),
		// 상세 페이지를 마지막으로 받은 시각. 목록만 보면 생존 여부는 알 수 있어도 내용 변경은
		// 알 수 없어, 이 값을 기준으로 상세를 다시 받을 대상을 고른다. last_seen_at과 분리한
		// 이유는 매 회차 목록으로 갱신되는 값과 섞이면 재수집 판정이 무너지기 때문이다.
		detailFetchedAt: timestamp("detail_fetched_at"),
		sourcePostedAt: timestamp("source_posted_at"),
		// 원본이 내건 마감일자. 접수기간의 끝(source_posted_at은 그 시작)이라 "이미 끝난 공고를
		// 계속 보여주는" 상황을 이 값으로만 가려낼 수 있다. 원본에 없는 사이트가 있어 nullable.
		sourceDeadlineAt: timestamp("source_deadline_at"),
		// 원본에서 이 공고가 어느 자리에 걸려 있었는지. 일반 목록 공고와 메인 상단의 유료 노출
		// (광고 배너·우대채용·스페셜채용)은 같은 공고여도 값어치가 다르다 — 돈을 낸 자리라
		// 그 사이트가 지금 무엇을 밀고 있는지의 신호가 된다. null은 아직 분류 전(구 수집분).
		listingType: text("listing_type"),
		// 아래 네 칸에는 원본 URL이 아니라 **base64 data URI**가 들어간다
		// (`data:image/jpeg;base64,...`). 원본을 핫링크하면 상대가 파일을 지우거나 referer로
		// 막는 순간 우리 화면이 깨지고, 버킷 업로드는 로컬 자격증명 없이 조용히 실패해 네 칸이
		// 전부 null로 남았다. data URI도 URI라서 컬럼 이름은 그대로 두고 <img src>에 직행한다.
		// 크기 상한은 bambi-crawl-media.ts(한 장 2MB·공고당 8MB)에서 지킨다.
		//
		// 목록·카드에 걸린 대표 이미지(실측 16KB GIF → base64 21KB).
		thumbnailUrl: text("thumbnail_url"),
		// 광고 배너 자리에서 온 공고의 배너 이미지. 가로형과 세로형은 자리도 비율도 달라
		// 서로를 대신할 수 없으므로 한 칸에 섞지 않는다(우리 광고 상품의 ad_horizontal /
		// ad_vertical과 같은 축이다). 원본이 한쪽만 걸어두는 경우가 흔해 각각 nullable.
		bannerHorizontalUrl: text("banner_horizontal_url"),
		bannerVerticalUrl: text("banner_vertical_url"),
		// 상세 본문에 박혀 있던 이미지들. 유흥 공고는 조건 대부분을 이미지로만 적어두는 경우가
		// 많아, 본문 텍스트만 저장하면 정작 핵심 정보가 빠진다(실측: 본문 텍스트는 거의 없고
		// 1.4MB JPG 한 장이 공고 내용 전부였다). 순서를 유지해야 의미가 사므로 배열.
		//
		// 이 칸은 목록 쿼리에서 고르지 말 것 — 한 장이 base64 1.8MB다.
		detailImageUrls: jsonb("detail_image_urls")
			.$type<string[]>()
			.default([])
			.notNull(),
		// 크롤링 원본은 위 배열에 보존하고 운영자가 확정한 배치·크롭 결과만 별도 저장한다.
		// null은 원본 폴백, items: []는 의도적으로 상세 이미지를 모두 숨긴 상태다.
		editedDetailImageDocument: jsonb("edited_detail_image_document")
			.$type<CrawledJobEditedImageDocument | null>()
			.default(null),
		detailImagesEditedAt: timestamp("detail_images_edited_at"),
		detailImagesEditedByUserId: text(
			"detail_images_edited_by_user_id"
		).references(() => user.id, { onDelete: "set null" }),
		detailImageEditRevision: integer("detail_image_edit_revision")
			.default(0)
			.notNull(),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at")
			.defaultNow()
			.$onUpdate(() => /* @__PURE__ */ new Date())
			.notNull(),
	},
	(table) => [
		uniqueIndex("crawled_job_post_source_uidx").on(
			table.sourceSite,
			table.sourceExternalId
		),
		index("crawled_job_post_status_last_seen_at_idx").on(
			table.status,
			table.lastSeenAt
		),
		index("crawled_job_post_discovery_idx").on(
			table.status,
			table.industryCategory,
			table.regionCode
		),
	]
);

// 수집 커뮤니티 글의 댓글 한 건. jsonb 컬럼에 통째로 담으므로 날짜는 timestamp가 아니라
// ISO 문자열로 굳힌다(jsonb에는 Date 타입이 없다). authorName은 원본 공개 필명(실명 아님),
// 날짜는 대댓글처럼 표기가 없는 경우가 있어 null 허용.
export interface CrawledCommunityCommentRecord {
	authorName: string | null;
	body: string;
	sourcePostedAt: string | null;
}

// 외부 게시판에서 뽑는 주제 신호. 제목과 반응 지표만 담고 본문은 저장하지 않는다 —
// 게시글은 개별 작성자의 저작물이고, 남의 글을 community_post에 넣으려면 우리 회원 ID와
// 가짜 글 비밀번호를 붙여야 해서 "남이 쓴 글이 우리 회원 얼굴로 서는" 구조가 된다.
// 대신 "어떤 주제가 실제로 반응을 얻는가"만 운영 참고자료로 쓰고 시드 글은 운영이 직접 쓴다.
export const crawledCommunityTopic = pgTable(
	"crawled_community_topic",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		sourceSite: crawlSourceSite("source_site").notNull(),
		sourceExternalId: text("source_external_id").notNull(),
		sourceUrl: text("source_url").notNull(),
		boardName: text("board_name"),
		title: text("title").notNull(),
		// 정규화 본문. 목록에는 없고 상세를 따로 받아야 채워진다(그래서 nullable —
		// 아직 상세를 안 받았거나 파싱에 실패한 주제는 null로 남고 다음 회차가 다시 시도한다).
		// 연락처 마스킹은 공고와 같은 이유로 여기서도 적용한다: 유흥 커뮤니티 글은 본문에
		// 번호·카톡을 그대로 박아둔다.
		body: text("body"),
		// 조회수는 목록에 안 나온다(공지 행에만 채워진다). 상세를 받아야 알 수 있어서
		// 목록 패스는 이 값을 건드리지 않는다 — 건드리면 매 회차 null로 되돌린다.
		viewCount: integer("view_count"),
		commentCount: integer("comment_count"),
		// 상세에서 함께 수집하는 댓글. 본문(body)과 같은 이유로 nullable이되, 여기선 null과 []의
		// 구분이 백필 판정 기준이다: null = 아직 상세를 안 받아 미수집, [] = 상세를 받았고 댓글이
		// 0개. 이 구분이 없으면 "댓글 없는 글"과 "아직 안 받은 글"이 뭉개져 매 회차 다시 받는다.
		comments: jsonb("comments").$type<CrawledCommunityCommentRecord[]>(),
		sourcePostedAt: timestamp("source_posted_at"),
		// 운영자가 이 글을 내린 시각. null이면 노출 중이다. 공고와 달리 상태 enum이 없어
		// 컬럼 하나로 톰스톤을 세운다 — 행을 지우면 원본이 살아 있는 한 다음 회차 upsert가
		// 같은 (사이트, 원본ID)로 되살린다. 목록 패스의 upsert set 목록에 이 칸이 없으므로
		// 재수집이 자연히 값을 유지한다(bambi-crawl-ingest.ts runCommunityPass).
		removedAt: timestamp("removed_at"),
		firstSeenAt: timestamp("first_seen_at").defaultNow().notNull(),
		lastSeenAt: timestamp("last_seen_at").defaultNow().notNull(),
	},
	(table) => [
		uniqueIndex("crawled_community_topic_source_uidx").on(
			table.sourceSite,
			table.sourceExternalId
		),
		index("crawled_community_topic_seen_idx").on(
			table.sourceSite,
			table.lastSeenAt
		),
	]
);

// 수집 회차 기록. DOM 크롤링의 운영 비용은 대부분 셀렉터가 소리 없이 깨지는 데서 나오므로,
// 회차별 수율을 남겨야 파손을 알아챌 수 있다.
export const crawlRun = pgTable(
	"crawl_run",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		sourceSite: crawlSourceSite("source_site").notNull(),
		// 이 회차가 무엇을 긁었는지. 사이트만 남기면 "퀸알바 회차"가 공고인지 게시판인지
		// 구분되지 않아, 회차 목록이 파손 신호를 읽는 창구 역할을 못 한다.
		contentType: crawlContentType("content_type").default("job_post").notNull(),
		status: crawlRunStatus("status").default("running").notNull(),
		startedAt: timestamp("started_at").defaultNow().notNull(),
		finishedAt: timestamp("finished_at"),
		pagesFetched: integer("pages_fetched").default(0).notNull(),
		itemsSeen: integer("items_seen").default(0).notNull(),
		itemsNew: integer("items_new").default(0).notNull(),
		itemsUpdated: integer("items_updated").default(0).notNull(),
		itemsFailed: integer("items_failed").default(0).notNull(),
		error: text("error"),
	},
	(table) => [
		index("crawl_run_source_site_started_at_idx").on(
			table.sourceSite,
			table.startedAt
		),
		// 사이트당 진행 중 회차는 하나뿐이다. 운영자의 "즉시 수집"과 스케줄러 틱이 겹치거나
		// 버튼을 연달아 누르면 같은 목록을 두 번 긁게 되는데, 애플리케이션 쪽 검사만으로는
		// 두 요청이 동시에 통과하는 창이 남는다. 부분 유니크 인덱스로 DB가 직렬화 지점을
		// 잡아주면 두 번째 INSERT가 실패하고, 수집기가 그걸 "이미 실행 중"으로 처리한다.
		uniqueIndex("crawl_run_active_source_site_uidx")
			.on(table.sourceSite)
			.where(sql`${table.status} = 'running'`),
	]
);

export const jobPost = pgTable(
	"job_post",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		organizationId: text("organization_id")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		teamId: text("team_id").references(() => team.id, {
			onDelete: "set null",
		}),
		createdByUserId: text("created_by_user_id")
			.notNull()
			.references(() => user.id),
		// 출처. 기본값이 "original"이라 기존 행은 백필 없이 그대로 맞는다.
		source: jobPostSource("source").default("original").notNull(),
		// 전환의 씨앗이 된 크롤링 원본. 원본이 만료돼 정리돼도 전환된 공고는 남아야 하므로
		// set null이다. 한 원본은 한 번만 전환되므로 유니크(nullable이라 미전환 행은 제한 없음).
		crawledFromId: uuid("crawled_from_id").references(() => crawledJobPost.id, {
			onDelete: "set null",
		}),
		status: jobPostStatus("status").default("pending_review").notNull(),
		industryCategory: jobIndustryCategory("industry_category").notNull(),
		// 표시용 지역 문자열. 입력은 region_code·district_code로 받고 저장 시 마스터의
		// 라벨·시군구명을 여기에 복사해 둔다 — 목록·검색(ilike)이 조인 없이 읽는 자리다.
		region: text("region").notNull(),
		district: text("district"),
		regionCode: varchar("region_code", { length: 10 }).references(
			() => region.code
		),
		districtCode: varchar("district_code", { length: 10 }).references(
			() => region.code
		),
		// payUnit이 "협의"(면접 후 급여 협의)면 금액이 없다 — 그래서 nullable.
		payAmount: integer("pay_amount"),
		payUnit: text("pay_unit").notNull(),
		workSchedule: text("work_schedule").notNull(),
		title: text("title").notNull(),
		description: text("description").notNull(),
		descriptionBlocks: jsonb("description_blocks")
			.$type<JobDescriptionBlock[]>()
			.default([])
			.notNull(),
		interviewNotes: text("interview_notes"),
		// 채용자가 지정하는 seeker 필터 축. 텍스트 매칭이 아니라 명시 필드로 거른다.
		beginnerFriendly: boolean("beginner_friendly").default(false).notNull(),
		// "당일면접 가능" — 시간에 낡지 않는 상시 속성(오늘 날짜 개념 아님).
		instantInterview: boolean("instant_interview").default(false).notNull(),
		rejectionReason: text("rejection_reason"),
		riskFlags: jsonb("risk_flags").$type<string[]>().default([]).notNull(),
		// 검수에 걸린 금칙어 원문. risk_flags가 "왜"(코드)라면 이 칸은 "어떤 단어"다.
		// 운영자 화면이 본문에서 이 문자열을 그대로 찾아 강조하므로 라벨이 아닌 원문을 담는다.
		detectedTerms: jsonb("detected_terms")
			.$type<string[]>()
			.default([])
			.notNull(),
		exposureType: jobExposureType("exposure_type")
			.default("standard")
			.notNull(),
		exposureDurationDays: integer("exposure_duration_days"),
		adProductId: uuid("ad_product_id").references(() => adProduct.id, {
			onDelete: "set null",
		}),
		exposureAmount: integer("exposure_amount"),
		paymentMethod: jobPaymentMethod("payment_method"),
		paymentStatus: jobPaymentStatus("payment_status")
			.default("unpaid")
			.notNull(),
		exposureEndsAt: timestamp("exposure_ends_at"),
		// 마지막 끌어올림(점프) 시각. 노출 정렬 키 GREATEST(boosted_at, published_at)의 재료.
		boostedAt: timestamp("boosted_at"),
		// 공고 구매 시점에 광고 상품에서 복사한 하루 수동 끌어올리기 횟수 스냅샷. 0 = 미제공.
		// 상품(ad_product.manual_boosts_per_day)을 라이브 참조하지 않고 이 컬럼으로 자격을 판정해,
		// 운영자가 상품 횟수를 바꿔도 기존 적용 공고에 소급되지 않도록 한다(노출 축 스냅샷과 동일 패턴).
		manualBoostsPerDay: integer("manual_boosts_per_day").default(0).notNull(),
		// 공고 구매 시점에 광고 상품에서 복사한 하루 자동 끌어올리기 횟수 스냅샷. 0 = 미제공.
		// 수동과 동일한 스냅샷 패턴(라이브 상품 미참조)이라 상품 수정이 기존 공고에 소급되지 않는다.
		// 서버 틱 스케줄러가 09~21시 KST 창을 이 횟수로 균등 분배해 자동 발동한다.
		autoBoostsPerDay: integer("auto_boosts_per_day").default(0).notNull(),
		publishedAt: timestamp("published_at"),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at")
			.defaultNow()
			.$onUpdate(() => /* @__PURE__ */ new Date())
			.notNull(),
	},
	(table) => [
		index("job_post_organization_id_idx").on(table.organizationId),
		index("job_post_team_id_idx").on(table.teamId),
		index("job_post_created_by_user_id_idx").on(table.createdByUserId),
		index("job_post_status_idx").on(table.status),
		index("job_post_discovery_idx").on(
			table.status,
			table.industryCategory,
			table.regionCode,
			table.payAmount
		),
		uniqueIndex("job_post_crawled_from_id_uidx").on(table.crawledFromId),
	]
);

export const jobPostMedia = pgTable(
	"job_post_media",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		jobPostId: uuid("job_post_id")
			.notNull()
			.references(() => jobPost.id, { onDelete: "cascade" }),
		organizationId: text("organization_id")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		uploadedByUserId: text("uploaded_by_user_id")
			.notNull()
			.references(() => user.id),
		usage: jobPostMediaUsage("usage").notNull(),
		position: integer("position").notNull(),
		fileName: text("file_name").notNull(),
		mimeType: text("mime_type").notNull(),
		byteSize: integer("byte_size").notNull(),
		// 광고 배너는 비율이 어긋나면 슬롯에서 잘려 상품 가치가 훼손된다. 업로드 시 브라우저가
		// 읽은 원본 치수를 저장해 비율을 검증하고, 이후 레이아웃 시프트 방지에도 쓴다.
		// 기존 행에는 값이 없으므로 nullable이다.
		width: integer("width"),
		height: integer("height"),
		storageKey: text("storage_key").notNull(),
		altText: text("alt_text").default("").notNull(),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at")
			.defaultNow()
			.$onUpdate(() => /* @__PURE__ */ new Date())
			.notNull(),
	},
	(table) => [
		index("job_post_media_job_post_id_idx").on(table.jobPostId),
		index("job_post_media_organization_id_idx").on(table.organizationId),
		index("job_post_media_usage_position_idx").on(table.usage, table.position),
		uniqueIndex("job_post_media_storage_key_uidx").on(table.storageKey),
	]
);

// 프리미엄 광고 배너의 자유 배치 레이아웃. 구조는
// apps/web/src/lib/bambi/ad-banner-layout.ts의 AdBannerLayout과 같고, 서버 zod가 저장 전에
// 검증한다. jobPostId가 PK라 공고당 정확히 한 행이며, 행의 존재 여부가 "배너를 편집했는가"다.
export const jobAdBannerLayout = pgTable("job_ad_banner_layout", {
	jobPostId: uuid("job_post_id")
		.primaryKey()
		.references(() => jobPost.id, { onDelete: "cascade" }),
	layout: jsonb("layout").notNull(),
	createdAt: timestamp("created_at").defaultNow().notNull(),
	updatedAt: timestamp("updated_at")
		.defaultNow()
		.$onUpdate(() => /* @__PURE__ */ new Date())
		.notNull(),
});

export const jobPromotionCampaign = pgTable(
	"job_promotion_campaign",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		jobPostId: uuid("job_post_id")
			.notNull()
			.references(() => jobPost.id, { onDelete: "cascade" }),
		organizationId: text("organization_id")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		tier: promotionTier("tier").notNull(),
		status: promotionStatus("status").default("draft").notNull(),
		startsAt: timestamp("starts_at").notNull(),
		endsAt: timestamp("ends_at").notNull(),
		manualBoostsTotal: integer("manual_boosts_total").default(0).notNull(),
		manualBoostsUsed: integer("manual_boosts_used").default(0).notNull(),
		autoBoostsPerDay: integer("auto_boosts_per_day").default(0).notNull(),
		lastBoostedAt: timestamp("last_boosted_at"),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at")
			.defaultNow()
			.$onUpdate(() => /* @__PURE__ */ new Date())
			.notNull(),
	},
	(table) => [
		index("job_promotion_campaign_job_post_id_idx").on(table.jobPostId),
		index("job_promotion_campaign_organization_id_idx").on(
			table.organizationId
		),
		index("job_promotion_campaign_status_idx").on(table.status),
		index("job_promotion_campaign_active_listing_idx").on(
			table.status,
			table.tier,
			table.endsAt,
			table.lastBoostedAt
		),
	]
);

export const jobPromotionBoostEvent = pgTable(
	"job_promotion_boost_event",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		campaignId: uuid("campaign_id")
			.notNull()
			.references(() => jobPromotionCampaign.id, { onDelete: "cascade" }),
		jobPostId: uuid("job_post_id")
			.notNull()
			.references(() => jobPost.id, { onDelete: "cascade" }),
		organizationId: text("organization_id")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		actorUserId: text("actor_user_id")
			.notNull()
			.references(() => user.id),
		boostType: text("boost_type").notNull(),
		createdAt: timestamp("created_at").defaultNow().notNull(),
	},
	(table) => [
		index("job_promotion_boost_event_campaign_id_idx").on(table.campaignId),
		index("job_promotion_boost_event_job_post_id_idx").on(table.jobPostId),
		index("job_promotion_boost_event_organization_id_idx").on(
			table.organizationId
		),
	]
);

// 광고 상품 축 끌어올리기 이력. 일일 사용량 판정은 (job_post_id, boost_type, created_at) 카운트로 한다.
// boost_type은 수동 클릭('manual')과 서버 틱 자동 발동('auto')을 구분한다.
export const jobBoostEvent = pgTable(
	"job_boost_event",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		jobPostId: uuid("job_post_id")
			.notNull()
			.references(() => jobPost.id, { onDelete: "cascade" }),
		organizationId: text("organization_id")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		// 자동 발동('auto')은 사람 액터가 없어 null. 수동('manual')은 클릭한 사용자를 저장한다.
		actorUserId: text("actor_user_id").references(() => user.id),
		boostType: text("boost_type").default("manual").notNull(),
		createdAt: timestamp("created_at").defaultNow().notNull(),
	},
	(table) => [
		index("job_boost_event_job_post_created_at_idx").on(
			table.jobPostId,
			table.createdAt
		),
		index("job_boost_event_organization_id_idx").on(table.organizationId),
	]
);

export const adPlacement = pgTable(
	"ad_placement",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		name: text("name").notNull(),
		description: text("description"),
		kind: adPlacementKind("kind").default("listing").notNull(),
		sortOrder: integer("sort_order").default(0).notNull(),
		isActive: boolean("is_active").default(true).notNull(),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at")
			.defaultNow()
			.$onUpdate(() => /* @__PURE__ */ new Date())
			.notNull(),
	},
	(table) => [
		index("ad_placement_active_sort_idx").on(table.isActive, table.sortOrder),
	]
);

export const adProduct = pgTable(
	"ad_product",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		placementId: uuid("placement_id")
			.notNull()
			.references(() => adPlacement.id, { onDelete: "cascade" }),
		name: text("name").notNull(),
		tagline: text("tagline"),
		previewTemplate: adPreviewTemplate("preview_template")
			.default("none")
			.notNull(),
		previewImageUrl: text("preview_image_url"),
		benefits: jsonb("benefits").$type<string[]>().default([]).notNull(),
		// 가격 옵션(기간). discountPercent는 옵션별 할인율(0~100 정수 %, optional) — 없거나
		// 0이면 할인 없음(원값 그대로). 구매(노출 확정) 시점에 결제 금액을 이 비율로 깎아 스냅샷한다.
		priceOptions: jsonb("price_options")
			.$type<{ amount: number; days: number; discountPercent?: number }[]>()
			.default([])
			.notNull(),
		// 이 상품을 구매한 공고가 하루(KST 자정 리셋)에 쓸 수 있는 수동 끌어올리기 횟수. 0 = 미제공.
		manualBoostsPerDay: integer("manual_boosts_per_day").default(0).notNull(),
		// 이 상품을 구매한 공고가 하루에 자동으로 끌어올려지는 횟수(구매 시 공고로 스냅샷). 0 = 미제공.
		autoBoostsPerDay: integer("auto_boosts_per_day").default(0).notNull(),
		sortOrder: integer("sort_order").default(0).notNull(),
		isActive: boolean("is_active").default(true).notNull(),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at")
			.defaultNow()
			.$onUpdate(() => /* @__PURE__ */ new Date())
			.notNull(),
	},
	(table) => [
		index("ad_product_placement_idx").on(
			table.placementId,
			table.isActive,
			table.sortOrder
		),
	]
);

// 사이트 전역 설정(단일 행). 지금은 푸터에 노출하는 사업자 정보를 담고, 이후 다른
// 사이트 설정(무통장입금 계좌 안내 등)이 생기면 컬럼을 추가한다. 도메인을 푸터로 좁히지
// 않으려고 이름을 site_settings로 둔다. 값이 없으면(null) 코드의 폴백 상수를 쓴다.
export const bambiSiteSettings = pgTable("bambi_site_settings", {
	// 단일 행 강제용 고정 키. 조회·수정 모두 이 키 하나만 다룬다.
	id: text("id").default("default").primaryKey(),
	// 푸터 서비스 소개 문구
	footerIntro: text("footer_intro"),
	// 운영 주체(상호)
	operator: text("operator"),
	// 대표자
	ceo: text("ceo"),
	// 사업자등록번호
	bizRegNo: text("biz_reg_no"),
	// 사업장 주소
	address: text("address"),
	// 고객문의 이메일
	email: text("email"),
	// 고객센터 전화(TEL). 푸터에 노출. null이면 코드 폴백(BAMBI_COMPANY.tel).
	tel: text("tel"),
	// 광고 슬롯 자리표시에 노출하는 광고 등록 문의 전화. 고객센터 전화(tel)와 다를 수 있어
	// 별도 컬럼이다. null이면 tel → BAMBI_COMPANY.tel 순으로 폴백한다.
	adInquiryTel: text("ad_inquiry_tel"),
	// 무통장입금 안내 계좌 목록. 운영자가 사이트 설정에서 관리하고, 공고 결제 안내에 노출된다.
	// 미설정이면 빈 배열 → 안내 화면은 고객센터 문의 문구로 폴백한다.
	bankAccounts: jsonb("bank_accounts")
		.$type<{ accountNumber: string; bank: string; holder: string }[]>()
		.default([])
		.notNull(),
	// 법정 최저시급과 그 기준 연도. 공고 상세의 급여 옆에 나란히 붙여, 제시 급여가 최저시급
	// 대비 어느 수준인지를 구직자가 그 자리에서 판단할 수 있게 한다. 매년 바뀌고 다음 해 값이
	// 8월에 미리 고시되므로 연도도 함께 저장한다(현재 연도로 유추하면 연말에 틀린다).
	// null이면 코드 기본값(DEFAULT_MINIMUM_WAGE)으로 폴백한다.
	minimumWageYear: integer("minimum_wage_year"),
	minimumWageHourly: integer("minimum_wage_hourly"),
	// 회원 탈퇴 후 개인정보 보존기간(일). 운영자 사이트 설정에서 편집한다.
	// null이면 코드 기본값(DEFAULT_WITHDRAWAL_RETENTION_DAYS=30)으로 폴백한다.
	withdrawalRetentionDays: integer("withdrawal_retention_days"),
	// 파기 배치 자동 실행 시각(KST 0~23시). null이면 코드 기본값
	// (DEFAULT_WITHDRAWAL_PURGE_HOUR=4)으로 폴백한다.
	withdrawalPurgeHour: integer("withdrawal_purge_hour"),
	// 파기 배치 마지막 실행 시각(자동·수동 공통). 스케줄러가 "오늘 설정 시각 이후 이미 돌았는지"를
	// 이 값으로 판정한다 — 프로세스 메모리가 아니라 DB라 서버를 재시작하거나 인스턴스가 늘어도
	// 하루 한 번이 유지되고, 운영자 화면의 "마지막 실행" 표시도 같은 값을 본다.
	withdrawalPurgeLastRunAt: timestamp("withdrawal_purge_last_run_at"),
	// 광고 배너 로테이션 주기(분). 운영자 사이트 설정에서 편집한다. 활성 광고 칸이 이 주기마다
	// 한 칸씩 전진한다. null이면 코드 기본값(DEFAULT_AD_ROTATION_MINUTES=60)으로 폴백한다.
	adBannerRotationMinutes: integer("ad_banner_rotation_minutes"),
	// 개인정보 처리방침에 노출하는 위탁사·관리부서 연락처. 운영자 사이트 설정에서 편집한다.
	// null이면 프론트가 코드 폴백(BAMBI_PROCESSORS 이름 / BAMBI_COMPANY.privacyOfficer)을 쓴다.
	privacyPaymentProcessor: text("privacy_payment_processor"),
	// 개인정보 보호책임자 성명(개인정보 보호법 제31조 공개 대상).
	privacyOfficerName: text("privacy_officer_name"),
	// 문자(SMS) 발송 기능이 없어 수탁자 표에서 SMS 행을 걷어냈다. 컬럼은 마이그레이션
	// 없이 남겨두고 읽지 않는다 — SMS 위탁이 생기면 다시 노출한다.
	privacySmsProvider: text("privacy_sms_provider"),
	privacyContactPhone: text("privacy_contact_phone"),
	privacyContactEmail: text("privacy_contact_email"),
	// 수집 스케줄러 스위치. 스케줄러 job은 항상 등록해두고 매 틱 이 값을 읽는다 —
	// toad-scheduler의 job.stop()은 프로세스 메모리 상태라 서버를 재시작하거나 인스턴스가
	// 늘면 상태가 갈리지만, DB 플래그는 어디서 켜도 모든 인스턴스에 즉시 반영된다.
	// 기본이 false라 배포만으로는 저절로 돌지 않는다(운영자가 명시적으로 켠다). 이 값은
	// 주기 실행만 통제하고, 운영자의 「즉시 수집」은 꺼져 있어도 항상 돈다 — 수동 실행까지
	// 막으면 스케줄러를 켜지 않고는 파서를 확인할 방법이 없어진다.
	crawlEnabled: boolean("crawl_enabled").default(false).notNull(),
	// 수집 대상 사이트. 현재는 퀸알바만 수집한다(여우알바는 대상에서 내렸다). enum 값과
	// 과거 회차 기록은 남겨두므로 되살릴 때 마이그레이션이 필요 없다.
	crawlSourceSite: crawlSourceSite("crawl_source_site")
		.default("queenalba")
		.notNull(),
	// 수집 데이터 종류(공고/커뮤니티). 사이트와 함께 (사이트×종류) 조합을 이루고, 파서가
	// 구현된 조합만 실제로 돈다.
	crawlContentType: crawlContentType("crawl_content_type")
		.default("job_post")
		.notNull(),
	// 수집 주기(시간). null이면 코드 기본값(DEFAULT_CRAWL_INTERVAL_HOURS)으로 폴백한다.
	crawlIntervalHours: integer("crawl_interval_hours"),
	// 마지막 수집 시각. 틱 간격보다 이 값을 기준으로 판정해 서버 재시작에도 주기가 밀리지 않는다.
	crawlLastRunAt: timestamp("crawl_last_run_at"),
	// 수집 공고를 광고 배너 슬롯에 채울지. 수집 여부와 별개의 스위치다 — 긁어 두는 것과
	// 남의 업소 이미지를 우리 광고 자리에 거는 것은 판단이 다르고, 문제가 생기면 수집을
	// 멈추지 않고 노출만 즉시 내려야 한다. 기본이 false라 배포만으로는 노출되지 않는다.
	crawledAdBannerEnabled: boolean("crawled_ad_banner_enabled")
		.default(false)
		.notNull(),
	// 수집 공고를 공고 목록에 섞을지. 위와 같은 이유로 배너와 따로 끈다 — 배너 한 칸이
	// 문제여도 목록은 살려 두거나, 그 반대를 택할 수 있어야 한다.
	crawledJobFeedEnabled: boolean("crawled_job_feed_enabled")
		.default(false)
		.notNull(),
	// 수집 커뮤니티 글을 커뮤니티 목록에 섞을지. 위 공고 스위치와 같은 이유로 수집과 노출을
	// 따로 끈다 — 긁어 두는 것과 남의 글을 우리 커뮤니티에 세우는 것은 판단이 다르고, 문제가
	// 생기면 수집을 멈추지 않고 노출만 즉시 내려야 한다. 기본이 false라 배포만으로는 켜지지 않는다.
	crawledCommunityFeedEnabled: boolean("crawled_community_feed_enabled")
		.default(false)
		.notNull(),
	// 섹션별 수집 공고 노출 상한. 수집할 때(배너 리다이렉터 해석 요청 절약)와 조회할 때(과거
	// 회차가 남긴 초과 라벨 방어) 같은 값을 쓴다. null이면 코드 기본값(DEFAULT_CRAWLED_LIMITS)
	// 으로 폴백한다 — 컬럼 default를 박으면 기본값을 조정할 때마다 마이그레이션이 필요해진다.
	crawledAdBannerLimit: integer("crawled_ad_banner_limit"),
	crawledSpecialLimit: integer("crawled_special_limit"),
	crawledUrgentLimit: integer("crawled_urgent_limit"),
	crawledRecommendedLimit: integer("crawled_recommended_limit"),
	// 한 회차에 게시판 목록에서 모을 커뮤니티 글 수 상한. 위 네 값이 "노출 자리 개수"라면 이건
	// "수집 규모"다 — 최신순 앞에서 이 개수만큼만 담고, 채우면 남은 목록 페이지를 받지 않는다.
	// 같은 이유로 null이면 코드 기본값(DEFAULT_CRAWLED_LIMITS.community)으로 폴백한다.
	crawledCommunityLimit: integer("crawled_community_limit"),
	updatedAt: timestamp("updated_at")
		.defaultNow()
		.$onUpdate(() => /* @__PURE__ */ new Date())
		.notNull(),
});

export const jobPerformanceEvent = pgTable(
	"job_performance_event",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		jobPostId: uuid("job_post_id")
			.notNull()
			.references(() => jobPost.id, { onDelete: "cascade" }),
		organizationId: text("organization_id")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		actorUserId: text("actor_user_id").references(() => user.id, {
			onDelete: "set null",
		}),
		eventType: jobPerformanceEventType("event_type").notNull(),
		metadata: jsonb("metadata").$type<Record<string, unknown>>(),
		createdAt: timestamp("created_at").defaultNow().notNull(),
	},
	(table) => [
		index("job_performance_event_job_post_id_idx").on(table.jobPostId),
		index("job_performance_event_organization_id_idx").on(table.organizationId),
		index("job_performance_event_type_created_at_idx").on(
			table.eventType,
			table.createdAt
		),
	]
);

export const chatRoom = pgTable(
	"chat_room",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		jobPostId: uuid("job_post_id")
			.notNull()
			.references(() => jobPost.id, { onDelete: "cascade" }),
		organizationId: text("organization_id")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		teamId: text("team_id").references(() => team.id, {
			onDelete: "set null",
		}),
		employerUserId: text("employer_user_id")
			.notNull()
			.references(() => user.id),
		jobSeekerUserId: text("job_seeker_user_id")
			.notNull()
			.references(() => user.id),
		isBlocked: boolean("is_blocked").default(false).notNull(),
		// 회원별 소프트삭제(목록 숨김). 상대는 그대로 유지되며, 새 메시지 도착 시
		// sendMessage가 양쪽 값을 NULL로 되돌려 방을 다시 노출한다.
		seekerDeletedAt: timestamp("seeker_deleted_at"),
		employerDeletedAt: timestamp("employer_deleted_at"),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at")
			.defaultNow()
			.$onUpdate(() => /* @__PURE__ */ new Date())
			.notNull(),
	},
	(table) => [
		uniqueIndex("chat_room_job_post_id_job_seeker_user_id_uidx").on(
			table.jobPostId,
			table.jobSeekerUserId
		),
		index("chat_room_organization_id_idx").on(table.organizationId),
		index("chat_room_team_id_idx").on(table.teamId),
		index("chat_room_employer_user_id_idx").on(table.employerUserId),
		index("chat_room_job_seeker_user_id_idx").on(table.jobSeekerUserId),
	]
);

export const chatMessage = pgTable(
	"chat_message",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		chatRoomId: uuid("chat_room_id")
			.notNull()
			.references(() => chatRoom.id, { onDelete: "cascade" }),
		senderUserId: text("sender_user_id")
			.notNull()
			.references(() => user.id),
		body: text("body").notNull(),
		// 메시지 종류. "text"=일반, "contact_request"=연락처 공개 요청(인라인 시스템 메시지).
		kind: text("kind").notNull().default("text"),
		// contact_request일 때 { status: "pending"|"revealed"|"declined",
		// requesterUserId, targetUserId }. 공개된 번호는 여기 저장하지 않고 응답 조립 시 주입.
		metadata: jsonb("metadata"),
		riskFlags: jsonb("risk_flags").$type<string[]>().default([]).notNull(),
		createdAt: timestamp("created_at").defaultNow().notNull(),
	},
	(table) => [
		index("chat_message_chat_room_id_idx").on(table.chatRoomId),
		index("chat_message_sender_user_id_idx").on(table.senderUserId),
	]
);

export const chatAttachment = pgTable(
	"chat_attachment",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		chatRoomId: uuid("chat_room_id")
			.notNull()
			.references(() => chatRoom.id, { onDelete: "cascade" }),
		messageId: uuid("message_id")
			.notNull()
			.references(() => chatMessage.id, { onDelete: "cascade" }),
		storageKey: text("storage_key").notNull(),
		fileName: text("file_name").notNull(),
		mimeType: text("mime_type").notNull(),
		byteSize: integer("byte_size").notNull(),
		category: chatAttachmentCategory("category").notNull(),
		createdByUserId: text("created_by_user_id")
			.notNull()
			.references(() => user.id),
		createdAt: timestamp("created_at").defaultNow().notNull(),
	},
	(table) => [
		index("chat_attachment_chat_room_id_idx").on(table.chatRoomId),
		index("chat_attachment_message_id_idx").on(table.messageId),
		uniqueIndex("chat_attachment_storage_key_uidx").on(table.storageKey),
		index("chat_attachment_created_by_user_id_idx").on(table.createdByUserId),
	]
);

export const chatMessageReadReceipt = pgTable(
	"chat_message_read_receipt",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		messageId: uuid("message_id")
			.notNull()
			.references(() => chatMessage.id, { onDelete: "cascade" }),
		chatRoomId: uuid("chat_room_id")
			.notNull()
			.references(() => chatRoom.id, { onDelete: "cascade" }),
		readerUserId: text("reader_user_id")
			.notNull()
			.references(() => user.id),
		readAt: timestamp("read_at").defaultNow().notNull(),
		createdAt: timestamp("created_at").defaultNow().notNull(),
	},
	(table) => [
		uniqueIndex("chat_message_read_receipt_message_id_reader_user_id_uidx").on(
			table.messageId,
			table.readerUserId
		),
		index("chat_message_read_receipt_chat_room_id_idx").on(table.chatRoomId),
		index("chat_message_read_receipt_reader_user_id_idx").on(
			table.readerUserId
		),
	]
);

export const interviewSchedule = pgTable(
	"interview_schedule",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		chatRoomId: uuid("chat_room_id")
			.notNull()
			.references(() => chatRoom.id, { onDelete: "cascade" }),
		proposedByUserId: text("proposed_by_user_id")
			.notNull()
			.references(() => user.id),
		status: interviewStatus("status").default("proposed").notNull(),
		scheduledAt: timestamp("scheduled_at").notNull(),
		locationNote: text("location_note"),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at")
			.defaultNow()
			.$onUpdate(() => /* @__PURE__ */ new Date())
			.notNull(),
	},
	(table) => [
		index("interview_schedule_chat_room_id_idx").on(table.chatRoomId),
		index("interview_schedule_status_idx").on(table.status),
	]
);

export const contactRevealConsent = pgTable(
	"contact_reveal_consent",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		interviewScheduleId: uuid("interview_schedule_id")
			.notNull()
			.references(() => interviewSchedule.id, { onDelete: "cascade" }),
		userId: text("user_id")
			.notNull()
			.references(() => user.id),
		contactMethod: text("contact_method").notNull(),
		contactValue: text("contact_value").notNull(),
		createdAt: timestamp("created_at").defaultNow().notNull(),
	},
	(table) => [
		uniqueIndex("contact_reveal_consent_schedule_id_user_id_method_uidx").on(
			table.interviewScheduleId,
			table.userId,
			table.contactMethod
		),
	]
);

// 회원가입 시 이용약관·개인정보 처리방침 동의 이력. 감사 목적으로 동의한 문서 종류·
// 버전·동의 시각을 남긴다. 문서 개정 후 재동의 시 새 (userId, document, version) 행이
// 누적된다(같은 버전 중복 저장은 unique index로 방지).
export const bambiLegalConsentDocument = pgEnum(
	"bambi_legal_consent_document",
	["terms_of_service", "privacy_policy"]
);

export const bambiLegalConsent = pgTable(
	"bambi_legal_consent",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		document: bambiLegalConsentDocument("document").notNull(),
		version: text("version").notNull(),
		agreedAt: timestamp("agreed_at").defaultNow().notNull(),
	},
	(table) => [
		uniqueIndex("bambi_legal_consent_user_id_document_version_uidx").on(
			table.userId,
			table.document,
			table.version
		),
		index("bambi_legal_consent_user_id_idx").on(table.userId),
	]
);

export const userBlock = pgTable(
	"user_block",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		blockerUserId: text("blocker_user_id")
			.notNull()
			.references(() => user.id),
		blockedUserId: text("blocked_user_id")
			.notNull()
			.references(() => user.id),
		chatRoomId: uuid("chat_room_id").references(() => chatRoom.id, {
			onDelete: "cascade",
		}),
		createdAt: timestamp("created_at").defaultNow().notNull(),
	},
	(table) => [
		uniqueIndex("user_block_blocker_user_id_blocked_user_id_uidx").on(
			table.blockerUserId,
			table.blockedUserId
		),
	]
);

export const review = pgTable(
	"review",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		jobPostId: uuid("job_post_id")
			.notNull()
			.references(() => jobPost.id, { onDelete: "cascade" }),
		organizationId: text("organization_id")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		chatRoomId: uuid("chat_room_id")
			.notNull()
			.references(() => chatRoom.id, { onDelete: "cascade" }),
		reviewerUserId: text("reviewer_user_id")
			.notNull()
			.references(() => user.id),
		rating: integer("rating").notNull(),
		body: text("body").notNull(),
		isAnonymous: boolean("is_anonymous").default(false).notNull(),
		status: reviewStatus("status").default("published").notNull(),
		riskFlags: jsonb("risk_flags").$type<string[]>().default([]).notNull(),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at").defaultNow().notNull(),
	},
	(table) => [
		uniqueIndex("review_chat_room_id_reviewer_user_id_uidx").on(
			table.chatRoomId,
			table.reviewerUserId
		),
		index("review_job_post_id_status_idx").on(table.jobPostId, table.status),
		index("review_organization_id_idx").on(table.organizationId),
		index("review_reviewer_user_id_idx").on(table.reviewerUserId),
	]
);

export const report = pgTable(
	"report",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		reporterUserId: text("reporter_user_id")
			.notNull()
			.references(() => user.id),
		targetType: moderationTargetType("target_type").notNull(),
		targetId: text("target_id").notNull(),
		reason: text("reason").notNull(),
		details: text("details"),
		status: reportStatus("status").default("open").notNull(),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at")
			.defaultNow()
			.$onUpdate(() => /* @__PURE__ */ new Date())
			.notNull(),
	},
	(table) => [
		index("report_status_idx").on(table.status),
		index("report_target_type_target_id_idx").on(
			table.targetType,
			table.targetId
		),
	]
);

export const adminModerationAction = pgTable(
	"admin_moderation_action",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		adminUserId: text("admin_user_id")
			.notNull()
			.references(() => user.id),
		targetType: moderationTargetType("target_type").notNull(),
		targetId: text("target_id").notNull(),
		action: text("action").notNull(),
		reason: text("reason").notNull(),
		metadata: jsonb("metadata").$type<Record<string, unknown>>(),
		createdAt: timestamp("created_at").defaultNow().notNull(),
	},
	(table) => [
		index("admin_moderation_action_target_type_target_id_idx").on(
			table.targetType,
			table.targetId
		),
	]
);

export const bambiNotification = pgTable(
	"bambi_notification",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		recipientUserId: text("recipient_user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		actorUserId: text("actor_user_id")
			.notNull()
			.references(() => user.id),
		targetType: moderationTargetType("target_type").notNull(),
		targetId: text("target_id").notNull(),
		chatRoomId: uuid("chat_room_id").references(() => chatRoom.id, {
			onDelete: "cascade",
		}),
		readAt: timestamp("read_at"),
		metadata: jsonb("metadata").$type<Record<string, unknown>>(),
		createdAt: timestamp("created_at").defaultNow().notNull(),
	},
	(table) => [
		index("bambi_notification_recipient_user_id_idx").on(table.recipientUserId),
		index("bambi_notification_chat_room_id_idx").on(table.chatRoomId),
		index("bambi_notification_target_type_target_id_idx").on(
			table.targetType,
			table.targetId
		),
	]
);

export const communityPost = pgTable(
	"community_post",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		board: communityBoard("board").notNull(),
		// 회원 글이면 author_user_id, 비회원(게스트 토큰) 글이면 author_guest_id만 채워진다
		// — 정확히 한쪽만 채워지도록 아래 CHECK로 강제한다. 게스트는 계정이 없어 FK가 없고,
		// 소유권은 password_hash 검증으로만 증명한다.
		authorUserId: text("author_user_id").references(() => user.id, {
			onDelete: "cascade",
		}),
		authorGuestId: text("author_guest_id"),
		// 클래식 게시판 필드: 글별 표시명(익명), 글 비밀번호(scrypt salt:hash), 비밀글 여부.
		authorDisplayName: text("author_display_name").notNull(),
		passwordHash: text("password_hash").notNull(),
		isLocked: boolean("is_locked").default(false).notNull(),
		// 법률 자문 글의 선택 입력 연락처(휴대폰). 잠금을 연 열람자(작성자·운영자·법률자문)에게만
		// 응답에 실린다. legal 외 게시판에서는 저장하지 않는다(API 강제).
		contactPhone: text("contact_phone"),
		// 작성 시점 계정 유형 스냅샷(서버 기록, 위조 불가). 업소 배지·필터용 — 이후 role 변경과 무관.
		authorRole: bambiUserRole("author_role").notNull(),
		// 업소회원 자율 광고 표시. employer만 true 가능(API 강제), 미표시 광고는 신고로 보완.
		isPromotion: boolean("is_promotion").default(false).notNull(),
		title: text("title").notNull(),
		body: text("body").notNull(),
		viewCount: integer("view_count").default(0).notNull(),
		// 추천·댓글 수 캐시. 진실값은 community_post_like/community_comment 집계이며
		// 토글·작성·삭제 트랜잭션에서 함께 증감한다.
		likeCount: integer("like_count").default(0).notNull(),
		commentCount: integer("comment_count").default(0).notNull(),
		status: communityContentStatus("status").default("published").notNull(),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		// $onUpdate를 쓰지 않는다 — 조회수 증가가 "수정됨" 시각을 갱신하면 안 되므로
		// updatePost에서만 명시적으로 갱신한다.
		updatedAt: timestamp("updated_at").defaultNow().notNull(),
	},
	(table) => [
		index("community_post_board_status_created_at_idx").on(
			table.board,
			table.status,
			table.createdAt
		),
		index("community_post_status_created_at_idx").on(
			table.status,
			table.createdAt
		),
		index("community_post_author_user_id_idx").on(table.authorUserId),
		check(
			"community_post_author_one_of_ck",
			sql`num_nonnulls(${table.authorUserId}, ${table.authorGuestId}) = 1`
		),
	]
);

export const communityComment = pgTable(
	"community_comment",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		postId: uuid("post_id")
			.notNull()
			.references(() => communityPost.id, { onDelete: "cascade" }),
		// 글과 같은 규칙: 회원이면 author_user_id, 비회원이면 author_guest_id만 채워진다.
		authorUserId: text("author_user_id").references(() => user.id, {
			onDelete: "cascade",
		}),
		authorGuestId: text("author_guest_id"),
		// 비회원 댓글의 수정·삭제 소유권 증명용(scrypt salt:hash). 회원 댓글은 세션으로
		// 소유권이 증명되므로 글의 관례대로 빈 문자열을 넣는다.
		passwordHash: text("password_hash").default("").notNull(),
		// 작성 시점 계정 유형 스냅샷(서버 기록). 업소 댓글 배지·숨김 토글용.
		authorRole: bambiUserRole("author_role").notNull(),
		// 대댓글(1단계). null이면 최상위 댓글. 1단계 제한은 API에서 강제한다.
		parentCommentId: uuid("parent_comment_id").references(
			(): AnyPgColumn => communityComment.id,
			{ onDelete: "cascade" }
		),
		body: text("body").notNull(),
		status: communityContentStatus("status").default("published").notNull(),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at").defaultNow().notNull(),
	},
	(table) => [
		index("community_comment_post_id_status_created_at_idx").on(
			table.postId,
			table.status,
			table.createdAt
		),
		index("community_comment_author_user_id_idx").on(table.authorUserId),
		index("community_comment_parent_comment_id_idx").on(table.parentCommentId),
		check(
			"community_comment_author_one_of_ck",
			sql`num_nonnulls(${table.authorUserId}, ${table.authorGuestId}) = 1`
		),
	]
);

export const communityPostLike = pgTable(
	"community_post_like",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		postId: uuid("post_id")
			.notNull()
			.references(() => communityPost.id, { onDelete: "cascade" }),
		// 회원 추천은 user_id, 비회원 추천은 guest_id(게스트 토큰의 gid). 정확히 한쪽만
		// 채워지며, unique 인덱스가 각각 중복 추천을 막는다(NULL은 서로 distinct라 섞이지 않는다).
		userId: text("user_id").references(() => user.id, { onDelete: "cascade" }),
		guestId: text("guest_id"),
		createdAt: timestamp("created_at").defaultNow().notNull(),
	},
	(table) => [
		uniqueIndex("community_post_like_post_id_user_id_uidx").on(
			table.postId,
			table.userId
		),
		uniqueIndex("community_post_like_post_id_guest_id_uidx").on(
			table.postId,
			table.guestId
		),
		index("community_post_like_user_id_idx").on(table.userId),
		check(
			"community_post_like_actor_one_of_ck",
			sql`num_nonnulls(${table.userId}, ${table.guestId}) = 1`
		),
	]
);

export const supportInquiry = pgTable(
	"support_inquiry",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		authorUserId: text("author_user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		// 작성 시점 계정 유형 스냅샷(서버 기록). 이후 role 변경과 무관하게 문의 맥락을 보존한다.
		authorRole: bambiUserRole("author_role").notNull(),
		category: supportInquiryCategory("category").notNull(),
		title: text("title").notNull(),
		// 커뮤니티와 달리 평문이다 — 문의에 서식이 필요 없고 금칙어 검사를 바로 걸 수 있다.
		body: text("body").notNull(),
		inquiryStatus: supportInquiryStatus("inquiry_status")
			.default("open")
			.notNull(),
		// 운영 조치 상태. community_content_status를 재사용해 조치 로직·UI 매핑을 공유한다.
		status: communityContentStatus("status").default("published").notNull(),
		// 목록 정렬용 — 답변이 달리면 갱신해 위로 올린다.
		lastMessageAt: timestamp("last_message_at").defaultNow().notNull(),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at").defaultNow().notNull(),
	},
	(table) => [
		index("support_inquiry_author_user_id_created_at_idx").on(
			table.authorUserId,
			table.createdAt
		),
		index("support_inquiry_inquiry_status_last_message_at_idx").on(
			table.inquiryStatus,
			table.lastMessageAt
		),
		index("support_inquiry_status_created_at_idx").on(
			table.status,
			table.createdAt
		),
	]
);

export const supportInquiryMessage = pgTable(
	"support_inquiry_message",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		inquiryId: uuid("inquiry_id")
			.notNull()
			.references(() => supportInquiry.id, { onDelete: "cascade" }),
		authorUserId: text("author_user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		// 작성 시점 운영자 여부 스냅샷. 이후 role이 바뀌어도 스레드 표시가 흔들리지 않는다.
		isStaff: boolean("is_staff").default(false).notNull(),
		body: text("body").notNull(),
		status: communityContentStatus("status").default("published").notNull(),
		createdAt: timestamp("created_at").defaultNow().notNull(),
	},
	(table) => [
		index("support_inquiry_message_inquiry_id_created_at_idx").on(
			table.inquiryId,
			table.createdAt
		),
	]
);

export const faqEntry = pgTable(
	"faq_entry",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		category: supportInquiryCategory("category").notNull(),
		question: text("question").notNull(),
		answer: text("answer").notNull(),
		sortOrder: integer("sort_order").default(0).notNull(),
		isPublished: boolean("is_published").default(true).notNull(),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at").defaultNow().notNull(),
	},
	(table) => [
		index("faq_entry_is_published_sort_order_idx").on(
			table.isPublished,
			table.sortOrder
		),
	]
);

export const bannedWordScope = pgEnum("banned_word_scope", [
	"content",
	"display_name",
]);

export const bannedWord = pgTable(
	"banned_word",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		scope: bannedWordScope("scope").default("content").notNull(),
		// 운영자가 입력한 원문(표시용).
		term: text("term").notNull(),
		// 정규화형(매칭용). 저장 시 계산해 두고 매 요청 재계산을 피한다.
		normalizedTerm: text("normalized_term").notNull(),
		isActive: boolean("is_active").default(true).notNull(),
		createdByUserId: text("created_by_user_id")
			.notNull()
			.references(() => user.id),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at").defaultNow().notNull(),
	},
	(table) => [
		// 같은 범위에서는 "성 매매"와 "성매매"가 중복되지 않지만, 본문·닉네임에는 같은
		// 단어를 각각 등록할 수 있어야 한다.
		uniqueIndex("banned_word_scope_normalized_term_uidx").on(
			table.scope,
			table.normalizedTerm
		),
		index("banned_word_scope_is_active_idx").on(table.scope, table.isActive),
	]
);

export const bambiProfileRelations = relations(bambiProfile, ({ one }) => ({
	user: one(user, {
		fields: [bambiProfile.userId],
		references: [user.id],
	}),
}));

export const employerOrganizationProfileRelations = relations(
	employerOrganizationProfile,
	({ many }) => ({
		teamProfiles: many(employerTeamProfile),
	})
);

export const employerTeamProfileRelations = relations(
	employerTeamProfile,
	({ one }) => ({
		organizationProfile: one(employerOrganizationProfile, {
			fields: [employerTeamProfile.organizationId],
			references: [employerOrganizationProfile.organizationId],
		}),
	})
);

export const jobPostRelations = relations(jobPost, ({ many }) => ({
	chatRooms: many(chatRoom),
	media: many(jobPostMedia),
	promotionCampaigns: many(jobPromotionCampaign),
}));

export const jobPostMediaRelations = relations(jobPostMedia, ({ one }) => ({
	jobPost: one(jobPost, {
		fields: [jobPostMedia.jobPostId],
		references: [jobPost.id],
	}),
}));

export const jobPromotionCampaignRelations = relations(
	jobPromotionCampaign,
	({ many, one }) => ({
		boostEvents: many(jobPromotionBoostEvent),
		jobPost: one(jobPost, {
			fields: [jobPromotionCampaign.jobPostId],
			references: [jobPost.id],
		}),
	})
);

export const jobPromotionBoostEventRelations = relations(
	jobPromotionBoostEvent,
	({ one }) => ({
		campaign: one(jobPromotionCampaign, {
			fields: [jobPromotionBoostEvent.campaignId],
			references: [jobPromotionCampaign.id],
		}),
		jobPost: one(jobPost, {
			fields: [jobPromotionBoostEvent.jobPostId],
			references: [jobPost.id],
		}),
	})
);

export const adPlacementRelations = relations(adPlacement, ({ many }) => ({
	products: many(adProduct),
}));

export const adProductRelations = relations(adProduct, ({ one }) => ({
	placement: one(adPlacement, {
		fields: [adProduct.placementId],
		references: [adPlacement.id],
	}),
}));

export const chatRoomRelations = relations(chatRoom, ({ many, one }) => ({
	attachments: many(chatAttachment),
	jobPost: one(jobPost, {
		fields: [chatRoom.jobPostId],
		references: [jobPost.id],
	}),
	messages: many(chatMessage),
}));

export const chatMessageRelations = relations(chatMessage, ({ many, one }) => ({
	attachments: many(chatAttachment),
	room: one(chatRoom, {
		fields: [chatMessage.chatRoomId],
		references: [chatRoom.id],
	}),
}));

export const chatAttachmentRelations = relations(chatAttachment, ({ one }) => ({
	message: one(chatMessage, {
		fields: [chatAttachment.messageId],
		references: [chatMessage.id],
	}),
	room: one(chatRoom, {
		fields: [chatAttachment.chatRoomId],
		references: [chatRoom.id],
	}),
}));

export const communityPostRelations = relations(communityPost, ({ many }) => ({
	comments: many(communityComment),
	likes: many(communityPostLike),
}));

export const communityCommentRelations = relations(
	communityComment,
	({ one }) => ({
		post: one(communityPost, {
			fields: [communityComment.postId],
			references: [communityPost.id],
		}),
	})
);

export const communityPostLikeRelations = relations(
	communityPostLike,
	({ one }) => ({
		post: one(communityPost, {
			fields: [communityPostLike.postId],
			references: [communityPost.id],
		}),
	})
);

export const supportInquiryRelations = relations(
	supportInquiry,
	({ many }) => ({
		messages: many(supportInquiryMessage),
	})
);

export const supportInquiryMessageRelations = relations(
	supportInquiryMessage,
	({ one }) => ({
		inquiry: one(supportInquiry, {
			fields: [supportInquiryMessage.inquiryId],
			references: [supportInquiry.id],
		}),
	})
);
