"use client";

import { Button } from "@bambi-app/ui/components/button";
import { Input } from "@bambi-app/ui/components/input";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@bambi-app/ui/components/popover";
import { FontSize, TextStyle } from "@tiptap/extension-text-style";
import {
	type Editor,
	EditorContent,
	type JSONContent,
	useEditor,
} from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import {
	Bold,
	Italic,
	Link,
	List,
	ListOrdered,
	Strikethrough,
} from "lucide-react";
import { useState } from "react";

const FONT_SIZES = [12, 14, 16, 18, 20, 24, 28, 32, 40, 48] as const;
const SCHEME_PATTERN = /^[a-z][\w+.-]*:/i;
const TOGGLES = [
	[
		"굵게",
		Bold,
		"bold",
		(editor: Editor) => editor.chain().focus().toggleBold().run(),
	],
	[
		"기울임",
		Italic,
		"italic",
		(editor: Editor) => editor.chain().focus().toggleItalic().run(),
	],
	[
		"취소선",
		Strikethrough,
		"strike",
		(editor: Editor) => editor.chain().focus().toggleStrike().run(),
	],
	[
		"글머리 목록",
		List,
		"bulletList",
		(editor: Editor) => editor.chain().focus().toggleBulletList().run(),
	],
	[
		"번호 목록",
		ListOrdered,
		"orderedList",
		(editor: Editor) => editor.chain().focus().toggleOrderedList().run(),
	],
] as const;

function LinkButton({ editor }: { editor: Editor }) {
	const [open, setOpen] = useState(false);
	const [url, setUrl] = useState("");
	return (
		<Popover
			onOpenChange={(next) => {
				setOpen(next);
				if (next) {
					setUrl(
						(editor.getAttributes("link").href as string | undefined) ?? ""
					);
				}
			}}
			open={open}
		>
			<PopoverTrigger
				render={
					<Button
						aria-label="링크"
						size="icon-sm"
						type="button"
						variant="ghost"
					>
						<Link />
					</Button>
				}
			/>
			<PopoverContent align="start" className="w-72">
				<form
					className="flex gap-2"
					onSubmit={(event) => {
						event.preventDefault();
						const value = url.trim();
						const chain = editor.chain().focus().extendMarkRange("link");
						if (value) {
							chain
								.setLink({
									href: SCHEME_PATTERN.test(value) ? value : `https://${value}`,
								})
								.run();
						} else {
							chain.unsetLink().run();
						}
						setOpen(false);
					}}
				>
					<Input
						aria-label="링크 URL"
						onChange={(event) => setUrl(event.target.value)}
						placeholder="example.com"
						value={url}
					/>
					<Button type="submit">적용</Button>
				</form>
			</PopoverContent>
		</Popover>
	);
}

const extensions = [
	StarterKit.configure({
		link: {
			HTMLAttributes: { rel: "noopener noreferrer nofollow", target: "_blank" },
			openOnClick: false,
		},
	}),
	TextStyle,
	FontSize,
];

export function PopupTextEditor({
	onAutoHeight,
	onChange,
	value,
}: {
	onAutoHeight?: (height: number) => void;
	onChange: (value: JSONContent) => void;
	value: JSONContent;
}) {
	const editor = useEditor({
		content: value,
		editorProps: {
			attributes: {
				class:
					"min-h-full w-full bg-background p-4 text-foreground outline-none [&_a]:text-primary [&_a]:underline [&_ol]:list-decimal [&_ol]:pl-5 [&_ul]:list-disc [&_ul]:pl-5",
			},
		},
		extensions,
		immediatelyRender: false,
		onUpdate: ({ editor: current }) => {
			onChange(current.getJSON());
			requestAnimationFrame(() =>
				onAutoHeight?.(
					Math.min(window.innerHeight * 0.8, current.view.dom.scrollHeight + 48)
				)
			);
		},
	});
	return (
		<div className="flex h-full min-h-0 flex-col overflow-hidden rounded-md border bg-background">
			{editor ? (
				<div className="flex flex-wrap items-center gap-1 border-b p-1.5">
					{TOGGLES.map(([label, Icon, active, run]) => (
						<Button
							aria-label={label}
							aria-pressed={editor.isActive(active)}
							key={label}
							onClick={() => run(editor)}
							size="icon-sm"
							type="button"
							variant={editor.isActive(active) ? "secondary" : "ghost"}
						>
							<Icon />
						</Button>
					))}
					<LinkButton editor={editor} />
					<select
						aria-label="글자 크기"
						className="h-8 rounded-md border bg-background px-2 text-sm"
						defaultValue="16"
						onChange={(event) =>
							editor
								.chain()
								.focus()
								.setFontSize(`${event.target.value}px`)
								.run()
						}
					>
						{FONT_SIZES.map((size) => (
							<option key={size} value={size}>
								{size}px
							</option>
						))}
					</select>
				</div>
			) : null}
			<EditorContent
				className="min-h-0 flex-1 overflow-y-auto"
				editor={editor}
			/>
		</div>
	);
}

export function PopupTextViewer({ document }: { document: JSONContent }) {
	const editor = useEditor({
		content: document,
		editable: false,
		editorProps: {
			attributes: {
				class:
					"h-full overflow-y-auto bg-background p-4 text-foreground [&_a]:text-primary [&_a]:underline [&_ol]:list-decimal [&_ol]:pl-5 [&_ul]:list-disc [&_ul]:pl-5",
			},
		},
		extensions,
		immediatelyRender: false,
	});
	return <EditorContent className="h-full overflow-y-auto" editor={editor} />;
}
