"use client";

import { Button, buttonVariants } from "@bambi-app/ui/components/button";
import { Input } from "@bambi-app/ui/components/input";
import { Label } from "@bambi-app/ui/components/label";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { use, useEffect, useState } from "react";
import { toast } from "sonner";

import { EmptyState } from "@/components/bambi/empty-state";
import { FieldError, FormError } from "@/components/bambi/form-message";
import { PageShell } from "@/components/bambi/page-shell";
import Loader from "@/components/loader";
import { authClient } from "@/lib/auth-client";
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

const readOnlyValueClassName =
	"min-h-10 break-words border bg-muted/30 px-3 py-2 text-muted-foreground text-sm md:min-h-8 md:text-xs";

const getErrorCode = (error: Error | null): string | undefined =>
	error && "code" in error && typeof error.code === "string"
		? error.code
		: undefined;

const getFieldErrorId = (field: keyof JobForm) => `${field}-error`;

export default function EditEmployerJobPage({
	params,
}: {
	params: Promise<{ id: string }>;
}) {
	const { id } = use(params);
	const router = useRouter();
	const utils = useQueryClient();
	const session = authClient.useSession();
	const isSignedIn = Boolean(session.data?.user);
	const [form, setForm] = useState(emptyJobForm);
	const [fieldErrors, setFieldErrors] = useState<JobFormErrors>({});
	const [formError, setFormError] = useState<null | string>(null);
	const jobQuery = useQuery({
		...orpc.bambi.jobs.getEditableById.queryOptions({ input: { id } }),
		enabled: isSignedIn,
	});
	const updateMutation = useMutation(
		orpc.bambi.jobs.update.mutationOptions({
			onError: (error) => {
				const message =
					"공고를 수정하지 못했습니다. 입력값과 공고 수정 권한을 확인해 주세요.";
				setFormError(message);
				toast.error(error.message || message);
			},
			onSuccess: async () => {
				toast.success("공고가 수정되었습니다.");
				await utils.invalidateQueries({
					queryKey: orpc.bambi.jobs.listMine.queryKey(),
				});
				await utils.invalidateQueries({
					queryKey: orpc.bambi.jobs.getEditableById.queryKey({ input: { id } }),
				});
				router.push("/employer");
			},
		})
	);
	const job = jobQuery.data;

	useEffect(() => {
		if (!job) {
			return;
		}

		setForm({
			description: job.description,
			industryCategory: job.industryCategory,
			interviewNotes: job.interviewNotes ?? "",
			organizationId: job.organizationId,
			payAmount: String(job.payAmount),
			payUnit: job.payUnit,
			region: job.region,
			teamId: job.teamId ?? "",
			title: job.title,
			workSchedule: job.workSchedule,
		});
	}, [job]);

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

		const validation = validateJobForm(form, {
			teamScopes: form.teamId
				? [{ organizationId: form.organizationId, teamId: form.teamId }]
				: [],
		});

		if (!validation.ok) {
			setFieldErrors(validation.errors);
			setFormError(validation.message);
			toast.error(validation.message);
			return;
		}

		updateMutation.mutate({
			data: validation.input,
			id,
		});
	};

	if (session.isPending || jobQuery.isLoading) {
		return <Loader />;
	}

	if (!isSignedIn || getErrorCode(jobQuery.error) === "UNAUTHORIZED") {
		return (
			<PageShell
				description="공고 수정은 로그인 후 이용할 수 있습니다."
				title="공고 수정"
			>
				<EmptyState
					action={
						<Link className={buttonVariants()} href="/login">
							로그인
						</Link>
					}
					description="공고를 등록한 구인자 계정으로 로그인해 주세요."
					title="로그인이 필요합니다"
				/>
			</PageShell>
		);
	}

	if (jobQuery.isError && getErrorCode(jobQuery.error) === "NOT_FOUND") {
		return (
			<PageShell
				description="삭제되었거나 수정 권한이 없는 공고입니다."
				title="공고 수정"
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
					description="관리 가능한 공고만 수정할 수 있습니다."
					title="공고를 찾을 수 없습니다"
				/>
			</PageShell>
		);
	}

	if (jobQuery.isError) {
		return (
			<PageShell
				description="공고 수정 정보를 불러오지 못했습니다."
				title="공고 수정"
			>
				<EmptyState
					action={
						<Button onClick={() => jobQuery.refetch()} type="button">
							다시 시도
						</Button>
					}
					description="로그인 상태와 연결 상태를 확인한 뒤 다시 시도해 주세요."
					title="공고 정보를 불러올 수 없습니다"
				/>
			</PageShell>
		);
	}

	if (!job) {
		return (
			<PageShell
				description="삭제되었거나 수정 권한이 없는 공고입니다."
				title="공고 수정"
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
					description="관리 가능한 공고만 수정할 수 있습니다."
					title="공고를 찾을 수 없습니다"
				/>
			</PageShell>
		);
	}

	return (
		<PageShell
			description="소속 조직과 팀은 유지한 채 공개 공고 내용을 수정합니다."
			title="공고 수정"
		>
			<form className="space-y-6 border p-4" onSubmit={handleSubmit}>
				<FormError message={formError} />
				<section aria-label="소속 정보" className="grid gap-4 md:grid-cols-2">
					<div className="space-y-2">
						<span className="font-medium text-sm">조직 ID</span>
						<p className={readOnlyValueClassName}>{form.organizationId}</p>
					</div>
					<div className="space-y-2">
						<span className="font-medium text-sm">팀 ID</span>
						<p className={readOnlyValueClassName}>
							{form.teamId || "전체 조직"}
						</p>
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
					<Button disabled={updateMutation.isPending} type="submit">
						{updateMutation.isPending ? "수정 중…" : "공고 수정"}
					</Button>
				</div>
			</form>
		</PageShell>
	);
}
