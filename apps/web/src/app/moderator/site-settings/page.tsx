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
		</div>
	);
}
