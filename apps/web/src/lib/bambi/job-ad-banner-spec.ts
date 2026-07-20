// 광고 배너 규격. 서버 정책(packages/api/src/services/bambi-job-media-policy.ts)과
// 노출 슬롯 CSS(components/bambi/ad-banner.tsx)가 같은 비율을 쓴다. 셋 중 하나만 바뀌면
// 광고가 잘려 나가므로 함께 고쳐야 한다.
export type JobAdBannerUsage = "ad_horizontal" | "ad_vertical";

export interface JobAdBannerSpec {
	aspectClassName: string;
	// 문구용 비율 표기. 안내·오류 메시지는 특정 해상도가 아니라 비율로 말한다.
	aspectLabel: string;
	aspectRatio: number;
	description: string;
	label: string;
	// 하한. 비율이 맞아도 이보다 작으면 슬롯에서 늘어나 뭉개진다. 미설정이면 크기는 안 본다.
	minHeight?: number;
	minWidth?: number;
	// 안내용 권장 해상도. 강제하지 않으며, 하한(min*)이 있으면 그쪽을 대신 안내한다.
	recommendedHeight?: number;
	recommendedWidth?: number;
}

export const JOB_AD_BANNER_SPECS: Record<JobAdBannerUsage, JobAdBannerSpec> = {
	ad_horizontal: {
		aspectClassName: "aspect-[7/3]",
		aspectLabel: "7:3",
		aspectRatio: 7 / 3,
		description: "좌측·상단 프리미엄 슬롯에 노출됩니다.",
		label: "가로형 광고 배너",
		// 하한과 비율은 서로 독립인 두 규칙이고 둘 다 통과해야 한다. 150×50 자체는 3:1이라
		// 비율 검증에 걸리므로, 실질 하한은 "가로 150px 이상"이고 세로는 7:3이 결정한다
		// (가로 150이면 세로는 약 64 이상). 세로 하한 50은 그래서 사실상 비구속이다.
		minHeight: 50,
		minWidth: 150,
	},
	ad_vertical: {
		aspectClassName: "aspect-[4/9]",
		aspectLabel: "4:9",
		aspectRatio: 4 / 9,
		description: "우측 사이드 슬롯에 노출됩니다.",
		label: "세로형 광고 배너",
		recommendedHeight: 900,
		recommendedWidth: 400,
	},
};

export const JOB_AD_BANNER_ASPECT_RATIO_TOLERANCE = 0.02;

export const isAllowedJobAdBannerAspectRatio = ({
	height,
	usage,
	width,
}: {
	height: number;
	usage: JobAdBannerUsage;
	width: number;
}): boolean => {
	if (width <= 0 || height <= 0) {
		return false;
	}

	const { aspectRatio } = JOB_AD_BANNER_SPECS[usage];

	return (
		Math.abs(width / height - aspectRatio) / aspectRatio <=
		JOB_AD_BANNER_ASPECT_RATIO_TOLERANCE
	);
};

export const isAllowedJobAdBannerSize = ({
	height,
	usage,
	width,
}: {
	height: number;
	usage: JobAdBannerUsage;
	width: number;
}): boolean => {
	const { minHeight, minWidth } = JOB_AD_BANNER_SPECS[usage];

	if (!(minWidth && minHeight)) {
		return true;
	}

	return width >= minWidth && height >= minHeight;
};

export const formatJobAdBannerSpec = (usage: JobAdBannerUsage): string => {
	const {
		aspectLabel,
		minHeight,
		minWidth,
		recommendedHeight,
		recommendedWidth,
	} = JOB_AD_BANNER_SPECS[usage];

	if (minWidth && minHeight) {
		return `비율 ${aspectLabel} · 최소 ${minWidth}×${minHeight}px`;
	}

	if (recommendedWidth && recommendedHeight) {
		return `비율 ${aspectLabel} · 권장 ${recommendedWidth}×${recommendedHeight}px`;
	}

	return `비율 ${aspectLabel}`;
};

// 브라우저가 원본 치수를 읽는다. 서버는 바이트를 열지 않으므로 이 값이 비율 검증의 근거다.
export const readImageDimensions = async (
	file: File
): Promise<{ height: number; width: number }> => {
	const bitmap = await createImageBitmap(file);

	try {
		return { height: bitmap.height, width: bitmap.width };
	} finally {
		bitmap.close();
	}
};
