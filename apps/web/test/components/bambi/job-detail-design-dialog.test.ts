import fs from "node:fs";
import { describe, expect, it } from "vitest";

import { srcPath } from "../../src-path";

const read = (file: string) => fs.readFileSync(srcPath(file), "utf8");

describe("디자인 제작 관리 다이얼로그", () => {
	it("상세 이미지 슬롯 컴포넌트를 재사용한다", () => {
		expect(read("components/bambi/job-post-media-uploader.tsx")).toContain(
			"export function JobDetailImageSlots"
		);
		expect(read("components/bambi/job-detail-design-dialog.tsx")).toContain(
			"JobDetailImageSlots"
		);
	});

	it("업로드 인텐트·교체·완료 토글 프로시저를 모두 호출한다", () => {
		const source = read("components/bambi/job-detail-design-dialog.tsx");

		expect(source).toContain("createJobPostDesignMediaUpload");
		expect(source).toContain("setJobPostDesignMedia");
		expect(source).toContain("setJobPostDesignStatus");
		expect(source).toContain("uploadFileToSignedUrl");
	});

	it("결제 관리 화면이 총액 합산·필터·다이얼로그를 갖는다", () => {
		const source = read("app/moderator/payments/page.tsx");

		expect(source).toContain("sumJobPaymentAmount");
		expect(source).toContain("onlyDetailDesign");
		expect(source).toContain("JOB_DETAIL_DESIGN_STATUS_LABELS");
		expect(source).toContain("JobDetailDesignDialog");
	});

	it("제작 상태 알림이 폴백 문구로 떨어지지 않는다", () => {
		const source = read("lib/bambi/notification-labels.ts");

		expect(source).toContain("job_post:set_detail_design_status:completed");
		expect(source).toContain("job_post:set_detail_design_status:requested");
	});
});
