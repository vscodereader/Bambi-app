// 공개 가이드 콘텐츠(/jobs/guide, /jobs/guide/[slug])의 본문. 랜딩(public-job-landing)과
// 같은 서버 컴포넌트 원칙을 따른다 — 크롤러가 JS 실행 없이 본문을 읽고, 링크는 실제 <a href>다.
// 섹션 헤딩·문단·FAQ 텍스트 블록 스타일을 랜딩과 일관되게 맞춘다(BreadcrumbList + Article
// JSON-LD, FAQPage JSON-LD 금지).

import { Badge } from "@bambi-app/ui/components/badge";
import type { Route } from "next";
import Link from "next/link";
import { Fragment } from "react";
import {
	GUIDE_CONTENTS,
	type GuideContent,
	type GuideLandingLink,
	guidePath,
} from "@/lib/bambi/guide";
import {
	findJobLandingIndustry,
	findJobLandingRegion,
	jobLandingPath,
} from "@/lib/bambi/job-landing";
import {
	articleJsonLd,
	type BreadcrumbItem,
	breadcrumbJsonLd,
} from "@/lib/bambi/seo";
import { JsonLd } from "./json-ld";

interface LandingLink {
	href: Route;
	label: string;
}

// 관련 랜딩 슬러그 쌍 → 실제 링크. 슬러그가 표에 없으면(오타·삭제) null로 걸러 죽은 링크를 막는다.
const resolveLandingLink = ({
	industry,
	region,
}: GuideLandingLink): LandingLink | null => {
	const landingRegion = findJobLandingRegion(region);

	if (!landingRegion) {
		return null;
	}

	const landingIndustry = industry
		? findJobLandingIndustry(industry)
		: undefined;

	// 업종 슬러그를 줬는데 표에 없으면 링크를 만들지 않는다(지역만인 경우는 정상).
	if (industry && !landingIndustry) {
		return null;
	}

	return {
		href: jobLandingPath({
			industry: landingIndustry,
			region: landingRegion,
		}) as Route,
		label: `${[landingRegion.label, landingIndustry?.label]
			.filter(Boolean)
			.join(" ")} 채용 정보`,
	};
};

// 화면 nav와 JSON-LD가 같은 계층·순서를 공유한다(랜딩 LandingBreadcrumb와 같은 패턴).
function GuideBreadcrumb({ items }: { items: readonly BreadcrumbItem[] }) {
	return (
		<>
			<JsonLd data={breadcrumbJsonLd(items)} />
			<nav
				aria-label="현재 위치"
				className="flex flex-wrap items-center gap-1 text-muted-foreground text-sm"
			>
				{items.map((item, index) => {
					const isCurrent = index === items.length - 1;

					return (
						<Fragment key={item.path}>
							{index > 0 ? <span aria-hidden="true">›</span> : null}
							{isCurrent ? (
								<span className="font-bold text-foreground">{item.name}</span>
							) : (
								<Link className="hover:underline" href={item.path as Route}>
									{item.name}
								</Link>
							)}
						</Fragment>
					);
				})}
			</nav>
		</>
	);
}

// 링크 칩 목록(랜딩 LandingLinkChips와 같은 스타일).
function LinkChips({
	items,
	title,
}: {
	items: readonly LandingLink[];
	title: string;
}) {
	if (items.length === 0) {
		return null;
	}

	return (
		<section className="flex flex-col gap-2">
			<h2 className="m-0 font-extrabold text-base">{title}</h2>
			<ul className="flex list-none flex-wrap gap-2 p-0">
				{items.map((item) => (
					<li key={item.href}>
						<Badge
							render={<Link href={item.href}>{item.label}</Link>}
							variant="outline"
						/>
					</li>
				))}
			</ul>
		</section>
	);
}

export function JobGuide({ content }: { content: GuideContent }) {
	const path = guidePath(content.slug);
	const breadcrumbItems: BreadcrumbItem[] = [
		{ name: "홈", path: "/seeker" },
		{ name: "채용 정보", path: "/jobs" },
		{ name: "가이드", path: "/jobs/guide" },
		{ name: content.title, path },
	];

	const relatedLandings = content.relatedLandings
		.map(resolveLandingLink)
		.filter((link): link is LandingLink => link !== null);

	// 관련 가이드 slug → 링크. 레지스트리에 없는 slug는 걸러 죽은 링크를 막는다.
	const relatedGuides = content.relatedGuides
		.map((slug) => GUIDE_CONTENTS.find((guide) => guide.slug === slug))
		.filter((guide): guide is GuideContent => guide !== undefined)
		.map((guide) => ({
			href: guidePath(guide.slug) as Route,
			label: guide.title,
		}));

	return (
		<div className="flex flex-col gap-8 py-8">
			<JsonLd
				data={articleJsonLd({
					description: content.description,
					headline: content.title,
					path,
				})}
			/>
			<header className="flex flex-col gap-3">
				<GuideBreadcrumb items={breadcrumbItems} />
				<h1 className="m-0 font-extrabold text-2xl sm:text-3xl">
					{content.title}
				</h1>
				<p className="m-0 text-muted-foreground text-sm">
					{content.description}
				</p>
			</header>

			{content.sections.map((section) => (
				<section className="flex flex-col gap-3" key={section.heading}>
					<h2 className="m-0 font-extrabold text-lg">{section.heading}</h2>
					{section.paragraphs.map((paragraph) => (
						<p className="m-0 text-muted-foreground text-sm" key={paragraph}>
							{paragraph}
						</p>
					))}
				</section>
			))}

			<section className="flex flex-col gap-4">
				<h2 className="m-0 font-extrabold text-lg">자주 묻는 질문</h2>
				{content.faqs.map((faq) => (
					<div className="flex flex-col gap-1" key={faq.question}>
						<h3 className="m-0 font-bold text-base text-foreground">
							{faq.question}
						</h3>
						<p className="m-0 text-muted-foreground text-sm">{faq.answer}</p>
					</div>
				))}
			</section>

			<LinkChips items={relatedLandings} title="관련 채용 정보" />
			<LinkChips items={relatedGuides} title="관련 가이드" />
		</div>
	);
}

// 가이드 허브(/jobs/guide) — 5편 목록. 랜딩 인덱스와 같은 카드/칩 톤.
export function JobGuideHub() {
	const breadcrumbItems: BreadcrumbItem[] = [
		{ name: "홈", path: "/seeker" },
		{ name: "채용 정보", path: "/jobs" },
		{ name: "가이드", path: "/jobs/guide" },
	];

	return (
		<div className="flex flex-col gap-8 py-8">
			<header className="flex flex-col gap-3">
				<GuideBreadcrumb items={breadcrumbItems} />
				<h1 className="m-0 font-extrabold text-2xl sm:text-3xl">
					유흥·접객 알바 가이드
				</h1>
				<p className="m-0 text-muted-foreground text-sm">
					업종별 알바의 뜻과 근무 방식, 정산 구조, 자주 묻는 질문을 정리한
					가이드입니다. 관심 있는 주제를 골라 확인해 보세요.
				</p>
			</header>

			<section className="grid grid-cols-1 gap-3 sm:grid-cols-2">
				{GUIDE_CONTENTS.map((guide) => (
					<Link
						className="flex flex-col gap-2 rounded-lg border border-border bg-card p-4 no-underline transition-colors hover:border-primary/40"
						href={guidePath(guide.slug) as Route}
						key={guide.slug}
					>
						<h2 className="m-0 font-extrabold text-base text-foreground">
							{guide.title}
						</h2>
						<p className="m-0 text-muted-foreground text-sm">
							{guide.description}
						</p>
					</Link>
				))}
			</section>

			<section className="flex flex-col gap-2">
				<h2 className="m-0 font-extrabold text-base">지역·업종별 채용 정보</h2>
				<ul className="flex list-none flex-wrap gap-2 p-0">
					<li>
						<Badge
							render={<Link href={"/jobs" as Route}>채용 정보 전체 보기</Link>}
							variant="outline"
						/>
					</li>
				</ul>
			</section>
		</div>
	);
}
