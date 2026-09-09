import { generateChatMessageId } from "@bambi-app/api/services/bambi-chat-message-id";
import {
	type CrawledImageDocument,
	cleanUnusedAssets,
	crawledImageDocumentSizeError,
	duplicateItems,
	imageExtension,
	imageMime,
	moveItems,
	resizeItemDimensions,
} from "@bambi-app/api/services/bambi-crawled-image-editor";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import { launchImageLibraryAsync } from "expo-image-picker";
import { Button, Input, TextField, useToast } from "heroui-native";
import { useEffect, useState } from "react";
import { Image, Pressable, Text, View } from "react-native";
import { ImageCropSelection } from "@/src/components/moderation/image-crop-selection";
import { readLocalFileBytes } from "@/src/lib/local-file-bytes";
import { saveManagedFile } from "@/src/lib/managed-file";
import { bytesToBase64 } from "@/src/lib/managed-file-policy";
import { croppedItem, imageLayout } from "@/src/lib/moderation/image-layout";

const HISTORY_LIMIT = 50;
const MAX_ITEMS = 60;
const MAX_INSERT_BYTES = 8 * 1024 * 1024;

export function ImageDocumentEditor({
	value,
	onChange,
	isDisabled = false,
	maxItems = MAX_ITEMS,
	maxInsertBytes = MAX_INSERT_BYTES,
	mimeTypes = ["image/jpeg", "image/png", "image/webp", "image/gif"],
}: {
	value: CrawledImageDocument;
	onChange: (document: CrawledImageDocument) => void;
	isDisabled?: boolean;
	maxItems?: number;
	maxInsertBytes?: number;
	mimeTypes?: readonly string[];
}) {
	const [selected, setSelected] = useState(new Set<string>());
	const [clipboard, setClipboard] = useState<CrawledImageDocument | null>(null);
	const [history, setHistory] = useState<CrawledImageDocument[]>([]);
	const [width, setWidth] = useState("");
	const [height, setHeight] = useState("");
	const [cropX, setCropX] = useState("0");
	const [cropY, setCropY] = useState("0");
	const [busy, setBusy] = useState(false);
	const [availableWidth, setAvailableWidth] = useState(0);
	const { toast } = useToast();
	const selection = value.items.filter((item) => selected.has(item.id));
	const first = selection[0];
	const asset = value.assets.find((item) => item.id === first?.assetId);
	useEffect(() => {
		if (!(asset && first)) {
			return;
		}
		setWidth(String(first?.displayWidthPx ?? asset.width));
		setHeight(String(first?.displayHeightPx ?? asset.height));
		setCropX("0");
		setCropY("0");
	}, [first, asset]);
	const disabled = isDisabled || busy;
	const apply = (next: CrawledImageDocument) => {
		const cleaned = cleanUnusedAssets(next);
		const error = crawledImageDocumentSizeError(cleaned);
		if (error) {
			toast.show({ label: error, variant: "danger" });
			return;
		}
		setHistory((items) => [...items.slice(-(HISTORY_LIMIT - 1)), value]);
		onChange(cleaned);
	};
	const run = async (action: () => Promise<void>) => {
		if (disabled) {
			return;
		}
		setBusy(true);
		try {
			await action();
		} catch (error) {
			toast.show({
				label:
					error instanceof Error
						? error.message
						: "이미지를 처리하지 못했어요.",
				variant: "danger",
			});
		} finally {
			setBusy(false);
		}
	};
	const insert = () =>
		run(async () => {
			const result = await launchImageLibraryAsync({
				mediaTypes: ["images"],
				base64: true,
				quality: 1,
			});
			if (result.canceled) {
				return;
			}
			const picked = result.assets[0];
			if (!picked) {
				throw new Error("이미지 데이터를 읽지 못했어요.");
			}
			const { bytes } = await readLocalFileBytes(picked.uri);
			if (bytes.length > maxInsertBytes) {
				throw new Error(
					`추가할 이미지는 ${maxInsertBytes / 1024 / 1024}MB 이하여야 합니다.`
				);
			}
			if (!(picked.mimeType && mimeTypes.includes(picked.mimeType))) {
				throw new Error("지원하지 않는 이미지 형식입니다.");
			}
			const assetId = generateChatMessageId();
			apply({
				...value,
				assets: [
					...value.assets,
					{
						id: assetId,
						dataUrl: `data:${picked.mimeType};base64,${bytesToBase64(bytes)}`,
						width: picked.width,
						height: picked.height,
					},
				],
				items: [
					...value.items,
					{
						id: generateChatMessageId(),
						assetId,
						displayWidthPx: null,
						displayHeightPx: null,
						offsetX: 0,
						offsetY: 0,
					},
				],
			});
		});
	const crop = () =>
		run(async () => {
			if (!(asset && first)) {
				return;
			}
			const rect = {
				originX: Number(cropX),
				originY: Number(cropY),
				width: Number(width),
				height: Number(height),
			};
			if (
				!Object.values(rect).every(Number.isInteger) ||
				rect.originX < 0 ||
				rect.originY < 0 ||
				rect.width < 1 ||
				rect.height < 1 ||
				rect.originX + rect.width > asset.width ||
				rect.originY + rect.height > asset.height
			) {
				throw new Error("자르기 영역을 원본 이미지 안으로 설정해 주세요.");
			}
			const context = ImageManipulator.manipulate(asset.dataUrl);
			const image = await context.crop(rect).renderAsync();
			const encoded = await image.saveAsync({
				base64: true,
				format: SaveFormat.PNG,
			});
			if (!encoded.base64) {
				throw new Error("이미지를 자르지 못했어요.");
			}
			const assetId = generateChatMessageId();
			apply({
				...value,
				assets: [
					...value.assets,
					{
						id: assetId,
						dataUrl: `data:image/png;base64,${encoded.base64}`,
						width: encoded.width,
						height: encoded.height,
					},
				],
				items: value.items.map((item) =>
					item.id === first.id
						? croppedItem(item, {
								id: assetId,
								dataUrl: `data:image/png;base64,${encoded.base64}`,
								width: encoded.width,
								height: encoded.height,
							})
						: item
				),
			});
		});
	return (
		<View className="gap-3">
			<View className="flex-row flex-wrap gap-2">
				<Button
					isDisabled={disabled || value.items.length >= maxItems}
					onPress={insert}
					size="sm"
					variant="secondary"
				>
					<Button.Label>이미지 삽입</Button.Label>
				</Button>
				<Button
					isDisabled={disabled}
					onPress={() =>
						setSelected(new Set(value.items.map((item) => item.id)))
					}
					size="sm"
					variant="secondary"
				>
					<Button.Label>전체 선택</Button.Label>
				</Button>
				<Button
					isDisabled={disabled || !selected.size}
					onPress={() =>
						setClipboard(cleanUnusedAssets({ ...value, items: selection }))
					}
					size="sm"
					variant="secondary"
				>
					<Button.Label>복사</Button.Label>
				</Button>
				<Button
					isDisabled={
						disabled ||
						!clipboard ||
						value.items.length + clipboard.items.length > maxItems
					}
					onPress={() => {
						if (!clipboard) {
							return;
						}
						const assets = new Map(
							[...value.assets, ...clipboard.assets].map((item) => [
								item.id,
								item,
							])
						);
						const duplicated = duplicateItems(
							{ ...value, assets: [...assets.values()] },
							clipboard.items,
							first
								? value.items.findIndex((item) => item.id === first.id) + 1
								: value.items.length
						);
						apply(duplicated.document);
						setSelected(new Set(duplicated.insertedIds));
					}}
					size="sm"
					variant="secondary"
				>
					<Button.Label>붙여넣기</Button.Label>
				</Button>
				{([-1, 1] as const).map((direction) => (
					<Button
						isDisabled={disabled || !selected.size}
						key={direction}
						onPress={() => apply(moveItems(value, selected, direction))}
						size="sm"
						variant="secondary"
					>
						<Button.Label>{direction === -1 ? "위로" : "아래로"}</Button.Label>
					</Button>
				))}
				<Button
					isDisabled={disabled || !selected.size}
					onPress={() => {
						apply({
							...value,
							items: value.items.filter((item) => !selected.has(item.id)),
						});
						setSelected(new Set());
					}}
					size="sm"
					variant="danger-soft"
				>
					<Button.Label>선택 삭제</Button.Label>
				</Button>
				<Button
					isDisabled={disabled || !history.length}
					onPress={() => {
						const previous = history.at(-1);
						if (!previous) {
							return;
						}
						onChange(previous);
						setHistory((items) => items.slice(0, -1));
						setSelected(new Set());
					}}
					size="sm"
					variant="secondary"
				>
					<Button.Label>실행 취소</Button.Label>
				</Button>
			</View>
			<Text className="text-muted text-xs">
				이미지를 눌러 복수 선택할 수 있습니다. 선택 {selected.size}개
			</Text>
			{value.items.map((item) => {
				const image = value.assets.find(
					(candidate) => candidate.id === item.assetId
				);
				if (!image) {
					return null;
				}
				const layout = imageLayout(image, item, availableWidth);
				return (
					<Pressable
						accessibilityLabel="편집할 이미지 선택"
						accessibilityRole="checkbox"
						accessibilityState={{ checked: selected.has(item.id) }}
						className={`rounded-lg border-2 p-2 ${selected.has(item.id) ? "border-accent" : "border-transparent"}`}
						key={item.id}
						onPress={() => {
							if (disabled) {
								return;
							}
							setSelected((current) => {
								const next = new Set(current);
								if (next.has(item.id)) {
									next.delete(item.id);
								} else {
									next.add(item.id);
								}
								return next;
							});
							setWidth(String(item.displayWidthPx ?? image.width));
							setHeight(String(item.displayHeightPx ?? image.height));
						}}
					>
						<View
							onLayout={(event) =>
								setAvailableWidth(event.nativeEvent.layout.width)
							}
							style={{ alignItems: "center", marginBottom: item.offsetY }}
						>
							<Image
								accessibilityLabel="편집 이미지"
								resizeMode="stretch"
								source={{ uri: image.dataUrl }}
								style={{
									width: layout.width,
									height: layout.height,
									transform: [
										{ translateX: layout.offsetX },
										{ translateY: layout.offsetY },
									],
								}}
							/>
						</View>
					</Pressable>
				);
			})}
			{selection.length === 1 &&
			asset &&
			Number(width) > 0 &&
			Number(height) > 0 ? (
				<ImageCropSelection
					onChange={(rect) => {
						setCropX(String(rect.x));
						setCropY(String(rect.y));
						setWidth(String(rect.width));
						setHeight(String(rect.height));
					}}
					rect={{
						x: Number(cropX),
						y: Number(cropY),
						width: Number(width),
						height: Number(height),
					}}
					source={asset}
					uri={asset.dataUrl}
				/>
			) : null}
			<View className="flex-row gap-2">
				<TextField className="flex-1">
					<Input
						accessibilityLabel="너비 픽셀"
						keyboardType="number-pad"
						onChangeText={setWidth}
						placeholder="너비"
						value={width}
					/>
				</TextField>
				<TextField className="flex-1">
					<Input
						accessibilityLabel="높이 픽셀"
						keyboardType="number-pad"
						onChangeText={setHeight}
						placeholder="높이"
						value={height}
					/>
				</TextField>
			</View>
			<Button
				isDisabled={
					disabled ||
					!selected.size ||
					!Number.isFinite(Number(width)) ||
					!Number.isFinite(Number(height)) ||
					Number(width) <= 0 ||
					Number(height) <= 0
				}
				onPress={() =>
					apply(
						resizeItemDimensions(value, selected, {
							width: Number(width),
							height: Number(height),
						})
					)
				}
				size="sm"
				variant="secondary"
			>
				<Button.Label>선택 이미지 크기 적용</Button.Label>
			</Button>
			<View className="flex-row gap-2">
				<TextField className="flex-1">
					<Input
						accessibilityLabel="자르기 왼쪽 위치"
						keyboardType="number-pad"
						onChangeText={setCropX}
						placeholder="자르기 X"
						value={cropX}
					/>
				</TextField>
				<TextField className="flex-1">
					<Input
						accessibilityLabel="자르기 위쪽 위치"
						keyboardType="number-pad"
						onChangeText={setCropY}
						placeholder="자르기 Y"
						value={cropY}
					/>
				</TextField>
			</View>
			<Button
				isDisabled={disabled || selection.length !== 1}
				onPress={crop}
				size="sm"
				variant="secondary"
			>
				<Button.Label>지정 영역으로 자르기</Button.Label>
			</Button>
			<Button
				isDisabled={disabled || !asset}
				onPress={() =>
					run(async () => {
						if (!asset) {
							return;
						}
						const result = await saveManagedFile({
							url: asset.dataUrl,
							mimeType: imageMime(asset.dataUrl),
							fileName: `image-${asset.id}.${imageExtension(asset.dataUrl)}`,
						});
						if (result.status === "failed") {
							throw new Error(result.message);
						}
						if (result.status === "saved") {
							toast.show({ label: "이미지를 저장했어요." });
						}
					})
				}
				size="sm"
				variant="secondary"
			>
				<Button.Label>선택 이미지 기기에 저장</Button.Label>
			</Button>
		</View>
	);
}
