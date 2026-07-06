import type { Metadata, Viewport } from "next";
import { Providers } from "@/components/providers";
import "../index.css";

export const metadata: Metadata = {
	description: "밤비 — 합법 유흥·접객 채용의 신뢰와 안전 흐름",
	title: "밤비 · 신뢰와 안전",
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
