"use client";

import {
	BAMBI_COMPANY,
	BAMBI_PROCESSORS,
} from "@bambi-app/api/services/bambi-company";
import { DEFAULT_MINIMUM_WAGE } from "@bambi-app/api/services/bambi-policy";
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
import { Switch } from "@bambi-app/ui/components/switch";
import { Textarea } from "@bambi-app/ui/components/textarea";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useEffect, useState } from "react";
import { toast } from "sonner";
import { formatDateTime } from "@/lib/bambi-format";
import { orpc } from "@/utils/orpc";

interface FooterForm {
	address: string;
	adInquiryTel: string;
	bizRegNo: string;
	ceo: string;
	email: string;
	footerIntro: string;
	operator: string;
	tel: string;
}

const EMPTY_FORM: FooterForm = {
	address: "",
	adInquiryTel: "",
	bizRegNo: "",
	ceo: "",
	email: "",
	footerIntro: "",
	operator: "",
	tel: "",
};

// 개인정보 처리방침에 노출되는 위탁사명·관리부서 연락처. 키는 서버 입력 스키마와 동일하게 둔다.
interface PrivacyForm {
	privacyContactEmail: string;
	privacyContactPhone: string;
	privacyOfficerName: string;
	privacyPaymentProcessor: string;
}

const EMPTY_PRIVACY_FORM: PrivacyForm = {
	privacyContactEmail: "",
	privacyContactPhone: "",
	privacyOfficerName: "",
	privacyPaymentProcessor: "",
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

// 슬롯 입력은 1 이상의 정수만 통과시키고 그 외에는 null(=검증 실패)로 돌려준다.
// 최종 범위 검증은 서버 스키마가 맡고, 여기선 즉시 피드백용 최소 검증만 한다.
const parsePositiveSlotCount = (raw: string): number | null => {
	const parsed = Number(raw.trim());
	return Number.isInteger(parsed) && parsed >= 1 ? parsed : null;
};

// 노출 섹션 관리 카드. 급구 숨김 토글과 스페셜/추천 슬롯 수를 다룬다. 자체 쿼리·상태만
// 쓰고 부모 폼들과 얽히지 않아 별도 컴포넌트로 분리했다(부모 페이지 복잡도도 낮춘다).
function ExposureSectionCard() {
	const queryClient = useQueryClient();
	const exposureSectionQuery = useQuery(
		orpc.bambi.siteSettings.getExposureSectionConfig.queryOptions()
	);
	const [urgentHidden, setUrgentHidden] = useState(true);
	const [specialSlots, setSpecialSlots] = useState("");
	const [recommendedSlots, setRecommendedSlots] = useState("");

	// 저장된 값이 오면 폼에 채운다. 급구 숨김은 not null(기본 true)이라 그대로 반영하고,
	// 슬롯 수는 서버가 이미 코드 기본값(12/20)으로 폴백해 내려주므로 그 값을 표시한다.
	useEffect(() => {
		const data = exposureSectionQuery.data;
		if (!data) {
			return;
		}
		setUrgentHidden(data.urgentHidden);
		setSpecialSlots(String(data.specialSlots));
		setRecommendedSlots(String(data.recommendedSlots));
	}, [exposureSectionQuery.data]);

	const saveExposureSectionMutation = useMutation(
		orpc.bambi.siteSettings.updateExposureSectionConfig.mutationOptions({
			onError: (error) => toast.error(error.message || "저장하지 못했어요."),
			onSuccess: async () => {
				toast.success("노출 섹션 설정을 저장했어요.");
				await queryClient.invalidateQueries({
					queryKey: orpc.bambi.siteSettings.getExposureSectionConfig.queryKey(),
				});
			},
		})
	);

	const onSubmit = (event: FormEvent) => {
		event.preventDefault();
		const parsedSpecial = parsePositiveSlotCount(specialSlots);
		const parsedRecommended = parsePositiveSlotCount(recommendedSlots);
		if (parsedSpecial === null || parsedRecommended === null) {
			toast.error("스페셜·추천 슬롯 수는 1 이상의 정수로 입력해 주세요.");
			return;
		}
		saveExposureSectionMutation.mutate({
			recommendedSlots: parsedRecommended,
			specialSlots: parsedSpecial,
			urgentHidden,
		});
	};

	return (
		<AccordionItem value="exposure-section">
			<AccordionTrigger>노출 섹션 관리</AccordionTrigger>
			<AccordionContent>
				<form className="flex flex-col gap-5" onSubmit={onSubmit}>
					<div className="flex items-start justify-between gap-4">
						<div className="flex flex-col gap-1">
							<Label htmlFor="urgentSectionHidden">급구 섹션 숨김</Label>
							<p className="m-0 text-muted-foreground text-xs">
								켜두면 메인의 급구 채용 섹션이 노출되지 않습니다. 배포 없이 바로
								켜고 끌 수 있어요.
							</p>
						</div>
						<Switch
							checked={urgentHidden}
							disabled={exposureSectionQuery.isLoading}
							id="urgentSectionHidden"
							onCheckedChange={setUrgentHidden}
						/>
					</div>
					<div className="grid grid-cols-1 gap-5 md:max-w-md md:grid-cols-2">
						<div className="flex flex-col gap-2">
							<Label htmlFor="specialSlots">스페셜 슬롯 수</Label>
							<Input
								id="specialSlots"
								inputMode="numeric"
								onChange={(event) => setSpecialSlots(event.target.value)}
								placeholder="12"
								value={specialSlots}
							/>
						</div>
						<div className="flex flex-col gap-2">
							<Label htmlFor="recommendedSlots">추천 슬롯 수</Label>
							<Input
								id="recommendedSlots"
								inputMode="numeric"
								onChange={(event) => setRecommendedSlots(event.target.value)}
								placeholder="20"
								value={recommendedSlots}
							/>
						</div>
					</div>
					<p className="m-0 text-muted-foreground text-xs">
						스페셜/추천 리스팅 광고는 이 슬롯 수만큼 고정 인벤토리로 노출되며,
						빈 자리는 "광고 모집중"으로 채워집니다. 슬롯이 차면 신규 승인은
						대기열로 들어가요.
					</p>
					<div className="flex justify-end">
						<Button
							disabled={
								saveExposureSectionMutation.isPending ||
								exposureSectionQuery.isLoading
							}
							type="submit"
						>
							{saveExposureSectionMutation.isPending ? "저장 중…" : "저장"}
						</Button>
					</div>
				</form>
			</AccordionContent>
		</AccordionItem>
	);
}

// 문의 채팅 공지 카드. 위젯 홈 탭에 노출할 공지 문구 하나만 다뤄 자체 쿼리·상태만 쓴다.
function SupportChatCard() {
	const queryClient = useQueryClient();
	const supportChatQuery = useQuery(
		orpc.bambi.siteSettings.getSupportChat.queryOptions()
	);
	const [notice, setNotice] = useState("");

	// 저장된 값이 오면 폼에 채운다(미설정이면 빈 값 → 배너 미표시).
	useEffect(() => {
		const data = supportChatQuery.data;
		if (!data) {
			return;
		}
		setNotice(data.supportChatNotice ?? "");
	}, [supportChatQuery.data]);

	const saveMutation = useMutation(
		orpc.bambi.siteSettings.updateSupportChat.mutationOptions({
			onError: (error) => toast.error(error.message || "저장하지 못했어요."),
			onSuccess: async () => {
				toast.success("문의 채팅 공지 문구를 저장했어요.");
				await queryClient.invalidateQueries({
					queryKey: orpc.bambi.siteSettings.getSupportChat.queryKey(),
				});
			},
		})
	);

	const onSubmit = (event: FormEvent) => {
		event.preventDefault();
		saveMutation.mutate({ supportChatNotice: notice });
	};

	return (
		<AccordionItem value="support-chat">
			<AccordionTrigger>문의 채팅</AccordionTrigger>
			<AccordionContent>
				<form className="flex flex-col gap-5" onSubmit={onSubmit}>
					<div className="flex flex-col gap-2">
						<Label htmlFor="supportChatNotice">홈 공지 문구</Label>
						<Textarea
							id="supportChatNotice"
							maxLength={300}
							onChange={(event) => setNotice(event.target.value)}
							placeholder="위젯 홈에 노출할 공지 문구 (비우면 배너 미표시)"
							value={notice}
						/>
						<p className="m-0 text-muted-foreground text-xs">
							문의 채팅 위젯의 홈 탭 상단에 배너로 노출됩니다. 비워두면 배너가
							표시되지 않아요. 최대 300자.
						</p>
					</div>
					<div className="flex justify-end">
						<Button
							disabled={saveMutation.isPending || supportChatQuery.isLoading}
							type="submit"
						>
							{saveMutation.isPending ? "저장 중…" : "저장"}
						</Button>
					</div>
				</form>
			</AccordionContent>
		</AccordionItem>
	);
}

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
			adInquiryTel: data.adInquiryTel ?? "",
			bizRegNo: data.bizRegNo ?? "",
			ceo: data.ceo ?? "",
			email: data.email ?? "",
			footerIntro: data.footerIntro ?? "",
			operator: data.operator ?? "",
			tel: data.tel ?? "",
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

	const privacyQuery = useQuery(
		orpc.bambi.siteSettings.getPrivacyContacts.queryOptions()
	);
	const [privacyForm, setPrivacyForm] =
		useState<PrivacyForm>(EMPTY_PRIVACY_FORM);

	// 저장된 값이 오면 폼에 채운다(미설정 필드는 빈 값 → 폴백 placeholder 노출).
	useEffect(() => {
		const data = privacyQuery.data;
		if (!data) {
			return;
		}
		setPrivacyForm({
			privacyContactEmail: data.privacyContactEmail ?? "",
			privacyContactPhone: data.privacyContactPhone ?? "",
			privacyOfficerName: data.privacyOfficerName ?? "",
			privacyPaymentProcessor: data.privacyPaymentProcessor ?? "",
		});
	}, [privacyQuery.data]);

	const savePrivacyMutation = useMutation(
		orpc.bambi.siteSettings.updatePrivacyContacts.mutationOptions({
			onError: (error) => toast.error(error.message || "저장하지 못했어요."),
			onSuccess: async () => {
				toast.success("개인정보 처리방침 연락처를 저장했어요.");
				await queryClient.invalidateQueries({
					queryKey: orpc.bambi.siteSettings.getPrivacyContacts.queryKey(),
				});
			},
		})
	);

	const updatePrivacy =
		(key: keyof PrivacyForm) => (event: { target: { value: string } }) =>
			setPrivacyForm((prev) => ({ ...prev, [key]: event.target.value }));

	const onSubmitPrivacy = (event: FormEvent) => {
		event.preventDefault();
		savePrivacyMutation.mutate(privacyForm);
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
	const [purgeHour, setPurgeHour] = useState("");

	// 저장된 값이 오면 폼에 채운다(미설정이면 빈 값 → 기본값 placeholder 노출).
	useEffect(() => {
		const data = memberPolicyQuery.data;
		if (!data) {
			return;
		}
		setRetentionDays(data.days === null ? "" : String(data.days));
		setPurgeHour(data.purgeHour === null ? "" : String(data.purgeHour));
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
		const trimmedHour = purgeHour.trim();
		const parsedHour = trimmedHour === "" ? null : Number(trimmedHour);
		if (
			parsedHour !== null &&
			!(Number.isInteger(parsedHour) && parsedHour >= 0 && parsedHour <= 23)
		) {
			toast.error("파기 실행 시각은 0~23 사이 정수로 입력해 주세요.");
			return;
		}
		saveMemberPolicyMutation.mutate({
			withdrawalPurgeHour: parsedHour,
			withdrawalRetentionDays: parsed,
		});
	};

	// 파기 배치 수동 실행. 서버 스케줄러가 매일 설정 시각에 같은 배치를 돌리며, 이 버튼은
	// 다음 자동 실행을 기다리지 않고 즉시 정리할 때 쓰는 트리거다(멱등이라 겹쳐도 안전).
	// 수동 실행도 "마지막 실행" 시각을 갱신하므로 성공 후 회원 정책 조회를 다시 받는다.
	const purgeMutation = useMutation(
		orpc.bambi.moderation.purgeWithdrawnAccounts.mutationOptions({
			onError: (error) => toast.error(error.message || "실행하지 못했어요."),
			onSuccess: async (result) => {
				await queryClient.invalidateQueries({
					queryKey: orpc.bambi.siteSettings.getMemberPolicy.queryKey(),
				});
				if (result.purgedCount === 0) {
					toast.success("보존기간이 지난 탈퇴 계정이 없어요.");
					return;
				}
				toast.success(
					`탈퇴 계정 ${result.purgedCount}건의 잔여 정보를 파기했어요.`
				);
			},
		})
	);

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

	// 최저시급은 푸터와 같은 공개 조회(getFooter)에 실려 있어 별도 쿼리를 두지 않는다.
	const [minimumWage, setMinimumWage] = useState({ hourly: "", year: "" });

	// 저장된 값이 오면 폼에 채운다(미설정이면 빈 값 → 기본값 placeholder 노출).
	useEffect(() => {
		const data = settingsQuery.data;
		if (!data) {
			return;
		}
		setMinimumWage({
			hourly:
				data.minimumWageHourly === null ? "" : String(data.minimumWageHourly),
			year: data.minimumWageYear === null ? "" : String(data.minimumWageYear),
		});
	}, [settingsQuery.data]);

	const saveMinimumWageMutation = useMutation(
		orpc.bambi.siteSettings.updateMinimumWage.mutationOptions({
			onError: (error) => toast.error(error.message || "저장하지 못했어요."),
			onSuccess: async () => {
				toast.success("최저시급을 저장했어요.");
				await queryClient.invalidateQueries({
					queryKey: orpc.bambi.siteSettings.getFooter.queryKey(),
				});
			},
		})
	);

	const onSubmitMinimumWage = (event: FormEvent) => {
		event.preventDefault();
		// 빈 값은 null(=기본값 사용)로 보낸다. 범위 검증은 서버 스키마가 맡는다.
		const toNumberOrNull = (raw: string) => {
			const trimmed = raw.trim();
			return trimmed === "" ? null : Number(trimmed);
		};
		const year = toNumberOrNull(minimumWage.year);
		const hourly = toNumberOrNull(minimumWage.hourly);
		if (
			(year !== null && !Number.isInteger(year)) ||
			(hourly !== null && !Number.isInteger(hourly))
		) {
			toast.error("연도와 시급은 숫자(정수)로 입력해 주세요.");
			return;
		}
		saveMinimumWageMutation.mutate({ hourly, year });
	};

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

			<Accordion
				defaultValue={[
					"footer-info",
					"privacy-contact",
					"bank-account",
					"member-policy",
					"minimum-wage",
					"ad-rotation",
					"exposure-section",
					"support-chat",
				]}
				multiple
			>
				<AccordionItem value="footer-info">
					<AccordionTrigger>푸터 사업자 정보</AccordionTrigger>
					<AccordionContent>
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
								<div className="flex flex-col gap-2">
									<Label htmlFor="tel">고객센터 전화</Label>
									<Input
										id="tel"
										onChange={update("tel")}
										placeholder={BAMBI_COMPANY.tel}
										type="tel"
										value={form.tel}
									/>
								</div>
								<div className="flex flex-col gap-2">
									<Label htmlFor="adInquiryTel">광고 등록 문의 전화</Label>
									<Input
										id="adInquiryTel"
										onChange={update("adInquiryTel")}
										placeholder={form.tel || BAMBI_COMPANY.tel}
										type="tel"
										value={form.adInquiryTel}
									/>
									<p className="m-0 text-muted-foreground text-xs">
										광고 슬롯의 "광고 등록 문의"에 노출됩니다. 비워두면 고객센터
										전화가 표시됩니다.
									</p>
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
					</AccordionContent>
				</AccordionItem>

				<AccordionItem value="privacy-contact">
					<AccordionTrigger>개인정보 처리방침 연락처</AccordionTrigger>
					<AccordionContent>
						<form className="flex flex-col gap-5" onSubmit={onSubmitPrivacy}>
							<p className="m-0 text-muted-foreground text-sm">
								개인정보 처리방침 페이지의 위탁사명과 보호책임자 정보에
								노출됩니다. 비워두면 기본값이 표시됩니다.
							</p>
							<div className="grid grid-cols-1 gap-5 md:grid-cols-2">
								<div className="flex flex-col gap-2">
									<Label htmlFor="privacyPaymentProcessor">
										본인인증 대행사(수탁사명)
									</Label>
									<Input
										id="privacyPaymentProcessor"
										onChange={updatePrivacy("privacyPaymentProcessor")}
										placeholder={BAMBI_PROCESSORS[0].name}
										value={privacyForm.privacyPaymentProcessor}
									/>
								</div>
								<div className="flex flex-col gap-2">
									<Label htmlFor="privacyOfficerName">보호책임자 성명</Label>
									<Input
										id="privacyOfficerName"
										onChange={updatePrivacy("privacyOfficerName")}
										placeholder={BAMBI_COMPANY.privacyOfficer.name}
										value={privacyForm.privacyOfficerName}
									/>
								</div>
								<div className="flex flex-col gap-2">
									<Label htmlFor="privacyContactPhone">관리부서 전화</Label>
									<Input
										id="privacyContactPhone"
										onChange={updatePrivacy("privacyContactPhone")}
										placeholder={BAMBI_COMPANY.privacyOfficer.tel}
										value={privacyForm.privacyContactPhone}
									/>
								</div>
								<div className="flex flex-col gap-2">
									<Label htmlFor="privacyContactEmail">관리부서 메일</Label>
									<Input
										id="privacyContactEmail"
										onChange={updatePrivacy("privacyContactEmail")}
										placeholder={BAMBI_COMPANY.privacyOfficer.email}
										type="email"
										value={privacyForm.privacyContactEmail}
									/>
								</div>
							</div>
							<div className="flex justify-end">
								<Button
									disabled={
										savePrivacyMutation.isPending || privacyQuery.isLoading
									}
									type="submit"
								>
									{savePrivacyMutation.isPending ? "저장 중…" : "저장"}
								</Button>
							</div>
						</form>
					</AccordionContent>
				</AccordionItem>

				<AccordionItem value="bank-account">
					<AccordionTrigger>무통장입금 계좌</AccordionTrigger>
					<AccordionContent>
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
													placeholder="예: 밤비알바"
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
					</AccordionContent>
				</AccordionItem>

				<AccordionItem value="member-policy">
					<AccordionTrigger>회원 정책</AccordionTrigger>
					<AccordionContent>
						<form
							className="flex flex-col gap-5"
							onSubmit={onSubmitMemberPolicy}
						>
							<div className="grid grid-cols-1 gap-5 md:max-w-md md:grid-cols-2">
								<div className="flex flex-col gap-2">
									<Label htmlFor="withdrawalRetentionDays">
										탈퇴 개인정보 보존기간(일)
									</Label>
									<Input
										id="withdrawalRetentionDays"
										inputMode="numeric"
										onChange={(event) => setRetentionDays(event.target.value)}
										placeholder={String(
											memberPolicyQuery.data?.defaultDays ?? 30
										)}
										value={retentionDays}
									/>
									<p className="m-0 text-muted-foreground text-xs">
										연락처·비밀번호 등은 탈퇴 즉시 파기하고, 부정 재가입 차단에
										필요한 본인인증 식별값(CI·DI 해시)만 이 기간 동안 남겨요.
										비워두면 기본값을 사용하고, 탈퇴 안내 문구와 개인정보
										처리방침에도 그대로 표시돼요.
									</p>
								</div>
								<div className="flex flex-col gap-2">
									<Label htmlFor="withdrawalPurgeHour">
										파기 배치 실행 시각(0~23시)
									</Label>
									<Input
										id="withdrawalPurgeHour"
										inputMode="numeric"
										onChange={(event) => setPurgeHour(event.target.value)}
										placeholder={String(
											memberPolicyQuery.data?.defaultPurgeHour ?? 4
										)}
										value={purgeHour}
									/>
									<p className="m-0 text-muted-foreground text-xs">
										보존기간이 지난 탈퇴 계정을 파기하는 배치가 매일 이
										시각(한국 시간)에 자동으로 돌아요. 비워두면 기본값(새벽
										4시)을 사용해요.
									</p>
								</div>
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
						<Separator className="my-5" />
						<div className="flex flex-col gap-3">
							<p className="m-0 text-muted-foreground text-xs">
								보존기간이 지난 탈퇴 계정의 잔여 식별값을 파기해요. 매일 위에서
								설정한 시각(기본 새벽 4시)에 자동으로 실행되며, 이 버튼은 지금
								바로 실행하고 싶을 때 눌러 주세요.
							</p>
							<p className="m-0 text-muted-foreground text-xs">
								마지막 실행:{" "}
								{memberPolicyQuery.data?.purgeLastRunAt
									? formatDateTime(memberPolicyQuery.data.purgeLastRunAt)
									: "아직 없음"}
							</p>
							<div className="flex justify-end">
								<Button
									disabled={purgeMutation.isPending}
									onClick={() => purgeMutation.mutate({})}
									type="button"
									variant="outline"
								>
									{purgeMutation.isPending ? "파기 중…" : "지금 파기 실행"}
								</Button>
							</div>
						</div>
					</AccordionContent>
				</AccordionItem>

				<AccordionItem value="minimum-wage">
					<AccordionTrigger>최저시급 표기</AccordionTrigger>
					<AccordionContent>
						<form
							className="flex flex-col gap-5"
							onSubmit={onSubmitMinimumWage}
						>
							<div className="grid grid-cols-1 gap-5 md:max-w-md md:grid-cols-2">
								<div className="flex flex-col gap-2">
									<Label htmlFor="minimumWageYear">기준 연도</Label>
									<Input
										id="minimumWageYear"
										inputMode="numeric"
										onChange={(event) =>
											setMinimumWage((prev) => ({
												...prev,
												year: event.target.value,
											}))
										}
										placeholder={String(DEFAULT_MINIMUM_WAGE.year)}
										value={minimumWage.year}
									/>
								</div>
								<div className="flex flex-col gap-2">
									<Label htmlFor="minimumWageHourly">시급(원)</Label>
									<Input
										id="minimumWageHourly"
										inputMode="numeric"
										onChange={(event) =>
											setMinimumWage((prev) => ({
												...prev,
												hourly: event.target.value,
											}))
										}
										placeholder={String(DEFAULT_MINIMUM_WAGE.hourly)}
										value={minimumWage.hourly}
									/>
								</div>
							</div>
							<p className="m-0 text-muted-foreground text-xs">
								공고 상세의 급여 옆에 "{DEFAULT_MINIMUM_WAGE.year}년 최저시급{" "}
								{DEFAULT_MINIMUM_WAGE.hourly.toLocaleString("ko-KR")}원" 형태로
								노출됩니다. 비워두면 기본값을 사용해요. 다음 해 최저시급이
								고시되면 연도와 시급을 함께 바꿔 주세요.
							</p>
							<div className="flex justify-end">
								<Button
									disabled={
										saveMinimumWageMutation.isPending || settingsQuery.isLoading
									}
									type="submit"
								>
									{saveMinimumWageMutation.isPending ? "저장 중…" : "저장"}
								</Button>
							</div>
						</form>
					</AccordionContent>
				</AccordionItem>

				<AccordionItem value="ad-rotation">
					<AccordionTrigger>광고 배너 로테이션</AccordionTrigger>
					<AccordionContent>
						<form className="flex flex-col gap-5" onSubmit={onSubmitAdRotation}>
							<div className="flex flex-col gap-2 md:max-w-xs">
								<Label htmlFor="adBannerRotationMinutes">
									로테이션 주기(분)
								</Label>
								<Input
									id="adBannerRotationMinutes"
									inputMode="numeric"
									onChange={(event) => setRotationMinutes(event.target.value)}
									placeholder={String(
										adRotationQuery.data?.defaultMinutes ?? 60
									)}
									value={rotationMinutes}
								/>
								<p className="m-0 text-muted-foreground text-xs">
									프리미엄 광고 배너는 한 광고가 한 칸씩 차지해 최대 8칸까지
									동시 노출되며, 이 주기마다 각 광고가 좌→상단→우 순서로 한 칸씩
									전진(밀어내기)합니다. 비워두면 기본값(60분)을 사용합니다.
									주기를 바꾸면 이동 위치가 한 번 점프할 수 있어요.
								</p>
							</div>
							<div className="flex justify-end">
								<Button
									disabled={
										saveAdRotationMutation.isPending ||
										adRotationQuery.isLoading
									}
									type="submit"
								>
									{saveAdRotationMutation.isPending ? "저장 중…" : "저장"}
								</Button>
							</div>
						</form>
					</AccordionContent>
				</AccordionItem>

				<ExposureSectionCard />

				<SupportChatCard />
			</Accordion>
		</div>
	);
}
