import { Button, cn, useThemeColor } from "heroui-native";
import { useState } from "react";
import { Image, type LayoutChangeEvent, View } from "react-native";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";

import {
	type DetailImageSliceItem,
	groupDetailImageSlices,
} from "@/src/lib/bambi-native";

// 접힘 높이는 Tailwind h-96(24rem = 384px). 상수는 콘텐츠가 이 높이를 넘는지 재는
// 기준으로만 쓰고, 실제 클리핑 높이는 아래 클리퍼의 className h-96가 건다.
const COLLAPSED_HEIGHT = 384;
// 잘린 경계를 알리는 하단 페이드 높이(h-16 = 64px). Svg는 숫자 높이가 필요해 상수로 둔다.
const FADE_HEIGHT = 64;

interface DetailImageDocument {
	assets: readonly {
		height: number;
		id: string;
		src: string;
		width: number;
	}[];
	items: readonly DetailImageSliceItem[];
}

// 웹 수집 상세의 CollapsibleJobDescription "일부만 보여주고 더보기" 패턴을 이식한다.
// 웹은 뷰포트 높이를 실시간 계측해 접힘 높이를 잡지만, native는 고정 높이(h-96)로 자르고
// 콘텐츠가 그 높이를 넘을 때만 하단 페이드 + 더보기 pill을 보인다 — onLayout으로 실제
// 콘텐츠 높이를 재 짧은 이미지엔 더보기를 띄우지 않는다. 웹처럼 다시 접는 버튼은 없다.
export function CrawledJobDetailImages({
	document,
	title,
}: {
	document: DetailImageDocument;
	title: string;
}) {
	// 이미지는 화면 배경(Container bg-background) 위에 얹히므로 페이드도 배경색으로 섞는다.
	const backgroundColor = useThemeColor("background");
	const [expanded, setExpanded] = useState(false);
	const [contentHeight, setContentHeight] = useState<null | number>(null);

	if (document.items.length === 0) {
		return null;
	}

	const assetsById = new Map(document.assets.map((asset) => [asset.id, asset]));
	// 같은 원본에서 잘린 조각들을 한 그룹으로 묶는다(비조각 이미지는 각자 단독 그룹).
	const groups = groupDetailImageSlices(document.items);
	// 계측 전(null)엔 접힌 상태로 시작한다 — 유흥 공고 상세 이미지는 대개 h-96을 넘어,
	// 넘치는 흔한 경우에 펼침→접힘 깜빡임이 없다. 짧아서 다 들어가면 계측 후 제약을 푼다.
	const fitsWithoutCollapse =
		contentHeight !== null && contentHeight <= COLLAPSED_HEIGHT;
	const collapsed = !(expanded || fitsWithoutCollapse);

	const onContentLayout = (event: LayoutChangeEvent) => {
		setContentHeight(event.nativeEvent.layout.height);
	};

	return (
		<View>
			<View className={cn(collapsed && "h-96 overflow-hidden")}>
				{/* 그룹 사이엔 gap-3 유지, 그룹 안(조각들)은 간격 0으로 딱 붙인다. */}
				<View className="gap-3" onLayout={onContentLayout}>
					{groups.map((group, groupIndex) => (
						<View key={group.key}>
							{group.pieces.map((piece) => {
								const asset = assetsById.get(piece.assetId);
								if (!asset) {
									return null;
								}

								// 좌우 테두리는 그룹 내내 이어지고, 라운드·상하 테두리는 위/아래 끝에만.
								// 단독 그룹(첫=끝)은 네 변 모두 → 기존 rounded-lg border와 동일하다.
								return (
									// 조각 하나는 그룹(한 장)의 일부이므로 첫 조각에만 라벨을 달고
									// 나머지는 장식으로 접근성 트리에서 숨긴다.
									<Image
										accessibilityLabel={
											piece.isGroupStart
												? `${title} 상세 이미지 ${groupIndex + 1}`
												: undefined
										}
										accessible={piece.isGroupStart}
										className={cn(
											"w-full border-border border-x",
											piece.isGroupStart && "rounded-t-lg border-t",
											piece.isGroupEnd && "rounded-b-lg border-b"
										)}
										importantForAccessibility={
											piece.isGroupStart ? "yes" : "no-hide-descendants"
										}
										key={piece.id}
										resizeMode="contain"
										source={{ uri: asset.src }}
										style={{ aspectRatio: asset.width / asset.height }}
									/>
								);
							})}
						</View>
					))}
				</View>
				{collapsed ? (
					<View
						className="absolute inset-x-0 bottom-0 h-16"
						style={{ pointerEvents: "none" }}
					>
						<Svg height={FADE_HEIGHT} width="100%">
							<Defs>
								<LinearGradient
									id="crawledImageFade"
									x1="0"
									x2="0"
									y1="0"
									y2="1"
								>
									<Stop
										offset="0"
										stopColor={backgroundColor}
										stopOpacity={0}
									/>
									<Stop
										offset="1"
										stopColor={backgroundColor}
										stopOpacity={1}
									/>
								</LinearGradient>
							</Defs>
							<Rect fill="url(#crawledImageFade)" height="100%" width="100%" />
						</Svg>
					</View>
				) : null}
			</View>
			{collapsed ? (
				<Button
					className="mt-4 self-center rounded-full"
					onPress={() => setExpanded(true)}
				>
					<Button.Label>더보기</Button.Label>
				</Button>
			) : null}
		</View>
	);
}
