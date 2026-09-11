import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
	Button,
	Input,
	Surface,
	Switch,
	TextArea,
	TextField,
	useToast,
} from "heroui-native";
import { useState } from "react";
import { Alert, Text, View } from "react-native";

import {
	BambiHeader,
	BambiScreen,
	StateCard,
} from "@/src/components/bambi-screen";
import { orpc } from "@/src/lib/orpc";

const optional = (value: string) => value.trim() || null;
const integer = (value: string) => (value.trim() ? Number(value) : null);

function SupportNotice({ initial }: { initial: string | null }) {
	const [value, setValue] = useState(initial ?? "");
	const mutation = useMutation(
		orpc.bambi.siteSettings.updateSupportChat.mutationOptions()
	);
	const client = useQueryClient();
	return (
		<Card title="문의 채팅 공지">
			<TextField>
				<TextArea
					maxLength={300}
					onChangeText={setValue}
					placeholder="비우면 공지 배너가 표시되지 않습니다."
					value={value}
				/>
			</TextField>
			<Save
				onPress={async () => {
					await mutation.mutateAsync({ supportChatNotice: optional(value) });
					await client.invalidateQueries({
						queryKey: orpc.bambi.siteSettings.getSupportChat.key(),
					});
				}}
				pending={mutation.isPending}
			/>
		</Card>
	);
}
function Rotation({
	data,
}: {
	data: { minutes: number | null; defaultMinutes: number };
}) {
	const [value, setValue] = useState(
		data.minutes === null ? "" : String(data.minutes)
	);
	const mutation = useMutation(
		orpc.bambi.siteSettings.updateAdRotation.mutationOptions()
	);
	return (
		<Card title="광고 배너 로테이션">
			<Text className="text-muted text-sm">
				비우면 기본 {data.defaultMinutes}분을 사용합니다.
			</Text>
			<TextField>
				<Input
					keyboardType="number-pad"
					onChangeText={setValue}
					placeholder={`${data.defaultMinutes}`}
					value={value}
				/>
			</TextField>
			<Save
				onPress={() => mutation.mutateAsync({ minutes: integer(value) })}
				pending={mutation.isPending}
			/>
		</Card>
	);
}
function MemberPolicy({
	data,
}: {
	data: {
		days: number | null;
		defaultDays: number;
		purgeHour: number | null;
		defaultPurgeHour: number;
		purgeLastRunAt: Date | null;
	};
}) {
	const client = useQueryClient();
	const [days, setDays] = useState(data.days === null ? "" : String(data.days));
	const [hour, setHour] = useState(
		data.purgeHour === null ? "" : String(data.purgeHour)
	);
	const save = useMutation(
		orpc.bambi.siteSettings.updateMemberPolicy.mutationOptions()
	);
	const purge = useMutation(
		orpc.bambi.moderation.purgeWithdrawnAccounts.mutationOptions()
	);
	const { toast } = useToast();
	return (
		<Card title="탈퇴 회원 보존·파기">
			<Text className="text-muted text-sm">
				비우면 {data.defaultDays}일 보존, {data.defaultPurgeHour}시 자동
				실행입니다.
				{data.purgeLastRunAt
					? ` 최근 실행 ${new Date(data.purgeLastRunAt).toLocaleString("ko-KR")}`
					: ""}
			</Text>
			<TextField>
				<Input
					keyboardType="number-pad"
					onChangeText={setDays}
					placeholder="보존 일수"
					value={days}
				/>
			</TextField>
			<TextField>
				<Input
					keyboardType="number-pad"
					onChangeText={setHour}
					placeholder="실행 시각 0~23"
					value={hour}
				/>
			</TextField>
			<Save
				onPress={() =>
					save.mutateAsync({
						withdrawalRetentionDays: integer(days),
						withdrawalPurgeHour: integer(hour),
					})
				}
				pending={save.isPending}
			/>
			<Button
				isDisabled={purge.isPending}
				onPress={() =>
					Alert.alert(
						"탈퇴 개인정보 즉시 파기",
						"보존기간이 지난 탈퇴 계정의 식별 정보를 지금 제거합니다. 실행할까요?",
						[
							{ text: "취소", style: "cancel" },
							{
								text: "실행",
								style: "destructive",
								onPress: async () => {
									try {
										const result = await purge.mutateAsync({});
										await client.invalidateQueries({
											queryKey: orpc.bambi.siteSettings.getMemberPolicy.key(),
										});
										toast.show({
											label: `${result.purgedCount}개 계정을 파기했어요.`,
										});
									} catch (error) {
										toast.show({
											label:
												error instanceof Error
													? error.message
													: "실행하지 못했어요.",
											variant: "danger",
										});
									}
								},
							},
						]
					)
				}
				variant="danger-soft"
			>
				<Button.Label>지금 파기 실행</Button.Label>
			</Button>
		</Card>
	);
}
function Exposure({
	data,
}: {
	data: {
		recommendedSlots: number;
		specialSlots: number;
		urgentHidden: boolean;
	};
}) {
	const [recommended, setRecommended] = useState(String(data.recommendedSlots));
	const [special, setSpecial] = useState(String(data.specialSlots));
	const [hidden, setHidden] = useState(data.urgentHidden);
	const mutation = useMutation(
		orpc.bambi.siteSettings.updateExposureSectionConfig.mutationOptions()
	);
	return (
		<Card title="공고 노출 섹션">
			<View className="flex-row items-center justify-between">
				<Text className="text-foreground">급구 섹션 숨김</Text>
				<Switch isSelected={hidden} onSelectedChange={setHidden} />
			</View>
			<TextField>
				<Input
					keyboardType="number-pad"
					onChangeText={setSpecial}
					placeholder="스페셜 슬롯"
					value={special}
				/>
			</TextField>
			<TextField>
				<Input
					keyboardType="number-pad"
					onChangeText={setRecommended}
					placeholder="추천 슬롯"
					value={recommended}
				/>
			</TextField>
			<Save
				onPress={() =>
					mutation.mutateAsync({
						recommendedSlots: Number(recommended),
						specialSlots: Number(special),
						urgentHidden: hidden,
					})
				}
				pending={mutation.isPending}
			/>
		</Card>
	);
}
function Wage({
	data,
}: {
	data: { minimumWageHourly: number | null; minimumWageYear: number | null };
}) {
	const [year, setYear] = useState(
		data.minimumWageYear ? String(data.minimumWageYear) : ""
	);
	const [hourly, setHourly] = useState(
		data.minimumWageHourly ? String(data.minimumWageHourly) : ""
	);
	const mutation = useMutation(
		orpc.bambi.siteSettings.updateMinimumWage.mutationOptions()
	);
	return (
		<Card title="최저시급">
			<TextField>
				<Input
					keyboardType="number-pad"
					onChangeText={setYear}
					placeholder="적용 연도"
					value={year}
				/>
			</TextField>
			<TextField>
				<Input
					keyboardType="number-pad"
					onChangeText={setHourly}
					placeholder="시급(원)"
					value={hourly}
				/>
			</TextField>
			<Save
				onPress={() =>
					mutation.mutateAsync({ year: Number(year), hourly: Number(hourly) })
				}
				pending={mutation.isPending}
			/>
		</Card>
	);
}
function Footer({
	data,
}: {
	data: NonNullable<
		Awaited<
			ReturnType<
				import("@bambi-app/api/routers/index").AppRouterClient["bambi"]["siteSettings"]["getFooter"]
			>
		>
	>;
}) {
	const [operator, setOperator] = useState(data.operator ?? "");
	const [ceo, setCeo] = useState(data.ceo ?? "");
	const [bizRegNo, setBiz] = useState(data.bizRegNo ?? "");
	const [address, setAddress] = useState(data.address ?? "");
	const [email, setEmail] = useState(data.email ?? "");
	const [tel, setTel] = useState(data.tel ?? "");
	const [adInquiryTel, setAdTel] = useState(data.adInquiryTel ?? "");
	const [footerIntro, setIntro] = useState(data.footerIntro ?? "");
	const mutation = useMutation(
		orpc.bambi.siteSettings.updateFooter.mutationOptions()
	);
	return (
		<Card title="사이트·사업자 정보">
			<TextField>
				<Input
					onChangeText={setOperator}
					placeholder="운영자"
					value={operator}
				/>
			</TextField>
			<TextField>
				<Input onChangeText={setCeo} placeholder="대표자" value={ceo} />
			</TextField>
			<TextField>
				<Input
					onChangeText={setBiz}
					placeholder="사업자등록번호"
					value={bizRegNo}
				/>
			</TextField>
			<TextField>
				<Input onChangeText={setAddress} placeholder="주소" value={address} />
			</TextField>
			<TextField>
				<Input onChangeText={setEmail} placeholder="이메일" value={email} />
			</TextField>
			<TextField>
				<Input onChangeText={setTel} placeholder="전화번호" value={tel} />
			</TextField>
			<TextField>
				<Input
					onChangeText={setAdTel}
					placeholder="광고 문의 전화"
					value={adInquiryTel}
				/>
			</TextField>
			<TextField>
				<TextArea
					onChangeText={setIntro}
					placeholder="푸터 소개"
					value={footerIntro}
				/>
			</TextField>
			<Save
				onPress={() =>
					mutation.mutateAsync({
						operator: optional(operator),
						ceo: optional(ceo),
						bizRegNo: optional(bizRegNo),
						address: optional(address),
						email: optional(email),
						tel: optional(tel),
						adInquiryTel: optional(adInquiryTel),
						footerIntro: optional(footerIntro),
					})
				}
				pending={mutation.isPending}
			/>
		</Card>
	);
}
function Privacy({
	data,
}: {
	data: {
		privacyContactEmail: string | null;
		privacyContactPhone: string | null;
		privacyOfficerName: string | null;
		privacyPaymentProcessor: string | null;
	};
}) {
	const [processor, setProcessor] = useState(
		data.privacyPaymentProcessor ?? ""
	);
	const [officer, setOfficer] = useState(data.privacyOfficerName ?? "");
	const [phone, setPhone] = useState(data.privacyContactPhone ?? "");
	const [email, setEmail] = useState(data.privacyContactEmail ?? "");
	const mutation = useMutation(
		orpc.bambi.siteSettings.updatePrivacyContacts.mutationOptions()
	);
	return (
		<Card title="개인정보 처리방침 연락처">
			<TextField>
				<Input
					onChangeText={setProcessor}
					placeholder="결제 처리 위탁사"
					value={processor}
				/>
			</TextField>
			<TextField>
				<Input
					onChangeText={setOfficer}
					placeholder="개인정보 보호책임자"
					value={officer}
				/>
			</TextField>
			<TextField>
				<Input onChangeText={setPhone} placeholder="연락처" value={phone} />
			</TextField>
			<TextField>
				<Input onChangeText={setEmail} placeholder="이메일" value={email} />
			</TextField>
			<Save
				onPress={() =>
					mutation.mutateAsync({
						privacyPaymentProcessor: optional(processor),
						privacyOfficerName: optional(officer),
						privacyContactPhone: optional(phone),
						privacyContactEmail: optional(email),
					})
				}
				pending={mutation.isPending}
			/>
		</Card>
	);
}
function Accounts({
	data,
}: {
	data: { accountNumber: string; bank: string; holder: string }[];
}) {
	const [rows, setRows] = useState(() =>
		(data.length ? data : [{ accountNumber: "", bank: "", holder: "" }]).map(
			(row, index) => ({ ...row, localId: `account-${index}-${row.bank}` })
		)
	);
	const mutation = useMutation(
		orpc.bambi.siteSettings.updatePaymentAccounts.mutationOptions()
	);
	const update = (
		index: number,
		field: "accountNumber" | "bank" | "holder",
		value: string
	) =>
		setRows((current) =>
			current.map((row, rowIndex) =>
				rowIndex === index ? { ...row, [field]: value } : row
			)
		);
	return (
		<Card title="무통장입금 계좌">
			{rows.map((row, index) => (
				<View className="gap-2 rounded-lg bg-background p-3" key={row.localId}>
					<TextField>
						<Input
							onChangeText={(value) => update(index, "bank", value)}
							placeholder="은행"
							value={row.bank}
						/>
					</TextField>
					<TextField>
						<Input
							onChangeText={(value) => update(index, "accountNumber", value)}
							placeholder="계좌번호"
							value={row.accountNumber}
						/>
					</TextField>
					<TextField>
						<Input
							onChangeText={(value) => update(index, "holder", value)}
							placeholder="예금주"
							value={row.holder}
						/>
					</TextField>
					<Button
						onPress={() =>
							setRows((current) =>
								current.filter((_, rowIndex) => rowIndex !== index)
							)
						}
						size="sm"
						variant="danger-soft"
					>
						<Button.Label>계좌 제거</Button.Label>
					</Button>
				</View>
			))}
			<Button
				isDisabled={rows.length >= 10}
				onPress={() =>
					setRows((current) => [
						...current,
						{
							accountNumber: "",
							bank: "",
							holder: "",
							localId: `account-${Date.now()}`,
						},
					])
				}
				size="sm"
				variant="secondary"
			>
				<Button.Label>계좌 추가</Button.Label>
			</Button>
			<Save
				onPress={() =>
					mutation.mutateAsync({
						bankAccounts: rows.map((row) => ({
							accountNumber: row.accountNumber.trim(),
							bank: row.bank.trim(),
							holder: row.holder.trim(),
						})),
					})
				}
				pending={mutation.isPending}
			/>
		</Card>
	);
}
function Save({
	pending,
	onPress,
}: {
	pending: boolean;
	onPress: () => Promise<unknown>;
}) {
	const client = useQueryClient();
	const { toast } = useToast();
	return (
		<Button
			isDisabled={pending}
			onPress={async () => {
				try {
					await onPress();
					await client.invalidateQueries({
						queryKey: orpc.bambi.siteSettings.key(),
					});
					toast.show({ label: "설정을 저장했어요." });
				} catch (error) {
					toast.show({
						label:
							error instanceof Error ? error.message : "저장하지 못했어요.",
						variant: "danger",
					});
				}
			}}
		>
			<Button.Label>저장</Button.Label>
		</Button>
	);
}
function Card({
	title,
	children,
}: {
	title: string;
	children: React.ReactNode;
}) {
	return (
		<Surface className="gap-3 rounded-lg p-4" variant="secondary">
			<Text className="font-bold text-foreground">{title}</Text>
			{children}
		</Surface>
	);
}

export default function ModeratorSiteSettingsScreen() {
	const footer = useQuery(orpc.bambi.siteSettings.getFooter.queryOptions());
	const support = useQuery(
		orpc.bambi.siteSettings.getSupportChat.queryOptions()
	);
	const member = useQuery(
		orpc.bambi.siteSettings.getMemberPolicy.queryOptions()
	);
	const rotation = useQuery(
		orpc.bambi.siteSettings.getAdRotation.queryOptions()
	);
	const exposure = useQuery(
		orpc.bambi.siteSettings.getExposureSectionConfig.queryOptions()
	);
	const privacy = useQuery(
		orpc.bambi.siteSettings.getPrivacyContacts.queryOptions()
	);
	const accounts = useQuery(
		orpc.bambi.siteSettings.getPaymentAccounts.queryOptions()
	);
	const footerData = footer.data ?? {
		operator: null,
		ceo: null,
		bizRegNo: null,
		address: null,
		email: null,
		tel: null,
		adInquiryTel: null,
		footerIntro: null,
		minimumWageHourly: null,
		minimumWageYear: null,
	};
	const privacyData = privacy.data ?? {
		privacyPaymentProcessor: null,
		privacyOfficerName: null,
		privacyContactPhone: null,
		privacyContactEmail: null,
	};
	const sections = [
		{ title: "사이트 정보", query: footer },
		{ title: "문의 공지", query: support },
		{ title: "회원 정책", query: member },
		{ title: "광고 회전", query: rotation },
		{ title: "노출 섹션", query: exposure },
		{ title: "개인정보 연락처", query: privacy },
		{ title: "입금 계좌", query: accounts },
	];
	return (
		<BambiScreen>
			<BambiHeader
				description="사이트 정보와 운영 정책을 항목별로 저장합니다."
				title="사이트 설정"
			/>
			{sections
				.filter((section) => section.query.isError)
				.map((section) => (
					<StateCard
						action={
							<Button onPress={() => section.query.refetch()}>
								<Button.Label>다시 시도</Button.Label>
							</Button>
						}
						description="다른 설정은 계속 사용할 수 있습니다."
						key={section.title}
						title={`${section.title} 조회 실패`}
					/>
				))}
			{footer.isSuccess ? (
				<>
					<Footer data={footerData} />
					<Wage data={footerData} />
				</>
			) : null}
			{support.data ? (
				<SupportNotice initial={support.data.supportChatNotice} />
			) : null}
			{privacy.isSuccess ? <Privacy data={privacyData} /> : null}
			{accounts.data ? <Accounts data={accounts.data} /> : null}
			{member.data ? <MemberPolicy data={member.data} /> : null}
			{rotation.data ? <Rotation data={rotation.data} /> : null}
			{exposure.data ? <Exposure data={exposure.data} /> : null}
		</BambiScreen>
	);
}
