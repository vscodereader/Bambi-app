// 문의 본문 에디터 — 서식 도구는 없다. 문단과 이미지를 문서 순서대로 쌓고 옮기는 것만 한다.
// 저장 형식은 Tiptap doc JSON의 부분집합(doc/paragraph/text/hardBreak/image)이라 웹과 호환된다.
// 웹에서 붙은 마크나 native가 모르는 노드는 editBlockText가 건드리지 않고 그대로 보존한다.
import { Button, TextArea } from "heroui-native";
import { useState } from "react";
import { Text, View } from "react-native";

import { MessageBody } from "@/src/components/message-body";
import {
	type DocumentNode,
	documentImages,
	editBlockText,
	moveBlock,
	nodeText,
	readDocument,
	removeBlock,
	replaceNode,
} from "@/src/lib/support/content-document";

export function SupportDocumentEditor({
	isDisabled,
	onChange,
	onPickImage,
	value,
}: {
	isDisabled: boolean;
	onChange: (value: { json: string; text: string; hasImage: boolean }) => void;
	onPickImage?: () => Promise<string | null>;
	value: string;
}) {
	const [document, setDocument] = useState(() => readDocument(value));
	const blocks = document.content ?? [];
	const publish = (next: DocumentNode) => {
		setDocument(next);
		onChange({
			hasImage: documentImages(next).length > 0,
			json: JSON.stringify(next),
			text: (next.content ?? []).map(nodeText).join("\n"),
		});
	};
	const append = (block: DocumentNode) =>
		publish({ ...document, content: [...blocks, block] });

	return (
		<View className="gap-3">
			{blocks.map((block, index) => {
				const label = `${block.type === "image" ? "이미지" : "문단"} ${index + 1}`;

				return (
					<View
						className="gap-2 rounded-lg border border-border p-3"
						// biome-ignore lint/suspicious/noArrayIndexKey: 블록에는 id가 없고(Tiptap doc 그대로 저장한다) 입력은 value로 완전히 제어돼 순서가 바뀌어도 내용이 어긋나지 않는다
						key={index}
					>
						<View className="flex-row flex-wrap items-center gap-2">
							<Text className="font-semibold text-muted text-xs">{label}</Text>
							<View className="ml-auto flex-row gap-2">
								<Button
									accessibilityLabel={`${label} 위로`}
									isDisabled={isDisabled || index === 0}
									onPress={() => publish(moveBlock(document, [index], -1))}
									size="sm"
									variant="secondary"
								>
									<Button.Label>위로</Button.Label>
								</Button>
								<Button
									accessibilityLabel={`${label} 아래로`}
									isDisabled={isDisabled || index === blocks.length - 1}
									onPress={() => publish(moveBlock(document, [index], 1))}
									size="sm"
									variant="secondary"
								>
									<Button.Label>아래로</Button.Label>
								</Button>
								{/* 마지막 한 블록을 지우면 removeBlock이 빈 문단을 남긴다 — 내용만 비워진다 */}
								<Button
									accessibilityLabel={`${label} 삭제`}
									isDisabled={isDisabled}
									onPress={() => publish(removeBlock(document, [index]))}
									size="sm"
									variant="danger-soft"
								>
									<Button.Label>삭제</Button.Label>
								</Button>
							</View>
						</View>
						{block.type === "image" ? (
							<MessageBody
								body={JSON.stringify({ content: [block], type: "doc" })}
							/>
						) : (
							<TextArea
								accessibilityLabel={label}
								className={blocks.length === 1 ? "min-h-32" : undefined}
								editable={!isDisabled}
								onChangeText={(text) =>
									publish(
										replaceNode(document, [index], (current) =>
											editBlockText(current, text)
										)
									)
								}
								placeholder="문의하실 내용을 적어 주세요"
								value={nodeText(block)}
							/>
						)}
					</View>
				);
			})}
			<View className="flex-row gap-2">
				<View className="flex-1">
					<Button
						isDisabled={isDisabled}
						onPress={() => append({ type: "paragraph" })}
						variant="secondary"
					>
						<Button.Label>문단 추가</Button.Label>
					</Button>
				</View>
				{onPickImage ? (
					<View className="flex-1">
						<Button
							isDisabled={isDisabled}
							onPress={async () => {
								const src = await onPickImage();

								if (src) {
									append({ attrs: { alt: "", src }, type: "image" });
								}
							}}
							variant="secondary"
						>
							<Button.Label>이미지 추가</Button.Label>
						</Button>
					</View>
				) : null}
			</View>
		</View>
	);
}
