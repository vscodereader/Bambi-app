"use client";

// 수다방 글 본문 에디터. Tiptap StarterKit + 최소 툴바(굵게/기울임/취소선/리스트/링크).
// 확장 세트(communityEditorExtensions)는 T11 읽기 전용 뷰어가 그대로 재사용한다.

import {
	ALLOWED_JOB_POST_IMAGE_MIME_TYPES,
	JOB_POST_IMAGE_ALT_TEXT_MAX_LENGTH,
	JOB_POST_IMAGE_MAX_BYTES,
} from "@bambi-app/api/services/bambi-job-media-policy";
import { Button } from "@bambi-app/ui/components/button";
import { Input } from "@bambi-app/ui/components/input";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@bambi-app/ui/components/popover";
import { Separator } from "@bambi-app/ui/components/separator";
import { cn } from "@bambi-app/ui/lib/utils";
import { useMutation } from "@tanstack/react-query";
import Image from "@tiptap/extension-image";
import {
	type Editor,
	EditorContent,
	type JSONContent,
	useEditor,
} from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import {
	BoldIcon,
	ImageIcon,
	ItalicIcon,
	LinkIcon,
	ListIcon,
	ListOrderedIcon,
	Loader2Icon,
	StrikethroughIcon,
} from "lucide-react";
import { type ChangeEvent, useState } from "react";

import { jobMediaPublicUrl } from "@/lib/bambi/api-job-mapper";
import {
	detectImageSignature,
	isSignatureMismatch,
} from "@/lib/bambi/image-signature";
import {
	uploadedEditorMediaUrl,
	uploadFileToSignedUrl,
} from "@/lib/bambi-job-form";
import { orpc } from "@/utils/orpc";

// 공유 확장 세트 — 편집기와 읽기 전용 뷰어(T11)가 동일 스키마로 렌더하도록 export.
// 이미지 노드는 src(URL)만 들고 있다(allowBase64 기본 false). 업로드한 파일은 GCS 공개 URL이,
// 외부 이미지는 그 주소가 그대로 src에 들어가므로 두 경로 모두 스키마 변경이 필요 없다.
export const communityEditorExtensions = [
	StarterKit.configure({
		link: {
			// 스킴 없이 친 주소(example.com)도 https로 붙는다 — 본문에 그냥 적은 주소가
			// autolink로 걸릴 때와 링크 팝오버로 걸 때 모두 같은 규칙을 탄다.
			defaultProtocol: "https",
			// nofollow까지 붙인다 — 회원이 아무 주소나 걸 수 있는 본문이라 우리 도메인의
			// 신뢰를 광고·스팸 링크에 넘겨주지 않는다.
			HTMLAttributes: {
				rel: "noopener noreferrer nofollow",
				target: "_blank",
			},
			openOnClick: false,
		},
	}),
	Image.configure({
		HTMLAttributes: { loading: "lazy" },
		inline: false,
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

// 스킴 없이 적은 주소에 https를 붙인다. mailto:·tel: 같은 다른 스킴은 그대로 둔다
// (Link 확장의 defaultProtocol은 autolink 경로에만 걸려 setLink에는 적용되지 않는다).
const SCHEME_RE = /^[a-z][\w+.-]*:/i;

const withHttps = (value: string): string =>
	SCHEME_RE.test(value) ? value : `https://${value}`;

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
		const trimmed = url.trim();
		const chain = editor.chain().focus().extendMarkRange("link");
		if (trimmed === "") {
			chain.unsetLink().run();
		} else {
			chain.setLink({ href: withHttps(trimmed) }).run();
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
					{/* type="url"이면 브라우저 검증이 스킴 없는 입력(example.com)의 제출 자체를
					    막아 https 자동 보정이 돌 기회가 없다. 검증은 withHttps가 맡는다. */}
					<Input
						aria-label="링크 URL"
						inputMode="url"
						onChange={(event) => setUrl(event.target.value)}
						placeholder="example.com"
						type="text"
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

// 아래 세 값은 서버 정책(bambi-job-media-policy를 usage 없이 호출 = 가장 좁은 집합)의 사본이다.
// 클라이언트 필터는 왕복 한 번과 헛된 대기를 줄이는 편의일 뿐 정본은 서버이며, 어긋나도
// 서버가 BAD_REQUEST로 거절해 에러 문구로 드러난다.
const BYTES_PER_MEGABYTE = 1024 * 1024;
const UPLOAD_ACCEPT = ALLOWED_JOB_POST_IMAGE_MIME_TYPES.join(",");
const UPLOAD_MAX_MB = JOB_POST_IMAGE_MAX_BYTES / BYTES_PER_MEGABYTE;
const ALT_TEXT_MAX_LENGTH = JOB_POST_IMAGE_ALT_TEXT_MAX_LENGTH;

// 이미지 팝오버 — 파일 업로드(GCS)와 외부 URL 삽입을 함께 제공한다.
// URL 삽입을 남겨 두는 이유: 기존 글 본문에 이미 외부 URL 이미지가 들어 있어 수정 모드에서
// 같은 표현이 필요하고, 남의 이미지를 링크로만 참조하려는 쓰임도 정당하기 때문이다.
// 업로드는 인텐트 발급 → 서명 URL PUT → 공개 URL 삽입 순서이며, 어느 단계든 실패하면
// 이미지 노드를 넣지 않고 팝오버 안에 사유를 남긴다(깨진 이미지가 본문에 조용히 박히는 걸 막는다).
// allowUpload=false면 파일 업로드 자리를 안내 문구로 바꾼다 — 비회원은 업로드 인텐트
// 발급(createMediaUpload)이 회원 전용이라 파일을 고를수록 401만 받는다.
function ImagePopover({
	allowUpload,
	editor,
}: {
	allowUpload: boolean;
	editor: Editor;
}) {
	const [open, setOpen] = useState(false);
	const [url, setUrl] = useState("");
	const [alt, setAlt] = useState("");
	const [error, setError] = useState<null | string>(null);
	const [isUploading, setIsUploading] = useState(false);
	const createMediaUpload = useMutation(
		orpc.bambi.community.createMediaUpload.mutationOptions()
	);

	function handleOpenChange(next: boolean) {
		if (next) {
			setUrl("");
			setAlt("");
			setError(null);
		}
		setOpen(next);
	}

	function insertImage(src: string) {
		editor
			.chain()
			.focus()
			.setImage({ alt: alt.trim() || undefined, src })
			.run();
		setOpen(false);
	}

	async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
		const file = event.target.files?.[0];
		// 같은 파일을 다시 고를 때도 change가 뜨도록 값을 비운다(실패 후 재시도 경로).
		event.target.value = "";
		if (!file) {
			return;
		}

		setError(null);

		// 파일 앞바이트(매직넘버)로 실제 형식을 확인해 확장자·File.type 위조를 업로드 전에 막는다.
		if (file.type.startsWith("image/")) {
			const detected = await detectImageSignature(file);

			if (isSignatureMismatch(file.type, detected)) {
				setError(
					"이미지 형식이 올바르지 않습니다. 파일이 실제 이미지인지 확인해 주세요."
				);
				return;
			}
		}

		setIsUploading(true);
		try {
			const intent = await createMediaUpload.mutateAsync({
				byteSize: file.size,
				fileName: file.name,
				mimeType: file.type,
			});
			await uploadFileToSignedUrl({ file, uploadIntent: intent });
			insertImage(
				uploadedEditorMediaUrl(intent) ?? jobMediaPublicUrl(intent.storageKey)
			);
		} catch (caught) {
			// 서버 정책 위반(용량·타입)도 전송 실패도 여기로 모인다 — 문구는 서버가 준 걸 우선한다.
			setError(
				caught instanceof Error && caught.message
					? caught.message
					: "이미지를 올리지 못했어요. 잠시 후 다시 시도해 주세요."
			);
		} finally {
			setIsUploading(false);
		}
	}

	function applyImage() {
		const trimmedUrl = url.trim();
		if (trimmedUrl === "") {
			return;
		}
		insertImage(trimmedUrl);
	}

	return (
		<Popover onOpenChange={handleOpenChange} open={open}>
			<PopoverTrigger
				render={
					<Button
						aria-label="이미지"
						size="icon-sm"
						type="button"
						variant="ghost"
					>
						<ImageIcon />
					</Button>
				}
			/>
			{/* 모바일에서 팝오버가 화면 밖으로 나가지 않도록 뷰포트 기준 상한을 함께 둔다. */}
			<PopoverContent
				align="start"
				className="flex w-[min(18rem,calc(100vw-2rem))] flex-col gap-3"
			>
				{/* 설명(alt)은 업로드·URL 두 경로가 함께 쓰므로 폼 밖 공용 필드로 둔다. */}
				<Input
					aria-label="이미지 설명"
					maxLength={ALT_TEXT_MAX_LENGTH}
					onChange={(event) => setAlt(event.target.value)}
					placeholder="이미지 설명(선택)"
					value={alt}
				/>
				<div className="flex flex-col gap-1.5">
					{allowUpload ? (
						<Input
							accept={UPLOAD_ACCEPT}
							aria-label="이미지 파일"
							disabled={isUploading}
							onChange={handleFileChange}
							type="file"
						/>
					) : (
						<p className="text-muted-foreground text-xs">
							이미지 업로드는 회원만 이용할 수 있어요. 이미지 주소로 넣어
							주세요.
						</p>
					)}
					{allowUpload ? (
						<p className="flex items-center gap-1.5 text-muted-foreground text-xs">
							{isUploading ? (
								<>
									<Loader2Icon className="size-3.5 animate-spin" />
									업로드 중…
								</>
							) : (
								`JPG·PNG·WebP · 최대 ${UPLOAD_MAX_MB}MB`
							)}
						</p>
					) : null}
					{error ? (
						<p className="text-destructive text-xs" role="alert">
							{error}
						</p>
					) : null}
				</div>
				<Separator />
				<form
					className="flex flex-col gap-2"
					onSubmit={(event) => {
						event.preventDefault();
						applyImage();
					}}
				>
					<Input
						aria-label="이미지 URL"
						onChange={(event) => setUrl(event.target.value)}
						placeholder="https://example.com/image.jpg"
						type="url"
						value={url}
					/>
					<div className="flex justify-end">
						<Button
							disabled={isUploading || url.trim() === ""}
							size="sm"
							type="submit"
						>
							URL 삽입
						</Button>
					</div>
				</form>
			</PopoverContent>
		</Popover>
	);
}

function CommunityEditorToolbar({
	allowUpload,
	editor,
}: {
	allowUpload: boolean;
	editor: Editor;
}) {
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
			<ImagePopover allowUpload={allowUpload} editor={editor} />
		</div>
	);
}

interface CommunityPostEditorProps {
	// 파일 업로드 허용 여부(기본 허용). 비회원 폼은 false로 내려 URL 삽입만 남긴다.
	allowUpload?: boolean;
	onChange: (payload: {
		hasImage: boolean;
		json: string;
		text: string;
	}) => void;
	plainTextPaste?: boolean;
	value: string;
}

// 이미지 노드 존재 여부 — 텍스트 없이 이미지만 있는 글도 비어있지 않음으로 판정하려고
// 문서를 훑어 image 노드가 있는지 확인한다.
const docHasImage = (editor: Editor): boolean => {
	let found = false;
	editor.state.doc.descendants((node) => {
		if (node.type.name === "image") {
			found = true;
		}
	});
	return found;
};

// 에디터 상태를 폼 페이로드로 직렬화 — json(제출용)·text(비어있음 판정)·hasImage(이미지 전용 글 허용).
const buildEditorPayload = (editor: Editor) => ({
	hasImage: docHasImage(editor),
	json: JSON.stringify(editor.getJSON()),
	text: editor.getText(),
});

// 컨트롤드 규약: value는 초기 마운트 시 1회만 파싱해 주입(마운트 후 비제어), onChange는 매
// 업데이트마다 { json, text, hasImage }를 돌려준다 — 폼은 json으로 제출, text·hasImage로 비어있음 판정.
export function CommunityPostEditor({
	allowUpload = true,
	onChange,
	plainTextPaste = false,
	value,
}: CommunityPostEditorProps) {
	const editor = useEditor({
		content: parseCommunityBody(value),
		editorProps: {
			attributes: { class: EDITOR_BODY_CLASS },
			handlePaste: plainTextPaste
				? (view, event) => {
						const text = event.clipboardData?.getData("text/plain");
						if (!text) {
							return false;
						}
						event.preventDefault();
						view.dispatch(
							view.state.tr.insertText(text.replace(/\r?\n+/g, " "))
						);
						return true;
					}
				: undefined,
		},
		extensions: communityEditorExtensions,
		immediatelyRender: false,
		// 초기 콘텐츠(수정 모드 기존 본문)를 마운트 즉시 폼에 흘려 비어있음 게이트를 통과시킨다.
		onCreate: ({ editor: current }) => {
			onChange(buildEditorPayload(current));
		},
		onUpdate: ({ editor: current }) => {
			onChange(buildEditorPayload(current));
		},
	});

	return (
		<div className="flex flex-col rounded-lg border border-input bg-transparent focus-within:border-ring focus-within:ring-1 focus-within:ring-ring/50 dark:bg-input/30">
			{editor ? (
				<CommunityEditorToolbar allowUpload={allowUpload} editor={editor} />
			) : null}
			<EditorContent editor={editor} />
		</div>
	);
}
