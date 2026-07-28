import type { MetadataRoute } from "next";
import { BAMBI_COMPANY } from "@/lib/bambi/company";

// 로그인·게스트 게이트 없이 크롤러가 실제로 도달할 수 있는 공개 경로만 싣는다
// (resolve-gate의 PUBLIC_PREFIXES 중 색인 가치가 있는 것). /seeker는 비로그인이면
// 인증 오버레이가 뜨는 진입점이라 색인 대상이고, 그 뒤 상세 경로는 넣지 않는다.
const PUBLIC_PATHS = ["/seeker", "/terms", "/privacy"] as const;

export default function sitemap(): MetadataRoute.Sitemap {
	return PUBLIC_PATHS.map((path) => ({
		url: `${BAMBI_COMPANY.url}${path}`,
	}));
}
