// 광고 배너 슬롯의 미리보기 + 드래그 캔버스. 웹 렌더러(apps/web .../ad-banner-layout-renderer.tsx)를
// RN으로 1:1 이식한다: 배경(단색/이미지) → 스크림 → 자유 배치 문구 블록. onMoveBlock을 주면
// 편집(드래그)이 되고, 안 주면 그리기 전용이라 구직자 화면 렌더에도 그대로 쓸 수 있다.
import { type ReactElement, useRef, useState } from "react";
import {
	Image,
	type LayoutChangeEvent,
	PanResponder,
	Pressable,
	Text,
	View,
} from "react-native";
import {
	type AdBannerSlotLayout,
	type AdBannerTextBlock,
	clampPercent,
} from "@/src/lib/employer/ad-banner-layout";
import type { JobAdBannerUsage } from "@/src/lib/employer/ad-exposure";

// 슬롯 비율(ad-exposure의 규격 힌트와 일치). 가로형 7:3, 세로형 4:9.
const ASPECT_RATIO: Record<JobAdBannerUsage, number> = {
	ad_horizontal: 7 / 3,
	ad_vertical: 4 / 9,
};

// weight enum → RN fontWeight 문자열. 웹의 font-normal/bold/extrabold와 같은 무게다.
const FONT_WEIGHT: Record<AdBannerTextBlock["weight"], "400" | "700" | "800"> =
	{
		bold: "700",
		extrabold: "800",
		normal: "400",
	};

// 웹 bg-ink-900 상당. 스크림은 이미지 위 가독성 보조라 토큰 없이 고정색을 inline으로 준다.
const SCRIM_COLOR = "#111827";

interface CanvasSize {
	height: number;
	width: number;
}

// 문구 블록 하나. 편집 모드면 PanResponder로 중심을 옮긴다. 좌표·크기·색은 구인자가 정한
// 런타임 값이라 전부 inline style(Uniwind className은 정적 토큰만 처리한다).
function TextBlockView({
	block,
	container,
	editable,
	onMoveBlock,
	onSelectBlock,
	selected,
	shadowed,
}: {
	block: AdBannerTextBlock;
	container: CanvasSize;
	editable: boolean;
	onMoveBlock?: (id: string, x: number, y: number) => void;
	onSelectBlock?: (id: string | null) => void;
	selected: boolean;
	shadowed: boolean;
}): ReactElement {
	// 블록 높이는 그려 봐야 안다. 측정 전엔 0으로 두고 그린다(중심 정렬이 살짝 어긋났다가 잡힌다).
	const [blockHeight, setBlockHeight] = useState(0);

	// PanResponder 콜백이 그랜트 시점 이후의 최신 값을 봐야 하므로 ref로 흘려 넣는다(콜백은 한 번만
	// 만들어져 클로저가 초기값에 고정되기 때문). start는 그랜트 순간의 블록 좌표.
	const latest = useRef({
		containerHeight: container.height,
		containerWidth: container.width,
		onMove: onMoveBlock,
		onSelect: onSelectBlock,
		x: block.x,
		y: block.y,
	});
	latest.current = {
		containerHeight: container.height,
		containerWidth: container.width,
		onMove: onMoveBlock,
		onSelect: onSelectBlock,
		x: block.x,
		y: block.y,
	};
	const start = useRef({ x: block.x, y: block.y });

	const pan = useRef(
		PanResponder.create({
			// 그랜트 순간의 블록 좌표를 기준으로 dx/dy를 더해야, 이동 중 부모 state가 갱신돼
			// 리렌더돼도 튀지 않는다.
			onPanResponderGrant: () => {
				start.current = { x: latest.current.x, y: latest.current.y };
				latest.current.onSelect?.(block.id);
			},
			onPanResponderMove: (_event, gesture) => {
				const { containerHeight, containerWidth } = latest.current;
				// 슬롯 폭 대비 %로 환산. clampPercent가 폭 0(NaN)과 범위 밖을 함께 접는다.
				const x = clampPercent(
					start.current.x + (gesture.dx / containerWidth) * 100
				);
				const y = clampPercent(
					start.current.y + (gesture.dy / containerHeight) * 100
				);
				latest.current.onMove?.(block.id, x, y);
			},
			// 부모 ScrollView가 드래그를 뺏으면 블록이 손에서 떨어진다.
			onPanResponderTerminationRequest: () => false,
			onStartShouldSetPanResponder: () => true,
		})
	).current;

	const blockWidth = (container.width * block.width) / 100;
	const fontSize = (container.width * block.fontSize) / 100;
	// 중심이 (x%, y%)에 오도록 좌상단을 역산한다(웹의 -translate-x/y-1/2에 해당).
	const left = (container.width * block.x) / 100 - blockWidth / 2;
	const top = (container.height * block.y) / 100 - blockHeight / 2;

	return (
		<View
			accessibilityLabel={block.content}
			accessibilityRole={editable ? "button" : undefined}
			// 선택 테두리는 편집 모드에서만. 항상 border-2를 둬서(선택 시 색만 바뀜) 선택/해제로
			// 박스 크기가 흔들리지 않게 한다.
			className={
				selected && editable
					? "absolute border-2 border-accent"
					: "absolute border-2 border-transparent"
			}
			onLayout={(event: LayoutChangeEvent) =>
				setBlockHeight(event.nativeEvent.layout.height)
			}
			style={{ left, top, width: blockWidth }}
			{...(editable ? pan.panHandlers : {})}
		>
			<Text
				style={{
					color: block.color,
					fontSize,
					fontWeight: FONT_WEIGHT[block.weight],
					// leading-tight 상당.
					lineHeight: fontSize * 1.2,
					textAlign: block.align,
					// 스크림 없는 사진 위 문구는 대비 하한이 없다 — 그림자로 최소한의 윤곽을 만든다
					// (스크림·단색 배경에선 대비가 이미 확보돼 붙이지 않는다).
					...(shadowed
						? {
								textShadowColor: "rgba(0,0,0,0.6)",
								textShadowOffset: { height: 0, width: 0 },
								textShadowRadius: 4,
							}
						: null),
				}}
			>
				{block.content}
			</Text>
		</View>
	);
}

// 배경 한 겹. 이미지 배경인데 uri가 없으면 회색 자리표시, 단색이면 지정색으로 채운다
// (색은 런타임 값이라 inline). 삼항 중첩을 피하려고 함수로 뺀다.
function BannerBackground({
	background,
	imageUri,
}: {
	background: AdBannerSlotLayout["background"];
	imageUri: string;
}): ReactElement {
	if (background.type === "color") {
		return (
			<View
				className="absolute inset-0"
				style={{ backgroundColor: background.color }}
			/>
		);
	}

	if (imageUri) {
		return (
			<Image
				accessibilityLabel="배너 배경 이미지"
				className="absolute inset-0 size-full"
				resizeMode="cover"
				source={{ uri: imageUri }}
			/>
		);
	}

	return (
		<View className="absolute inset-0 items-center justify-center bg-surface-secondary">
			<Text className="text-muted text-xs">이미지 없음</Text>
		</View>
	);
}

// 슬롯 위에 얹는 자유 배치 캔버스. 폭·높이는 onLayout으로 재고, 폭 0이면 블록을 그리지 않는다
// (NaN 좌표 방지). 편집 모드가 아니면 pointerEvents none이라 아래 요소의 터치를 막지 않는다.
export function AdBannerSlotCanvas({
	imageUri,
	layout,
	onMoveBlock,
	onSelectBlock,
	selectedId,
	usage,
}: {
	imageUri: string;
	layout: AdBannerSlotLayout;
	onMoveBlock?: (id: string, x: number, y: number) => void;
	onSelectBlock?: (id: string | null) => void;
	selectedId: string | null;
	usage: JobAdBannerUsage;
}): ReactElement {
	const [size, setSize] = useState<CanvasSize>({ height: 0, width: 0 });
	const editable = Boolean(onMoveBlock);

	const { background, scrim, texts } = layout;
	const isImage = background.type === "image";
	// 이미지 배경 + 스크림 켜짐일 때만 스크림을 그린다(단색 배경에선 색을 흐릴 뿐이라 무시).
	const showScrim = isImage && scrim.enabled;
	// 사진 위 스크림이 없으면 문구에 그림자를 붙인다.
	const shadowed = isImage && !showScrim;

	const blocks =
		size.width > 0
			? texts.map((block) => (
					<TextBlockView
						block={block}
						container={size}
						editable={editable}
						key={block.id}
						onMoveBlock={onMoveBlock}
						onSelectBlock={onSelectBlock}
						selected={block.id === selectedId}
						shadowed={shadowed}
					/>
				))
			: null;

	const body = (
		<>
			<BannerBackground background={background} imageUri={imageUri} />

			{showScrim ? (
				// 불투명도는 0~100 백분율로 저장된다 — RN opacity(0~1)로 나눠 넣는다.
				<View
					className="absolute inset-0"
					style={{
						backgroundColor: SCRIM_COLOR,
						opacity: scrim.opacity / 100,
					}}
				/>
			) : null}

			{blocks}
		</>
	);

	const onLayout = (event: LayoutChangeEvent) =>
		setSize({
			height: event.nativeEvent.layout.height,
			width: event.nativeEvent.layout.width,
		});

	const style = { aspectRatio: ASPECT_RATIO[usage] };

	// 편집 모드가 아니면 그리기 전용: 터치를 통과시키고(빈 배경 탭 없음) 테두리도 없다.
	if (!editable) {
		return (
			<View
				className="w-full overflow-hidden rounded-lg"
				onLayout={onLayout}
				pointerEvents="none"
				style={style}
			>
				{body}
			</View>
		);
	}

	// 편집 모드: 빈 배경 탭 시 선택 해제. 블록은 PanResponder가 먼저 터치를 잡아 이 onPress를
	// 가로채지 않는다.
	return (
		<Pressable
			className="w-full overflow-hidden rounded-lg"
			onLayout={onLayout}
			onPress={() => onSelectBlock?.(null)}
			style={style}
		>
			{body}
		</Pressable>
	);
}
