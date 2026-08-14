import {
	Accordion,
	AccordionContent,
	AccordionItem,
	AccordionTrigger,
} from "@bambi-app/ui/components/accordion";
import { notFound } from "next/navigation";
import { ManualBody } from "@/components/bambi/manual/manual-body";
import { ManualTabs } from "@/components/bambi/manual/manual-tabs";
import { ManualToc } from "@/components/bambi/manual/manual-toc";
import { type ManualKey, manualKeysForRole } from "@/lib/bambi/manual";
import { loadManual } from "@/lib/bambi/manual-content";
import { enforceManualAccess } from "@/lib/bambi/require-role";

// 매뉴얼 한 편의 전체 화면. 가드 → 파일 로드 → 헤더·탭·목차·본문 순으로 조립한다.
// 세 라우트 페이지가 key만 바꿔 재사용한다.
export async function ManualScreen({ manualKey }: { manualKey: ManualKey }) {
	const { role } = await enforceManualAccess(manualKey);
	const doc = await loadManual(manualKey);
	if (!doc) {
		notFound();
	}
	const keys = manualKeysForRole(role);

	return (
		<div className="flex flex-col gap-6 py-6">
			<header className="flex flex-col gap-3">
				<h1 className="m-0 font-extrabold text-xl">{doc.title}</h1>
				<ManualTabs active={manualKey} keys={keys} />
			</header>

			{/* 모바일·태블릿: 본문 위 접이식 목차 */}
			<Accordion className="rounded-xl border px-4 lg:hidden">
				<AccordionItem value="toc">
					<AccordionTrigger>목차</AccordionTrigger>
					<AccordionContent>
						<ManualToc headings={doc.headings} />
					</AccordionContent>
				</AccordionItem>
			</Accordion>

			<div className="flex items-start gap-8">
				{/* 데스크톱: sticky 목차 사이드바. 문서가 길어 자체 스크롤을 준다. */}
				<aside className="sticky top-20 hidden max-h-[calc(100vh-6rem)] w-64 shrink-0 overflow-y-auto lg:block">
					<ManualToc headings={doc.headings} />
				</aside>
				<div className="min-w-0 max-w-3xl flex-1">
					<ManualBody markdown={doc.markdown} />
				</div>
			</div>
		</div>
	);
}
