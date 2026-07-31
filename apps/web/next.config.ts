import "@bambi-app/env/web";
import type { NextConfig } from "next";

const publicMediaBaseUrl = process.env.NEXT_PUBLIC_GCS_PUBLIC_BASE_URL;

// 공개 버킷 객체는 원격 호스트라, next/image가 최적화하려면 호스트를 명시해야 한다.
const remoteImagePatterns: NonNullable<NextConfig["images"]>["remotePatterns"] =
	[];

if (publicMediaBaseUrl) {
	const { hostname, pathname } = new URL(publicMediaBaseUrl);

	remoteImagePatterns.push({
		hostname,
		pathname: `${pathname.replace(/\/$/, "")}/**`,
		protocol: "https",
	});
}

const nextConfig: NextConfig = {
	images: { remotePatterns: remoteImagePatterns },
	typedRoutes: true,
	reactCompiler: true,
	// @bambi-app/api는 소스 TS를 그대로 export 한다. 웹은 지금까지 타입만 가져왔지만,
	// /api/guest 라우트가 포트원 본인인증 서비스(services/portone-identity)와
	// 레이트리밋 카운터(services/rate-limit)를 런타임 import 하므로 트랜스파일 대상에 넣는다.
	transpilePackages: ["shiki", "@bambi-app/api"],
	// 옛 진입 경로. 로그인·회원가입 UI가 /seeker 위 오버레이로 옮겨가 두 페이지는
	// 사라졌지만, 외부 북마크·검색엔진 색인이 남아 있어 영구 리다이렉트로 흡수한다.
	// next.config의 redirects는 프록시(미들웨어)보다 먼저 실행되므로 게이트에 걸리지 않는다.
	redirects() {
		return Promise.resolve([
			{ source: "/welcome", destination: "/seeker", permanent: true },
			{ source: "/login", destination: "/seeker?auth=login", permanent: true },
		]);
	},
};

export default nextConfig;
