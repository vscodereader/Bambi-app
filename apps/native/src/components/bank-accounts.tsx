import { setStringAsync } from "expo-clipboard";
import { Button, useToast } from "heroui-native";
import { Text, View } from "react-native";

// 무통장입금 계좌 목록. 광고 관리 입금 안내·공고 등록 결제·끌어올리기 옵션 구매가
// 같은 것을 쓴다(사본을 늘리면 계좌 문구가 화면마다 갈라진다).
export interface PaymentAccountItem {
	accountNumber: string;
	bank: string;
	holder: string;
}

export function BankAccounts({
	accounts,
	emptyMessage,
	isLoading = false,
}: {
	accounts: PaymentAccountItem[];
	emptyMessage: string;
	isLoading?: boolean;
}) {
	const { toast } = useToast();

	if (accounts.length === 0) {
		return (
			<Text className="text-danger text-xs">
				{isLoading ? "입금 계좌를 불러오고 있어요." : emptyMessage}
			</Text>
		);
	}

	return (
		<View className="gap-2">
			{accounts.map((account) => (
				<View
					className="flex-row items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2"
					key={`${account.bank}-${account.accountNumber}`}
				>
					<View className="flex-1 gap-0.5">
						<Text className="font-medium text-foreground text-sm" selectable>
							{`${account.bank} ${account.accountNumber}`}
						</Text>
						<Text className="text-muted text-xs">
							{`예금주 ${account.holder}`}
						</Text>
					</View>
					<Button
						onPress={() => {
							setStringAsync(account.accountNumber)
								.then(() => toast.show("계좌번호를 복사했어요."))
								.catch(() => toast.show("계좌번호를 복사하지 못했어요."));
						}}
						size="sm"
						variant="outline"
					>
						<Button.Label>복사</Button.Label>
					</Button>
				</View>
			))}
			<Text className="text-muted text-xs">
				입금자명은 업체명(상호)과 동일하게 입금해 주세요. 입금 확인 후 공고가
				게시됩니다.
			</Text>
		</View>
	);
}
