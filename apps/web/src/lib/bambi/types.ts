// 밤비 신뢰·안전 흐름 — 공용 타입

import type { AppRouterClient } from "@bambi-app/api/routers/index";

// 신고 목록의 대상 맥락(targetContext)은 서버 orpc 추론 타입을 그대로 따른다.
// targetType별로 확장된 단일 키 유니온(job_post·review·user·chat_room·chat_message)
// 또는 대상 row가 없으면 null.
type ModerationReportItem = Awaited<
	ReturnType<AppRouterClient["bambi"]["moderation"]["listReports"]>
>[number];
export type ReportTargetType = ModerationReportItem["targetType"];
export type ReportTargetContext = ModerationReportItem["targetContext"];

export type Severity = "block" | "review" | "warn" | "ok";
export type ReportSeverity = "high" | "mid" | "low";
export type RiskLevel = "high" | "mid" | "low";
export type VerdictState = "block" | "review" | "publish";
export type ModerationModel = "pre" | "post" | "hybrid";
export type VisualTone = "calm" | "bold";
export type ReportMode = "sheet" | "fullscreen" | "inline";

export interface ScanRule {
	cat: string;
	hint: string;
	label: string;
	reason: string;
	sev: Severity;
	terms: string[];
}

export interface Finding {
	cat: string;
	end: number;
	hint: string;
	label: string;
	match: string;
	reason: string;
	sev: Severity;
	start: number;
}

export interface Verdict {
	findings: Finding[];
	state: VerdictState;
}

export interface JobPerformanceMetrics {
	detailViews: number;
	impressions: number;
}

export interface Job {
	beginnerFriendly: boolean;
	company: string;
	coverImage?: JobMedia | null;
	// 외부에서 수집한 공고. 상세가 job_post 경로에 없어 카드 클릭이 수집 전용 상세로 가야 한다.
	crawled?: boolean;
	desc: string;
	descriptionBlocks?: JobDescriptionBlock[];
	detailImages?: JobMedia[];
	district: string;
	// 지역 마스터 코드. 필터는 표시 문자열이 아니라 이 값으로 비교한다(코드가 없는
	// 수집 공고는 빈 문자열이라 코드 필터에 걸리지 않는다 — 서버 필터와 결과가 같다).
	districtCode: string;
	// 공고를 올린 구인자의 user id. 공고 상세(getById) 응답에만 있어 목록/카드에는 없다.
	// 내 차단 목록과 대조하는 데 쓴다.
	employerUserId?: string;
	// 공고 상세에서만 채워진다(작성자 인증번호). 목록/카드 매핑에는 없음.
	employerVerifiedPhone?: string | null;
	exposureType?: null | string;
	featured: boolean;
	hours: string;
	id: string;
	instantInterview: boolean;
	isPromoted?: boolean;
	lastBoostedAt?: Date | null | string;
	location: string;
	pay: string;
	performance?: JobPerformanceMetrics;
	pref: string;
	promotionLabel?: null | string;
	promotionTier?: "premium" | "recommended" | "standard" | null;
	rating: number;
	region: string;
	regionCode: string;
	reviews: number;
	status: string;
	tags: string[];
	title: string;
	type: string;
	verified: boolean;
}

export type JobDescriptionBlockType =
	| "bullet_list"
	| "callout"
	| "heading"
	| "paragraph";

export interface JobDescriptionBlock {
	id: string;
	text: string;
	type: JobDescriptionBlockType;
}

export type JobMediaUsage =
	| "ad_horizontal"
	| "ad_vertical"
	| "cover"
	| "detail";

export interface JobMedia {
	altText: string;
	byteSize: number;
	fileName: string;
	height?: null | number;
	id?: string;
	mimeType: string;
	storageKey: string;
	url: string;
	usage: JobMediaUsage;
	width?: null | number;
}

export interface MarketplaceJobSections {
	organic: Job[];
	recommended: Job[];
	special: Job[];
	urgent: Job[];
}

export interface QueueFlag {
	label: string;
	match: string;
	sev: Severity;
}

export interface QueueItem {
	company: string;
	desc: string;
	// 본문에 실재하는 금칙어 원문만 담는다 — HiText가 이 문자열을 본문에서 찾아 강조한다.
	detected: string[];
	flags: QueueFlag[];
	id: string;
	location: string;
	// "대표 이미지 포함", "이미지 3개" 같은 구성 요약. 감지 문구와 섞으면
	// `감지 문구 "이미지 3개"`가 되고 본문 강조도 걸리지 않는다.
	mediaSummaries: string[];
	pay: string;
	receivedAt: string;
	refId: string;
	risk: Severity;
	riskLevel: RiskLevel;
	role: string;
	submitted: string;
	title: string;
}

export interface ThreadMessage {
	mine: boolean;
	text: string;
}

export type CommunityTargetStatus = "published" | "hidden" | "deleted";

// 신고 대상이 커뮤니티 글·댓글일 때 상세 미리보기·조치에 쓰는 옵션 컨텍스트.
export interface ReportCommunityTarget {
	authorName: string | null;
	board: string;
	bodyPreview: string;
	createdAt: Date | string;
	id: string;
	kind: "post" | "comment";
	// 댓글이면 원글 id.
	postId?: string;
	status: CommunityTargetStatus;
	// 댓글이면 원글 제목.
	title: string;
}

export interface Report {
	// 커뮤니티 신고면 대상 종류(post/comment). 컨텍스트 유실 시에도 커뮤니티 신고임을 안다.
	communityKind?: "post" | "comment";
	// 커뮤니티 대상 미리보기·조치 컨텍스트(대상이 유실되면 undefined).
	communityTarget?: ReportCommunityTarget;
	id: string;
	note: string;
	reason: string;
	reporter: string;
	reporterRole: string;
	sev: ReportSeverity;
	status: "open" | "closed";
	target: string;
	targetContext?: ReportTargetContext;
	// 실데이터 신고의 실제 대상 id(사용자 제재 등에 사용). 프리뷰 목업 신고에는 없다.
	targetId?: string;
	targetRole: string;
	// 실데이터(orpc) 신고에만 존재하는 대상 맥락. 프리뷰 목업 신고에는 없다.
	targetType?: ReportTargetType;
	thread: ThreadMessage[];
	time: string;
}

// DB account_status enum과 1:1이다(탈퇴는 상태가 아니라 user.deletedAt으로 표현).
export type UserStatus = "active" | "warned" | "suspended";

export interface ManagedUser {
	// 다른 사용자에게 차단당한 횟수(신고와 별개의 위험 신호).
	blockedByCount: number;
	// 소프트 탈퇴 시각. null이 아니면 탈퇴한 계정이다.
	deletedAt: Date | null;
	email: string;
	id: string;
	isPhoneVerified: boolean;
	// 표시용 가입일(포맷 완료 문자열). 정렬은 joinedAt으로 한다.
	joined: string;
	joinedAt: Date;
	// better-auth username 플러그인 로그인 아이디. 미설정 계정은 null.
	loginId: null | string;
	name: string;
	note: string;
	// 소속 업소 표시명(구인자만 채워진다).
	organizationNames: string[];
	reports: number;
	role: string;
	status: UserStatus;
	warnings: number;
}

export interface ReportReason {
	id: string;
	label: string;
	sev: ReportSeverity;
}
