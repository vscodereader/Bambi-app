export type ReviewStatus = "pending_review" | "published";

export type ReviewRiskFlag =
	| "external_messenger"
	| "personal_data"
	| "phone_number"
	| "threat";

export type ReviewPolicyCode =
	| "body_too_long"
	| "body_too_short"
	| "invalid_rating";

export interface ReviewInput {
	body: string;
	rating: number;
}

export type ReviewPolicyResult =
	| {
			ok: true;
			riskFlags: ReviewRiskFlag[];
			status: ReviewStatus;
	  }
	| {
			code: ReviewPolicyCode;
			maxLength?: number;
			minLength?: number;
			ok: false;
	  };

export const REVIEW_BODY_MIN_LENGTH = 20;
export const REVIEW_BODY_MAX_LENGTH = 1000;

// 후기 작성자 표시명을 일반 회원용으로 마스킹한다. 익명 후기가 아닌 경우에만 사용한다.
// 코드포인트 단위(Array.from)로 세어 한글·이모지 결합 문자도 안전하게 처리한다.
// 빈값/null → "구직자", 1자 → "*", 2자 → 첫자+"*", 3자+ → 첫자 + "*"×가운데 + 끝자.
export const maskReviewerDisplayName = (
	name: null | string | undefined
): string => {
	const chars = Array.from((name ?? "").trim());

	if (chars.length === 0) {
		return "구직자";
	}

	if (chars.length === 1) {
		return "*";
	}

	if (chars.length === 2) {
		return `${chars[0]}*`;
	}

	return `${chars[0]}${"*".repeat(chars.length - 2)}${chars.at(-1)}`;
};

const PHONE_NUMBER_RE = /01[016789][-.\s]?\d{3,4}[-.\s]?\d{4}/;
const EXTERNAL_MESSENGER_RE =
	/(카톡|카카오|텔레|텔레그램|오픈채팅|오픈톡|라인\s*아이디|라인아이디|디엠|\bdm\b)/i;
const THREAT_RE = /(협박|위협|보복|신고하면|찾아가)/;
const PERSONAL_DATA_RE = /(주민번호|계좌번호|여권번호|집주소|자택주소)/;

const addRiskFlag = (
	riskFlags: ReviewRiskFlag[],
	flag: ReviewRiskFlag
): void => {
	if (!riskFlags.includes(flag)) {
		riskFlags.push(flag);
	}
};

export const validateReviewInput = ({
	body,
	rating,
}: ReviewInput): ReviewPolicyResult => {
	const trimmedBody = body.trim();

	if (!(Number.isInteger(rating) && rating >= 1 && rating <= 5)) {
		return { code: "invalid_rating", ok: false };
	}

	if (trimmedBody.length < REVIEW_BODY_MIN_LENGTH) {
		return {
			code: "body_too_short",
			minLength: REVIEW_BODY_MIN_LENGTH,
			ok: false,
		};
	}

	if (trimmedBody.length > REVIEW_BODY_MAX_LENGTH) {
		return {
			code: "body_too_long",
			maxLength: REVIEW_BODY_MAX_LENGTH,
			ok: false,
		};
	}

	const riskFlags: ReviewRiskFlag[] = [];

	if (PHONE_NUMBER_RE.test(trimmedBody)) {
		addRiskFlag(riskFlags, "phone_number");
	}

	if (EXTERNAL_MESSENGER_RE.test(trimmedBody)) {
		addRiskFlag(riskFlags, "external_messenger");
	}

	if (THREAT_RE.test(trimmedBody)) {
		addRiskFlag(riskFlags, "threat");
	}

	if (PERSONAL_DATA_RE.test(trimmedBody)) {
		addRiskFlag(riskFlags, "personal_data");
	}

	return {
		ok: true,
		riskFlags,
		status: riskFlags.length > 0 ? "pending_review" : "published",
	};
};
