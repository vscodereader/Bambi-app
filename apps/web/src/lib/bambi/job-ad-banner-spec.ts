// 광고 배너 규격. 서버 정책(packages/api/src/services/bambi-job-media-policy.ts)과
// 노출 슬롯 CSS(components/bambi/ad-banner.tsx)가 같은 비율을 쓴다. 슬롯은 object-cover라
// 비율이 달라도 가운데를 기준으로 잘려 나갈 뿐 깨지지는 않으므로, 비율은 권장값이고
// 강제하지 않는다(어긋나면 업로더가 경고만 띄운다). 강제되는 건 최소 크기뿐이다.
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
		// 가로형은 세로보다 가로가 훨씬 길어서 실질적으로 구속하는 건 가로 하한 150이다
		// (7:3 근처라면 가로 150일 때 세로는 약 64라 하한 50을 이미 넘는다).
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

// 잘리는 방향. object-cover는 넘치는 축만 가운데 기준으로 자르므로, 원본이 슬롯보다
// 넓적하면 좌우("sides")가, 길쭉하면 위아래("topBottom")가 잘린다.
export type JobAdBannerCropDirection = "sides" | "topBottom";

// 경고 임계값. 예전 ±2%는 "이 비율이 아니면 반려"용이라 1200×500(오차 2.9%)이나
// 1080×1920 같은 실사용 소재까지 튕겨냈다. 지금은 반려가 아니라 안내라서, 눈에 띄게
// 잘릴 때만 말해야 한다. 비율 오차 15%는 한 축의 약 13%가 잘리는 수준 — 여백이면 모르고
// 넘어가지만 로고·문구가 걸리면 보이기 시작하는 경계다. 그 아래(예 1200×500)는
// 사실상 티가 안 나므로 조용히 통과시킨다.
export const JOB_AD_BANNER_CROP_WARNING_TOLERANCE = 0.15;

export const getJobAdBannerCropDirection = ({
	height,
	usage,
	width,
}: {
	height: number;
	usage: JobAdBannerUsage;
	width: number;
}): JobAdBannerCropDirection | null => {
	if (width <= 0 || height <= 0) {
		// 치수를 못 읽은 경우다. 크기 검증이 따로 잡으므로 여기선 아무 말도 하지 않는다.
		return null;
	}

	const { aspectRatio } = JOB_AD_BANNER_SPECS[usage];
	const ratio = width / height;

	if (
		Math.abs(ratio - aspectRatio) / aspectRatio <=
		JOB_AD_BANNER_CROP_WARNING_TOLERANCE
	) {
		return null;
	}

	return ratio > aspectRatio ? "sides" : "topBottom";
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

	// 비율은 권장, 크기 하한만 필수라서 문구에서도 둘을 구분해 말한다.
	if (minWidth && minHeight) {
		return `권장 비율 ${aspectLabel} · 최소 ${minWidth}×${minHeight}px`;
	}

	if (recommendedWidth && recommendedHeight) {
		return `권장 비율 ${aspectLabel} · 권장 크기 ${recommendedWidth}×${recommendedHeight}px`;
	}

	return `권장 비율 ${aspectLabel}`;
};

// 브라우저가 원본 치수를 읽는다. 서버는 바이트를 열지 않으므로 이 값이 크기 검증과
// 잘림 경고의 근거다.
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
