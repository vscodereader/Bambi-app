// 누적 광고일수 등급 구간 검증(순수). 상한 없음(null)은 항상 유효, 값이면 최소 일수가 최대
// 일수보다 크면 안 된다. 라우터 zod refine과 테스트가 공유한다.
export const isAdPeriodTierRangeValid = (
	minDays: number,
	maxDays: null | number
): boolean => maxDays === null || minDays <= maxDays;

// 아이콘 색: Tailwind 텍스트 색 유틸만 허용(raw hex 금지). 브랜드색 text-primary(숫자 없음)와
// text-amber-500(숫자 있음) 둘 다 통과. 화면은 프리셋에서 고르지만 서버도 최소 형태를 막는다.
const TEXT_COLOR_CLASS = /^text-[a-z]+(-\d{2,3})?$/;

export const isAdPeriodTierColorClassValid = (value: string): boolean =>
	TEXT_COLOR_CLASS.test(value);

// 등급 아이콘 이미지 정책 — 공고·수다방·채팅이 함께 쓰는 bambi-media-policy와 일부러 분리했다.
// 저기에 image/gif를 더하면 구직자 채팅·수다방 글까지 애니메이션 GIF가 열려버린다. 등급
// 아이콘은 운영자(adminProcedure)만 올리는 자리라 GIF를 여기서만 허용한다.
export const AD_PERIOD_TIER_ICON_MIME_TYPES = [
	"image/gif",
	"image/jpeg",
	"image/png",
	"image/webp",
] as const;

// 배지 안에서 16px로 그려지는 아이콘이라 10MB(공용 상한)까지 받을 이유가 없다.
export const AD_PERIOD_TIER_ICON_MAX_BYTES = 2 * 1024 * 1024;

export type AdPeriodTierIconPolicyCode =
	| "empty_file_name"
	| "file_too_large"
	| "unsupported_type";

export const validateAdPeriodTierIconUpload = ({
	byteSize,
	fileName,
	mimeType,
}: {
	byteSize: number;
	fileName: string;
	mimeType: string;
}): { code: AdPeriodTierIconPolicyCode; ok: false } | { ok: true } => {
	if (!fileName.trim()) {
		return { code: "empty_file_name", ok: false };
	}
	if (
		!(AD_PERIOD_TIER_ICON_MIME_TYPES as readonly string[]).includes(mimeType)
	) {
		return { code: "unsupported_type", ok: false };
	}
	if (byteSize > AD_PERIOD_TIER_ICON_MAX_BYTES) {
		return { code: "file_too_large", ok: false };
	}
	return { ok: true };
};
