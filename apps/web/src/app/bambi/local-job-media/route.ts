import type { NextRequest } from "next/server";

const escapeSvgText = (value: string): string =>
	value
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;");

export function GET(request: NextRequest) {
	const fileName =
		request.nextUrl.searchParams.get("fileName")?.trim() || "job-media";
	const usage = request.nextUrl.searchParams.get("usage");
	const label = usage === "cover" ? "COVER" : "DETAIL";
	const safeFileName = escapeSvgText(fileName.slice(0, 48));
	const svg = `<svg width="960" height="540" viewBox="0 0 960 540" fill="none" xmlns="http://www.w3.org/2000/svg">
<rect width="960" height="540" fill="#F7FBFA"/>
<rect x="56" y="56" width="848" height="428" rx="24" fill="#FFFFFF" stroke="#91CFC2" stroke-width="3"/>
<path d="M120 384L286 238L394 326L506 226L840 384V432H120V384Z" fill="#10B981" fill-opacity="0.16"/>
<circle cx="732" cy="158" r="62" fill="#FF6B4A" fill-opacity="0.18"/>
<rect x="120" y="120" width="86" height="86" rx="20" fill="#10B981"/>
<text x="236" y="174" fill="#12312B" font-family="Arial, sans-serif" font-size="54" font-weight="700">${label}</text>
<text x="120" y="452" fill="#4B5563" font-family="Arial, sans-serif" font-size="30" font-weight="700">${safeFileName}</text>
</svg>`;

	return new Response(svg, {
		headers: {
			"Cache-Control": "no-store",
			"Content-Type": "image/svg+xml; charset=utf-8",
		},
	});
}
