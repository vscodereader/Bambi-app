"use client";

// 글 작성/수정 공용 폼. 컨트롤드 필드 + Tiptap 본문 에디터, 서버 검증에 위임한다.

import {
	Alert,
	AlertDescription,
	AlertTitle,
} from "@bambi-app/ui/components/alert";
import { Button } from "@bambi-app/ui/components/button";
import { Input } from "@bambi-app/ui/components/input";
import { Label } from "@bambi-app/ui/components/label";
import { Switch } from "@bambi-app/ui/components/switch";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { LockIcon } from "lucide-react";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { CommunityPostEditor } from "@/components/bambi/community-editor";
import { authClient } from "@/lib/auth-client";
import {
	type CommunityBoardMeta,
	communityBoardPath,
	isLegalBoardKey,
} from "@/lib/bambi/community";
import { useCommunityAreaPaths } from "@/lib/bambi/community-paths";
import { orpc } from "@/utils/orpc";

const TITLE_MAX = 100;
const AUTHOR_MAX = 30;
const CONTACT_PHONE_MAX = 20;
const PASSWORD_MIN = 4;
const PASSWORD_MAX = 30;
const MIN_TEXT = 2;

// 비회원 글의 작성인 기본값. 서버 zod가 빈 문자열을 거부하므로 화면이 값을 채워 보낸다
// (자유 수정 가능 — 금칙어 검사는 회원과 동일하게 서버가 한다).
const GUEST_AUTHOR_DEFAULT = "비회원";

// 법률 자문 글은 서버가 잠금을 강제하므로(resolveLockedForBoard) 화면도 항상 잠금 상태로 연다.
const getInitialLockedState = (
	boardKey: string,
	initiallyLocked: boolean | undefined
): boolean =>
	isLegalBoardKey(boardKey) ||
	(boardKey !== "free" && Boolean(initiallyLocked));

const initialAuthorName = (guest: boolean, initial?: string): string =>
	initial ?? (guest ? GUEST_AUTHOR_DEFAULT : "");

const isLockPasswordRequired = (
	isEdit: boolean,
	isFreeBoard: boolean,
	isLocked: boolean
): boolean => !(isEdit || isFreeBoard) && isLocked;

// 실제로 서버에 보낼 잠금 값. 법률 자문은 회원·비회원 가릴 것 없이 잠긴 채 등록되고
// (서버 resolveLockedForBoard가 같은 판정을 다시 강제한다), 자유수다·비회원 글은 잠기지 않는다.
const resolveSubmittedLock = (
	boardKey: string,
	guest: boolean,
	isLocked: boolean
): boolean =>
	isLegalBoardKey(boardKey) || (!(boardKey === "free" || guest) && isLocked);

// 연락처는 법률 자문 글에만 실어 보낸다 — 다른 게시판에 실리면 서버가 400으로 막는다.
const contactPhoneInput = (
	boardKey: string,
	contactPhone: string
): { contactPhone?: string } =>
	isLegalBoardKey(boardKey) ? { contactPhone: contactPhone.trim() } : {};

const eventStateAfterLockChange = (
	currentIsEvent: boolean,
	nextIsLocked: boolean
): boolean => (nextIsLocked ? false : currentIsEvent);

const lockStateAfterEventChange = (
	currentIsLocked: boolean,
	nextIsEvent: boolean
): boolean => (nextIsEvent ? false : currentIsLocked);

const passwordAfterEventChange = (
	currentPassword: string,
	nextIsEvent: boolean
): string => (nextIsEvent ? "" : currentPassword);

const canPromotePost = (
	isEdit: boolean,
	initialAuthorRole: CommunityPostInitial["authorRole"] | undefined,
	currentRole: CommunityPostInitial["authorRole"] | undefined
): boolean =>
	isEdit ? initialAuthorRole === "employer" : currentRole === "employer";

interface CommunityPostInitial {
	authorName: string;
	// 글 작성자의 role 스냅샷(getPost.authorRole). 수정 모드 광고 Switch 게이트에 쓴다.
	authorRole: "admin" | "employer" | "guest" | "job_seeker" | "legal_advisor";
	body: string;
	// 법률 자문 글의 연락처. 수정 폼이 다시 실어 보내지 않으면 서버가 null로 덮어쓴다.
	contactPhone?: string | null;
	id: string;
	isEvent?: boolean;
	isLocked: boolean;
	// 수정 모드 광고글 초기값. 편집 페이지가 getPost.isPromotion을 넘겨주면 사용한다.
	isPromotion?: boolean;
	title: string;
}

interface CommunityPostFormProps {
	board: CommunityBoardMeta;
	// 수정 모드 초기값. 게이트(CommunityEditGate)를 통과한 비번을 넘긴다 — 비회원 수정과
	// 회원 비작성자 수정 모두 이 값으로 인라인 비밀번호 재입력을 없앤다(회원 작성자는 undefined).
	editPassword?: string;
	// 비회원(게스트 인증) 모드. 작성인 기본값·잠금/광고·이미지 업로드 숨김이 함께 바뀐다.
	// 작성 모드는 비밀번호 필드를 세워 새 비번을 받고, 수정 모드는 게이트에서 받은 editPassword를
	// 쓰므로 필드를 숨긴다. 완료 후 이동은 신분이 아니라 지금 있는 영역(useCommunityAreaPaths)을 따른다.
	guest?: boolean;
	initialPost?: CommunityPostInitial;
}

const passwordLabel = (guest: boolean, isEdit: boolean): string => {
	if (guest) {
		return "비밀번호";
	}
	return isEdit ? "글 비밀번호" : "비밀글 비밀번호";
};

const passwordPlaceholder = (guest: boolean, isEdit: boolean): string => {
	if (guest) {
		return "4자 이상 (수정·삭제할 때 필요해요)";
	}
	return isEdit ? "본인은 비워둘 수 있어요" : "4자 이상";
};

// 비밀글 잠금 스위치 + (잠금 시) 비밀번호 필드. 자유수다는 스위치를 숨기되 수정 권한 확인용
// 비밀번호 필드는 유지한다. 작성 모드는 잠금을 끄면 잔여 비번을 비운다.
// 비회원은 잠금 자체를 쓸 수 없고(공개 경로에서 자기 글도 못 읽게 된다) 비밀번호가
// 소유권 증명 전용이다. 작성 모드는 새 비밀번호를 정하는 곳이라 필드를 세우지만, 수정 모드는
// 게이트(CommunityEditGate)에서 검증된 비번을 editPassword로 이미 받으므로 인라인 필드를 숨긴다.
// 법률 자문(forcedLock)은 스위치 대신 안내만 두고 비밀번호를 반드시 받는다.
function PostLockField({
	allowLocking,
	forcedLock,
	guest,
	isEdit,
	isLocked,
	password,
	setIsLocked,
	setPassword,
}: {
	allowLocking: boolean;
	forcedLock: boolean;
	guest: boolean;
	isEdit: boolean;
	isLocked: boolean;
	password: string;
	setIsLocked: (value: boolean) => void;
	setPassword: (value: string) => void;
}) {
	const showPasswordField = guest ? !isEdit : isEdit || isLocked;
	const handleLockChange = (checked: boolean) => {
		setIsLocked(checked);
		if (!(checked || isEdit)) {
			setPassword("");
		}
	};
	return (
		<div className="flex flex-col gap-2">
			{forcedLock ? (
				<Alert>
					<LockIcon />
					<AlertTitle>법률 자문 글은 비밀글로 등록됩니다</AlertTitle>
					<AlertDescription>
						글 비밀번호를 정해 주세요. 본인과 운영자·법률자문만 내용을 볼 수
						있어요.
					</AlertDescription>
				</Alert>
			) : null}
			{allowLocking ? (
				<div className="flex items-center gap-2">
					<Switch
						checked={isLocked}
						id="community-post-lock"
						onCheckedChange={handleLockChange}
					/>
					<Label htmlFor="community-post-lock">비밀글로 잠그기</Label>
				</div>
			) : null}
			{showPasswordField ? (
				<div className="flex flex-col gap-2">
					<Label htmlFor="community-post-password">
						{passwordLabel(guest, isEdit)}
					</Label>
					<Input
						autoComplete="new-password"
						id="community-post-password"
						maxLength={PASSWORD_MAX}
						onChange={(event) => setPassword(event.target.value)}
						placeholder={passwordPlaceholder(guest, isEdit)}
						type="password"
						value={password}
					/>
				</div>
			) : null}
		</div>
	);
}

// 연락처(선택) — 법률 자문 게시판에서만 세운다. 서버는 다른 게시판에서 이 값을 받으면
// 400으로 막으므로 폼도 여기서만 보낸다.
function ContactPhoneField({
	setValue,
	value,
}: {
	setValue: (next: string) => void;
	value: string;
}) {
	return (
		<div className="flex flex-col gap-2">
			<Label htmlFor="community-post-contact-phone">연락처 (선택)</Label>
			<Input
				autoComplete="tel"
				id="community-post-contact-phone"
				inputMode="tel"
				maxLength={CONTACT_PHONE_MAX}
				onChange={(event) => setValue(event.target.value)}
				placeholder="010-0000-0000"
				type="tel"
				value={value}
			/>
			<p className="m-0 text-muted-foreground text-xs">
				답변 안내를 받을 휴대폰 번호예요. 글을 열람할 수 있는
				본인·운영자·법률자문에게만 보입니다.
			</p>
		</div>
	);
}

function LegalContactPhoneField({
	setValue,
	value,
	visible,
}: {
	setValue: (next: string) => void;
	value: string;
	visible: boolean;
}) {
	if (!visible) {
		return null;
	}
	return <ContactPhoneField setValue={setValue} value={value} />;
}

function useNoticeWriteRedirect({
	blocked,
	boardSlug,
	router,
}: {
	blocked: boolean;
	boardSlug: string;
	router: ReturnType<typeof useRouter>;
}) {
	useEffect(() => {
		if (blocked) {
			toast("공지사항은 운영자만 작성할 수 있어요.");
			router.replace(communityBoardPath(boardSlug) as Route);
		}
	}, [blocked, boardSlug, router]);
}

function useInitialAuthorName({
	displayName,
	isEdit,
	setAuthorName,
}: {
	displayName: string;
	isEdit: boolean;
	setAuthorName: (updater: (previous: string) => string) => void;
}) {
	useEffect(() => {
		if (!isEdit && displayName) {
			setAuthorName((previous) => (previous === "" ? displayName : previous));
		}
	}, [displayName, isEdit, setAuthorName]);
}

function NoticeEventField({
	isEvent,
	onChange,
	visible,
}: {
	isEvent: boolean;
	onChange: (checked: boolean) => void;
	visible: boolean;
}) {
	if (!visible) {
		return null;
	}
	return (
		<div className="flex items-center gap-2">
			<Switch
				checked={isEvent}
				id="community-post-event"
				onCheckedChange={onChange}
			/>
			<Label htmlFor="community-post-event">이벤트로 표시하기</Label>
		</div>
	);
}

function PromotionField({
	checked,
	onChange,
	visible,
}: {
	checked: boolean;
	onChange: (checked: boolean) => void;
	visible: boolean;
}) {
	if (!visible) {
		return null;
	}
	return (
		<div className="flex items-center gap-2">
			<Switch
				checked={checked}
				id="community-post-promotion"
				onCheckedChange={onChange}
			/>
			<Label htmlFor="community-post-promotion">광고글로 표시하기</Label>
		</div>
	);
}

export function CommunityPostForm({
	board,
	editPassword,
	guest = false,
	initialPost,
}: CommunityPostFormProps) {
	const router = useRouter();
	const queryClient = useQueryClient();
	const paths = useCommunityAreaPaths();
	const isEdit = Boolean(initialPost);
	const isFreeBoard = board.key === "free";
	const isLegalBoard = isLegalBoardKey(board.key);
	const listPath = paths.boardPath(board.slug);

	const [authorName, setAuthorName] = useState(
		initialAuthorName(guest, initialPost?.authorName)
	);
	const [password, setPassword] = useState(editPassword ?? "");
	const [isLocked, setIsLocked] = useState(
		getInitialLockedState(board.key, initialPost?.isLocked)
	);
	const [isPromotion, setIsPromotion] = useState(
		initialPost?.isPromotion ?? false
	);
	const [contactPhone, setContactPhone] = useState(
		initialPost?.contactPhone ?? ""
	);
	const [isEvent, setIsEvent] = useState(initialPost?.isEvent ?? false);
	const [title, setTitle] = useState(initialPost?.title ?? "");
	const [bodyJson, setBodyJson] = useState(initialPost?.body ?? "");
	const [bodyText, setBodyText] = useState("");
	// 이미지만 있고 텍스트가 없는 글도 허용(서버 검증과 일치) — 에디터가 이미지 포함 여부를 보고한다.
	const [bodyHasImage, setBodyHasImage] = useState(false);

	// 현재 편집자가 admin인지 알아야 예약 작성인 예외를 적용할 수 있으므로 작성·수정
	// 모두 프로필을 조회한다. 광고 게이트는 수정 모드에서 글 작성자 role 스냅샷을 쓴다.
	// 비회원 모드에서는 세션·프로필 조회가 401로 끝나므로 아예 걸지 않는다.
	const session = authClient.useSession();
	const mineQuery = useQuery(
		orpc.bambi.onboarding.getMine.queryOptions({ enabled: !guest })
	);
	const role = mineQuery.data?.bambiProfile?.role;
	// 작성인 기본값은 표시명(user.name, 세션)에서 가져온다 — bambi_profile.display_name은 제거됐다.
	const displayName = session.data?.user?.name ?? "";
	// 광고 Switch 노출: 작성 모드는 편집자 role, 수정 모드는 글 작성자 role 기준.
	// employer가 비번으로 타인(job_seeker) 글을 수정할 때 서버 검증(작성자 role
	// 기준)과 어긋나 BAD_REQUEST 나던 문제를 막는다.
	const canPromote = canPromotePost(isEdit, initialPost?.authorRole, role);
	useInitialAuthorName({ displayName, isEdit, setAuthorName });

	// 공지사항은 운영자만 작성 가능 — 작성 모드에서 비운영자는 안내 후 목록으로 보낸다.
	const blockedFromNotice = Boolean(
		!(isEdit || mineQuery.isPending) && board.adminOnly && role !== "admin"
	);
	useNoticeWriteRedirect({
		blocked: blockedFromNotice,
		boardSlug: board.slug,
		router,
	});

	const invalidateAndGo = async (postId: string) => {
		await queryClient.invalidateQueries({
			queryKey: orpc.bambi.community.key(),
		});
		router.replace(paths.postPath(board.slug, postId) as Route);
	};

	const createMutation = useMutation(
		orpc.bambi.community.createPost.mutationOptions({
			onError: (error) => {
				toast(error.message || "글을 등록하지 못했어요.");
			},
			onSuccess: async (created) => {
				toast("글이 등록됐어요.");
				await invalidateAndGo(created.id);
			},
		})
	);
	const updateMutation = useMutation(
		orpc.bambi.community.updatePost.mutationOptions({
			onError: (error) => {
				toast(error.message || "글을 수정하지 못했어요.");
			},
			onSuccess: async (updated) => {
				toast("글이 수정됐어요.");
				await invalidateAndGo(updated.id);
			},
		})
	);

	// 비밀번호는 비밀글(잠금)에만 필요하다 — 작성 모드에서 잠그지 않으면 비번 없이 등록할 수 있다.
	// 비회원은 세션이 없어 비밀번호가 유일한 소유권 증명이라 작성·수정 모두 필수다.
	const requiresPassword =
		guest || isLockPasswordRequired(isEdit, isFreeBoard, isLocked);
	const submittedIsLocked = resolveSubmittedLock(board.key, guest, isLocked);
	const submittedIsEvent =
		board.key === "notice" && role === "admin" && isEvent;

	const isSubmitting = createMutation.isPending || updateMutation.isPending;
	const canSubmit =
		authorName.trim().length >= 1 &&
		title.trim().length >= MIN_TEXT &&
		(bodyText.trim().length >= MIN_TEXT || bodyHasImage) &&
		(!requiresPassword || password.length >= PASSWORD_MIN) &&
		!isSubmitting;

	const submitEdit = (postId: string) => {
		const trimmedPassword = password.trim();
		updateMutation.mutate({
			...contactPhoneInput(board.key, contactPhone),
			authorName: authorName.trim(),
			body: bodyJson,
			isLocked: submittedIsLocked,
			isEvent: submittedIsEvent,
			isPromotion,
			postId,
			title: title.trim(),
			...(trimmedPassword ? { password: trimmedPassword } : {}),
		});
	};

	// 쓸 수 없는 게시판(베스트·비활성)은 글쓰기 페이지가 애초에 열리지 않고, 서버도
	// assertBoard로 한 번 더 막는다 — 폼은 받은 게시판 key를 그대로 보낸다.
	const submitCreate = () => {
		const trimmedPassword = password.trim();
		createMutation.mutate({
			...contactPhoneInput(board.key, contactPhone),
			authorName: authorName.trim(),
			board: board.key,
			body: bodyJson,
			isLocked: submittedIsLocked,
			isEvent: submittedIsEvent,
			isPromotion,
			title: title.trim(),
			...(trimmedPassword ? { password: trimmedPassword } : {}),
		});
	};

	const handleSubmit = () => {
		if (!canSubmit) {
			return;
		}
		if (isEdit && initialPost) {
			submitEdit(initialPost.id);
			return;
		}
		submitCreate();
	};
	const handleLockChange = (value: boolean) => {
		setIsLocked(value);
		setIsEvent((current) => eventStateAfterLockChange(current, value));
	};
	const handleEventChange = (checked: boolean) => {
		setIsEvent(checked);
		setIsLocked((current) => lockStateAfterEventChange(current, checked));
		setPassword((current) => passwordAfterEventChange(current, checked));
	};

	if (blockedFromNotice) {
		return null;
	}

	return (
		<div className="flex flex-col gap-4">
			<h1 className="m-0 font-extrabold text-xl">
				{board.label} {isEdit ? "글 수정" : "글쓰기"}
			</h1>

			<div className="flex flex-col gap-2">
				<Label htmlFor="community-post-author">작성인</Label>
				<Input
					id="community-post-author"
					maxLength={AUTHOR_MAX}
					onChange={(event) => setAuthorName(event.target.value)}
					placeholder="작성인 이름"
					value={authorName}
				/>
			</div>

			<PostLockField
				allowLocking={!(isFreeBoard || guest || isLegalBoard)}
				forcedLock={isLegalBoard}
				guest={guest}
				isEdit={isEdit}
				isLocked={isLocked}
				password={password}
				setIsLocked={handleLockChange}
				setPassword={setPassword}
			/>

			<LegalContactPhoneField
				setValue={setContactPhone}
				value={contactPhone}
				visible={isLegalBoard}
			/>

			<NoticeEventField
				isEvent={isEvent}
				onChange={handleEventChange}
				visible={board.key === "notice" && role === "admin"}
			/>

			<PromotionField
				checked={isPromotion}
				onChange={setIsPromotion}
				visible={canPromote}
			/>

			<div className="flex flex-col gap-2">
				<Label htmlFor="community-post-title">제목</Label>
				<Input
					id="community-post-title"
					maxLength={TITLE_MAX}
					onChange={(event) => setTitle(event.target.value)}
					placeholder="제목을 입력해 주세요 (2자 이상)"
					value={title}
				/>
			</div>

			<div className="flex flex-col gap-2">
				<Label>본문</Label>
				{/* 이미지 업로드(createMediaUpload)는 회원 전용이라 비회원에게는 URL 삽입만 연다. */}
				<CommunityPostEditor
					allowUpload={!guest}
					onChange={(payload) => {
						setBodyJson(payload.json);
						setBodyText(payload.text);
						setBodyHasImage(payload.hasImage);
					}}
					value={bodyJson}
				/>
			</div>

			<div className="flex justify-end gap-2">
				<Button
					onClick={() => router.push(listPath as Route)}
					type="button"
					variant="outline"
				>
					취소
				</Button>
				<Button disabled={!canSubmit} onClick={handleSubmit} type="button">
					{isEdit ? "수정하기" : "등록하기"}
				</Button>
			</div>
		</div>
	);
}
