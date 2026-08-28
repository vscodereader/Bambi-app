"use client";

import {
	Accordion,
	AccordionContent,
	AccordionItem,
	AccordionTrigger,
} from "@bambi-app/ui/components/accordion";
import { Button } from "@bambi-app/ui/components/button";
import { Input } from "@bambi-app/ui/components/input";
import { Label } from "@bambi-app/ui/components/label";
import { Separator } from "@bambi-app/ui/components/separator";
import { cn } from "@bambi-app/ui/lib/utils";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { EmptyState } from "@/components/bambi/empty-state";
import { orpc } from "@/utils/orpc";
import { CommentBonusCard } from "./comment-bonus-card";
import { CommentMilestoneSection } from "./comment-milestone-section";

const parsePoints = (value: string): number | null =>
	value.trim() === "" ? null : Number(value);
const fieldValid = (value: string, min = 0, nullable = false): boolean =>
	value.trim() === ""
		? nullable
		: Number.isInteger(Number(value)) && Number(value) >= min;
const settingDraft = (value: null | number): string =>
	value === null ? "" : String(value);

export default function ModeratorPointSettingsPage() {
	const client = useQueryClient();
	const query = useQuery(orpc.bambi.pointSettings.getAdmin.queryOptions());
	const [signup, setSignup] = useState("");
	const [attendance, setAttendance] = useState("");
	const [minimum, setMinimum] = useState("");
	const [maximum, setMaximum] = useState("");
	const [reviewWrite, setReviewWrite] = useState("");
	const [reviewView, setReviewView] = useState("");
	const [premiumPointReward, setPremiumPointReward] = useState("");
	const [premiumRotationHours, setPremiumRotationHours] = useState("");
	const [specialPointReward, setSpecialPointReward] = useState("");
	const [specialRotationHours, setSpecialRotationHours] = useState("");
	const [recommendedPointReward, setRecommendedPointReward] = useState("");
	const [recommendedRotationHours, setRecommendedRotationHours] = useState("");
	useEffect(() => {
		if (!query.data) {
			return;
		}
		setSignup(String(query.data.signupPoints));
		setAttendance(String(query.data.attendancePoints));
		setMinimum(
			query.data.jobPaymentMinPoints === null
				? ""
				: String(query.data.jobPaymentMinPoints)
		);
		setMaximum(
			query.data.jobPaymentMaxPoints === null
				? ""
				: String(query.data.jobPaymentMaxPoints)
		);
		setReviewWrite(String(query.data.reviewWritePoints));
		setReviewView(String(query.data.reviewViewPoints));
		setPremiumPointReward(settingDraft(query.data.premiumPointJobRewardPoints));
		setPremiumRotationHours(
			settingDraft(query.data.premiumPointJobRotationHours)
		);
		setSpecialPointReward(settingDraft(query.data.specialPointJobRewardPoints));
		setSpecialRotationHours(
			settingDraft(query.data.specialPointJobRotationHours)
		);
		setRecommendedPointReward(
			settingDraft(query.data.recommendedPointJobRewardPoints)
		);
		setRecommendedRotationHours(
			settingDraft(query.data.recommendedPointJobRotationHours)
		);
	}, [query.data]);
	const membershipMutation = useMutation(
		orpc.bambi.pointSettings.saveMembershipAdmin.mutationOptions({
			onError: (error) =>
				toast.error(error.message || "회원가입·출석 설정을 저장하지 못했어요."),
			onSuccess: async () => {
				toast.success("회원가입·출석 설정을 저장했어요.");
				await client.invalidateQueries({
					queryKey: orpc.bambi.pointSettings.key(),
				});
			},
		})
	);
	const pointJobsMutation = useMutation(
		orpc.bambi.pointSettings.savePointJobsAdmin.mutationOptions({
			onError: (error) =>
				toast.error(error.message || "공고 포인트 설정을 저장하지 못했어요."),
			onSuccess: async () => {
				toast.success("공고 포인트 설정을 저장했어요.");
				await client.invalidateQueries({
					queryKey: orpc.bambi.pointSettings.key(),
				});
				await client.invalidateQueries({
					queryKey: orpc.bambi.pointJobRewards.key(),
				});
			},
		})
	);
	const jobPaymentMutation = useMutation(
		orpc.bambi.pointSettings.saveJobPaymentAdmin.mutationOptions({
			onError: (error) =>
				toast.error(
					error.message || "공고 결제 포인트 설정을 저장하지 못했어요."
				),
			onSuccess: async () => {
				toast.success("공고 결제 포인트 설정을 저장했어요.");
				await client.invalidateQueries({
					queryKey: orpc.bambi.pointSettings.key(),
				});
			},
		})
	);
	const membershipChanged = query.data
		? signup !== String(query.data.signupPoints) ||
			attendance !== String(query.data.attendancePoints)
		: false;
	const canSaveMembership =
		fieldValid(signup) &&
		fieldValid(attendance) &&
		membershipChanged &&
		!membershipMutation.isPending;
	const pointJobsChanged = query.data
		? reviewWrite !== String(query.data.reviewWritePoints) ||
			reviewView !== String(query.data.reviewViewPoints) ||
			premiumPointReward !==
				settingDraft(query.data.premiumPointJobRewardPoints) ||
			premiumRotationHours !==
				settingDraft(query.data.premiumPointJobRotationHours) ||
			specialPointReward !==
				settingDraft(query.data.specialPointJobRewardPoints) ||
			specialRotationHours !==
				settingDraft(query.data.specialPointJobRotationHours) ||
			recommendedPointReward !==
				settingDraft(query.data.recommendedPointJobRewardPoints) ||
			recommendedRotationHours !==
				settingDraft(query.data.recommendedPointJobRotationHours)
		: false;
	const canSavePointJobs =
		fieldValid(reviewWrite) &&
		fieldValid(reviewView) &&
		fieldValid(premiumPointReward, 0, true) &&
		fieldValid(premiumRotationHours, 1) &&
		fieldValid(specialPointReward, 0, true) &&
		fieldValid(specialRotationHours, 1) &&
		fieldValid(recommendedPointReward, 0, true) &&
		fieldValid(recommendedRotationHours, 1) &&
		pointJobsChanged &&
		!pointJobsMutation.isPending;
	const parsedMinimum = parsePoints(minimum);
	const parsedMaximum = parsePoints(maximum);
	const jobPaymentRangeValid =
		parsedMinimum === null ||
		parsedMinimum === 0 ||
		parsedMaximum === null ||
		parsedMaximum >= parsedMinimum;
	const jobPaymentChanged = query.data
		? minimum !== settingDraft(query.data.jobPaymentMinPoints) ||
			maximum !== settingDraft(query.data.jobPaymentMaxPoints)
		: false;
	const canSaveJobPayment =
		fieldValid(minimum, 0, true) &&
		fieldValid(maximum, 0, true) &&
		jobPaymentRangeValid &&
		jobPaymentChanged &&
		!jobPaymentMutation.isPending;
	if (query.isError) {
		return (
			<EmptyState
				description="포인트 설정을 불러오지 못했어요."
				title="불러오기 실패"
			/>
		);
	}
	if (!query.data) {
		return <div className="p-6">불러오는 중...</div>;
	}
	return (
		<main className="mx-auto flex w-full flex-col gap-6 px-5 py-6 md:px-6">
			<div>
				<h1 className="m-0 font-extrabold text-2xl">기타 포인트 설정</h1>
				<p className="mt-1 text-muted-foreground text-sm">
					입력한 값은 저장 버튼을 눌러야 새 적립과 결제부터 반영됩니다.
				</p>
			</div>
			<Accordion className="flex flex-col gap-3" multiple>
				<AccordionItem
					className="overflow-hidden rounded-xl border border-border bg-card shadow-sm"
					value="signup-attendance"
				>
					<AccordionTrigger className="bg-card px-4 py-4 font-bold hover:bg-muted/50">
						회원가입과 출석
					</AccordionTrigger>
					<AccordionContent className="grid gap-4 px-4 pt-4 pb-4 md:grid-cols-2">
						<PointField
							hint="0이면 지급과 로그인 화면 안내를 중단합니다."
							id="signup-points"
							label="회원가입 포인트"
							onChange={setSignup}
							value={signup}
						/>
						<PointField
							id="attendance-points"
							label="출석 포인트"
							onChange={setAttendance}
							value={attendance}
						/>
						<Button
							className="ml-auto md:col-span-2"
							disabled={!canSaveMembership}
							onClick={() =>
								membershipMutation.mutate({
									attendancePoints: Number(attendance),
									signupPoints: Number(signup),
								})
							}
						>
							{membershipMutation.isPending
								? "저장 중"
								: "회원가입·출석 설정 저장"}
						</Button>
					</AccordionContent>
				</AccordionItem>
				<AccordionItem
					className="overflow-hidden rounded-xl border border-border bg-card shadow-sm"
					value="job-points"
				>
					<AccordionTrigger className="bg-card px-4 py-4 font-bold hover:bg-muted/50">
						공고 포인트
					</AccordionTrigger>
					<AccordionContent className="grid gap-4 px-4 pt-4 pb-4 md:grid-cols-2">
						<PointField
							id="review-write-points"
							label="후기 작성 포인트"
							onChange={setReviewWrite}
							value={reviewWrite}
						/>
						<PointField
							hint="다른 구직자의 후기 한 건을 열 때 사용하는 포인트입니다."
							id="review-view-points"
							label="다른 구직자 후기 열람 포인트"
							onChange={setReviewView}
							value={reviewView}
						/>
						<div className="mt-4 grid gap-4 md:col-span-2 md:grid-cols-2">
							<Separator className="md:col-span-2" />
							<PointField
								hint="0이거나 비어 있으면 프리미엄 포인트 광고를 비활성화합니다."
								id="premium-point-job-reward"
								label="프리미엄 포인트"
								nullable
								onChange={setPremiumPointReward}
								value={premiumPointReward}
							/>
							<PointField
								id="premium-point-job-rotation"
								label="프리미엄 로테이션 시간"
								min={1}
								onChange={setPremiumRotationHours}
								suffix="시간"
								value={premiumRotationHours}
							/>
						</div>
						<div className="grid gap-4 md:col-span-2 md:grid-cols-2">
							<Separator className="md:col-span-2" />
							<PointField
								hint="0이거나 비어 있으면 스페셜 포인트 광고를 비활성화합니다."
								id="special-point-job-reward"
								label="스페셜 포인트"
								nullable
								onChange={setSpecialPointReward}
								value={specialPointReward}
							/>
							<PointField
								id="special-point-job-rotation"
								label="스페셜 로테이션 시간"
								min={1}
								onChange={setSpecialRotationHours}
								suffix="시간"
								value={specialRotationHours}
							/>
						</div>
						<div className="grid gap-4 md:col-span-2 md:grid-cols-2">
							<Separator className="md:col-span-2" />
							<PointField
								hint="0이거나 비어 있으면 추천 포인트 광고를 비활성화합니다."
								id="recommended-point-job-reward"
								label="추천 포인트"
								nullable
								onChange={setRecommendedPointReward}
								value={recommendedPointReward}
							/>
							<PointField
								id="recommended-point-job-rotation"
								label="추천 로테이션 시간"
								min={1}
								onChange={setRecommendedRotationHours}
								suffix="시간"
								value={recommendedRotationHours}
							/>
						</div>
						<Button
							className="ml-auto md:col-span-2"
							disabled={!canSavePointJobs}
							onClick={() =>
								pointJobsMutation.mutate({
									reviewViewPoints: Number(reviewView),
									reviewWritePoints: Number(reviewWrite),
									premiumPointJobRewardPoints: parsePoints(premiumPointReward),
									premiumPointJobRotationHours: Number(premiumRotationHours),
									recommendedPointJobRewardPoints: parsePoints(
										recommendedPointReward
									),
									recommendedPointJobRotationHours: Number(
										recommendedRotationHours
									),
									specialPointJobRewardPoints: parsePoints(specialPointReward),
									specialPointJobRotationHours: Number(specialRotationHours),
								})
							}
						>
							{pointJobsMutation.isPending
								? "저장 중"
								: "공고 포인트 설정 저장"}
						</Button>
					</AccordionContent>
				</AccordionItem>
				<AccordionItem
					className="overflow-hidden rounded-xl border border-border bg-card shadow-sm"
					value="job-payment-points"
				>
					<AccordionTrigger className="bg-card px-4 py-4 font-bold hover:bg-muted/50">
						공고 결제 포인트 사용
					</AccordionTrigger>
					<AccordionContent className="grid gap-4 px-4 pt-4 pb-4 md:grid-cols-2">
						<PointField
							hint="비우거나 0으로 저장하면 공고 결제 포인트 사용을 중단합니다."
							id="job-min-points"
							label="공고 시 최소 사용 포인트"
							nullable
							onChange={setMinimum}
							placeholder="사용 안 함"
							value={minimum}
						/>
						<PointField
							hint="비우면 결제 예정 금액까지 사용할 수 있습니다."
							id="job-max-points"
							label="공고 시 최대 사용 포인트"
							nullable
							onChange={setMaximum}
							placeholder="결제 예정 금액까지"
							value={maximum}
						/>
						<Button
							className="ml-auto md:col-span-2"
							disabled={!canSaveJobPayment}
							onClick={() =>
								jobPaymentMutation.mutate({
									jobPaymentMaxPoints: parsedMaximum,
									jobPaymentMinPoints: parsedMinimum,
								})
							}
						>
							{jobPaymentMutation.isPending ? "저장 중" : "공고 결제 설정 저장"}
						</Button>
					</AccordionContent>
				</AccordionItem>
			</Accordion>
			<CommentBonusCard />
			<CommentMilestoneSection />
		</main>
	);
}

function PointField({
	className,
	hint,
	id,
	label,
	min = 0,
	nullable = false,
	onChange,
	placeholder,
	suffix = "P",
	value,
}: {
	className?: string;
	hint?: string;
	id: string;
	label: string;
	min?: number;
	nullable?: boolean;
	onChange: (value: string) => void;
	placeholder?: string;
	suffix?: string;
	value: string;
}) {
	const invalid = !fieldValid(value, min, nullable);
	const errorMessage =
		value.trim() === ""
			? "값을 입력해주세요"
			: `${min} 이상의 정수를 입력해주세요`;
	return (
		<div className={cn("flex flex-col gap-2", className)}>
			<Label htmlFor={id}>{label}</Label>
			<div className="flex items-center gap-2">
				<Input
					aria-invalid={invalid}
					id={id}
					inputMode="numeric"
					min={min}
					onChange={(event) => onChange(event.target.value)}
					placeholder={placeholder}
					type="number"
					value={value}
				/>
				<span className="shrink-0 whitespace-nowrap text-xs">{suffix}</span>
			</div>
			{invalid ? (
				<p className="m-0 text-destructive text-xs">{errorMessage}</p>
			) : null}
			{invalid || !hint ? null : (
				<p className="m-0 text-muted-foreground text-xs">{hint}</p>
			)}
		</div>
	);
}
