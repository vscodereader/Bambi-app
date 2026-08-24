// 공개 공고 랜딩(/jobs, /jobs/[region], /jobs/[region]/[industry])의 본문. 세 라우트가
// 축 조합만 다르고 나머지는 같아 한 서버 컴포넌트가 전부 그린다.
//
// 서버 컴포넌트인 것이 핵심이다 — 크롤러가 JS 실행 없이 공고 제목·지역·급여를 그대로
// 읽어야 하고, 랜딩 간 이동도 실제 <a href>여야 한다(클라이언트 라우팅 핸들러 금지).
// 카드 클릭만 로그인 게이트가 걸린 /seeker/jobs/[id]로 나간다(의도된 전환 지점).

import { Badge } from "@bambi-app/ui/components/badge";
import { Button } from "@bambi-app/ui/components/button";
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyTitle,
} from "@bambi-app/ui/components/empty";
import type { Route } from "next";
import Link from "next/link";
import { cache, Fragment } from "react";
import { toMarketplaceJob } from "@/lib/bambi/api-job-mapper";
import {
	findJobLandingIndustry,
	findJobLandingRegion,
	JOB_LANDING_INDUSTRIES,
	JOB_LANDING_REGIONS,
	type JobLandingIndustry,
	type JobLandingRegion,
	type JobLandingTarget,
	jobLandingDescription,
	jobLandingHeading,
	jobLandingIntro,
	jobLandingPath,
} from "@/lib/bambi/job-landing";
import {
	type DefinitionBlock,
	type FaqItem,
	jobLandingIndustryDefinition,
	jobLandingIndustryFaqs,
	jobLandingPlatformFaqs,
	jobLandingRegionNote,
	jobLandingServiceDefinition,
} from "@/lib/bambi/job-landing-content";
import {
	type BreadcrumbItem,
	breadcrumbJsonLd,
	collectionPageJsonLd,
} from "@/lib/bambi/seo";
import type { Job } from "@/lib/bambi/types";
import { client } from "@/utils/orpc";
import { JobCoverImage } from "./job-cover-image";
import { JsonLd } from "./json-ld";

// 첫 화면에 실을 공고 수. 더보기·페이징은 두지 않는다 — 랜딩의 역할은 색인용 진입점이지
// 전체 목록 열람이 아니고, 더 보려면 /seeker 목록으로 넘어가는 게 정상 동선이다.
const LANDING_JOB_LIMIT = 24;

// 가입 유도 목적지. anon이 눌러도 게이트 리다이렉트 없이 바로 가입 카드가 뜬다.
const SIGNUP_HREF = "/seeker?auth=signup" as Route;

// cache()는 인자의 참조 동일성으로 키를 잡는다 — 매 요청 새로 만들어지는 target 객체를
// 키로 쓰면 generateMetadata와 페이지 렌더가 서로 다른 키가 돼 조회가 두 번 나간다.
// 원시값 슬러그로 키를 잡아, 같은 요청 안의 두 호출이 조회 하나를 공유하게 한다.
const loadLandingJobsBySlug = cache(
	async (regionSlug?: string, industrySlug?: string): Promise<Job[] | null> => {
		const region = regionSlug ? findJobLandingRegion(regionSlug) : undefined;
		const industry = industrySlug
			? findJobLandingIndustry(industrySlug)
			: undefined;

		try {
			const { sections } = await client.bambi.jobs.list({
				limit: LANDING_JOB_LIMIT,
				...(industry ? { industryCategory: industry.label } : {}),
				...(region ? { regionCode: region.code } : {}),
			});
			// 유료 섹션 행은 organic에도 같이 담겨 오므로 id로 중복을 걷어낸다.
			const unique = new Map<string, (typeof sections.organic)[number]>();

			for (const item of [
				...sections.special,
				...sections.urgent,
				...sections.recommended,
				...sections.organic,
			]) {
				if (!unique.has(item.id)) {
					unique.set(item.id, item);
				}
			}

			return [...unique.values()]
				.slice(0, LANDING_JOB_LIMIT)
				.map(toMarketplaceJob);
		} catch {
			// 조회 실패(null)와 진짜 0건([])을 구분한다 — 실패 시 generateMetadata가 noindex를
			// 붙이지 않아 정상 랜딩이 API 일시 장애로 색인에서 빠지지 않는다. 렌더는 null을 []로 본다.
			return null;
		}
	}
);

// 캐시 함수는 원시값 키를 받으므로, 슬러그를 풀어 넘기는 얇은 래퍼만 노출한다.
export const loadLandingJobs = ({
	industry,
	region,
}: JobLandingTarget): Promise<Job[] | null> =>
	loadLandingJobsBySlug(region?.slug, industry?.slug);

// 수집 공고 id는 job_post에 없어 상세 경로가 다르다. 카드 href와 CollectionPage ItemList가
// 같은 경로를 쓰도록 한 곳에서 만든다.
const jobDetailPath = (job: Job): string =>
	job.crawled ? `/seeker/jobs/crawled/${job.id}` : `/seeker/jobs/${job.id}`;

interface LandingLink {
	href: Route;
	label: string;
}

interface LandingLinkSection {
	items: LandingLink[];
	title: string;
}

// 랜딩끼리 서로를 링크해 크롤러가 두 홉 안에 모든 조합에 닿게 한다.
const buildLinkSections = ({
	industry,
	region,
}: JobLandingTarget): LandingLinkSection[] => {
	const regionLinks = (withIndustry?: JobLandingIndustry): LandingLink[] =>
		JOB_LANDING_REGIONS.filter((item) => item.slug !== region?.slug).map(
			(item) => ({
				href: jobLandingPath({ industry: withIndustry, region: item }) as Route,
				label: withIndustry
					? `${item.label} ${withIndustry.label}`
					: item.label,
			})
		);
	const industryLinks = (inRegion: JobLandingRegion): LandingLink[] =>
		JOB_LANDING_INDUSTRIES.filter((item) => item.slug !== industry?.slug).map(
			(item) => ({
				href: jobLandingPath({ industry: item, region: inRegion }) as Route,
				label: item.label,
			})
		);

	if (region && industry) {
		return [
			{ items: industryLinks(region), title: `${region.label} 다른 업종` },
			{ items: regionLinks(industry), title: `다른 지역 ${industry.label}` },
		];
	}

	if (region) {
		return [
			{
				items: industryLinks(region),
				title: `${region.label} 업종별 채용 정보`,
			},
			{ items: regionLinks(), title: "다른 지역 채용 정보" },
		];
	}

	// 인덱스에서는 업종 링크의 지역 축을 첫 지역(서울)으로 고정한다 — 업종만 있는 랜딩은
	// 없고, 나머지 지역×업종은 각 지역 랜딩이 이어서 링크한다.
	const [firstRegion] = JOB_LANDING_REGIONS;

	return [
		{ items: regionLinks(), title: "지역별 채용 정보" },
		...(firstRegion
			? [
					{
						items: industryLinks(firstRegion),
						title: `${firstRegion.label} 업종별 채용 정보`,
					},
				]
			: []),
	];
};

function LandingBreadcrumb({ industry, region }: JobLandingTarget) {
	// 화면 nav와 JSON-LD가 같은 계층·순서를 공유한다 — 구조화 데이터가 화면에 없는 경로를
	// 주장하면 리치 결과에서 빠진다. 모든 계층이 홈 › 채용 정보로 시작하고, 인덱스도 그린다.
	const breadcrumbItems: BreadcrumbItem[] = [
		{ name: "홈", path: "/seeker" },
		{ name: "채용 정보", path: "/jobs" },
		...(region
			? [{ name: region.label, path: jobLandingPath({ region }) }]
			: []),
		...(region && industry
			? [{ name: industry.label, path: jobLandingPath({ industry, region }) }]
			: []),
	];

	return (
		<>
			<JsonLd data={breadcrumbJsonLd(breadcrumbItems)} />
			<nav
				aria-label="현재 위치"
				className="flex flex-wrap items-center gap-1 text-muted-foreground text-sm"
			>
				{breadcrumbItems.map((item, index) => {
					const isCurrent = index === breadcrumbItems.length - 1;

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

function LandingJobCard({ job }: { job: Job }) {
	const href = jobDetailPath(job) as Route;
	// ponytail: 수집 공고 커버는 DB에 base64 data URI로 들어와, 24장이면 HTML이 수 MB가 된다
	// (모바일 LCP 30s 실측). 랜딩 카드 썸네일은 어차피 블러라 시각 가치가 없으니 data URI는
	// 싣지 않는다(텍스트 카드). 업그레이드 경로: 수집 미디어 GCS 이관 또는 이미지 프록시 라우트.
	const cover =
		job.coverImage && !job.coverImage.url.startsWith("data:")
			? job.coverImage
			: null;

	return (
		<Link
			className="flex gap-3 rounded-lg border border-border bg-card p-3 no-underline transition-colors hover:border-primary/40"
			href={href}
		>
			{cover ? (
				// 목록 썸네일은 블러로 가린다 — 수다방 목록과 같은 기준이다. 원본은 상세에서 본다.
				<JobCoverImage
					className="size-10 shrink-0 rounded-lg border border-border object-cover blur-sm"
					height={40}
					media={cover}
					width={40}
				/>
			) : null}
			<div className="flex min-w-0 flex-1 flex-col gap-1">
				<h3 className="m-0 truncate font-extrabold text-base text-foreground">
					{job.title}
				</h3>
				<p className="m-0 truncate text-muted-foreground text-sm">
					{job.company} · {job.location}
				</p>
				<p className="m-0 font-bold text-foreground text-sm">{job.pay}</p>
				<div className="flex flex-wrap items-center gap-1">
					<Badge variant="secondary">{job.type}</Badge>
					{job.verified ? <Badge variant="success">인증 완료</Badge> : null}
					{job.instantInterview ? (
						<Badge variant="outline">당일면접</Badge>
					) : null}
				</div>
			</div>
		</Link>
	);
}

// 정의 섹션(h2 질문형 + 문단). 헤딩 직하 첫 문단은 반드시 완결된 직답(body[0])이어야
// AI가 문단째 발췌한다 — 그래서 지역 고유 lead는 body[0] '뒤'에 끼운다. 같은 업종 정의가
// 16개 지역에 반복돼도 지역 문장이 페이지마다 텍스트를 달라지게 하되, 직답은 항상 맨 앞이다.
function DefinitionSection({
	block,
	lead,
}: {
	block: DefinitionBlock;
	lead?: string;
}) {
	return (
		<section className="flex flex-col gap-3">
			<h2 className="m-0 font-extrabold text-lg">{block.title}</h2>
			{block.body.map((paragraph, index) => (
				<Fragment key={paragraph}>
					<p className="m-0 text-muted-foreground text-sm">{paragraph}</p>
					{index === 0 && lead ? (
						<p className="m-0 text-muted-foreground text-sm">{lead}</p>
					) : null}
				</Fragment>
			))}
		</section>
	);
}

// FAQ는 접힘(details/accordion) 없이 항상 펼쳐진 정적 텍스트로 그린다 — 크롤러·AI가 접힌
// 답변을 못 읽는 리스크를 없앤다. 질문은 h3(정의 h2 하위), 답변은 첫 문장이 직답.
function FaqSection({ items }: { items: readonly FaqItem[] }) {
	return (
		<section className="flex flex-col gap-4">
			<h2 className="m-0 font-extrabold text-lg">자주 묻는 질문</h2>
			{items.map((item) => (
				<div className="flex flex-col gap-1" key={item.question}>
					<h3 className="m-0 font-bold text-base text-foreground">
						{item.question}
					</h3>
					<p className="m-0 text-muted-foreground text-sm">{item.answer}</p>
				</div>
			))}
		</section>
	);
}

// 축 조합별 정의·FAQ 노출: 인덱스=서비스 정의+플랫폼 FAQ, 지역=지역 서술+플랫폼 FAQ,
// 지역×업종=업종 정의(지역 서술로 감쌈)+업종 FAQ.
function LandingContentSections({ industry, region }: JobLandingTarget) {
	if (region && industry) {
		return (
			<>
				<DefinitionSection
					block={jobLandingIndustryDefinition(industry)}
					lead={jobLandingRegionNote(region) || undefined}
				/>
				<FaqSection items={jobLandingIndustryFaqs(industry)} />
			</>
		);
	}

	if (region) {
		const note = jobLandingRegionNote(region);

		return (
			<>
				{note ? (
					<section className="flex flex-col gap-3">
						<h2 className="m-0 font-extrabold text-lg">
							{region.label} 유흥·접객 알바 안내
						</h2>
						<p className="m-0 text-muted-foreground text-sm">{note}</p>
					</section>
				) : null}
				<FaqSection items={jobLandingPlatformFaqs()} />
			</>
		);
	}

	return (
		<>
			<DefinitionSection block={jobLandingServiceDefinition()} />
			<FaqSection items={jobLandingPlatformFaqs()} />
		</>
	);
}

function LandingLinkChips({ items, title }: LandingLinkSection) {
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

export async function PublicJobLanding({ industry, region }: JobLandingTarget) {
	const target: JobLandingTarget = { industry, region };
	// 조회 실패(null)든 진짜 0건이든 화면은 소개·링크를 그대로 띄운다 — null을 []로 취급.
	const jobs = (await loadLandingJobs(target)) ?? [];
	const heading = jobLandingHeading(target);

	return (
		<div className="flex flex-col gap-8 py-8">
			{jobs.length > 0 ? (
				<JsonLd
					data={collectionPageJsonLd({
						path: jobLandingPath(target),
						name: heading,
						description: jobLandingDescription(target),
						items: jobs.map(jobDetailPath),
					})}
				/>
			) : null}
			<header className="flex flex-col gap-3">
				<LandingBreadcrumb industry={industry} region={region} />
				<h1 className="m-0 font-extrabold text-2xl sm:text-3xl">{heading}</h1>
				{jobLandingIntro(target).map((paragraph) => (
					<p className="m-0 text-muted-foreground text-sm" key={paragraph}>
						{paragraph}
					</p>
				))}
				<div>
					<Button
						nativeButton={false}
						render={<Link href={SIGNUP_HREF}>회원가입하고 채팅으로 문의</Link>}
						variant="outline"
					/>
				</div>
			</header>

			<section className="flex flex-col gap-3">
				<h2 className="m-0 font-extrabold text-lg">
					모집 중인 공고 {jobs.length}개
				</h2>
				{jobs.length > 0 ? (
					<div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
						{jobs.map((job) => (
							<LandingJobCard job={job} key={job.id} />
						))}
					</div>
				) : (
					<Empty className="border border-border">
						<EmptyHeader>
							<EmptyTitle>지금은 모집 중인 공고가 없어요</EmptyTitle>
							<EmptyDescription>
								다른 지역이나 업종을 골라 보세요. 새 공고는 등록되는 대로
								올라옵니다.
							</EmptyDescription>
						</EmptyHeader>
					</Empty>
				)}
			</section>

			<LandingContentSections industry={industry} region={region} />

			{buildLinkSections(target).map((section) => (
				<LandingLinkChips
					items={section.items}
					key={section.title}
					title={section.title}
				/>
			))}

			<section className="flex flex-col items-start gap-3 rounded-xl border border-border bg-card p-6">
				<h2 className="m-0 font-extrabold text-lg">
					마음에 드는 공고를 찾으셨나요?
				</h2>
				<p className="m-0 text-muted-foreground text-sm">
					회원가입하면 공고 상세와 1:1 채팅 문의를 이용할 수 있습니다. 연락처를
					먼저 공개하지 않아도 됩니다.
				</p>
				<Button
					nativeButton={false}
					render={<Link href={SIGNUP_HREF}>회원가입하고 시작하기</Link>}
					size="lg"
				/>
			</section>
		</div>
	);
}
