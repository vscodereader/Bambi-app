import { db } from "@bambi-app/db";
import { bambiSiteSettings } from "@bambi-app/db/schema/bambi";
import { eq } from "drizzle-orm";

export const DEFAULT_SIGNUP_POINTS = 1000;
export const DEFAULT_ATTENDANCE_POINTS = 10;
export const DEFAULT_REVIEW_VIEW_POINTS = 10;
export const DEFAULT_REVIEW_WRITE_POINTS = 0;
export const POINT_SETTING_VALUE_MAX = 100_000_000;
export const SITE_SETTINGS_ROW_ID = "default";

export async function getPointSettings() {
	const settingsRows = await db
		.select({
			attendancePoints: bambiSiteSettings.attendancePoints,
			jobPaymentMaxPoints: bambiSiteSettings.jobPaymentMaxPoints,
			jobPaymentMinPoints: bambiSiteSettings.jobPaymentMinPoints,
			reviewViewPoints: bambiSiteSettings.reviewViewPoints,
			reviewWritePoints: bambiSiteSettings.reviewWritePoints,
			premiumPointJobRewardPoints:
				bambiSiteSettings.premiumPointJobRewardPoints,
			premiumPointJobRotationHours:
				bambiSiteSettings.premiumPointJobRotationHours,
			recommendedPointJobRewardPoints:
				bambiSiteSettings.recommendedPointJobRewardPoints,
			recommendedPointJobRotationHours:
				bambiSiteSettings.recommendedPointJobRotationHours,
			specialPointJobRewardPoints:
				bambiSiteSettings.specialPointJobRewardPoints,
			specialPointJobRotationHours:
				bambiSiteSettings.specialPointJobRotationHours,
			signupPoints: bambiSiteSettings.signupPoints,
		})
		.from(bambiSiteSettings)
		.where(eq(bambiSiteSettings.id, SITE_SETTINGS_ROW_ID))
		.limit(1);
	const settings = settingsRows[0];
	return {
		attendancePoints: settings?.attendancePoints ?? DEFAULT_ATTENDANCE_POINTS,
		jobPaymentMaxPoints: settings?.jobPaymentMaxPoints ?? null,
		jobPaymentMinPoints: settings?.jobPaymentMinPoints ?? null,
		reviewViewPoints: settings?.reviewViewPoints ?? DEFAULT_REVIEW_VIEW_POINTS,
		reviewWritePoints:
			settings?.reviewWritePoints ?? DEFAULT_REVIEW_WRITE_POINTS,
		premiumPointJobRewardPoints: settings?.premiumPointJobRewardPoints ?? null,
		premiumPointJobRotationHours:
			settings?.premiumPointJobRotationHours ?? null,
		recommendedPointJobRewardPoints:
			settings?.recommendedPointJobRewardPoints ?? null,
		recommendedPointJobRotationHours:
			settings?.recommendedPointJobRotationHours ?? null,
		specialPointJobRewardPoints: settings?.specialPointJobRewardPoints ?? null,
		specialPointJobRotationHours:
			settings?.specialPointJobRotationHours ?? null,
		signupPoints: settings?.signupPoints ?? DEFAULT_SIGNUP_POINTS,
	};
}
