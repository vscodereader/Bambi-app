import type { MetadataRoute } from "next";
import { BAMBI_COMPANY } from "@/lib/bambi/company";

// Vercel 프리뷰·dev 배포도 NODE_ENV=production이라, 실제 프로덕션에서만 참인
// VERCEL_ENV로 판정한다. 테스트 도메인이 색인되면 중복 콘텐츠로 프로덕션 순위가
// 깎이므로, 프로덕션이 아니면 전체 크롤링을 차단한다.
export default function robots(): MetadataRoute.Robots {
	if (process.env.VERCEL_ENV !== "production") {
		return { rules: { userAgent: "*", disallow: "/" } };
	}

	return {
		rules: { userAgent: "*", allow: "/" },
		sitemap: `${BAMBI_COMPANY.url}/sitemap.xml`,
	};
}
