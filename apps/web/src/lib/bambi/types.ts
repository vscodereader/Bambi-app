// 밤비 신뢰·안전 흐름 — 공용 타입

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

export interface Job {
	company: string;
	coverImage?: JobMedia | null;
	desc: string;
	descriptionBlocks?: JobDescriptionBlock[];
	detailImages?: JobMedia[];
	featured: boolean;
	hours: string;
	id: string;
	isPromoted?: boolean;
	lastBoostedAt?: Date | null | string;
	location: string;
	pay: string;
	pref: string;
	promotionLabel?: null | string;
	promotionTier?: "premium" | "recommended" | "standard" | null;
	rating: number;
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

export interface JobMedia {
	altText: string;
	byteSize: number;
	fileName: string;
	id?: string;
	mimeType: string;
	storageKey: string;
	url: string;
	usage: "cover" | "detail";
}

export interface MarketplaceJobSections {
	organic: Job[];
	premium: Job[];
	recommended: Job[];
}

export interface QueueFlag {
	label: string;
	match: string;
	sev: Severity;
}

export interface QueueItem {
	company: string;
	desc: string;
	detected: string[];
	flags: QueueFlag[];
	id: string;
	location: string;
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

export interface Report {
	id: string;
	note: string;
	reason: string;
	reporter: string;
	reporterRole: string;
	sev: ReportSeverity;
	status: "open" | "closed";
	target: string;
	targetRole: string;
	thread: ThreadMessage[];
	time: string;
}

export type UserStatus = "active" | "warned" | "suspended" | "blocked";

export interface ManagedUser {
	id: string;
	joined: string;
	name: string;
	note: string;
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
