import type { Metadata } from "next";
import "../index.css";

export const metadata: Metadata = {
	description: "밤비 — 합법 유흥·접객 채용의 신뢰와 안전 흐름",
	title: "밤비 · 신뢰와 안전",
};

export default function RootLayout({
	children,
}: Readonly<{
	children: React.ReactNode;
}>) {
	return (
		<html lang="ko">
			<body>{children}</body>
		</html>
	);
}
