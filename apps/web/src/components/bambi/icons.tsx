// 밤비 디자인 시스템 아이콘 — 원본 Figma 익스포트 아이콘을 lucide-react로 매핑.
// 모든 아이콘은 부모 컨테이너(span)를 채우도록 100% 크기, stroke=currentColor 상속.

import {
	ArrowLeft,
	ArrowUpDown,
	Bell,
	Bookmark,
	Briefcase,
	Check,
	ChevronDown,
	ChevronLeft,
	ChevronRight,
	CircleAlert,
	CircleDollarSign,
	ClipboardList,
	Clock,
	Copy,
	EllipsisVertical,
	Eye,
	EyeOff,
	FileText,
	Flag,
	House,
	Image as ImageIconBase,
	Lock,
	type LucideIcon,
	type LucideProps,
	MapPin,
	MessageCircle,
	MessagesSquare,
	Paperclip,
	Phone,
	Plus,
	Search,
	Settings,
	ShieldCheck,
	SlidersHorizontal,
	Star,
	Store,
	User,
	X,
	Zap,
} from "lucide-react";

const fill = (
	Icon: LucideIcon
): ((props: LucideProps) => React.ReactElement) => {
	function BambiIcon(props: LucideProps) {
		return <Icon height="100%" width="100%" {...props} />;
	}
	return BambiIcon;
};

export const AlertCircle = fill(CircleAlert);
export const ArrowNarrowLeft = fill(ArrowLeft);
export const BellIcon = fill(Bell);
export const BookmarkIcon = fill(Bookmark);
export const BriefcaseIcon = fill(Briefcase);
export const CheckIcon = fill(Check);
export const ChevronDownIcon = fill(ChevronDown);
export const ChevronLeftIcon = fill(ChevronLeft);
export const ChevronRightIcon = fill(ChevronRight);
export const ClipboardListIcon = fill(ClipboardList);
export const ClockIcon = fill(Clock);
export const CopyIcon = fill(Copy);
export const DollarCircle = fill(CircleDollarSign);
export const DotsVertical = fill(EllipsisVertical);
export const EyeIcon = fill(Eye);
export const EyeOffIcon = fill(EyeOff);
export const FileTextIcon = fill(FileText);
export const Filter = fill(SlidersHorizontal);
export const Flash = fill(Zap);
export const FlagIcon = fill(Flag);
export const Home2 = fill(House);
export const ImageIcon = fill(ImageIconBase);
export const LockIcon = fill(Lock);
export const MapPinIcon = fill(MapPin);
export const Message = fill(MessageCircle);
export const MessagesIcon = fill(MessagesSquare);
export const PaperclipIcon = fill(Paperclip);
export const PhoneIcon = fill(Phone);
export const PlusIcon = fill(Plus);
export const SearchIcon = fill(Search);
export const Search2 = fill(Search);
export const SettingsIcon = fill(Settings);
export const ShieldIcon = fill(ShieldCheck);
export const SortIcon = fill(ArrowUpDown);
export const StarIcon = fill(Star);
export const StoreIcon = fill(Store);
export const UserIcon = fill(User);
export const XIcon = fill(X);
