// 광고 배너 규격. 서버 정책(packages/api/src/services/bambi-job-media-policy.ts)과
// 노출 슬롯 CSS(components/bambi/ad-banner.tsx)가 같은 비율을 쓴다. 셋 중 하나만 바뀌면
// 광고가 잘려 나가므로 함께 고쳐야 한다.
export type JobAdBannerUsage = "ad_horizontal" | "ad_vertical";

export interface JobAdBannerSpec {
	aspectClassName: string;
	aspectRatio: number;
	description: string;
	label: string;
	// 하한. 비율이 맞아도 이보다 작으면 슬롯에서 늘어나 뭉개진다. 미설정이면 크기는 안 본다.
	minHeight?: number;
	minWidth?: number;
	recommendedHeight: number;
	recommendedWidth: number;
}

export const JOB_AD_BANNER_SPECS: Record<JobAdBannerUsage, JobAdBannerSpec> = {
	ad_horizontal: {
		aspectClassName: "aspect-[7/3]",
		aspectRatio: 7 / 3,
		description: "좌측·상단 프리미엄 슬롯에 노출됩니다.",
		label: "가로형 광고 배너",
		// 259×111은 정확히 7:3(259=7×37, 111=3×37)이라 비율 규칙은 그대로 통과한다.
		minHeight: 111,
		minWidth: 259,
		recommendedHeight: 600,
		recommendedWidth: 1400,
	},
	ad_vertical: {
		aspectClassName: "aspect-[4/9]",
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
	const { minHeight, minWidth, recommendedHeight, recommendedWidth } =
		JOB_AD_BANNER_SPECS[usage];

	if (minWidth && minHeight) {
		return `최소 ${minWidth}×${minHeight}px (권장 ${recommendedWidth}×${recommendedHeight}px)`;
	}

	return `권장 ${recommendedWidth}×${recommendedHeight}px`;
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
