import { ImageResponse } from "next/og";

export const alt = "밤비 - 유흥·접객 룸알바·구인구직 사이트";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const MARK = "밤비";
const TAG = "유흥·접객 구인구직 플랫폼";
const SUB = "룸알바 · 밤알바 · 노래방 · 라운지 고소득 채용";
const FOOT = "1:1 채팅으로 빠르고 안전하게 연결";
const URL = "bambialba.com";

// 구글 폰트 CSS에서 TTF/OTF 소스 URL을 뽑는 정규식.
const FONT_SRC_REGEX =
	/src:\s*url\((.+?)\)\s*format\('(?:opentype|truetype)'\)/;

// Satori는 woff2를 못 읽으므로 구형 User-Agent로 구글 폰트 TTF를 강제로 받는다.
async function loadKoreanFont(
	weight: number,
	text: string
): Promise<ArrayBuffer> {
	const familyUrl = `https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@${weight}&text=${encodeURIComponent(
		text
	)}`;
	const css = await (
		await fetch(familyUrl, {
			headers: {
				"User-Agent":
					"Mozilla/5.0 (Windows NT 6.1) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/40.0.0.0 Safari/537.36",
			},
		})
	).text();
	const match = css.match(FONT_SRC_REGEX);
	if (!match) {
		throw new Error("Noto Sans KR 폰트 URL을 찾지 못했습니다.");
	}
	return await (await fetch(match[1])).arrayBuffer();
}

export default async function OpengraphImage() {
	const fontText = `${MARK}${TAG}${SUB}${FOOT}${URL}0123456789:·|`;
	const [regular, bold] = await Promise.all([
		loadKoreanFont(500, fontText),
		loadKoreanFont(800, fontText),
	]);

	return new ImageResponse(
		<div
			style={{
				width: "100%",
				height: "100%",
				display: "flex",
				flexDirection: "column",
				justifyContent: "space-between",
				padding: "84px 88px",
				background:
					"radial-gradient(120% 120% at 100% 0%, #2a1220 0%, #121a26 55%, #0f1620 100%)",
				fontFamily: "Noto Sans KR",
			}}
		>
			{/* 코럴 글로우 악센트 */}
			<div
				style={{
					position: "absolute",
					top: -160,
					right: -120,
					width: 520,
					height: 520,
					borderRadius: "9999px",
					background:
						"radial-gradient(circle, rgba(249,75,99,0.55) 0%, rgba(249,75,99,0) 70%)",
					display: "flex",
				}}
			/>

			{/* 상단: 브랜드 마크 */}
			<div style={{ display: "flex", alignItems: "center", gap: 24 }}>
				<div
					style={{
						display: "flex",
						alignItems: "center",
						justifyContent: "center",
						width: 88,
						height: 88,
						borderRadius: 24,
						background: "linear-gradient(135deg, #f94b63 0%, #e5304c 100%)",
						fontSize: 52,
						fontWeight: 800,
						color: "#ffffff",
					}}
				>
					{MARK}
				</div>
				<div
					style={{
						display: "flex",
						fontSize: 30,
						fontWeight: 500,
						color: "rgba(255,255,255,0.72)",
						letterSpacing: 2,
					}}
				>
					{URL}
				</div>
			</div>

			{/* 중앙: 헤드라인 */}
			<div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
				<div
					style={{
						display: "flex",
						fontSize: 40,
						fontWeight: 800,
						color: "#f94b63",
					}}
				>
					{TAG}
				</div>
				<div
					style={{
						display: "flex",
						fontSize: 74,
						fontWeight: 800,
						color: "#ffffff",
						lineHeight: 1.15,
					}}
				>
					{SUB}
				</div>
			</div>

			{/* 하단: 서브 카피 */}
			<div
				style={{
					display: "flex",
					alignItems: "center",
					gap: 18,
					fontSize: 34,
					fontWeight: 500,
					color: "rgba(255,255,255,0.82)",
				}}
			>
				<div
					style={{
						display: "flex",
						width: 14,
						height: 14,
						borderRadius: "9999px",
						background: "#f94b63",
					}}
				/>
				{FOOT}
			</div>
		</div>,
		{
			...size,
			fonts: [
				{ name: "Noto Sans KR", data: regular, weight: 500, style: "normal" },
				{ name: "Noto Sans KR", data: bold, weight: 800, style: "normal" },
			],
		}
	);
}
