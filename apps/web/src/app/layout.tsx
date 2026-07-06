import type { Metadata, Viewport } from "next";
import { Providers } from "@/components/providers";
import "../index.css";

export const metadata: Metadata = {
	metadataBase: new URL("https://bambialba.com"),
	title: "밤비 - 유흥·접객 | 룸알바·구인구직 사이트",
	description:
		"밤비는 유흥·접객 구인구직 플랫폼입니다. 룸알바, 밤알바, 노래방, 라운지 등 고소득 채용 정보를 1:1 채팅으로 빠르고 안전하게 연결합니다.",
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
		siteName: "밤비",
		url: "https://bambialba.com",
		title: "밤비 - 유흥·접객 | 룸알바·구인구직 사이트",
		description:
			"밤비는 유흥·접객 구인구직 플랫폼입니다. 룸알바, 밤알바, 노래방, 라운지 등 고소득 채용 정보를 1:1 채팅으로 빠르고 안전하게 연결합니다.",
		// TODO: 실제 OG 이미지 PNG(1200x630) 전달받으면 아래 주석 해제. 현재 public/og-image.png는 임시 placeholder.
		// images: [
		// 	{
		// 		url: "/og-image.png",
		// 		width: 1200,
		// 		height: 630,
		// 		alt: "밤비 - 유흥·접객 룸알바·구인구직 사이트",
		// 	},
		// ],
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
				<Providers>{children}</Providers>
			</body>
		</html>
	);
}
