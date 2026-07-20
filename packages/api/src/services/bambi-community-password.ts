import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const KEY_LENGTH = 64;
const SALT_BYTES = 16;

// 커뮤니티 글 비밀번호 저장 형식: "<salt hex>:<scrypt hash hex>".
export const hashCommunityPassword = (password: string): string => {
	const salt = randomBytes(SALT_BYTES).toString("hex");
	const hash = scryptSync(password, salt, KEY_LENGTH).toString("hex");
	return `${salt}:${hash}`;
};

export const verifyCommunityPassword = (
	password: string,
	stored: string
): boolean => {
	const [salt, hash] = stored.split(":");
	if (!(salt && hash)) {
		return false;
	}
	const candidate = scryptSync(password, salt, KEY_LENGTH);
	const expected = Buffer.from(hash, "hex");
	return (
		candidate.length === expected.length && timingSafeEqual(candidate, expected)
	);
};
