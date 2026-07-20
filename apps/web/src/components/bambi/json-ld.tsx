import { toJsonLdScriptContent } from "@/lib/bambi/seo";

// schema.org 구조화 데이터를 <script type="application/ld+json">으로 주입한다.
// JSON-LD는 스크립트 본문으로만 전달할 수 있어 dangerouslySetInnerHTML이 유일한 경로다.
export function JsonLd({ data }: { data: object }) {
	return (
		<script
			// biome-ignore lint/security/noDangerouslySetInnerHtml: JSON-LD는 script 본문 주입이 유일한 수단이며 toJsonLdScriptContent가 태그 탈출을 막는다
			dangerouslySetInnerHTML={{ __html: toJsonLdScriptContent(data) }}
			type="application/ld+json"
		/>
	);
}
