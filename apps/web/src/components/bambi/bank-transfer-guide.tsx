"use client";

import { Button } from "@bambi-app/ui/components/button";
import { useQuery } from "@tanstack/react-query";
import { Copy } from "lucide-react";
import { toast } from "sonner";

import { formatAdPrice } from "@/lib/bambi/ad-catalog";
import { orpc } from "@/utils/orpc";

const copyAccountNumber = async (accountNumber: string) => {
	try {
		await navigator.clipboard.writeText(accountNumber);
		toast.success("계좌번호를 복사했어요.");
	} catch {
		toast.error("계좌번호를 복사하지 못했어요.");
	}
};

interface BankTransferGuideProps {
	// 결제 예정 금액(있으면 상단에 안내). 협의/무료는 null.
	amount?: number | null;
}

// 무통장입금 안내(계좌 목록·복사·입금 규칙)를 공고 등록·완료·광고 관리에서 공유하는 콘텐츠 블록.
// 래퍼(Alert/Popover/Dialog)는 소비처가 감싼다. 계좌 데이터는 공개 조회를 react-query로 읽는다.
export function BankTransferGuide({ amount }: BankTransferGuideProps) {
	const accountsQuery = useQuery(
		orpc.bambi.siteSettings.getPaymentAccounts.queryOptions()
	);
	const accounts = accountsQuery.data ?? [];
	const hasAccounts = accounts.length > 0;

	return (
		<div className="flex flex-col gap-2 text-sm">
			{typeof amount === "number" ? (
				<p className="font-medium">
					결제 예정 금액{" "}
					<span className="text-primary">{formatAdPrice(amount)}</span>
				</p>
			) : null}
			{hasAccounts ? (
				<ul className="flex flex-col gap-2">
					{accounts.map((account) => (
						<li
							className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-muted/30 px-3 py-2"
							key={`${account.bank}-${account.accountNumber}`}
						>
							<div className="flex min-w-0 flex-col">
								<span className="break-all font-medium">
									{account.bank} {account.accountNumber}
								</span>
								<span className="text-muted-foreground text-xs">
									예금주 {account.holder}
								</span>
							</div>
							<Button
								onClick={() => copyAccountNumber(account.accountNumber)}
								size="sm"
								type="button"
								variant="outline"
							>
								<Copy data-icon="inline-start" />
								복사
							</Button>
						</li>
					))}
				</ul>
			) : (
				<p className="text-destructive">
					입금 계좌가 준비되기 전이라 무통장입금으로 등록할 수 없습니다. 다른
					결제수단을 선택하거나 고객센터로 문의해 주세요.
				</p>
			)}
			{hasAccounts ? (
				<div className="flex flex-col gap-1 text-muted-foreground text-xs">
					<p>입금자명은 업체명(상호)과 동일하게 입금해 주세요.</p>
					<p>입금 확인 후 공고가 게시됩니다.</p>
				</div>
			) : null}
		</div>
	);
}
