import { InquiryForm } from "@/components/bambi/support/inquiry-form";
import { MemberOnlySupport } from "@/components/bambi/support/moderator-support-notice";

export default function SupportInquiryNewPage() {
	return (
		<MemberOnlySupport>
			<InquiryForm />
		</MemberOnlySupport>
	);
}
