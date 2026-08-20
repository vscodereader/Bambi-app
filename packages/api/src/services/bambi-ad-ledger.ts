// 유료 광고(노출 상품) 결제 확정 시 조직 단위 누적 집계용 원장(job_ad_purchase) 1행을 만든다.
// unpaid→paid 전환 분기에서 호출한다. DB를 건드리지 않는 순수 매핑이라, 호출부가 반환값이
// 있을 때만 tx.insert 한다(무료 공고는 adProductId가 null이라 적재 대상이 아니므로 null).

export type AdLedgerSource = "moderation_bulk" | "moderation_single";

export interface AdLedgerJobPost {
	adProductId: null | string;
	exposureAmount: null | number;
	exposureDurationDays: null | number;
	organizationId: string;
}

export interface AdLedgerInsert {
	adProductId: string;
	amount: number;
	durationDays: number;
	jobPostId: string;
	organizationId: string;
	source: AdLedgerSource;
}

export const buildAdLedgerInsert = (
	jobPostId: string,
	job: AdLedgerJobPost,
	source: AdLedgerSource
): AdLedgerInsert | null => {
	if (!job.adProductId) {
		return null;
	}

	return {
		adProductId: job.adProductId,
		amount: job.exposureAmount ?? 0,
		durationDays: job.exposureDurationDays ?? 0,
		jobPostId,
		organizationId: job.organizationId,
		source,
	};
};
