import { BAMBI_COMPANY } from "@bambi-app/api/services/bambi-company";
import { describe, expect, it } from "vitest";
import { resolveAdInquiryTel } from "@/lib/bambi/ad-inquiry-tel";

describe("resolveAdInquiryTel", () => {
	it("uses the ad inquiry number when the operator set one", () => {
		expect(
			resolveAdInquiryTel({ adInquiryTel: "070-1111-2222", tel: "02-333-4444" })
		).toBe("070-1111-2222");
	});

	it("falls back to the customer center number", () => {
		// 광고 문의 번호를 따로 두지 않은 운영자는 고객센터 번호로 문의를 받는다.
		expect(
			resolveAdInquiryTel({ adInquiryTel: null, tel: "02-333-4444" })
		).toBe("02-333-4444");
	});

	it("falls back to the code constant when nothing is set", () => {
		// 사이트 설정 행이 아예 없는 초기 상태에서도 자리표시에 번호가 비지 않아야 한다.
		expect(resolveAdInquiryTel({ adInquiryTel: null, tel: null })).toBe(
			BAMBI_COMPANY.tel
		);
	});

	it("treats a blank string as unset", () => {
		expect(
			resolveAdInquiryTel({ adInquiryTel: "   ", tel: "02-333-4444" })
		).toBe("02-333-4444");
	});
});
