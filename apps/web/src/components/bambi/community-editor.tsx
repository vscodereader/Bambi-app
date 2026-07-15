"use client";

// 수다방 글 본문 에디터. Tiptap StarterKit + 최소 툴바(굵게/기울임/취소선/리스트/링크).
// 확장 세트(communityEditorExtensions)는 T11 읽기 전용 뷰어가 그대로 재사용한다.

import { Button } from "@bambi-app/ui/components/button";
import { Input } from "@bambi-app/ui/components/input";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@bambi-app/ui/components/popover";
import { cn } from "@bambi-app/ui/lib/utils";
import {
	type Editor,
	EditorContent,
	type JSONContent,
	useEditor,
} from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import {
	BoldIcon,
	ItalicIcon,
	LinkIcon,
	ListIcon,
	ListOrderedIcon,
	StrikethroughIcon,
} from "lucide-react";
import { useState } from "react";

// 공유 확장 세트 — 편집기와 읽기 전용 뷰어(T11)가 동일 스키마로 렌더하도록 export.
export const communityEditorExtensions = [
	StarterKit.configure({
		link: {
			HTMLAttributes: { rel: "noopener noreferrer", target: "_blank" },
			openOnClick: false,
		},
	}),
];

// 본문 JSON 문자열을 Tiptap 문서로 안전 파싱. 비었거나 형식이 어긋나면 undefined(빈 문서).
export const parseCommunityBody = (value: string): JSONContent | undefined => {
	if (!value) {
		return;
	}
	try {
		const parsed = JSON.parse(value) as JSONContent;
		if (parsed && typeof parsed === "object" && parsed.type === "doc") {
			return parsed;
		}
	} catch {
		// 형식 오류는 빈 문서로 대체
	}
	return;
};

// EditorContent 본문 영역 타이포그래피(시맨틱 토큰 · Tailwind 스케일만 사용).
// 높이는 h-72로 고정하고 넘치면 내부 스크롤(overflow-y-auto) — 긴 글에도 폼 레이아웃이
// 밀리지 않는다. 삽입 이미지는 컨테이너 폭에 맞추고(rounded-md) 세로 비율을 유지한다.
const EDITOR_BODY_CLASS = cn(
	"h-72 w-full overflow-y-auto px-3 py-2 text-foreground text-sm leading-relaxed outline-none",
	"[&_a]:text-primary [&_a]:underline",
	"[&_ol]:list-decimal [&_ol]:pl-5 [&_ul]:list-disc [&_ul]:pl-5",
	"[&_p]:my-1 [&_strong]:font-semibold",
	"[&_img]:my-2 [&_img]:h-auto [&_img]:max-w-full [&_img]:rounded-md",
	"[&_img.ProseMirror-selectednode]:outline [&_img.ProseMirror-selectednode]:outline-2 [&_img.ProseMirror-selectednode]:outline-ring"
);

interface ToggleSpec {
	icon: typeof BoldIcon;
	isActive: (editor: Editor) => boolean;
	label: string;
	run: (editor: Editor) => void;
}

const TOGGLES: ToggleSpec[] = [
	{
		icon: BoldIcon,
		isActive: (editor) => editor.isActive("bold"),
		label: "굵게",
		run: (editor) => editor.chain().focus().toggleBold().run(),
	},
	{
		icon: ItalicIcon,
		isActive: (editor) => editor.isActive("italic"),
		label: "기울임",
		run: (editor) => editor.chain().focus().toggleItalic().run(),
	},
	{
		icon: StrikethroughIcon,
		isActive: (editor) => editor.isActive("strike"),
		label: "취소선",
		run: (editor) => editor.chain().focus().toggleStrike().run(),
	},
	{
		icon: ListIcon,
		isActive: (editor) => editor.isActive("bulletList"),
		label: "글머리 목록",
		run: (editor) => editor.chain().focus().toggleBulletList().run(),
	},
	{
		icon: ListOrderedIcon,
		isActive: (editor) => editor.isActive("orderedList"),
		label: "번호 목록",
		run: (editor) => editor.chain().focus().toggleOrderedList().run(),
	},
];

// 링크 입력 팝오버 — window.prompt 대체. 열릴 때 기존 링크 href를 초기값으로 채우고,
// 빈 값 적용은 링크 해제(unsetLink), URL 적용은 setLink({ href }).
function LinkPopover({ editor }: { editor: Editor }) {
	const [open, setOpen] = useState(false);
	const [url, setUrl] = useState("");
	const isActive = editor.isActive("link");

	function handleOpenChange(next: boolean) {
		if (next) {
			const previous = editor.getAttributes("link").href as string | undefined;
			setUrl(previous ?? "");
		}
		setOpen(next);
	}

	function applyLink() {
		const chain = editor.chain().focus().extendMarkRange("link");
		if (url === "") {
			chain.unsetLink().run();
		} else {
			chain.setLink({ href: url }).run();
		}
		setOpen(false);
	}

	function removeLink() {
		editor.chain().focus().extendMarkRange("link").unsetLink().run();
		setOpen(false);
	}

	return (
		<Popover onOpenChange={handleOpenChange} open={open}>
			<PopoverTrigger
				render={
					<Button
						aria-label="링크"
						aria-pressed={isActive}
						className={cn(isActive && "bg-accent text-accent-foreground")}
						size="icon-sm"
						type="button"
						variant="ghost"
					>
						<LinkIcon />
					</Button>
				}
			/>
			<PopoverContent align="start" className="w-64">
				<form
					className="flex flex-col gap-2"
					onSubmit={(event) => {
						event.preventDefault();
						applyLink();
					}}
				>
					<Input
						aria-label="링크 URL"
						onChange={(event) => setUrl(event.target.value)}
						placeholder="https://example.com"
						type="url"
						value={url}
					/>
					<div className="flex justify-end gap-1.5">
						<Button
							disabled={!isActive}
							onClick={removeLink}
							size="sm"
							type="button"
							variant="ghost"
						>
							해제
						</Button>
						<Button size="sm" type="submit">
							적용
						</Button>
					</div>
				</form>
			</PopoverContent>
		</Popover>
	);
}

function CommunityEditorToolbar({ editor }: { editor: Editor }) {
	return (
		<div className="flex flex-wrap items-center gap-1 border-border border-b px-2 py-1.5">
			{TOGGLES.map((toggle) => {
				const active = toggle.isActive(editor);
				const Icon = toggle.icon;
				return (
					<Button
						aria-label={toggle.label}
						aria-pressed={active}
						className={cn(active && "bg-accent text-accent-foreground")}
						key={toggle.label}
						onClick={() => toggle.run(editor)}
						size="icon-sm"
						type="button"
						variant="ghost"
					>
						<Icon />
					</Button>
				);
			})}
			<LinkPopover editor={editor} />
		</div>
	);
}

interface CommunityPostEditorProps {
	onChange: (payload: { json: string; text: string }) => void;
	value: string;
}

// 컨트롤드 규약: value는 초기 마운트 시 1회만 파싱해 주입(마운트 후 비제어), onChange는
// 매 업데이트마다 { json, text }를 돌려준다 — 폼은 json으로 제출, text로 비어있음 판정.
export function CommunityPostEditor({
	onChange,
	value,
}: CommunityPostEditorProps) {
	const editor = useEditor({
		content: parseCommunityBody(value),
		editorProps: {
			attributes: { class: EDITOR_BODY_CLASS },
		},
		extensions: communityEditorExtensions,
		immediatelyRender: false,
		// 초기 콘텐츠(수정 모드 기존 본문)를 마운트 즉시 폼에 흘려 비어있음 게이트를 통과시킨다.
		onCreate: ({ editor: current }) => {
			onChange({
				json: JSON.stringify(current.getJSON()),
				text: current.getText(),
			});
		},
		onUpdate: ({ editor: current }) => {
			onChange({
				json: JSON.stringify(current.getJSON()),
				text: current.getText(),
			});
		},
	});

	return (
		<div className="flex flex-col rounded-lg border border-input bg-transparent focus-within:border-ring focus-within:ring-1 focus-within:ring-ring/50 dark:bg-input/30">
			{editor ? <CommunityEditorToolbar editor={editor} /> : null}
			<EditorContent editor={editor} />
		</div>
	);
}
