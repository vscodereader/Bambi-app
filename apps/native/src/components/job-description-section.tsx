import {
	type JobDescriptionBlock,
	resolveJobDescriptionContent,
} from "@bambi-app/api/services/bambi-job-description-blocks";
import { Text, View } from "react-native";

import { CrawledJobDetailImages } from "@/src/components/crawled-job-detail-images";
import { publicObjectUri } from "@/src/lib/bambi-native";

const BULLET_ITEM_SEPARATOR = /\n+/;

// getById media.detail 행에서 이 섹션이 실제로 읽는 필드만 좁힌다(웹 detailImages와 같은 축).
// sliceGroupId/sliceIndex는 서버가 긴 원본을 잘라 저장한 조각 메타(비조각은 null). 서버
// 타입 반영 전에도 통과하도록 optional로 두면 구조적 타이핑으로 필드가 생기면 흐른다.
interface JobDetailMedia {
	height: null | number;
	sliceGroupId?: null | string;
	sliceIndex?: null | number;
	storageKey: string;
	width: null | number;
}

// 웹 DescriptionBlock의 노드 타입별 렌더를 native View/Text로 이식한다. 강조(callout)는 웹의
// coral-50/coral-800 분홍 박스를 브랜드 코랄인 --accent 토큰(bg-accent/10)으로 옮긴다.
function DescriptionBlock({ block }: { block: JobDescriptionBlock }) {
	if (block.type === "heading") {
		return (
			<Text className="font-bold text-foreground text-lg" selectable>
				{block.text}
			</Text>
		);
	}

	if (block.type === "bullet_list") {
		const itemOccurrences = new Map<string, number>();
		const items = block.text
			.split(BULLET_ITEM_SEPARATOR)
			.map((item) => item.trim())
			.filter((item) => item.length > 0)
			.map((text) => {
				const occurrence = (itemOccurrences.get(text) ?? 0) + 1;
				itemOccurrences.set(text, occurrence);
				return { key: `${block.id}-${text}-${occurrence}`, text };
			});

		return (
			<View className="gap-1">
				{items.map((item) => (
					<View className="flex-row gap-2" key={item.key}>
						<Text className="text-base text-foreground leading-6">{"•"}</Text>
						<Text
							className="flex-1 text-base text-foreground leading-6"
							selectable
						>
							{item.text}
						</Text>
					</View>
				))}
			</View>
		);
	}

	if (block.type === "callout") {
		return (
			<View className="rounded-lg border border-accent/20 bg-accent/10 p-3">
				<Text className="text-base text-foreground leading-6" selectable>
					{block.text}
				</Text>
			</View>
		);
	}

	return (
		<Text className="text-base text-foreground leading-6" selectable>
			{block.text}
		</Text>
	);
}

// 정보 섹션에서 뺀 "공고 설명"을 웹 seeker 상세와 같은 별도 섹션으로 그린다: 헤딩 → 서식 있는
// 본문(문단/소제목/불릿/강조) → 상세 이미지. 이미지는 수집 상세의 접힘+더보기 컴포넌트를
// 재사용하되 media.detail(storageKey 배열)을 그 문서 형태로 변환해 넘긴다.
export function JobDescriptionSection({
	description,
	descriptionBlocks,
	detail,
	gcsPublicBaseUrl,
	title,
}: {
	description: string;
	descriptionBlocks: JobDescriptionBlock[];
	detail: readonly JobDetailMedia[];
	gcsPublicBaseUrl: string | undefined;
	title: string;
}) {
	const content = resolveJobDescriptionContent({
		description,
		descriptionBlocks,
	});

	// storageKey → URL은 목록 커버와 같은 publicObjectUri 한 곳을 지난다(dev의 web 로컬
	// 라우트 분기까지 포함) — 여기서 따로 조립하면 목록엔 뜨는데 상세만 빈 칸이 된다.
	// URL을 못 만들거나(base 없음) 크기 메타가 없는 행은 aspectRatio를 못 잡으므로 뺀다.
	const imageRows = detail.flatMap((media) => {
		const src = publicObjectUri(media.storageKey, gcsPublicBaseUrl);

		return src && media.width && media.height
			? [
					{
						height: media.height,
						sliceGroupId: media.sliceGroupId ?? null,
						src,
						storageKey: media.storageKey,
						width: media.width,
					},
				]
			: [];
	});
	const imageDocument = {
		assets: imageRows.map((row) => ({
			height: row.height,
			id: row.storageKey,
			src: row.src,
			width: row.width,
		})),
		// storageKey는 행마다 고유하므로 asset id 겸 조각 id로 쓴다. sliceGroupId를 실어
		// 렌더러가 같은 원본 조각을 이음새 없이 묶게 한다(비조각은 null → 단독 그룹).
		items: imageRows.map((row) => ({
			assetId: row.storageKey,
			id: row.storageKey,
			sliceGroupId: row.sliceGroupId,
		})),
	};

	return (
		<View className="gap-4">
			<Text className="font-bold text-foreground text-xl" selectable>
				공고 설명
			</Text>
			{content.showDescription ? (
				<Text className="text-base text-foreground leading-6" selectable>
					{content.description}
				</Text>
			) : null}
			{content.blocks.map((block) => (
				<DescriptionBlock block={block} key={block.id} />
			))}
			<CrawledJobDetailImages document={imageDocument} title={title} />
		</View>
	);
}
