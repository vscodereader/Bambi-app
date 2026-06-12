"use client";

import { Button, buttonVariants } from "@bambi-app/ui/components/button";
import { Input } from "@bambi-app/ui/components/input";
import { Label } from "@bambi-app/ui/components/label";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { EmptyState } from "@/components/bambi/empty-state";
import { FieldError, FormError } from "@/components/bambi/form-message";
import { PageShell } from "@/components/bambi/page-shell";
import Loader from "@/components/loader";
import {
	emptyJobForm,
	type JobForm,
	type JobFormErrors,
	validateJobForm,
} from "@/lib/bambi-job-form";
import {
	industryOptions,
	payUnitOptions,
	regionOptions,
} from "@/lib/bambi-options";
import { orpc } from "@/utils/orpc";

const selectClassName =
	"h-10 w-full min-w-0 rounded-none border border-input bg-background px-2.5 py-1 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 md:h-8 md:text-xs";

const textareaClassName =
	"min-h-28 w-full min-w-0 rounded-none border border-input bg-background px-3 py-2 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50";

const getFieldErrorId = (field: keyof JobForm) => `${field}-error`;

export default function NewEmployerJobPage() {
	const router = useRouter();
	const utils = useQueryClient();
	const mineQuery = useQuery(orpc.bambi.onboarding.getMine.queryOptions());
	const [form, setForm] = useState(emptyJobForm);
	const [fieldErrors, setFieldErrors] = useState<JobFormErrors>({});
	const [formError, setFormError] = useState<null | string>(null);

	const createMutation = useMutation(
		orpc.bambi.jobs.create.mutationOptions({
			onError: (error) => {
				const message =
					"공고를 등록하지 못했습니다. 입력값과 공고 등록 권한을 확인해 주세요.";
				setFormError(message);
				toast.error(error.message || message);
			},
			onSuccess: async () => {
				toast.success("공고가 등록되었습니다.");
				await utils.invalidateQueries({
					queryKey: orpc.bambi.jobs.listMine.queryKey(),
				});
				router.push("/employer");
			},
		})
	);

	const profile = mineQuery.data?.bambiProfile ?? null;
	const organizationProfiles =
		mineQuery.data?.employerOrganizationProfiles ?? [];
	const teamProfiles = mineQuery.data?.employerTeamProfiles ?? [];
	const selectedOrganizationTeams = teamProfiles.filter(
		(teamProfile) => teamProfile.organizationId === form.organizationId
	);
	const teamScopes = teamProfiles.map((teamProfile) => ({
		organizationId: teamProfile.organizationId,
		teamId: teamProfile.teamId,
	}));
	const isEmployer = Boolean(profile && profile.role !== "job_seeker");

	useEffect(() => {
		const firstOrganizationId = organizationProfiles[0]?.organizationId;

		if (!form.organizationId && firstOrganizationId) {
			setForm((currentForm) => ({
				...currentForm,
				organizationId: firstOrganizationId,
			}));
			return;
		}

		const teamMatchesOrganization = selectedOrganizationTeams.some(
			(teamProfile) => teamProfile.teamId === form.teamId
		);

		if (form.teamId && !teamMatchesOrganization) {
			setForm((currentForm) => ({
				...currentForm,
				teamId: "",
			}));
		}
	}, [
		form.organizationId,
		form.teamId,
		organizationProfiles,
		selectedOrganizationTeams,
	]);

	const updateFormValue = (field: keyof JobForm, value: string) => {
		setForm((currentForm) => ({
			...currentForm,
			[field]: value,
		}));
		setFieldErrors((currentErrors) => ({
			...currentErrors,
			[field]: undefined,
		}));
		setFormError(null);
	};

	const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
		event.preventDefault();

		const validation = validateJobForm(form, { teamScopes });

		if (!validation.ok) {
			setFieldErrors(validation.errors);
			setFormError(validation.message);
			toast.error(validation.message);
			return;
		}

		createMutation.mutate(validation.input);
	};

	if (mineQuery.isLoading) {
		return <Loader />;
	}

	if (mineQuery.isError) {
		return (
			<PageShell
				description="공고 등록에 필요한 프로필 정보를 불러오지 못했습니다."
				title="새 공고 등록"
			>
				<EmptyState
					action={
						<Button onClick={() => mineQuery.refetch()} type="button">
							다시 시도
						</Button>
					}
					description="로그인 상태와 연결 상태를 확인한 뒤 다시 시도해 주세요."
					title="프로필 정보를 불러올 수 없습니다"
				/>
			</PageShell>
		);
	}

	if (!profile) {
		return (
			<PageShell
				description="공고를 등록하려면 밤비 프로필 설정이 필요합니다."
				title="새 공고 등록"
			>
				<EmptyState
					action={
						<Link className={buttonVariants()} href="/onboarding">
							온보딩으로 이동
						</Link>
					}
					description="구인자 프로필을 만든 뒤 공고를 등록할 수 있습니다."
					title="밤비 프로필이 없습니다"
				/>
			</PageShell>
		);
	}

	if (!isEmployer) {
		return (
			<PageShell
				description="현재 계정은 구직자 프로필로 설정되어 있습니다."
				title="새 공고 등록"
			>
				<EmptyState
					action={
						<Link
							className={buttonVariants({ variant: "outline" })}
							href="/jobs"
						>
							공고 탐색으로 이동
						</Link>
					}
					description="구직자 계정은 공개 공고를 탐색하고 지원 대화를 시작할 수 있습니다."
					title="공고 등록 권한이 없습니다"
				/>
			</PageShell>
		);
	}

	if (organizationProfiles.length === 0) {
		return (
			<PageShell
				description="공고를 등록하려면 소속 조직 프로필이 필요합니다."
				title="새 공고 등록"
			>
				<EmptyState
					action={
						<Link
							className={buttonVariants({ variant: "outline" })}
							href="/employer"
						>
							구인자 관리로 이동
						</Link>
					}
					description="조직 프로필이 연결되면 새 공고를 등록할 수 있습니다."
					title="조직 프로필이 없습니다"
				/>
			</PageShell>
		);
	}

	return (
		<PageShell
			description="조직과 팀을 선택하고 공개할 공고 정보를 입력합니다."
			title="새 공고 등록"
		>
			<form className="space-y-6 border p-4" onSubmit={handleSubmit}>
				<FormError message={formError} />
				<section aria-label="소속 정보" className="grid gap-4 md:grid-cols-2">
					<div className="space-y-2">
						<Label htmlFor="organizationId">조직</Label>
						<select
							aria-describedby={
								fieldErrors.organizationId
									? getFieldErrorId("organizationId")
									: undefined
							}
							aria-invalid={Boolean(fieldErrors.organizationId)}
							className={selectClassName}
							id="organizationId"
							name="organizationId"
							onChange={(event) =>
								updateFormValue("organizationId", event.target.value)
							}
							required
							value={form.organizationId}
						>
							{organizationProfiles.map((organizationProfile) => (
								<option
									key={organizationProfile.organizationId}
									value={organizationProfile.organizationId}
								>
									{organizationProfile.displayName}
								</option>
							))}
						</select>
						<FieldError
							id={getFieldErrorId("organizationId")}
							message={fieldErrors.organizationId}
						/>
					</div>
					<div className="space-y-2">
						<Label htmlFor="teamId">팀</Label>
						<select
							aria-describedby={
								fieldErrors.teamId ? getFieldErrorId("teamId") : undefined
							}
							aria-invalid={Boolean(fieldErrors.teamId)}
							className={selectClassName}
							id="teamId"
							name="teamId"
							onChange={(event) =>
								updateFormValue("teamId", event.target.value)
							}
							value={form.teamId}
						>
							<option value="">전체 조직</option>
							{selectedOrganizationTeams.map((teamProfile) => (
								<option key={teamProfile.teamId} value={teamProfile.teamId}>
									{teamProfile.displayName}
								</option>
							))}
						</select>
						<FieldError
							id={getFieldErrorId("teamId")}
							message={fieldErrors.teamId}
						/>
					</div>
				</section>

				<section aria-label="공고 조건" className="grid gap-4 md:grid-cols-2">
					<div className="space-y-2 md:col-span-2">
						<Label htmlFor="title">공고 제목</Label>
						<Input
							aria-describedby={
								fieldErrors.title ? getFieldErrorId("title") : undefined
							}
							aria-invalid={Boolean(fieldErrors.title)}
							id="title"
							name="title"
							onChange={(event) => updateFormValue("title", event.target.value)}
							placeholder="예: 금요일 라운지 홀 스태프 모집…"
							required
							value={form.title}
						/>
						<FieldError
							id={getFieldErrorId("title")}
							message={fieldErrors.title}
						/>
					</div>
					<div className="space-y-2">
						<Label htmlFor="industryCategory">업종</Label>
						<select
							aria-describedby={
								fieldErrors.industryCategory
									? getFieldErrorId("industryCategory")
									: undefined
							}
							aria-invalid={Boolean(fieldErrors.industryCategory)}
							className={selectClassName}
							id="industryCategory"
							name="industryCategory"
							onChange={(event) =>
								updateFormValue("industryCategory", event.target.value)
							}
							required
							value={form.industryCategory}
						>
							{industryOptions.map((option) => (
								<option key={option} value={option}>
									{option}
								</option>
							))}
						</select>
						<FieldError
							id={getFieldErrorId("industryCategory")}
							message={fieldErrors.industryCategory}
						/>
					</div>
					<div className="space-y-2">
						<Label htmlFor="region">지역</Label>
						<select
							aria-describedby={
								fieldErrors.region ? getFieldErrorId("region") : undefined
							}
							aria-invalid={Boolean(fieldErrors.region)}
							className={selectClassName}
							id="region"
							name="region"
							onChange={(event) =>
								updateFormValue("region", event.target.value)
							}
							required
							value={form.region}
						>
							{regionOptions.map((option) => (
								<option key={option} value={option}>
									{option}
								</option>
							))}
						</select>
						<FieldError
							id={getFieldErrorId("region")}
							message={fieldErrors.region}
						/>
					</div>
					<div className="space-y-2">
						<Label htmlFor="payAmount">급여 금액</Label>
						<Input
							aria-describedby={
								fieldErrors.payAmount ? getFieldErrorId("payAmount") : undefined
							}
							aria-invalid={Boolean(fieldErrors.payAmount)}
							id="payAmount"
							inputMode="numeric"
							min="1"
							name="payAmount"
							onChange={(event) =>
								updateFormValue("payAmount", event.target.value)
							}
							placeholder="예: 12000…"
							required
							type="number"
							value={form.payAmount}
						/>
						<FieldError
							id={getFieldErrorId("payAmount")}
							message={fieldErrors.payAmount}
						/>
					</div>
					<div className="space-y-2">
						<Label htmlFor="payUnit">급여 단위</Label>
						<select
							aria-describedby={
								fieldErrors.payUnit ? getFieldErrorId("payUnit") : undefined
							}
							aria-invalid={Boolean(fieldErrors.payUnit)}
							className={selectClassName}
							id="payUnit"
							name="payUnit"
							onChange={(event) =>
								updateFormValue("payUnit", event.target.value)
							}
							required
							value={form.payUnit}
						>
							{payUnitOptions.map((option) => (
								<option key={option} value={option}>
									{option}
								</option>
							))}
						</select>
						<FieldError
							id={getFieldErrorId("payUnit")}
							message={fieldErrors.payUnit}
						/>
					</div>
					<div className="space-y-2 md:col-span-2">
						<Label htmlFor="workSchedule">근무 일정</Label>
						<Input
							aria-describedby={
								fieldErrors.workSchedule
									? getFieldErrorId("workSchedule")
									: undefined
							}
							aria-invalid={Boolean(fieldErrors.workSchedule)}
							id="workSchedule"
							name="workSchedule"
							onChange={(event) =>
								updateFormValue("workSchedule", event.target.value)
							}
							placeholder="예: 금/토 20:00-02:00…"
							required
							value={form.workSchedule}
						/>
						<FieldError
							id={getFieldErrorId("workSchedule")}
							message={fieldErrors.workSchedule}
						/>
					</div>
				</section>

				<section aria-label="상세 내용" className="grid gap-4">
					<div className="space-y-2">
						<Label htmlFor="description">상세 설명</Label>
						<textarea
							aria-describedby={
								fieldErrors.description
									? getFieldErrorId("description")
									: undefined
							}
							aria-invalid={Boolean(fieldErrors.description)}
							className={textareaClassName}
							id="description"
							maxLength={2000}
							minLength={10}
							name="description"
							onChange={(event) =>
								updateFormValue("description", event.target.value)
							}
							placeholder="업무 내용, 지원 조건, 준비 사항을 입력해 주세요…"
							required
							value={form.description}
						/>
						<FieldError
							id={getFieldErrorId("description")}
							message={fieldErrors.description}
						/>
					</div>
					<div className="space-y-2">
						<Label htmlFor="interviewNotes">면접 안내</Label>
						<textarea
							aria-describedby={
								fieldErrors.interviewNotes
									? getFieldErrorId("interviewNotes")
									: undefined
							}
							aria-invalid={Boolean(fieldErrors.interviewNotes)}
							className={textareaClassName}
							id="interviewNotes"
							maxLength={500}
							name="interviewNotes"
							onChange={(event) =>
								updateFormValue("interviewNotes", event.target.value)
							}
							placeholder="면접 장소, 준비물, 연락 가능 시간을 입력해 주세요…"
							value={form.interviewNotes}
						/>
						<FieldError
							id={getFieldErrorId("interviewNotes")}
							message={fieldErrors.interviewNotes}
						/>
					</div>
				</section>

				<div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
					<Link
						className={buttonVariants({ variant: "outline" })}
						href="/employer"
					>
						취소
					</Link>
					<Button disabled={createMutation.isPending} type="submit">
						{createMutation.isPending ? "등록 중…" : "공고 등록"}
					</Button>
				</div>
			</form>
		</PageShell>
	);
}
