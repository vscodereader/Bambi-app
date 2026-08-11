import type { Metadata, Viewport } from "next";
import Script from "next/script";
import { JsonLd } from "@/components/bambi/json-ld";
import { Providers } from "@/components/providers";
import { BAMBI_COMPANY } from "@/lib/bambi/company";
import {
	bambiSiteJsonLd,
	SITE_DESCRIPTION,
	SITE_KEYWORDS,
	SITE_TITLE,
} from "@/lib/bambi/seo";
import "../index.css";

export const metadata: Metadata = {
	metadataBase: new URL(BAMBI_COMPANY.url),
	title: SITE_TITLE,
	description: SITE_DESCRIPTION,
	keywords: SITE_KEYWORDS,
	authors: [{ name: "밤비알바" }],
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
				alt: SITE_TITLE,
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
						{/* 광고 신호를 끈다 — 크로스사이트 행태정보 수집·광고 개인화를 차단해
						    GA를 자사 방문 통계(처리위탁)로만 쓴다. 이래야 개인정보 보호법
						    제28조의8 제1항 제3호(위탁·보관 + 처리방침 공개)로 국외 이전을
						    동의 없이 커버할 수 있다. 광고 목적으로 전환하면 별도 동의가 필요하다. */}
						<Script id="gtag-init">
							{`window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', 'G-HNVZKKB0NX', {
  allow_google_signals: false,
  allow_ad_personalization_signals: false
});`}
						</Script>
					</>
				)}
			</body>
		</html>
	);
}
