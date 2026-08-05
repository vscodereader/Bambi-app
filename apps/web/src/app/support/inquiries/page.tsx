import { InquiryList } from "@/components/bambi/support/inquiry-list";
import { MemberOnlySupport } from "@/components/bambi/support/moderator-support-notice";

export default function SupportInquiriesPage() {
	return (
		<MemberOnlySupport>
			<InquiryList />
		</MemberOnlySupport>
	);
}
