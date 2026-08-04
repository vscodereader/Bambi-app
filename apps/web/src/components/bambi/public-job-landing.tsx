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
import { toMarketplaceJob } from "@/lib/bambi/api-job-mapper";
import {
	JOB_LANDING_INDUSTRIES,
	JOB_LANDING_REGIONS,
	type JobLandingIndustry,
	type JobLandingRegion,
	type JobLandingTarget,
	jobLandingHeading,
	jobLandingIntro,
	jobLandingPath,
} from "@/lib/bambi/job-landing";
import type { Job } from "@/lib/bambi/types";
import { client } from "@/utils/orpc";
import { JobCoverImage } from "./job-cover-image";

// 첫 화면에 실을 공고 수. 더보기·페이징은 두지 않는다 — 랜딩의 역할은 색인용 진입점이지
// 전체 목록 열람이 아니고, 더 보려면 /seeker 목록으로 넘어가는 게 정상 동선이다.
const LANDING_JOB_LIMIT = 24;

// 가입 유도 목적지. anon이 눌러도 게이트 리다이렉트 없이 바로 가입 카드가 뜬다.
const SIGNUP_HREF = "/seeker?auth=signup" as Route;

const loadLandingJobs = async ({
	industry,
	region,
}: JobLandingTarget): Promise<Job[]> => {
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
		// 조회가 실패해도 소개 문단·지역 링크는 색인 가치가 있으므로 페이지 자체는 뜬다.
		return [];
	}
};

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
	if (!region) {
		return null;
	}

	return (
		<nav
			aria-label="현재 위치"
			className="flex flex-wrap items-center gap-1 text-muted-foreground text-sm"
		>
			<Link className="hover:underline" href="/jobs">
				채용 정보
			</Link>
			<span aria-hidden="true">›</span>
			{industry ? (
				<>
					<Link
						className="hover:underline"
						href={jobLandingPath({ region }) as Route}
					>
						{region.label}
					</Link>
					<span aria-hidden="true">›</span>
					<span className="font-bold text-foreground">{industry.label}</span>
				</>
			) : (
				<span className="font-bold text-foreground">{region.label}</span>
			)}
		</nav>
	);
}

function LandingJobCard({ job }: { job: Job }) {
	// 수집 공고의 id는 job_post에 없어 상세 경로가 다르다(카드 매퍼와 같은 규칙).
	const href = (
		job.crawled ? `/seeker/jobs/crawled/${job.id}` : `/seeker/jobs/${job.id}`
	) as Route;

	return (
		<Link
			className="flex gap-3 rounded-lg border border-border bg-card p-3 no-underline transition-colors hover:border-primary/40"
			href={href}
		>
			{job.coverImage ? (
				// 목록 썸네일은 블러로 가린다 — 수다방 목록과 같은 기준이다. 원본은 상세에서 본다.
				<JobCoverImage
					className="size-12 shrink-0 rounded-md border border-border object-cover blur-sm"
					height={96}
					media={job.coverImage}
					width={96}
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
	const jobs = await loadLandingJobs(target);
	const heading = jobLandingHeading(target);

	return (
		<div className="flex flex-col gap-8 py-8">
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
