import { Button, Input, TextArea, TextField } from "heroui-native";
import { useState } from "react";
import { Text, View } from "react-native";

import { MessageBody } from "@/src/components/message-body";
import { isSafeLinkHref } from "@/src/lib/me-messages";
import {
	type DocumentMark,
	type DocumentNode,
	documentImages,
	editableBlocks,
	editBlockText,
	markRange,
	moveBlock,
	readDocument,
	removeBlock,
	replaceNode,
	toggleMarkRange,
	wrapBlock,
} from "@/src/lib/support/content-document";

type MarkName = "bold" | "italic" | "strike";
const MARK_LABELS: Record<MarkName, string> = {
	bold: "굵게",
	italic: "기울임",
	strike: "취소선",
};
const LINK_SCHEME = /^[a-z][\w+.-]*:/i;

export function SupportDocumentEditor({
	isDisabled,
	onChange,
	onPickImage,
	value,
}: {
	isDisabled: boolean;
	onChange: (value: { json: string; text: string }) => void;
	onPickImage?: () => Promise<string | null>;
	value: string;
}) {
	const [document, setDocument] = useState(() => readDocument(value));
	const [selection, setSelection] = useState<{
		end: number;
		path: number[];
		start: number;
	} | null>(null);
	const [history, setHistory] = useState<DocumentNode[]>([]);
	const [href, setHref] = useState("");
	const publish = (next: DocumentNode) => {
		setHistory((items) => [...items.slice(-99), document]);
		setDocument(next);
		const json = JSON.stringify(next);
		onChange({
			json,
			text: editableBlocks(next)
				.map(({ node }) =>
					(node.content ?? []).map((child) => child.text ?? "").join("")
				)
				.join("\n"),
		});
	};
	const applyMark = (mark: DocumentMark) => {
		if (selection) {
			publish(
				replaceNode(document, selection.path, (node) =>
					toggleMarkRange(node, selection.start, selection.end, mark)
				)
			);
		}
	};
	const normalizedHref = LINK_SCHEME.test(href.trim())
		? href.trim()
		: `https://${href.trim()}`;

	return (
		<View className="gap-3">
			<Text className="text-muted text-xs">
				문단에서 글자를 선택한 뒤 서식을 적용하세요.
			</Text>
			<View className="flex-row flex-wrap gap-2">
				{(Object.keys(MARK_LABELS) as MarkName[]).map((mark) => (
					<Button
						isDisabled={
							isDisabled || !selection || selection.start === selection.end
						}
						key={mark}
						onPress={() => applyMark({ type: mark })}
						size="sm"
						variant="secondary"
					>
						<Button.Label>{MARK_LABELS[mark]}</Button.Label>
					</Button>
				))}
				{(["bulletList", "orderedList"] as const).map((type) => (
					<Button
						isDisabled={isDisabled || !selection}
						key={type}
						onPress={() =>
							selection && publish(wrapBlock(document, selection.path, type))
						}
						size="sm"
						variant="secondary"
					>
						<Button.Label>
							{type === "bulletList" ? "글머리 목록" : "번호 목록"}
						</Button.Label>
					</Button>
				))}
				<Button
					isDisabled={isDisabled || history.length === 0}
					onPress={() => {
						const previous = history.at(-1);
						if (previous) {
							setHistory((items) => items.slice(0, -1));
							publish(previous);
						}
					}}
					size="sm"
					variant="secondary"
				>
					<Button.Label>실행 취소</Button.Label>
				</Button>
			</View>
			<View className="flex-row gap-2">
				<TextField className="flex-1">
					<Input
						autoCapitalize="none"
						onChangeText={setHref}
						placeholder="선택 글자 링크"
						value={href}
					/>
				</TextField>
				<Button
					isDisabled={
						isDisabled ||
						!selection ||
						selection.start === selection.end ||
						!isSafeLinkHref(normalizedHref)
					}
					onPress={() =>
						selection &&
						publish(
							replaceNode(document, selection.path, (node) =>
								markRange(node, selection.start, selection.end, {
									attrs: { href: normalizedHref },
									type: "link",
								})
							)
						)
					}
					variant="secondary"
				>
					<Button.Label>링크 적용</Button.Label>
				</Button>
			</View>
			{editableBlocks(document).map(({ editable, node, path }) => (
				<TextField isDisabled={isDisabled || !editable} key={path.join(".")}>
					<TextArea
						onChangeText={(text) =>
							publish(
								replaceNode(document, path, (current) =>
									editBlockText(current, text)
								)
							)
						}
						onSelectionChange={(event) =>
							setSelection({ path, ...event.nativeEvent.selection })
						}
						value={(node.content ?? [])
							.map((child) =>
								child.type === "hardBreak" ? "\n" : (child.text ?? "")
							)
							.join("")}
					/>
				</TextField>
			))}
			<Button
				isDisabled={isDisabled}
				onPress={() =>
					publish({
						...document,
						content: [...(document.content ?? []), { type: "paragraph" }],
					})
				}
				size="sm"
				variant="secondary"
			>
				<Button.Label>문단 추가</Button.Label>
			</Button>
			{onPickImage ? (
				<Button
					isDisabled={isDisabled}
					onPress={async () => {
						const src = await onPickImage();
						if (src) {
							publish({
								...document,
								content: [
									...(document.content ?? []),
									{ attrs: { alt: "", src }, type: "image" },
								],
							});
						}
					}}
					variant="secondary"
				>
					<Button.Label>이미지 추가</Button.Label>
				</Button>
			) : null}
			{documentImages(document).map(({ node, path }, index) => (
				<View
					className="gap-2 rounded-lg border border-border p-3"
					key={path.join(".")}
				>
					<Text className="text-muted text-sm">본문 이미지 {index + 1}</Text>
					<MessageBody
						body={JSON.stringify({ content: [node], type: "doc" })}
					/>
					<View className="flex-row gap-2">
						<Button
							onPress={() => publish(moveBlock(document, path, -1))}
							size="sm"
							variant="secondary"
						>
							<Button.Label>위로</Button.Label>
						</Button>
						<Button
							onPress={() => publish(moveBlock(document, path, 1))}
							size="sm"
							variant="secondary"
						>
							<Button.Label>아래로</Button.Label>
						</Button>
						<Button
							onPress={() => publish(removeBlock(document, path))}
							size="sm"
							variant="danger-soft"
						>
							<Button.Label>삭제</Button.Label>
						</Button>
					</View>
				</View>
			))}
			<View className="gap-2 rounded-lg border border-border p-3">
				<Text className="font-semibold text-muted text-xs">미리보기</Text>
				<MessageBody body={JSON.stringify(document)} />
			</View>
		</View>
	);
}
