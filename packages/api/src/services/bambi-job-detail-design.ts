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

	// 완료 건은 애드온이 동결이다 — 상품가가 바뀌거나 운영자가 옵션가를 지워도(price null)
	// 재검증 없이 completed 스냅샷을 그대로 돌려준다. 금액은 이미 구매 시점 스냅샷으로 굳어
	// 재결제할 것이 없고, 여기서 not_offered/amount_changed로 막으면 완료 공고의 모든 저장
	// (오타 수정·상품 전환 포함)이 봉쇄되고 구인자가 스스로 복구할 길이 없어진다. 실제 금액
	// 보존은 toJobDetailDesignWrite가 금액 키를 빼서 하므로 아래 detailDesignAmount 값은
	// (옵션가가 사라졌으면 null이더라도) completed 경로에서 의도적으로 버려진다. 명시적
	// requested=false의 completed_locked는 위에서 이미 처리된다(완료 건 해제 불가, 스펙).
	if (currentStatus === "completed") {
		return {
			ok: true,
			snapshot: {
				detailDesignAmount: productDetailDesignPrice,
				detailDesignStatus: "completed",
			},
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
			detailDesignStatus: "requested",
		},
	};
};

// 저장 시 실제로 쓸 값. detailDesignAmount 키가 아예 없으면(=undefined) 기존 금액을
// 그대로 둔다는 뜻이다 — drizzle의 update set은 undefined 컬럼을 건너뛴다.
export interface JobDetailDesignWrite {
	detailDesignAmount?: null | number;
	detailDesignStatus: JobDetailDesignStatus | null;
}

// 제작이 끝난 건은 장부 금액(구매 시점 스냅샷)을 보존한다. 상품가가 나중에 바뀌어도
// 이미 결제·제작이 끝난 건의 금액이 소급 변경되면 안 되므로, 스냅샷이 들고 온 새 가격을
// 의도적으로 버리고 금액 키 자체를 빼서 컬럼을 건드리지 않게 한다.
export const toJobDetailDesignWrite = ({
	currentStatus,
	snapshot,
}: {
	currentStatus: JobDetailDesignStatus | null;
	snapshot: JobDetailDesignSnapshot;
}): JobDetailDesignWrite =>
	currentStatus === "completed"
		? { detailDesignStatus: snapshot.detailDesignStatus }
		: snapshot;

// 신청 여부를 안 보낸 저장(폼이 이 필드를 안 다루는 경로)에서 쓸 값. 원칙은 "기존 유지"지만,
// 새로 확정된 상품이 옵션을 제공하지 않으면 스냅샷을 지운다 — 안 지우면 상품만 바꾼 수정에서
// 유령 금액이 남아, 옵션이 없는(무료 포함) 공고에 결제 예정 금액이 계속 붙는다.
// completed만 예외다: 이미 제작이 끝난 이력을 상품 변경만으로 지우면, 해제를 막는
// completed_locked 규칙과 정면으로 어긋난다. 운영자가 손대야 하는 건으로 남겨 둔다.
export const keepOrClearJobDetailDesign = ({
	currentStatus,
	productOffersDetailDesign,
}: {
	currentStatus: JobDetailDesignStatus | null;
	productOffersDetailDesign: boolean;
}): JobDetailDesignWrite =>
	productOffersDetailDesign || currentStatus === "completed"
		? // 금액 키를 빼서 기존 금액을 그대로 둔다(상품가가 올라도 재가격하지 않는다).
			{ detailDesignStatus: currentStatus }
		: { detailDesignAmount: null, detailDesignStatus: null };

// 결제 예정 총액 = 노출 금액 + 옵션 금액. 둘 다 없으면 무료 공고라 null이다.
export const sumJobPaymentAmount = (
	exposureAmount: null | number,
	detailDesignAmount: null | number
): null | number =>
	exposureAmount === null && detailDesignAmount === null
		? null
		: (exposureAmount ?? 0) + (detailDesignAmount ?? 0);
