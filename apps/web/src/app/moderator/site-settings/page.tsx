"use client";

import { Button } from "@bambi-app/ui/components/button";
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "@bambi-app/ui/components/card";
import { Input } from "@bambi-app/ui/components/input";
import { Label } from "@bambi-app/ui/components/label";
import { Textarea } from "@bambi-app/ui/components/textarea";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useEffect, useState } from "react";
import { toast } from "sonner";
import { BAMBI_COMPANY } from "@/lib/bambi/company";
import { orpc } from "@/utils/orpc";

interface FooterForm {
	address: string;
	bizRegNo: string;
	ceo: string;
	email: string;
	footerIntro: string;
	operator: string;
}

const EMPTY_FORM: FooterForm = {
	address: "",
	bizRegNo: "",
	ceo: "",
	email: "",
	footerIntro: "",
	operator: "",
};

// 편집용 행에는 안정적인 key를 위해 클라이언트 전용 id를 붙인다(서버 저장 시 제거).
interface AccountRow {
	accountNumber: string;
	bank: string;
	holder: string;
	id: string;
}

const newAccountRow = (
	account?: Pick<AccountRow, "accountNumber" | "bank" | "holder">
): AccountRow => ({
	accountNumber: account?.accountNumber ?? "",
	bank: account?.bank ?? "",
	holder: account?.holder ?? "",
	id: globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`,
});

export default function ModeratorSiteSettingsPage() {
	const queryClient = useQueryClient();
	const settingsQuery = useQuery(
		orpc.bambi.siteSettings.getFooter.queryOptions()
	);
	const [form, setForm] = useState<FooterForm>(EMPTY_FORM);

	// 저장된 값이 오면 폼에 채운다(미설정 필드는 빈 값 → 폴백 placeholder 노출).
	useEffect(() => {
		const data = settingsQuery.data;
		if (!data) {
			return;
		}
		setForm({
			address: data.address ?? "",
			bizRegNo: data.bizRegNo ?? "",
			ceo: data.ceo ?? "",
			email: data.email ?? "",
			footerIntro: data.footerIntro ?? "",
			operator: data.operator ?? "",
		});
	}, [settingsQuery.data]);

	const saveMutation = useMutation(
		orpc.bambi.siteSettings.updateFooter.mutationOptions({
			onError: (error) => toast.error(error.message || "저장하지 못했어요."),
			onSuccess: async () => {
				toast.success("사이트 정보를 저장했어요.");
				await queryClient.invalidateQueries({
					queryKey: orpc.bambi.siteSettings.getFooter.queryKey(),
				});
			},
		})
	);

	const update =
		(key: keyof FooterForm) => (event: { target: { value: string } }) =>
			setForm((prev) => ({ ...prev, [key]: event.target.value }));

	const onSubmit = (event: FormEvent) => {
		event.preventDefault();
		saveMutation.mutate(form);
	};

	const accountsQuery = useQuery(
		orpc.bambi.siteSettings.getPaymentAccounts.queryOptions()
	);
	const [accounts, setAccounts] = useState<AccountRow[]>([]);

	// 저장된 계좌가 오면 편집 행으로 채운다.
	useEffect(() => {
		const data = accountsQuery.data;
		if (!data) {
			return;
		}
		setAccounts(data.map((account) => newAccountRow(account)));
	}, [accountsQuery.data]);

	const saveAccountsMutation = useMutation(
		orpc.bambi.siteSettings.updatePaymentAccounts.mutationOptions({
			onError: (error) => toast.error(error.message || "저장하지 못했어요."),
			onSuccess: async () => {
				toast.success("무통장입금 계좌를 저장했어요.");
				await queryClient.invalidateQueries({
					queryKey: orpc.bambi.siteSettings.getPaymentAccounts.queryKey(),
				});
			},
		})
	);

	const updateAccount =
		(id: string, key: "accountNumber" | "bank" | "holder") =>
		(event: { target: { value: string } }) =>
			setAccounts((prev) =>
				prev.map((account) =>
					account.id === id
						? { ...account, [key]: event.target.value }
						: account
				)
			);

	const addAccount = () => setAccounts((prev) => [...prev, newAccountRow()]);

	const removeAccount = (id: string) =>
		setAccounts((prev) => prev.filter((account) => account.id !== id));

	const onSubmitAccounts = (event: FormEvent) => {
		event.preventDefault();
		// 전부 빈 행(실수로 추가만 한 행)은 제외하고 보낸다. 부분 입력은 서버 검증이 잡는다.
		const bankAccounts = accounts
			.filter(
				(account) =>
					account.bank.trim() ||
					account.accountNumber.trim() ||
					account.holder.trim()
			)
			.map((account) => ({
				accountNumber: account.accountNumber.trim(),
				bank: account.bank.trim(),
				holder: account.holder.trim(),
			}));
		saveAccountsMutation.mutate({ bankAccounts });
	};

	const memberPolicyQuery = useQuery(
		orpc.bambi.siteSettings.getMemberPolicy.queryOptions()
	);
	const [retentionDays, setRetentionDays] = useState("");

	// 저장된 값이 오면 폼에 채운다(미설정이면 빈 값 → 기본값 placeholder 노출).
	useEffect(() => {
		const data = memberPolicyQuery.data;
		if (!data) {
			return;
		}
		setRetentionDays(data.days === null ? "" : String(data.days));
	}, [memberPolicyQuery.data]);

	const saveMemberPolicyMutation = useMutation(
		orpc.bambi.siteSettings.updateMemberPolicy.mutationOptions({
			onError: (error) => toast.error(error.message || "저장하지 못했어요."),
			onSuccess: async () => {
				toast.success("회원 정책을 저장했어요.");
				await queryClient.invalidateQueries({
					queryKey: orpc.bambi.siteSettings.getMemberPolicy.queryKey(),
				});
			},
		})
	);

	const onSubmitMemberPolicy = (event: FormEvent) => {
		event.preventDefault();
		const trimmed = retentionDays.trim();
		const parsed = trimmed === "" ? null : Number(trimmed);
		if (parsed !== null && !Number.isInteger(parsed)) {
			toast.error("보존기간은 일 단위 정수로 입력해 주세요.");
			return;
		}
		saveMemberPolicyMutation.mutate({ withdrawalRetentionDays: parsed });
	};

	const adRotationQuery = useQuery(
		orpc.bambi.siteSettings.getAdRotation.queryOptions()
	);
	const [rotationMinutes, setRotationMinutes] = useState("");

	// 저장된 값이 오면 폼에 채운다(미설정이면 빈 값 → 기본값 placeholder 노출).
	useEffect(() => {
		const data = adRotationQuery.data;
		if (!data) {
			return;
		}
		setRotationMinutes(data.minutes === null ? "" : String(data.minutes));
	}, [adRotationQuery.data]);

	const saveAdRotationMutation = useMutation(
		orpc.bambi.siteSettings.updateAdRotation.mutationOptions({
			onError: (error) => toast.error(error.message || "저장하지 못했어요."),
			onSuccess: async () => {
				toast.success("광고 배너 로테이션 주기를 저장했어요.");
				await queryClient.invalidateQueries({
					queryKey: orpc.bambi.siteSettings.getAdRotation.queryKey(),
				});
			},
		})
	);

	const onSubmitAdRotation = (event: FormEvent) => {
		event.preventDefault();
		const trimmed = rotationMinutes.trim();
		const parsed = trimmed === "" ? null : Number(trimmed);
		if (parsed !== null && !Number.isInteger(parsed)) {
			toast.error("로테이션 주기는 분 단위 정수로 입력해 주세요.");
			return;
		}
		saveAdRotationMutation.mutate({ minutes: parsed });
	};

	return (
		<div className="mx-auto flex w-full flex-col gap-4 px-5 py-6 md:px-6">
			<div className="flex flex-col gap-1">
				<h1 className="m-0 font-extrabold text-2xl">사이트 정보</h1>
				<p className="m-0 text-muted-foreground text-sm">
					푸터에 노출되는 사업자 정보입니다. 비워두면 기본값이 표시됩니다.
				</p>
			</div>

			<Card>
				<CardHeader>
					<CardTitle>푸터 사업자 정보</CardTitle>
				</CardHeader>
				<CardContent>
					<form className="flex flex-col gap-5" onSubmit={onSubmit}>
						<div className="flex flex-col gap-2">
							<Label htmlFor="footerIntro">서비스 소개 문구</Label>
							<Textarea
								id="footerIntro"
								onChange={update("footerIntro")}
								placeholder={BAMBI_COMPANY.footerIntro}
								value={form.footerIntro}
							/>
						</div>
						<div className="grid grid-cols-1 gap-5 md:grid-cols-2">
							<div className="flex flex-col gap-2">
								<Label htmlFor="operator">상호(운영 주체)</Label>
								<Input
									id="operator"
									onChange={update("operator")}
									placeholder={BAMBI_COMPANY.operator}
									value={form.operator}
								/>
							</div>
							<div className="flex flex-col gap-2">
								<Label htmlFor="ceo">대표자</Label>
								<Input
									id="ceo"
									onChange={update("ceo")}
									placeholder={BAMBI_COMPANY.ceo}
									value={form.ceo}
								/>
							</div>
							<div className="flex flex-col gap-2">
								<Label htmlFor="bizRegNo">사업자등록번호</Label>
								<Input
									id="bizRegNo"
									onChange={update("bizRegNo")}
									placeholder={BAMBI_COMPANY.bizRegNo}
									value={form.bizRegNo}
								/>
							</div>
							<div className="flex flex-col gap-2">
								<Label htmlFor="email">고객문의 이메일</Label>
								<Input
									id="email"
									onChange={update("email")}
									placeholder={BAMBI_COMPANY.email}
									type="email"
									value={form.email}
								/>
							</div>
							<div className="flex flex-col gap-2 md:col-span-2">
								<Label htmlFor="address">사업장 주소</Label>
								<Input
									id="address"
									onChange={update("address")}
									placeholder={BAMBI_COMPANY.address}
									value={form.address}
								/>
							</div>
						</div>
						<div className="flex justify-end">
							<Button
								disabled={saveMutation.isPending || settingsQuery.isLoading}
								type="submit"
							>
								{saveMutation.isPending ? "저장 중…" : "저장"}
							</Button>
						</div>
					</form>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>무통장입금 계좌</CardTitle>
				</CardHeader>
				<CardContent>
					<form className="flex flex-col gap-5" onSubmit={onSubmitAccounts}>
						<p className="m-0 text-muted-foreground text-sm">
							공고 결제 안내에 노출됩니다. 등록된 계좌가 없으면 안내 화면은
							고객센터 문의 문구로 대체됩니다.
						</p>
						{accounts.length === 0 ? (
							<p className="m-0 text-muted-foreground text-sm">
								등록된 계좌가 없습니다. 아래에서 계좌를 추가해 주세요.
							</p>
						) : (
							<div className="flex flex-col gap-4">
								{accounts.map((account, index) => (
									<div
										className="grid grid-cols-1 gap-3 rounded-lg border p-4 md:grid-cols-[1fr_1fr_1fr_auto]"
										key={account.id}
									>
										<div className="flex flex-col gap-2">
											<Label htmlFor={`bank-${account.id}`}>은행명</Label>
											<Input
												id={`bank-${account.id}`}
												onChange={updateAccount(account.id, "bank")}
												placeholder="예: 국민은행"
												value={account.bank}
											/>
										</div>
										<div className="flex flex-col gap-2">
											<Label htmlFor={`accountNumber-${account.id}`}>
												계좌번호
											</Label>
											<Input
												id={`accountNumber-${account.id}`}
												onChange={updateAccount(account.id, "accountNumber")}
												placeholder="예: 123456-01-234567"
												value={account.accountNumber}
											/>
										</div>
										<div className="flex flex-col gap-2">
											<Label htmlFor={`holder-${account.id}`}>예금주</Label>
											<Input
												id={`holder-${account.id}`}
												onChange={updateAccount(account.id, "holder")}
												placeholder="예: 밤비"
												value={account.holder}
											/>
										</div>
										<div className="flex items-end">
											<Button
												aria-label={`계좌 ${index + 1} 삭제`}
												onClick={() => removeAccount(account.id)}
												type="button"
												variant="outline"
											>
												삭제
											</Button>
										</div>
									</div>
								))}
							</div>
						)}
						<div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
							<Button onClick={addAccount} type="button" variant="outline">
								계좌 추가
							</Button>
							<Button
								disabled={
									saveAccountsMutation.isPending || accountsQuery.isLoading
								}
								type="submit"
							>
								{saveAccountsMutation.isPending ? "저장 중…" : "계좌 저장"}
							</Button>
						</div>
					</form>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>회원 정책</CardTitle>
				</CardHeader>
				<CardContent>
					<form className="flex flex-col gap-5" onSubmit={onSubmitMemberPolicy}>
						<div className="flex flex-col gap-2 md:max-w-xs">
							<Label htmlFor="withdrawalRetentionDays">
								탈퇴 개인정보 보존기간(일)
							</Label>
							<Input
								id="withdrawalRetentionDays"
								inputMode="numeric"
								onChange={(event) => setRetentionDays(event.target.value)}
								placeholder={String(memberPolicyQuery.data?.defaultDays ?? 30)}
								value={retentionDays}
							/>
							<p className="m-0 text-muted-foreground text-xs">
								탈퇴 후 이 기간이 지나면 파기 배치가 개인정보를 삭제해요.
								비워두면 기본값을 사용하고, 탈퇴 안내 문구에도 그대로 표시돼요.
							</p>
						</div>
						<div className="flex justify-end">
							<Button
								disabled={
									saveMemberPolicyMutation.isPending ||
									memberPolicyQuery.isLoading
								}
								type="submit"
							>
								{saveMemberPolicyMutation.isPending ? "저장 중…" : "저장"}
							</Button>
						</div>
					</form>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>광고 배너 로테이션</CardTitle>
				</CardHeader>
				<CardContent>
					<form className="flex flex-col gap-5" onSubmit={onSubmitAdRotation}>
						<div className="flex flex-col gap-2 md:max-w-xs">
							<Label htmlFor="adBannerRotationMinutes">로테이션 주기(분)</Label>
							<Input
								id="adBannerRotationMinutes"
								inputMode="numeric"
								onChange={(event) => setRotationMinutes(event.target.value)}
								placeholder={String(adRotationQuery.data?.defaultMinutes ?? 60)}
								value={rotationMinutes}
							/>
							<p className="m-0 text-muted-foreground text-xs">
								프리미엄 광고 배너는 한 광고가 한 칸씩 차지해 최대 8칸까지 동시
								노출되며, 이 주기마다 각 광고가 좌→상단→우 순서로 한 칸씩
								전진(밀어내기)합니다. 비워두면 기본값(60분)을 사용합니다. 주기를
								바꾸면 이동 위치가 한 번 점프할 수 있어요.
							</p>
						</div>
						<div className="flex justify-end">
							<Button
								disabled={
									saveAdRotationMutation.isPending || adRotationQuery.isLoading
								}
								type="submit"
							>
								{saveAdRotationMutation.isPending ? "저장 중…" : "저장"}
							</Button>
						</div>
					</form>
				</CardContent>
			</Card>
		</div>
	);
}
