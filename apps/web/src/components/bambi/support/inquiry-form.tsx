"use client";

// 1:1 문의 작성 폼. 폭·좌우 패딩은 app/support/layout.tsx가 잡는다.
// 이 레포 관례대로 react-hook-form 없이 useState + 수동 canSubmit + sonner를 쓴다.

import { Button } from "@bambi-app/ui/components/button";
import { Input } from "@bambi-app/ui/components/input";
import { Label } from "@bambi-app/ui/components/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@bambi-app/ui/components/select";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { CommunityPostEditor } from "@/components/bambi/community-editor";
import {
	SUPPORT_CATEGORIES,
	SUPPORT_CATEGORY_LABELS,
	SUPPORT_INQUIRIES_PATH,
	type SupportCategory,
	supportInquiryPath,
} from "@/lib/bambi/support";
import { orpc } from "@/utils/orpc";

// 제목은 서버 zod 스키마(createInquiryInput)와 같은 값을 쓴다 — 어긋나면 제출 후에야 거절된다.
const TITLE_MIN = 2;
const TITLE_MAX = 100;
// 본문은 리치 에디터(Tiptap JSON)라 서버는 형식·길이만 검증한다. 이 값은 "너무 짧은
// 문의"를 막는 클라이언트 UX 게이트로, 에디터가 주는 평문(bodyText) 길이에만 건다.
const BODY_TEXT_MIN = 5;

// base-ui Select는 SelectValue가 라벨을 그리려면 items 매핑이 필요하다(값만으론 원값이 노출된다).
const CATEGORY_ITEMS = SUPPORT_CATEGORIES.map((key) => ({
	label: SUPPORT_CATEGORY_LABELS[key],
	value: key,
}));

export function InquiryForm() {
	const router = useRouter();
	const queryClient = useQueryClient();
	const [category, setCategory] = useState<SupportCategory>("account");
	const [title, setTitle] = useState("");
	// body는 제출용 Tiptap JSON 문자열. 비어있음 판정은 에디터가 같이 주는 평문(bodyText)·
	// hasImage로만 한다(빈 문서도 JSON은 40자쯤 되므로 body 길이로는 못 판단한다).
	const [body, setBody] = useState("");
	const [bodyText, setBodyText] = useState("");
	const [hasImage, setHasImage] = useState(false);
	// isPending은 리렌더 후에야 반영돼 연타 두 번이 다 통과한다. 동기 ref로 즉시 잠근다.
	const submittingRef = useRef(false);

	const createMutation = useMutation(
		orpc.bambi.support.createInquiry.mutationOptions({
			onError: (error) => {
				// 실패 시엔 재시도할 수 있게 잠금을 푼다(성공은 router.replace로 이탈하므로 유지).
				submittingRef.current = false;
				// 서버 ORPCError의 한국어 message를 그대로 노출한다(금칙어 차단 문구 포함).
				toast(error.message || "문의를 등록하지 못했어요.");
			},
			onSuccess: async (created) => {
				toast("문의가 등록됐어요.");
				await queryClient.invalidateQueries({
					queryKey: orpc.bambi.support.key(),
				});
				router.replace(supportInquiryPath(created.id));
			},
		})
	);

	// 검증은 제출 시점에 하고 사유를 토스트로 알린다(auth-panel과 같은 방식). 버튼을
	// 상시 disabled로 잠그면 제목 1자가 왜 막히는지 안 보이므로, 제출 진입을 열고 여기서 거른다.
	const handleSubmit = () => {
		if (submittingRef.current || createMutation.isPending) {
			return;
		}
		if (title.trim().length < TITLE_MIN) {
			toast(`제목은 ${TITLE_MIN}~${TITLE_MAX}자로 입력해 주세요.`);
			return;
		}
		// 이미지만 있는 문의(스크린샷)도 허용한다 — 수다방과 같은 비어있음 판정.
		if (bodyText.trim().length < BODY_TEXT_MIN && !hasImage) {
			toast(
				`문의 내용을 ${BODY_TEXT_MIN}자 이상 입력하거나 이미지를 첨부해 주세요.`
			);
			return;
		}
		submittingRef.current = true;
		createMutation.mutate({
			// body는 JSON 문자열이라 trim하면 형식이 깨진다.
			body,
			category,
			title: title.trim(),
		});
	};

	return (
		<div className="flex flex-col gap-4 py-6">
			{/* 문의 채팅 런처가 "1:1 상담"이 되면서, 글 문의 쪽은 진입 버튼과 같은 이름으로 구분한다. */}
			<h1 className="m-0 font-extrabold text-xl">문의 글 등록하기</h1>

			<div className="flex flex-col gap-2">
				<Label htmlFor="inquiry-category">문의 유형</Label>
				<Select
					items={CATEGORY_ITEMS}
					// base-ui는 선택 해제 시 null을 넘긴다 — 카테고리는 필수라 무시한다.
					onValueChange={(value) => {
						if (value) {
							setCategory(value);
						}
					}}
					value={category}
				>
					<SelectTrigger
						className="w-full text-sm data-[size=default]:h-9"
						id="inquiry-category"
					>
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						{CATEGORY_ITEMS.map((item) => (
							<SelectItem key={item.value} value={item.value}>
								{item.label}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			</div>

			<div className="flex flex-col gap-2">
				<Label htmlFor="inquiry-title">제목</Label>
				<Input
					id="inquiry-title"
					maxLength={TITLE_MAX}
					onChange={(event) => setTitle(event.target.value)}
					placeholder="문의 제목을 입력해 주세요 (2자 이상)"
					value={title}
				/>
			</div>

			<div className="flex flex-col gap-2">
				<Label>내용</Label>
				<CommunityPostEditor
					onChange={(payload) => {
						setBody(payload.json);
						setBodyText(payload.text);
						setHasImage(payload.hasImage);
					}}
					plainTextPaste
					value={body}
				/>
			</div>

			<div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
				<Button
					onClick={() => router.push(SUPPORT_INQUIRIES_PATH)}
					type="button"
					variant="outline"
				>
					취소
				</Button>
				<Button
					disabled={createMutation.isPending}
					onClick={handleSubmit}
					type="button"
				>
					문의 등록
				</Button>
			</div>
		</div>
	);
}
