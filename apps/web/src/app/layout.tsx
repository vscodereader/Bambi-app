import type { Metadata, Viewport } from "next";
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
		"노래방알바",
		"라운지알바",
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
			</body>
		</html>
	);
}
