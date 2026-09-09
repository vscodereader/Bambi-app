export interface DocumentMark {
	attrs?: Record<string, unknown>;
	type: string;
}

export interface DocumentNode {
	attrs?: Record<string, unknown>;
	content?: DocumentNode[];
	marks?: DocumentMark[];
	text?: string;
	type: string;
	[key: string]: unknown;
}

export function readDocument(value: string): DocumentNode {
	if (!value) {
		return { type: "doc", content: [{ type: "paragraph" }] };
	}
	try {
		const parsed = JSON.parse(value) as DocumentNode;
		if (parsed && parsed.type === "doc") {
			return parsed;
		}
		throw new Error("지원하지 않는 문서 형식입니다.");
	} catch (error) {
		if (!(error instanceof SyntaxError)) {
			throw error;
		}
		return {
			type: "doc",
			content: value.split("\n").map((text) => ({
				type: "paragraph",
				content: text ? [{ type: "text", text }] : [],
			})),
		};
	}
}

export function nodeText(node: DocumentNode): string {
	if (node.type === "hardBreak") {
		return "\n";
	}
	if (typeof node.text === "string") {
		return node.text;
	}
	return (node.content ?? []).map(nodeText).join("");
}

export function editableBlocks(
	document: DocumentNode
): { node: DocumentNode; path: number[]; editable: boolean }[] {
	const blocks: { node: DocumentNode; path: number[]; editable: boolean }[] =
		[];
	const visit = (node: DocumentNode, path: number[]) => {
		if (["paragraph", "heading", "codeBlock"].includes(node.type)) {
			blocks.push({
				node,
				path,
				editable: (node.content ?? []).every(
					(child) => child.type === "text" || child.type === "hardBreak"
				),
			});
			return;
		}
		for (const [index, child] of (node.content ?? []).entries()) {
			visit(child, [...path, index]);
		}
	};
	visit(document, []);
	return blocks;
}

export function documentImages(
	document: DocumentNode
): { node: DocumentNode; path: number[] }[] {
	const images: { node: DocumentNode; path: number[] }[] = [];
	const visit = (node: DocumentNode, path: number[]) => {
		if (node.type === "image") {
			images.push({ node, path });
		}
		for (const [index, child] of (node.content ?? []).entries()) {
			visit(child, [...path, index]);
		}
	};
	visit(document, []);
	return images;
}

export function replaceNode(
	document: DocumentNode,
	path: number[],
	update: (node: DocumentNode) => DocumentNode
): DocumentNode {
	const [index, ...rest] = path;
	if (index === undefined) {
		return update(document);
	}
	return {
		...document,
		content: document.content?.map((node, position) =>
			position === index ? replaceNode(node, rest, update) : node
		),
	};
}

export function wrapBlock(
	document: DocumentNode,
	path: number[],
	type: "bulletList" | "orderedList" | "blockquote"
): DocumentNode {
	let ancestor = document;
	for (let depth = 0; depth < path.length; depth++) {
		const index = path[depth];
		const child = index === undefined ? undefined : ancestor.content?.[index];
		if (!child) {
			break;
		}
		if (child.type === type) {
			return replaceNode(document, path.slice(0, depth), (parent) => ({
				...parent,
				content: parent.content?.flatMap((node, position) => {
					if (position !== index) {
						return [node];
					}
					return (node.content ?? []).flatMap((item) =>
						item.type === "listItem" ? (item.content ?? []) : [item]
					);
				}),
			}));
		}
		ancestor = child;
	}
	return replaceNode(document, path, (node) => ({
		type,
		content:
			type === "blockquote" ? [node] : [{ type: "listItem", content: [node] }],
	}));
}

function cleanEmptyContainers(node: DocumentNode): DocumentNode {
	if (!node.content) {
		return node;
	}
	const content = node.content
		.map(cleanEmptyContainers)
		.filter(
			(child) =>
				!["listItem", "bulletList", "orderedList", "blockquote"].includes(
					child.type
				) || Boolean(child.content?.length)
		);
	return {
		...node,
		content:
			node.type === "doc" && content.length === 0
				? [{ type: "paragraph" }]
				: content,
	};
}

export function removeBlock(
	document: DocumentNode,
	path: number[]
): DocumentNode {
	const index = path.at(-1);
	if (index === undefined) {
		return document;
	}
	return cleanEmptyContainers(
		replaceNode(document, path.slice(0, -1), (parent) => ({
			...parent,
			content: parent.content?.filter((_, position) => position !== index),
		}))
	);
}

export function moveBlock(
	document: DocumentNode,
	path: number[],
	direction: -1 | 1
): DocumentNode {
	const index = path.at(-1);
	if (index === undefined) {
		return document;
	}
	return replaceNode(document, path.slice(0, -1), (parent) => {
		const content = [...(parent.content ?? [])];
		const target = index + direction;
		const node = content[index];
		if (!node || target < 0 || target >= content.length) {
			return parent;
		}
		content.splice(index, 1);
		content.splice(target, 0, node);
		return { ...parent, content };
	});
}

function mergeRuns(nodes: DocumentNode[]): DocumentNode[] {
	const result: DocumentNode[] = [];
	for (const node of nodes) {
		if (node.type === "text" && !node.text) {
			continue;
		}
		const previous = result.at(-1);
		const { text: _text, ...metadata } = node;
		const { text: _previousText, ...previousMetadata } = previous ?? {};
		if (
			node.type === "text" &&
			previous?.type === "text" &&
			JSON.stringify(metadata) === JSON.stringify(previousMetadata)
		) {
			previous.text = (previous.text ?? "") + (node.text ?? "");
		} else {
			result.push({ ...node });
		}
	}
	return result;
}

export function markRange(
	node: DocumentNode,
	start: number,
	end: number,
	mark: DocumentMark,
	remove = false
): DocumentNode {
	if (start >= end) {
		return node;
	}
	let offset = 0;
	const content = (node.content ?? []).flatMap((child) => {
		const text = nodeText(child);
		const left = Math.max(0, start - offset);
		const right = Math.min(text.length, end - offset);
		offset += text.length;
		if (child.type !== "text" || left >= right) {
			return [child];
		}
		const marks = (child.marks ?? []).filter(
			(value) => value.type !== mark.type
		);
		if (!remove) {
			const original = child.marks?.find((value) => value.type === mark.type);
			marks.push(
				mark.attrs && original?.attrs
					? { ...mark, attrs: { ...original.attrs, ...mark.attrs } }
					: mark
			);
		}
		const { marks: _oldMarks, ...unmarked } = child;
		const marked = marks.length ? { ...child, marks } : unmarked;
		return [
			{ ...child, text: text.slice(0, left) },
			{ ...marked, text: text.slice(left, right) },
			{ ...child, text: text.slice(right) },
		];
	});
	return { ...node, content: mergeRuns(content) };
}

export function toggleMarkRange(
	node: DocumentNode,
	start: number,
	end: number,
	mark: DocumentMark
): DocumentNode {
	let offset = 0;
	const selected = (node.content ?? []).filter((child) => {
		const first = offset;
		offset += nodeText(child).length;
		return child.type === "text" && first < end && offset > start;
	});
	const active =
		selected.length > 0 &&
		selected.every((child) =>
			child.marks?.some((value) => value.type === mark.type)
		);
	return markRange(node, start, end, mark, active);
}

// TextInput offsets and JS slices both use UTF-16. Keep unchanged runs and their
// attributes intact, including marks unknown to the native editor.
function changedRange(previous: string, next: string) {
	let start = 0;
	while (
		start < previous.length &&
		start < next.length &&
		previous[start] === next[start]
	) {
		start++;
	}
	let end = previous.length;
	let nextEnd = next.length;
	while (
		end > start &&
		nextEnd > start &&
		previous[end - 1] === next[nextEnd - 1]
	) {
		end--;
		nextEnd--;
	}
	return { start, end, inserted: next.slice(start, nextEnd) };
}

function insertedRuns(
	text: string,
	marks: DocumentMark[] | undefined,
	isCode: boolean
): DocumentNode[] {
	const base = marks ? { marks } : {};
	if (isCode) {
		return text ? [{ type: "text", text, ...base }] : [];
	}
	return text
		.split("\n")
		.flatMap((line, index) => [
			...(index ? [{ type: "hardBreak" }] : []),
			...(line ? [{ type: "text", text: line, ...base }] : []),
		]);
}

function changedChild(
	child: DocumentNode,
	before: string,
	after: string,
	inserted: string,
	isCode: boolean
): DocumentNode[] {
	const result: DocumentNode[] = [];
	if (before) {
		result.push({ ...child, text: before });
	}
	if (inserted) {
		result.push(...insertedRuns(inserted, child.marks, isCode));
	}
	if (after) {
		result.push(child.type === "hardBreak" ? child : { ...child, text: after });
	}
	return result;
}

export function editBlockText(node: DocumentNode, next: string): DocumentNode {
	const previous = nodeText(node);
	if (previous === next) {
		return node;
	}
	const { start, end, inserted } = changedRange(previous, next);
	const result: DocumentNode[] = [];
	let offset = 0;
	let added = false;
	for (const child of node.content ?? []) {
		const text = nodeText(child);
		const childStart = offset;
		const childEnd = offset + text.length;
		offset = childEnd;
		if (childEnd < start || (childEnd === start && text.length > 0)) {
			result.push(child);
			continue;
		}
		if (childStart >= end && added) {
			result.push(child);
			continue;
		}
		if (child.type !== "text" && child.type !== "hardBreak") {
			result.push(child);
			continue;
		}
		const before = text.slice(0, Math.max(0, start - childStart));
		const after = text.slice(Math.max(0, end - childStart));
		result.push(
			...changedChild(
				child,
				before,
				after,
				added ? "" : inserted,
				node.type === "codeBlock"
			)
		);
		added = true;
	}
	if (!added && inserted) {
		result.push(
			...insertedRuns(inserted, result.at(-1)?.marks, node.type === "codeBlock")
		);
	}
	return { ...node, content: mergeRuns(result) };
}
