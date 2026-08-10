// 상세이미지 디자인 제작 애드온의 금액 합산·스냅샷 판정. 순수·무 import 모듈이라
// apps/web도 그대로 import한다(bambi-ad-pricing과 같은 규칙) — 폼에 보이는 결제 예정
// 금액과 서버가 저장하는 금액이 같은 함수에서 나온다.
// 에러를 던지지 않고 코드만 돌려주는 이유: ORPCError를 import하는 순간 웹 번들에
// 서버 의존성이 끌려온다. 문구·상태코드 번역은 라우터가 한다.

export const jobDetailDesignStatuses = ["requested", "completed"] as const;

export type JobDetailDesignStatus = (typeof jobDetailDesignStatuses)[number];

export interface JobDetailDesignSnapshot {
	detailDesignAmount: null | number;
	detailDesignStatus: JobDetailDesignStatus | null;
}

export type JobDetailDesignResolution =
	| { code: "amount_changed"; expectedAmount: number; ok: false; price: number }
	| { code: "completed_locked"; ok: false }
	| { code: "not_offered"; ok: false }
	| { ok: true; snapshot: JobDetailDesignSnapshot };

export const resolveJobDetailDesign = ({
	currentStatus,
	expectedAmount,
	productDetailDesignPrice,
	requested,
}: {
	currentStatus: JobDetailDesignStatus | null;
	// 클라이언트가 화면에서 본 옵션 가격. 서버 가격과 다르면 재확인을 요구한다.
	expectedAmount?: null | number;
	productDetailDesignPrice: null | number;
	requested: boolean;
}): JobDetailDesignResolution => {
	if (!requested) {
		// 이미 제작이 끝난 건은 흔적을 지우지 않는다.
		if (currentStatus === "completed") {
			return { code: "completed_locked", ok: false };
		}

		return {
			ok: true,
			snapshot: { detailDesignAmount: null, detailDesignStatus: null },
		};
	}

	if (productDetailDesignPrice === null) {
		return { code: "not_offered", ok: false };
	}

	if (expectedAmount != null && expectedAmount !== productDetailDesignPrice) {
		return {
			code: "amount_changed",
			expectedAmount,
			ok: false,
			price: productDetailDesignPrice,
		};
	}

	return {
		ok: true,
		snapshot: {
			detailDesignAmount: productDetailDesignPrice,
			// 재신청이 아니라 completed 유지 — 상태를 requested로 되돌리면 완료된 작업이
			// 운영자 큐에 다시 뜬다.
			detailDesignStatus: currentStatus ?? "requested",
		},
	};
};

// 결제 예정 총액 = 노출 금액 + 옵션 금액. 둘 다 없으면 무료 공고라 null이다.
export const sumJobPaymentAmount = (
	exposureAmount: null | number,
	detailDesignAmount: null | number
): null | number =>
	exposureAmount === null && detailDesignAmount === null
		? null
		: (exposureAmount ?? 0) + (detailDesignAmount ?? 0);
