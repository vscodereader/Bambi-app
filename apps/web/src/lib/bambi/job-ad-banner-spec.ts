// 광고 배너 규격. 서버 정책(packages/api/src/services/bambi-job-media-policy.ts)과
// 노출 슬롯 CSS(components/bambi/ad-banner.tsx)가 같은 비율을 쓴다. 슬롯은 object-cover라
// 비율이 약간 어긋나면 가운데를 기준으로 조금 잘려 나갈 뿐이지만, 크게 어긋나면 로고·문구가
// 잘려 광고 가치가 훼손된다. 그래서 최소 크기와 함께 비율도 허용 오차를 넘으면 반려한다.
export type JobAdBannerUsage = "ad_horizontal" | "ad_vertical";

export interface JobAdBannerSpec {
	aspectClassName: string;
	// 문구용 비율 표기. 안내 메시지는 특정 해상도가 아니라 비율로 말한다.
	aspectLabel: string;
	aspectRatio: number;
	description: string;
	label: string;
	// 하한. 이보다 작으면 슬롯에서 늘어나 뭉개진다. 미설정이면 크기는 안 본다.
	minHeight?: number;
	minWidth?: number;
	// 안내용 권장 해상도. 강제하지 않으며, 하한(min*)과 별도로 함께 안내한다.
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
		// 프리미엄 슬롯이 1행 2열로 커지면서 배너가 500px+ 폭으로 노출된다. 예전 하한(150×50)은
		// 그 폭에서 흐릿해 화질 하한을 700×300으로 올렸다. 권장 1400×600은 레티나(2x) 여유분이다.
		minHeight: 300,
		minWidth: 700,
		recommendedHeight: 600,
		recommendedWidth: 1400,
	},
	ad_vertical: {
		aspectClassName: "aspect-[4/9]",
		aspectLabel: "4:9",
		aspectRatio: 4 / 9,
		description: "우측 사이드 슬롯에 노출됩니다.",
		label: "세로형 광고 배너",
		// 표시 높이는 208px(h-52)라 400×900이면 이미 2x 레티나를 넘는다. 예전엔 권장값이라
		// 강제하지 않았지만 화질을 위해 그대로 최소로 승격했다(더 높은 권장값은 실익이 없어 생략).
		minHeight: 900,
		minWidth: 400,
	},
};

// 비율 허용 오차. 이 범위를 넘으면 업로드를 반려한다. 예전엔 이 값(±15%)을 넘으면 "잘림"을
// 경고만 했지만, 프리미엄 슬롯이 커지며 비율이 크게 어긋난 소재의 잘림이 눈에 띄어 반려로
// 바꿨다. 15%는 한 축의 약 13%가 잘리는 수준으로, 그 안쪽은 슬롯의 object-cover가 티 없이
// 흡수하므로 통과시킨다(예: 1200×500은 7:3과 오차 2.9%라 반려하지 않는다).
export const JOB_AD_BANNER_ASPECT_TOLERANCE = 0.15;

// 비율이 규격 허용 오차 안이면 true. 치수를 못 읽었으면(0 이하) 여기선 판단하지 않고
// (true) 크기 검증이 "치수를 확인하지 못했다"로 잡게 둔다.
export const isAllowedJobAdBannerAspect = ({
	height,
	usage,
	width,
}: {
	height: number;
	usage: JobAdBannerUsage;
	width: number;
}): boolean => {
	if (width <= 0 || height <= 0) {
		return true;
	}

	const { aspectRatio } = JOB_AD_BANNER_SPECS[usage];
	const ratio = width / height;

	return (
		Math.abs(ratio - aspectRatio) / aspectRatio <=
		JOB_AD_BANNER_ASPECT_TOLERANCE
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

	// 비율은 필수, 크기는 하한과 권장을 함께 안내한다. 셋 다 있으면 셋 다 보여준다.
	const parts = [`권장 비율 ${aspectLabel}`];

	if (minWidth && minHeight) {
		parts.push(`최소 ${minWidth}×${minHeight}px`);
	}

	if (recommendedWidth && recommendedHeight) {
		parts.push(`권장 ${recommendedWidth}×${recommendedHeight}px`);
	}

	return parts.join(" · ");
};

// 브라우저가 원본 치수를 읽는다. 서버는 바이트를 열지 않으므로 이 값이 크기·비율 검증의
// 근거다.
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
