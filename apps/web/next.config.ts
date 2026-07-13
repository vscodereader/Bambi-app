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
	transpilePackages: ["shiki"],
};

export default nextConfig;
