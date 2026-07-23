import type { Metadata, Viewport } from "next";
import Script from "next/script";
import { JsonLd } from "@/components/bambi/json-ld";
import { Providers } from "@/components/providers";
import { BAMBI_COMPANY } from "@/lib/bambi/company";
import { bambiSiteJsonLd, SITE_DESCRIPTION, SITE_TITLE } from "@/lib/bambi/seo";
import "../index.css";

export const metadata: Metadata = {
	metadataBase: new URL(BAMBI_COMPANY.url),
	title: SITE_TITLE,
	description: SITE_DESCRIPTION,
	keywords: [
		"유흥알바",
		"밤비",
		"밤알바",
		"룸알바",
		"노래주점알바",
		"룸싸롱알바",
		"유흥구인구직",
		"고소득알바",
		"여성알바",
		"접객알바",
	],
	authors: [{ name: "밤비" }],
	classification: "job",
	openGraph: {
		type: "website",
		locale: "ko_KR",
		siteName: BAMBI_COMPANY.serviceName,
		url: BAMBI_COMPANY.url,
		title: SITE_TITLE,
		description: SITE_DESCRIPTION,
		images: [
			{
				url: "/og-image.png",
				width: 1200,
				height: 630,
				alt: "밤비 - 유흥·접객 룸알바·구인구직 사이트",
			},
		],
	},
};

export const viewport: Viewport = {
	interactiveWidget: "resizes-content",
	themeColor: "#ffffff",
	viewportFit: "cover",
};

export default function RootLayout({
	children,
}: Readonly<{
	children: React.ReactNode;
}>) {
	return (
		<html lang="ko">
			<body>
				<JsonLd data={bambiSiteJsonLd} />
				<Providers>{children}</Providers>
				{/* Vercel은 프리뷰·개발 배포도 NODE_ENV=production이라, 프로덕션 배포에서만
				    참인 VERCEL_ENV로 게이팅해 dev/preview 트래픽이 GA에 섞이지 않게 한다.
				    루트 레이아웃은 서버 컴포넌트라 이 값이 런타임에 읽힌다. */}
				{process.env.VERCEL_ENV === "production" && (
					<>
						<Script src="https://www.googletagmanager.com/gtag/js?id=G-HNVZKKB0NX" />
						<Script id="gtag-init">
							{`window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', 'G-HNVZKKB0NX');`}
						</Script>
					</>
				)}
			</body>
		</html>
	);
}
