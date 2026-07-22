import type { MetadataRoute } from "next";
import { BAMBI_COMPANY } from "@/lib/bambi/company";

// 로그인·게스트 게이트 없이 크롤러가 실제로 도달할 수 있는 공개 경로만 싣는다
// (resolve-gate의 PUBLIC_PREFIXES 중 색인 가치가 있는 것). /seeker 등 게이트 뒤
// 경로는 크롤러가 /welcome으로 리다이렉트되므로 넣지 않는다.
const PUBLIC_PATHS = ["/welcome", "/terms", "/privacy"] as const;

export default function sitemap(): MetadataRoute.Sitemap {
	return PUBLIC_PATHS.map((path) => ({
		url: `${BAMBI_COMPANY.url}${path}`,
	}));
}
