"use client";

import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@bambi-app/ui/components/alert-dialog";
import { Checkbox } from "@bambi-app/ui/components/checkbox";
import { Label } from "@bambi-app/ui/components/label";
import { useId, useMemo, useState } from "react";
import { Button } from "./ds";
import { StarIcon } from "./icons";

const REVIEW_BODY_MIN_LENGTH = 20;
const REVIEW_BODY_MAX_LENGTH = 1000;
const REVIEW_RATINGS = [1, 2, 3, 4, 5] as const;

interface ReviewFormInput {
	body: string;
	isAnonymous: boolean;
	rating: number;
}

interface ReviewFormProps {
	errorMessage?: null | string;
	isSubmitting: boolean;
	onSubmit: (input: ReviewFormInput) => void;
}

const getBodyError = (body: string): null | string => {
	const length = body.trim().length;

	if (length < REVIEW_BODY_MIN_LENGTH) {
		return `후기는 ${REVIEW_BODY_MIN_LENGTH}자 이상 작성해 주세요.`;
	}

	if (length > REVIEW_BODY_MAX_LENGTH) {
		return `후기는 ${REVIEW_BODY_MAX_LENGTH}자 이하로 작성해 주세요.`;
	}

	return null;
};

export function ReviewForm({
	errorMessage,
	isSubmitting,
	onSubmit,
}: ReviewFormProps) {
	const [body, setBody] = useState("");
	const [rating, setRating] = useState(0);
	const [isAnonymous, setIsAnonymous] = useState(false);
	const [showValidation, setShowValidation] = useState(false);
	const [pendingInput, setPendingInput] = useState<ReviewFormInput | null>(
		null
	);
	const anonymousCheckboxId = useId();
	const bodyError = useMemo(() => getBodyError(body), [body]);
	const ratingError = rating === 0 ? "별점을 선택해 주세요." : null;
	const bodyLength = body.trim().length;
	const canSubmit = !(bodyError || ratingError || isSubmitting);

	const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		setShowValidation(true);

		if (!canSubmit) {
			return;
		}

		setPendingInput({
			body: body.trim(),
			isAnonymous,
			rating,
		});
	};

	return (
		<>
			<form className="grid gap-4" onSubmit={handleSubmit}>
				<div>
					<fieldset>
						<legend className="font-bold text-muted-foreground text-xs">
							별점
						</legend>
						<div className="mt-2 flex gap-1">
							{REVIEW_RATINGS.map((score) => {
								const selected = score <= rating;

								return (
									<button
										aria-label={`${score}점`}
										aria-pressed={score === rating}
										className={
											selected
												? "inline-flex size-9 cursor-pointer items-center justify-center rounded-lg border border-coral-200 bg-coral-50 text-coral-500"
												: "inline-flex size-9 cursor-pointer items-center justify-center rounded-lg border border-border bg-background text-muted-foreground hover:text-coral-500"
										}
										key={score}
										onClick={() => setRating(score)}
										title={`${score}점`}
										type="button"
									>
										<span className="inline-flex size-4">
											<StarIcon className={selected ? "fill-coral-500" : ""} />
										</span>
									</button>
								);
							})}
						</div>
					</fieldset>
					{showValidation && ratingError ? (
						<p className="mt-2 mb-0 font-semibold text-red-600 text-xs">
							{ratingError}
						</p>
					) : null}
				</div>
				<div className="grid gap-2">
					<div className="flex items-center justify-between gap-3">
						<label
							className="font-bold text-muted-foreground text-xs"
							htmlFor="review-body"
						>
							후기
						</label>
						<span className="text-muted-foreground text-xs">
							{bodyLength}/{REVIEW_BODY_MAX_LENGTH}
						</span>
					</div>
					<textarea
						aria-describedby="review-body-help"
						aria-invalid={showValidation && Boolean(bodyError)}
						className="min-h-32 resize-y rounded-lg border border-border bg-background px-3 py-3 text-sm leading-relaxed outline-none focus-visible:ring-2 focus-visible:ring-coral-100"
						id="review-body"
						maxLength={REVIEW_BODY_MAX_LENGTH}
						onChange={(event) => setBody(event.target.value)}
						placeholder="면접 안내, 공고와 실제 조건 일치 여부, 응대 경험을 남겨주세요."
						value={body}
					/>
					<p
						className="m-0 text-muted-foreground text-xs"
						id="review-body-help"
					>
						후기는 {REVIEW_BODY_MIN_LENGTH}자 이상 작성해 주세요. 개인 연락처나
						외부 메신저 아이디는 공개되지 않을 수 있어요.
					</p>
					{showValidation && bodyError ? (
						<p className="m-0 font-semibold text-red-600 text-xs">
							{bodyError}
						</p>
					) : null}
				</div>
				<div className="flex items-start gap-2">
					<Checkbox
						checked={isAnonymous}
						className="mt-0.5"
						id={anonymousCheckboxId}
						onCheckedChange={(checked) => setIsAnonymous(checked === true)}
					/>
					<div className="grid gap-1">
						<Label
							className="font-bold text-foreground text-sm"
							htmlFor={anonymousCheckboxId}
						>
							익명으로 표시
						</Label>
						<p className="m-0 text-muted-foreground text-xs leading-relaxed">
							선택하지 않으면 이름이 마스킹되어 표시돼요(예: 김*지).
						</p>
					</div>
				</div>
				{errorMessage ? (
					<p className="m-0 font-semibold text-red-600 text-xs" role="alert">
						{errorMessage}
					</p>
				) : null}
				<Button block disabled={!canSubmit} size="md" type="submit">
					{isSubmitting ? "등록 중" : "후기 등록"}
				</Button>
			</form>
			<AlertDialog
				onOpenChange={(open) => {
					if (!open) {
						setPendingInput(null);
					}
				}}
				open={pendingInput !== null}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>후기를 등록할까요?</AlertDialogTitle>
						<AlertDialogDescription>
							한 번 등록한 후기는 삭제하거나 다시 작성할 수 없습니다. 내용을
							꼼꼼히 확인해 주세요.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>취소</AlertDialogCancel>
						<AlertDialogAction
							onClick={() => {
								if (pendingInput) {
									onSubmit(pendingInput);
								}
								setPendingInput(null);
							}}
						>
							확인
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</>
	);
}
