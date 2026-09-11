// 정본은 packages/api 서비스로 옮겨 native와 공유한다(경로 호환용 재수출).
export type {
	ReportReason,
	ReportTargetType,
} from "@bambi-app/api/services/bambi-moderation-labels";
// biome-ignore lint/performance/noBarrelFile: 정본(packages/api) 이전에 따른 경로 호환용 재수출.
export {
	REPORT_REASON_LABELS,
	REPORT_TARGET_TYPE_LABELS,
	reportReasonLabel,
	targetTypeLabel,
} from "@bambi-app/api/services/bambi-moderation-labels";
