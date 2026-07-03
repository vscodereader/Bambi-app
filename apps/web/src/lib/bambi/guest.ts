export const GUEST_COOKIE_NAME = "bambi_guest";
export const GUEST_COOKIE_VALUE = "1";
export const GUEST_COOKIE_MAX_AGE = 60 * 60 * 24 * 30;

export const readGuestFromCookieString = (cookie: string): boolean =>
	cookie
		.split(";")
		.map((part) => part.trim())
		.some((part) => part === `${GUEST_COOKIE_NAME}=${GUEST_COOKIE_VALUE}`);
