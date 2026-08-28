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

const WHITESPACE = /\s+/;

// 어절 수(공백 분할) 기반 읽기 시간(분). 분당 250어절, 최소 1분. 섹션 문단만 집계.
function guideReadingMinutes({ sections }: GuideContent): number {
	const words = sections.reduce(
		(total, section) =>
			total +
			section.paragraphs.reduce(
				(sum, paragraph) =>
					sum + paragraph.trim().split(WHITESPACE).filter(Boolean).length,
				0
			),
		0
	);
	return Math.max(1, Math.round(words / 250));
}

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
		<div className="mx-auto flex w-full max-w-3xl flex-col gap-10 py-10 md:py-14">
			<JsonLd
				data={articleJsonLd({
					description: content.description,
					headline: content.title,
					path,
				})}
			/>
			<header className="flex flex-col gap-4">
				<GuideBreadcrumb items={breadcrumbItems} />
				<h1 className="m-0 text-balance font-extrabold text-3xl tracking-tight sm:text-4xl">
					{content.title}
				</h1>
				<p className="m-0 text-pretty text-base text-muted-foreground leading-7 sm:text-lg sm:leading-8">
					{content.description}
				</p>
			</header>

			{content.sections.map((section) => (
				<section className="flex flex-col gap-4" key={section.heading}>
					<h2 className="m-0 font-bold text-foreground text-xl tracking-tight sm:text-2xl">
						{section.heading}
					</h2>
					{section.paragraphs.map((paragraph) => (
						<p
							className="m-0 text-pretty text-base text-foreground leading-7 sm:leading-8"
							key={paragraph}
						>
							{paragraph}
						</p>
					))}
				</section>
			))}

			<section className="flex flex-col gap-6">
				<h2 className="m-0 font-bold text-foreground text-xl tracking-tight sm:text-2xl">
					자주 묻는 질문
				</h2>
				{content.faqs.map((faq) => (
					<div className="flex flex-col gap-2" key={faq.question}>
						<h3 className="m-0 font-bold text-foreground text-lg">
							{faq.question}
						</h3>
						<p className="m-0 text-pretty text-base text-foreground leading-7 sm:leading-8">
							{faq.answer}
						</p>
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
		<div className="flex flex-col gap-10 py-10 md:py-12">
			<header className="flex flex-col gap-4">
				<GuideBreadcrumb items={breadcrumbItems} />
				<h1 className="m-0 text-balance font-extrabold text-3xl tracking-tight sm:text-4xl">
					유흥·접객 알바 가이드
				</h1>
				<p className="m-0 max-w-2xl text-pretty text-base text-muted-foreground leading-7 sm:text-lg sm:leading-8">
					업종별 알바의 뜻과 근무 방식, 정산 구조, 자주 묻는 질문을 정리한
					가이드입니다. 관심 있는 주제를 골라 확인해 보세요.
				</p>
			</header>

			<section className="grid grid-cols-1 gap-4 sm:grid-cols-2">
				{GUIDE_CONTENTS.map((guide) => {
					const readingMinutes = guideReadingMinutes(guide);
					return (
						<Link
							className="flex h-full flex-col gap-3 rounded-lg border border-border bg-card p-5 no-underline transition-colors hover:border-primary/40"
							href={guidePath(guide.slug) as Route}
							key={guide.slug}
						>
							<h2 className="m-0 text-balance font-bold text-foreground text-lg tracking-tight">
								{guide.title}
							</h2>
							<p className="m-0 line-clamp-2 text-muted-foreground text-sm leading-6">
								{guide.description}
							</p>
							<p className="m-0 mt-auto text-muted-foreground text-xs">
								읽는 시간 약 {readingMinutes}분
							</p>
						</Link>
					);
				})}
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

			<section className="flex flex-col gap-2">
				<h2 className="m-0 font-extrabold text-base">커뮤니티</h2>
				<ul className="flex list-none flex-wrap gap-2 p-0">
					<li>
						<Badge
							render={
								<Link href={"/board" as Route}>밤알바 커뮤니티 게시판</Link>
							}
							variant="outline"
						/>
					</li>
				</ul>
			</section>
		</div>
	);
}
