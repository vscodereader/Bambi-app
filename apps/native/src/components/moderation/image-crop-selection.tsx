import { useRef, useState } from "react";
import { Image, PanResponder, Text, View } from "react-native";

interface Rect {
	height: number;
	width: number;
	x: number;
	y: number;
}
interface Size {
	height: number;
	width: number;
}
export function ImageCropSelection({
	uri,
	source,
	rect,
	onChange,
}: {
	uri: string;
	source: Size;
	rect: Rect;
	onChange: (rect: Rect) => void;
}) {
	const [displayWidth, setDisplayWidth] = useState(0);
	const current = useRef({ source, rect, onChange, displayWidth });
	current.current = { source, rect, onChange, displayWidth };
	const start = useRef(rect);
	const move = useRef(
		PanResponder.create({
			onStartShouldSetPanResponder: () => true,
			onPanResponderGrant: () => {
				start.current = { ...current.current.rect };
			},
			onPanResponderMove: (_, gesture) => {
				const state = current.current;
				if (!state.displayWidth) {
					return;
				}
				const scale = state.source.width / state.displayWidth;
				state.onChange({
					...start.current,
					x: Math.round(
						Math.max(
							0,
							Math.min(
								state.source.width - start.current.width,
								start.current.x + gesture.dx * scale
							)
						)
					),
					y: Math.round(
						Math.max(
							0,
							Math.min(
								state.source.height - start.current.height,
								start.current.y + gesture.dy * scale
							)
						)
					),
				});
			},
		})
	).current;
	const resize = useRef(
		PanResponder.create({
			onStartShouldSetPanResponder: () => true,
			onPanResponderGrant: () => {
				start.current = { ...current.current.rect };
			},
			onPanResponderMove: (_, gesture) => {
				const state = current.current;
				if (!state.displayWidth) {
					return;
				}
				const scale = state.source.width / state.displayWidth;
				state.onChange({
					...start.current,
					width: Math.round(
						Math.max(
							1,
							Math.min(
								state.source.width - start.current.x,
								start.current.width + gesture.dx * scale
							)
						)
					),
					height: Math.round(
						Math.max(
							1,
							Math.min(
								state.source.height - start.current.y,
								start.current.height + gesture.dy * scale
							)
						)
					),
				});
			},
		})
	).current;
	const scale = displayWidth / source.width;
	return (
		<View className="gap-2">
			<Text className="text-muted text-xs">
				영역 안을 끌어 위치를 옮기고, 오른쪽 아래 모서리를 끌어 크기를
				조절하세요.
			</Text>
			<View
				className="relative overflow-hidden rounded-lg"
				onLayout={(event) => setDisplayWidth(event.nativeEvent.layout.width)}
			>
				<Image
					accessibilityLabel="자르기 영역 미리보기"
					source={{ uri }}
					style={{ width: "100%", aspectRatio: source.width / source.height }}
				/>
				<View
					{...move.panHandlers}
					className="absolute border-2 border-accent bg-accent/10"
					style={{
						left: rect.x * scale,
						top: rect.y * scale,
						width: rect.width * scale,
						height: rect.height * scale,
					}}
				>
					<View
						{...resize.panHandlers}
						accessibilityLabel="자르기 크기 조절"
						className="absolute right-0 bottom-0 size-8 rounded-full bg-accent"
					/>
				</View>
			</View>
		</View>
	);
}
