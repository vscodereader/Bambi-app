import { Button, Dialog } from "heroui-native";
import { useState } from "react";
import { Image, ScrollView, Text } from "react-native";
import { MessageBody } from "@/src/components/message-body";

export interface PopupPreviewItem {
	body?: string;
	height: number;
	imageUrl?: string;
	link?: string;
	width: number;
}

export function PopupPreview({
	body,
	imageUrl,
	width,
	height,
	link,
	getItems,
}: {
	body?: string;
	imageUrl?: string;
	width: number;
	height: number;
	link?: string;
	getItems?: () => PopupPreviewItem[];
}) {
	const [open, setOpen] = useState(false);
	const [items, setItems] = useState<PopupPreviewItem[]>([]);
	const [index, setIndex] = useState(0);
	const current = items[index] ?? { body, imageUrl, width, height, link };
	return (
		<>
			<Button
				onPress={() => {
					setItems(getItems?.() ?? [{ body, imageUrl, width, height, link }]);
					setIndex(0);
					setOpen(true);
				}}
				size="sm"
				variant="secondary"
			>
				<Button.Label>
					{getItems ? "전체 팝업 순서 미리보기" : "팝업 미리보기"}
				</Button.Label>
			</Button>
			<Dialog isOpen={open} onOpenChange={setOpen}>
				<Dialog.Portal>
					<Dialog.Overlay />
					<Dialog.Content>
						<Dialog.Title>팝업 미리보기</Dialog.Title>
						<Dialog.Description>현재 편집 중인 내용입니다.</Dialog.Description>
						<ScrollView className="max-h-96">
							{current.imageUrl ? (
								<Image
									accessibilityLabel="팝업 이미지"
									resizeMode="contain"
									source={{ uri: current.imageUrl }}
									style={{
										width: "100%",
										aspectRatio:
											current.width > 0 && current.height > 0
												? current.width / current.height
												: 1,
									}}
								/>
							) : (
								<MessageBody
									body={current.body || '{"type":"doc","content":[]}'}
								/>
							)}
							{current.link ? (
								<Text className="text-muted text-xs">
									연결 주소: {current.link}
								</Text>
							) : null}
						</ScrollView>
						{items.length > 1 ? (
							<>
								<Text className="text-muted text-xs">
									{index + 1} / {items.length}
								</Text>
								<Button
									isDisabled={index === 0}
									onPress={() => setIndex(index - 1)}
									variant="secondary"
								>
									<Button.Label>이전 팝업</Button.Label>
								</Button>
								<Button
									isDisabled={index === items.length - 1}
									onPress={() => setIndex(index + 1)}
									variant="secondary"
								>
									<Button.Label>다음 팝업</Button.Label>
								</Button>
							</>
						) : null}
						<Button onPress={() => setOpen(false)}>
							<Button.Label>닫기</Button.Label>
						</Button>
					</Dialog.Content>
				</Dialog.Portal>
			</Dialog>
		</>
	);
}
