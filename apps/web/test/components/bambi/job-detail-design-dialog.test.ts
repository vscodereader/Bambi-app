import fs from "node:fs";
import { describe, expect, it } from "vitest";

import { srcPath } from "../../src-path";

// 다이얼로그는 @/utils/orpc를 타고 @bambi-app/env/web을 import 시점에 검증한다. 러너에는
// .env가 없으므로 동적 import 전에 최소 환경을 채운다(api-job-mapper.test.ts와 같은 관례).
process.env.NEXT_PUBLIC_SERVER_URL = "http://localhost:3000";
process.env.NEXT_PUBLIC_GCS_PUBLIC_BASE_URL = "https://cdn.bambi.test";

const { mergeDesignDetailPrefill } = await import(
	"@/components/bambi/job-detail-design-dialog"
);

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

	// 재조회(무효화·창 포커스 복귀)마다 getJobPostForAdmin은 새 참조를 돌려준다(응답에 Date가
	// 있어 structural sharing이 안 걸린다). 프리필이 그때마다 덮으면 아직 저장하지 않은 선택이
	// 경고 없이 사라지고, 이어지는 저장은 서버 상태 그대로를 저장하며 성공 토스트까지 띄운다.
	describe("mergeDesignDetailPrefill", () => {
		const saved = [
			{
				altText: "가게 외관",
				byteSize: 1024,
				fileName: "saved.jpg",
				height: 800,
				mimeType: "image/jpeg",
				storageKey: "org/1/detail/saved.jpg",
				width: 600,
			},
		];

		it("미저장 선택이 있으면 재조회분으로 덮지 않는다", () => {
			const picked = [
				{
					altText: "",
					byteSize: 2048,
					file: new File([], "picked.jpg"),
					fileName: "picked.jpg",
					mimeType: "image/jpeg",
					previewUrl: "blob:picked",
				},
			];

			expect(mergeDesignDetailPrefill(picked, saved)).toBe(picked);
		});

		it("미저장 선택이 없으면 저장분으로 채운다", () => {
			const merged = mergeDesignDetailPrefill([], saved);

			expect(merged).toHaveLength(1);
			expect(merged[0]?.storageKey).toBe("org/1/detail/saved.jpg");
			expect(merged[0]?.previewUrl).toBeTruthy();
			// 저장분에는 file이 없어야 다음 저장이 같은 이미지를 다시 올리지 않는다.
			expect(merged[0]?.file).toBeUndefined();
		});
	});

	it("제작 상태 알림이 폴백 문구로 떨어지지 않는다", () => {
		const source = read("lib/bambi/notification-labels.ts");

		expect(source).toContain("job_post:set_detail_design_status:completed");
		expect(source).toContain("job_post:set_detail_design_status:requested");
	});
});
