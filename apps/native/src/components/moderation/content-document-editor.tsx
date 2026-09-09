import { env } from "@bambi-app/env/native";
import { useMutation } from "@tanstack/react-query";
import { Button, Input, TextArea, TextField } from "heroui-native";
import { useState } from "react";
import { Text, View } from "react-native";
import { MessageBody } from "@/src/components/message-body";
import { publicObjectUri } from "@/src/lib/bambi-native";
import { directMessageBodyToText, isSafeLinkHref } from "@/src/lib/me-messages";
import {
	type DocumentMark,
	type DocumentNode,
	documentImages,
	editableBlocks,
	editBlockText,
	markRange,
	moveBlock,
	nodeText,
	readDocument,
	removeBlock,
	replaceNode,
	toggleMarkRange,
	wrapBlock,
} from "@/src/lib/moderation/content-document";
import { orpc } from "@/src/lib/orpc";
import { AdminImagePicker, uploadAdminImage } from "./admin-image-picker";

type MarkName = "bold" | "italic" | "strike" | "link";
interface Props {
	allowFontSize?: boolean;
	allowImages?: boolean;
	allowUpload?: boolean;
	capabilities?: readonly MarkName[];
	isDisabled?: boolean;
	onBusyChange?: (busy: boolean) => void;
	onChange: (value: { json: string; text: string }) => void;
	value?: string;
}
const LABELS = {
	bold: "굵게",
	italic: "기울임",
	strike: "취소선",
	link: "링크",
};
// Same choices as the web popup-text-editor toolbar.
const FONT_SIZES = [12, 14, 16, 18, 20, 24, 28, 32, 40, 48] as const;
// Installed Tiptap UndoRedo extension default (web StarterKit does not override it).
const HISTORY_LIMIT = 100;
const LINK_SCHEME = /^[a-z][\w+.-]*:/i;
export function ContentDocumentEditor({
	allowUpload = false,
	onBusyChange,
	allowImages = true,
	allowFontSize = false,
	capabilities = ["bold", "italic", "strike", "link"],
	isDisabled: externallyDisabled = false,
	onChange,
	value = "",
}: Props) {
	const [uploading, setUploading] = useState(false);
	const isDisabled = externallyDisabled || uploading;
	const upload = useMutation(
		orpc.bambi.community.createMediaUpload.mutationOptions()
	);
	const [document, setDocument] = useState(() => readDocument(value));
	const [history, setHistory] = useState<DocumentNode[]>([]);
	const [selection, setSelection] = useState<{
		path: number[];
		start: number;
		end: number;
	} | null>(null);
	const [href, setHref] = useState("");
	const [imageUrl, setImageUrl] = useState("");
	const normalizedHref = LINK_SCHEME.test(href.trim())
		? href.trim()
		: `https://${href.trim()}`;
	const publish = (next: DocumentNode) => {
		setHistory((items) => [...items.slice(-(HISTORY_LIMIT - 1)), document]);
		setDocument(next);
		const json = JSON.stringify(next);
		onChange({ json, text: directMessageBodyToText(json) });
	};
	const apply = (mark: DocumentMark) => {
		if (!selection) {
			return;
		}
		publish(
			replaceNode(document, selection.path, (node) =>
				markRange(node, selection.start, selection.end, mark)
			)
		);
	};
	return (
		<View className="gap-3">
			<Text className="text-muted text-xs">
				문단에서 글자를 선택한 후 서식을 적용하세요.
			</Text>
			{allowFontSize ? (
				<View className="flex-row flex-wrap gap-2">
					{FONT_SIZES.map((size) => (
						<Button
							isDisabled={
								isDisabled || !selection || selection.start === selection.end
							}
							key={size}
							onPress={() =>
								apply({ type: "textStyle", attrs: { fontSize: `${size}px` } })
							}
							size="sm"
							variant="secondary"
						>
							<Button.Label>{size}px</Button.Label>
						</Button>
					))}
				</View>
			) : null}
			<View className="flex-row flex-wrap gap-2">
				{(["paragraph", "codeBlock", "blockquote"] as const).map((type) => (
					<Button
						isDisabled={isDisabled || !selection}
						key={type}
						onPress={() => {
							if (!selection) {
								return;
							}
							publish(
								type === "blockquote"
									? wrapBlock(document, selection.path, type)
									: replaceNode(document, selection.path, (node) => ({
											...node,
											type,
										}))
							);
							setSelection(null);
						}}
						size="sm"
						variant="secondary"
					>
						<Button.Label>
							{
								{ paragraph: "문단", codeBlock: "코드", blockquote: "인용" }[
									type
								]
							}
						</Button.Label>
					</Button>
				))}
				{[1, 2, 3, 4, 5, 6].map((level) => (
					<Button
						isDisabled={isDisabled || !selection}
						key={level}
						onPress={() => {
							if (!selection) {
								return;
							}
							publish(
								replaceNode(document, selection.path, (node) => ({
									...node,
									type: "heading",
									attrs: { ...node.attrs, level },
								}))
							);
						}}
						size="sm"
						variant="secondary"
					>
						<Button.Label>제목 {level}</Button.Label>
					</Button>
				))}
				{(["bulletList", "orderedList"] as const).map((type) => (
					<Button
						isDisabled={isDisabled || !selection}
						key={type}
						onPress={() => {
							if (!selection) {
								return;
							}
							publish(wrapBlock(document, selection.path, type));
							setSelection(null);
						}}
						size="sm"
						variant="secondary"
					>
						<Button.Label>
							{type === "bulletList" ? "글머리 목록" : "번호 목록"}
						</Button.Label>
					</Button>
				))}
				{([-1, 1] as const).map((direction) => (
					<Button
						isDisabled={isDisabled || !selection}
						key={direction}
						onPress={() => {
							if (!selection) {
								return;
							}
							publish(moveBlock(document, selection.path, direction));
							setSelection(null);
						}}
						size="sm"
						variant="secondary"
					>
						<Button.Label>
							{direction === -1 ? "문단 위로" : "문단 아래로"}
						</Button.Label>
					</Button>
				))}
				<Button
					isDisabled={isDisabled || !selection}
					onPress={() => {
						if (!selection) {
							return;
						}
						publish(removeBlock(document, selection.path));
						setSelection(null);
					}}
					size="sm"
					variant="danger-soft"
				>
					<Button.Label>문단 삭제</Button.Label>
				</Button>
				{capabilities
					.filter((mark) => mark !== "link")
					.map((mark) => (
						<Button
							isDisabled={
								isDisabled || !selection || selection.start === selection.end
							}
							key={mark}
							onPress={() => {
								if (selection) {
									publish(
										replaceNode(document, selection.path, (node) =>
											toggleMarkRange(node, selection.start, selection.end, {
												type: mark,
											})
										)
									);
								}
							}}
							size="sm"
							variant="secondary"
						>
							<Button.Label>{LABELS[mark]}</Button.Label>
						</Button>
					))}
				<Button
					isDisabled={isDisabled || !history.length}
					onPress={() => {
						const previous = history.at(-1);
						if (!previous) {
							return;
						}
						setHistory((items) => items.slice(0, -1));
						setDocument(previous);
						const json = JSON.stringify(previous);
						onChange({ json, text: directMessageBodyToText(json) });
					}}
					size="sm"
					variant="secondary"
				>
					<Button.Label>실행 취소</Button.Label>
				</Button>
				<Button
					isDisabled={isDisabled || !selection}
					onPress={() => {
						if (!selection) {
							return;
						}
						publish(
							replaceNode(document, selection.path, (node) =>
								capabilities.reduce(
									(current, type) =>
										markRange(
											current,
											selection.start,
											selection.end,
											{ type },
											true
										),
									node
								)
							)
						);
					}}
					size="sm"
					variant="secondary"
				>
					<Button.Label>선택 서식 해제</Button.Label>
				</Button>
			</View>
			{capabilities.includes("link") ? (
				<View className="gap-2">
					<TextField isDisabled={isDisabled}>
						<Input
							accessibilityLabel="선택한 글자의 링크 주소"
							autoCapitalize="none"
							onChangeText={setHref}
							placeholder="https:// 주소"
							value={href}
						/>
					</TextField>
					<Button
						isDisabled={
							isDisabled ||
							!selection ||
							selection.start === selection.end ||
							!href.trim() ||
							!isSafeLinkHref(normalizedHref)
						}
						onPress={() =>
							apply({ type: "link", attrs: { href: normalizedHref } })
						}
						size="sm"
						variant="secondary"
					>
						<Button.Label>선택 글자에 링크 적용</Button.Label>
					</Button>
				</View>
			) : null}
			{editableBlocks(document).map(({ node, path, editable }) => (
				<TextField isDisabled={isDisabled || !editable} key={path.join(".")}>
					{editable ? null : (
						<Text className="text-muted text-xs">
							이 문단에는 지원하지 않는 요소가 있어 원문을 그대로 보존합니다.
						</Text>
					)}
					<TextArea
						accessibilityLabel="문단 내용"
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
						value={nodeText(node)}
					/>
				</TextField>
			))}
			{allowImages ? (
				<View className="gap-2">
					<TextField isDisabled={isDisabled}>
						<Input
							accessibilityLabel="본문 이미지 주소"
							autoCapitalize="none"
							onChangeText={setImageUrl}
							placeholder="이미지 URL"
							value={imageUrl}
						/>
					</TextField>
					<Button
						isDisabled={
							isDisabled ||
							!(
								imageUrl.startsWith("https://") ||
								imageUrl.startsWith("http://")
							)
						}
						onPress={() => {
							publish({
								...document,
								content: [
									...(document.content ?? []),
									{ type: "image", attrs: { src: imageUrl, alt: "" } },
								],
							});
							setImageUrl("");
						}}
						size="sm"
						variant="secondary"
					>
						<Button.Label>이미지 주소 삽입</Button.Label>
					</Button>
				</View>
			) : null}
			{documentImages(document).map(({ node, path }, index) => (
				<View
					className="gap-2 rounded-lg border border-border p-3"
					key={path.join(".")}
				>
					<Text className="text-foreground text-sm">
						본문 이미지 {index + 1}
					</Text>
					<MessageBody
						body={JSON.stringify({ type: "doc", content: [node] })}
					/>
					<View className="flex-row gap-2">
						{([-1, 1] as const).map((direction) => (
							<Button
								isDisabled={isDisabled}
								key={direction}
								onPress={() => publish(moveBlock(document, path, direction))}
								size="sm"
								variant="secondary"
							>
								<Button.Label>
									{direction === -1 ? "이미지 위로" : "이미지 아래로"}
								</Button.Label>
							</Button>
						))}
						<Button
							isDisabled={isDisabled}
							onPress={() => publish(removeBlock(document, path))}
							size="sm"
							variant="danger-soft"
						>
							<Button.Label>이미지 삭제</Button.Label>
						</Button>
					</View>
				</View>
			))}
			{allowImages && allowUpload ? (
				<AdminImagePicker
					maxBytes={10 * 1024 * 1024}
					onBusyChange={(busy) => {
						setUploading(busy);
						onBusyChange?.(busy);
					}}
					onChange={(url) => {
						if (url) {
							publish({
								...document,
								content: [
									...(document.content ?? []),
									{ type: "image", attrs: { src: url, alt: "" } },
								],
							});
						}
					}}
					upload={async (pick) => {
						const intent = await upload.mutateAsync({
							byteSize: pick.bytes.length,
							fileName: pick.fileName,
							mimeType: pick.mimeType,
						});
						await uploadAdminImage(pick, intent);
						const url = publicObjectUri(
							intent.storageKey,
							env.EXPO_PUBLIC_GCS_PUBLIC_BASE_URL
						);
						if (!url) {
							throw new Error("이미지 주소를 확인할 수 없습니다.");
						}
						return url;
					}}
				/>
			) : null}
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
			<View className="gap-2 rounded-lg border border-border p-3">
				<Text className="font-semibold text-muted text-xs">서식 미리보기</Text>
				<MessageBody body={JSON.stringify(document)} />
			</View>
		</View>
	);
}
