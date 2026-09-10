export const warnedDismissKey = (
	userId: string,
	sanctionCreatedAt: Date | string | null
): string =>
	`bambi:warned-banner-dismissed:${userId}:${
		sanctionCreatedAt
			? new Date(sanctionCreatedAt).toISOString()
			: "no-timestamp"
	}`;

export const onboardingCompletionKey = (
	userId: string,
	role: "employer" | "job_seeker"
): string => `bambi:onboarding:seen:${userId}:${role}`;

export const popupHiddenKey = (id: string): string =>
	`bambi:main-popup:hidden:${id}`;

export const isPopupHidden = (
	raw: string | null,
	revision: number,
	now: number
): boolean => {
	if (!raw) {
		return false;
	}
	try {
		const parsed = JSON.parse(raw) as {
			hiddenUntil?: unknown;
			revision?: unknown;
		};
		return (
			parsed.revision === revision &&
			typeof parsed.hiddenUntil === "number" &&
			parsed.hiddenUntil > now
		);
	} catch {
		return false;
	}
};

export const POPUP_HIDE_MS = 86_400_000;
let popupLoginTarget: string | null = null;
export const savePopupLoginTarget = (target: string): void => {
	popupLoginTarget = target;
};
export const takePopupLoginTarget = (): string | null => {
	const target = popupLoginTarget;
	popupLoginTarget = null;
	return target;
};
const NATIVE_JOB_DETAIL = /\/jobs\/[^/]+$/;
const WEB_JOB_DETAIL = /^\/seeker\/jobs\/([^/]+)$/;
export const ABSOLUTE_WEB_URL = /^https?:\/\//;

export const nativePopupPageId = (pathname: string): string | null => {
	if (pathname === "/login") {
		return "login";
	}
	if (
		pathname === "/" ||
		pathname === "/(seeker)" ||
		pathname.includes("(tabs)")
	) {
		return "main";
	}
	if (NATIVE_JOB_DETAIL.test(pathname)) {
		return "seeker_job_detail";
	}
	if (pathname.includes("/chats")) {
		return "seeker_chats";
	}
	if (pathname.includes("/me/attendance")) {
		return "seeker_attendance";
	}
	if (pathname.includes("/me")) {
		return "seeker_me";
	}
	return null;
};

export const nativePopupLink = (path: string | null): string | null => {
	if (!path) {
		return null;
	}
	if (path === "/seeker") {
		return "/(seeker)";
	}
	const job = WEB_JOB_DETAIL.exec(path);
	if (job?.[1]) {
		return `/(seeker)/jobs/${job[1]}`;
	}
	if (path.startsWith("/seeker/chats")) {
		return path.replace("/seeker/chats", "/(seeker)/chats");
	}
	if (path.startsWith("/seeker/me")) {
		return path.replace("/seeker/me", "/(seeker)/me");
	}
	return ABSOLUTE_WEB_URL.test(path) ? path : null;
};
