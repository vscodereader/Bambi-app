import { BAMBI_COMPANY } from "@bambi-app/api/services/bambi-company";
import type { MetadataRoute } from "next";
import { guidePath, guideSlugs } from "@/lib/bambi/guide";
import { buildJobLandingSitemapEntries } from "@/lib/bambi/job-landing-sitemap";
import {
	PUBLIC_BOARD_INDEX_PATH,
	PUBLIC_BOARDS,
	type PublicBoardMeta,
	publicBoardPath,
	publicPostPath,
} from "@/lib/bambi/public-community";
import { client } from "@/utils/orpc";

// 글 목록을 서버에서 받아 오므로 정적 생성 대상이 아니다. 강제 동적으로 두지 않으면
// 빌드 시점(서버 미기동)에 폴백만 담긴 사이트맵이 그대로 굳는다.
export const dynamic = "force-dynamic";

// 게시판당 실을 최신 글 상한. 더 오래된 글은 목록 페이지네이션(?page=)으로 닿는다 —
// 사이트맵이 글 수만큼 무한히 커지는 걸 막는 선이다.
const POSTS_PER_BOARD = 200;

// 로그인·게스트 게이트 없이 크롤러가 실제로 도달할 수 있는 공개 경로만 싣는다
// (resolve-gate의 PUBLIC_PREFIXES 중 색인 가치가 있는 것). /seeker는 비로그인이면
// 인증 오버레이가 뜨는 진입점이라 색인 대상이고, 그 뒤 상세 경로는 넣지 않는다.
const STATIC_PATHS: readonly string[] = [
	"/seeker",
	"/about",
	"/terms",
	"/privacy",
];

const boardPaths = (): string[] => [
	PUBLIC_BOARD_INDEX_PATH,
	...PUBLIC_BOARDS.map((board) => publicBoardPath(board.slug)),
];

// 가이드 허브 + 5편. 정적 콘텐츠라 lastmod 없이 정적 항목으로 싣는다.
const guidePaths = (): string[] => [
	"/jobs/guide",
	...guideSlugs().map(guidePath),
];

// 공개 목록 프로시저를 그대로 재사용한다(사이트맵 전용 조회를 새로 만들지 않는다).
// 1페이지로 총 건수를 확인한 뒤 남은 페이지만 병렬로 받는다.
const loadBoardPostEntries = async (
	board: PublicBoardMeta
): Promise<MetadataRoute.Sitemap> => {
	const first = await client.bambi.community.listPublicPosts({
		board: board.key,
		page: 1,
	});
	const pageCount = Math.ceil(
		Math.min(first.totalCount, POSTS_PER_BOARD) / first.pageSize
	);
	const rest = await Promise.all(
		Array.from({ length: Math.max(pageCount - 1, 0) }, (_, index) =>
			client.bambi.community.listPublicPosts({
				board: board.key,
				page: index + 2,
			})
		)
	);

	return [first, ...rest]
		.flatMap((data) => data.items)
		.slice(0, POSTS_PER_BOARD)
		.map((post) => ({
			lastModified: post.updatedAt,
			url: `${BAMBI_COMPANY.url}${publicPostPath(board.slug, post.id)}`,
		}));
};

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
	const staticEntries = [...STATIC_PATHS, ...boardPaths(), ...guidePaths()].map(
		(path) => ({
			url: `${BAMBI_COMPANY.url}${path}`,
		})
	);

	let landingEntries: MetadataRoute.Sitemap;

	try {
		// 지역×업종 집계로 0건 조합을 빼고 lastmod를 채운다. 조회 실패 시 null → 현행 폴백
		// (161개 전부·lastmod 없음)을 pure 함수가 그대로 낸다.
		const summary = await client.bambi.jobs.landingSummary();
		landingEntries = buildJobLandingSitemapEntries(summary, BAMBI_COMPANY.url);
	} catch {
		landingEntries = buildJobLandingSitemapEntries(null, BAMBI_COMPANY.url);
	}

	let postEntries: MetadataRoute.Sitemap = [];

	try {
		postEntries = (
			await Promise.all(PUBLIC_BOARDS.map(loadBoardPostEntries))
		).flat();
	} catch {
		// 조회가 실패해도 정적 공개 경로만은 내보낸다(빈 사이트맵보다 낫다).
	}

	return [...staticEntries, ...landingEntries, ...postEntries];
}
