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
	// /api/guest 라우트가 포트원 본인인증 서비스(services/portone-identity)를 런타임
	// import 하므로 트랜스파일 대상에 넣는다.
	transpilePackages: ["shiki", "@bambi-app/api"],
};

export default nextConfig;
