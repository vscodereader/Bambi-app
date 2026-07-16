"use client";

// 밤비 디자인 시스템 — 코어 프리미티브.
// shadcn(base-lyra) 기반으로 점진 전환 중. (apps/web/CLAUDE.md 참고)

import {
	Avatar as UiAvatar,
	AvatarFallback as UiAvatarFallback,
	AvatarImage as UiAvatarImage,
} from "@bambi-app/ui/components/avatar";
import { Badge as UiBadge } from "@bambi-app/ui/components/badge";
import { Button as UiButton } from "@bambi-app/ui/components/button";
import { Card as UiCard } from "@bambi-app/ui/components/card";
import { Input as UiInput } from "@bambi-app/ui/components/input";
import { Switch as UiSwitch } from "@bambi-app/ui/components/switch";
import {
	Tabs as UiTabs,
	TabsList as UiTabsList,
	TabsTrigger as UiTabsTrigger,
} from "@bambi-app/ui/components/tabs";
import { cn } from "@bambi-app/ui/lib/utils";
import type { CSSProperties, ReactElement, ReactNode } from "react";
import {
	SELECTED_JOB_CARD_CLASS,
	SELECTED_TAG_CLASS,
} from "@/lib/bambi/selection-style";
import {
	ArrowNarrowLeft,
	BookmarkIcon,
	CheckIcon,
	ClockIcon,
	Filter,
	Home2,
	MapPinIcon,
	Message,
	Search2,
	SearchIcon,
	StarIcon,
	UserIcon,
} from "./icons";

type IconComp = (props: { style?: CSSProperties }) => ReactElement;
type Size = "xs" | "sm" | "md" | "lg" | "xl";

const WHITESPACE_RE = /\s+/;

// ---- Avatar ----------------------------------------------------------------
const AVATAR_ROOT_SIZE: Record<Size, string> = {
	xs: "size-7",
	sm: "size-9",
	md: "size-11",
	lg: "size-14",
	xl: "size-18",
};

const AVATAR_FALLBACK_TEXT: Record<Size, string> = {
	xs: "text-[11px]",
	sm: "text-[13px]",
	md: "text-base",
	lg: "text-xl",
	xl: "text-[26px]",
};

interface AvatarProps {
	className?: string;
	name?: string;
	ring?: boolean;
	size?: Size;
	square?: boolean;
	src?: string;
}

export function Avatar({
	name = "",
	size = "md",
	square = false,
	ring = false,
	src,
	className,
}: AvatarProps) {
	const initials = name
		.trim()
		.split(WHITESPACE_RE)
		.map((w) => w[0])
		.slice(0, 2)
		.join("")
		.toUpperCase();
	return (
		<UiAvatar
			className={cn(
				AVATAR_ROOT_SIZE[size] || AVATAR_ROOT_SIZE.md,
				"after:border-0",
				square ? "rounded-[14px] after:rounded-[14px]" : "rounded-full",
				ring && "ring-2 ring-coral-50 ring-offset-2 ring-offset-background",
				className
			)}
		>
			{src ? <UiAvatarImage src={src} /> : null}
			<UiAvatarFallback
				className={cn(
					"bg-coral-50 font-bold text-coral-700",
					AVATAR_FALLBACK_TEXT[size] || AVATAR_FALLBACK_TEXT.md,
					square ? "rounded-[14px]" : "rounded-full"
				)}
			>
				{initials || "•"}
			</UiAvatarFallback>
		</UiAvatar>
	);
}

// ---- Badge -----------------------------------------------------------------
type BadgeTone =
	| "neutral"
	| "primary"
	| "success"
	| "pending"
	| "danger"
	| "info"
	| "dark";

type UiBadgeVariant =
	| "default"
	| "secondary"
	| "destructive"
	| "success"
	| "warning"
	| "dark";

const BADGE_VARIANT: Record<BadgeTone, UiBadgeVariant> = {
	neutral: "secondary",
	primary: "default",
	success: "success",
	pending: "warning",
	danger: "destructive",
	info: "secondary",
	dark: "dark",
};

interface BadgeProps {
	children?: ReactNode;
	className?: string;
	dot?: boolean;
	tone?: BadgeTone;
}

export function Badge({
	tone = "neutral",
	dot = false,
	children,
	className,
}: BadgeProps) {
	return (
		<UiBadge className={cn(className)} variant={BADGE_VARIANT[tone]}>
			{dot ? <span className="size-1.5 rounded-full bg-current" /> : null}
			{children}
		</UiBadge>
	);
}

// ---- Button ----------------------------------------------------------------
type ButtonVariant =
	| "primary"
	| "dark"
	| "secondary"
	| "ghost"
	| "soft"
	| "danger";
type ButtonSize = "lg" | "md" | "sm";

const BTN_VARIANT_PROPS: Record<
	ButtonVariant,
	{ variant: "default" | "outline" | "ghost"; className: string }
> = {
	primary: {
		variant: "default",
		className: "shadow-[var(--shadow-primary)]",
	},
	dark: {
		variant: "default",
		className: "bg-ink-800 text-white hover:bg-ink-700",
	},
	secondary: { variant: "outline", className: "" },
	ghost: { variant: "ghost", className: "" },
	soft: {
		variant: "default",
		className: "bg-coral-50 text-coral-700 hover:bg-coral-100",
	},
	danger: {
		variant: "default",
		className: "bg-destructive text-white hover:bg-destructive/90",
	},
};

const BTN_SIZE_PROPS: Record<
	ButtonSize,
	{ size: "lg" | "default" | "sm"; className: string }
> = {
	lg: { size: "lg", className: "h-14 px-6 text-base" },
	md: { size: "default", className: "h-11 px-[18px] text-sm" },
	sm: { size: "sm", className: "h-9 px-[14px] text-sm" },
};

interface ButtonProps {
	block?: boolean;
	children?: ReactNode;
	className?: string;
	disabled?: boolean;
	leftIcon?: ReactNode;
	onClick?: () => void;
	rightIcon?: ReactNode;
	size?: ButtonSize;
	type?: "button" | "reset" | "submit";
	variant?: ButtonVariant;
}

export function Button({
	variant = "primary",
	size = "lg",
	block = false,
	leftIcon,
	rightIcon,
	disabled = false,
	children,
	className,
	onClick,
	type = "button",
}: ButtonProps) {
	const v = BTN_VARIANT_PROPS[variant] || BTN_VARIANT_PROPS.primary;
	const s = BTN_SIZE_PROPS[size] || BTN_SIZE_PROPS.lg;
	return (
		<UiButton
			className={cn(
				"font-bold tracking-[-0.01em]",
				s.className,
				v.className,
				block && "w-full",
				className
			)}
			disabled={disabled}
			onClick={onClick}
			size={s.size}
			type={type}
			variant={v.variant}
		>
			{leftIcon ? (
				<span className="inline-flex size-4" data-icon="inline-start">
					{leftIcon}
				</span>
			) : null}
			{children}
			{rightIcon ? (
				<span className="inline-flex size-4" data-icon="inline-end">
					{rightIcon}
				</span>
			) : null}
		</UiButton>
	);
}

// ---- Card ------------------------------------------------------------------
type CardTone = "default" | "subtle" | "inverse" | "outline";
type CardPad = "none" | "sm" | "md" | "lg";

const CARD_PAD_CLASS: Record<CardPad, string> = {
	none: "p-0",
	sm: "p-3.5",
	md: "p-4",
	lg: "p-5",
};

const CARD_TONE_CLASS: Record<CardTone, string> = {
	default: "bg-card border border-border shadow-[var(--shadow-card)] ring-0",
	subtle: "bg-secondary border-0 shadow-none ring-0",
	inverse: "bg-ink-800 text-white border-0 ring-0",
	outline:
		"bg-card border border-[color:var(--border-default)] shadow-none ring-0",
};

interface CardProps {
	children?: ReactNode;
	className?: string;
	interactive?: boolean;
	pad?: CardPad;
	tone?: CardTone;
}

export function Card({
	tone = "default",
	pad = "md",
	children,
	className,
}: CardProps) {
	return (
		<UiCard
			className={cn(
				"gap-0 py-0",
				CARD_PAD_CLASS[pad] || CARD_PAD_CLASS.md,
				CARD_TONE_CLASS[tone] || CARD_TONE_CLASS.default,
				className
			)}
		>
			{children}
		</UiCard>
	);
}

// ---- IconButton ------------------------------------------------------------
const ICONBTN_SIZE: Record<"lg" | "md" | "sm", "icon-lg" | "icon" | "icon-sm"> =
	{
		lg: "icon-lg",
		md: "icon",
		sm: "icon-sm",
	};

const ICONBTN_VARIANT: Record<
	"subtle" | "plain" | "outline" | "inverse",
	"secondary" | "ghost" | "outline"
> = {
	subtle: "secondary",
	plain: "ghost",
	outline: "outline",
	inverse: "ghost",
};

interface IconButtonProps {
	active?: boolean;
	badge?: boolean;
	children?: ReactNode;
	className?: string;
	onClick?: () => void;
	size?: "lg" | "md" | "sm";
	variant?: "subtle" | "plain" | "outline" | "inverse";
}

export function IconButton({
	size = "md",
	variant = "subtle",
	active = false,
	badge = false,
	children,
	className,
	onClick,
}: IconButtonProps) {
	return (
		<span className="relative inline-flex">
			<UiButton
				className={cn(
					"rounded-lg",
					active &&
						"border-coral-500 bg-card text-coral-700 ring-2 ring-coral-100 hover:bg-card",
					variant === "inverse" && "bg-white/10 text-white hover:bg-white/20",
					className
				)}
				onClick={onClick}
				size={ICONBTN_SIZE[size] || ICONBTN_SIZE.md}
				variant={ICONBTN_VARIANT[variant] || ICONBTN_VARIANT.subtle}
			>
				<span className="inline-flex size-5">{children}</span>
			</UiButton>
			{badge ? (
				<span className="absolute top-1 right-1 size-2 rounded-full bg-coral-500 ring-2 ring-background" />
			) : null}
		</span>
	);
}

// ---- InfoTile --------------------------------------------------------------
interface InfoTileProps {
	className?: string;
	icon?: ReactNode;
	label?: ReactNode;
	value?: ReactNode;
}

export function InfoTile({ icon, label, value, className }: InfoTileProps) {
	return (
		// 루트에 min-w-0 필수: InfoTile은 grid/flex 아이템으로 배치되는데(예: 상세·프리플라이트의
		// `grid gap-3 sm:grid-cols-2`), 모바일 단일 열은 minmax(0,1fr) 없는 auto 트랙이라 아이템의
		// 자동 min-width가 남아 안쪽 value의 truncate가 무력화돼 값이 넘친다. min-w-0으로 아이템이
		// 트랙 폭까지 줄어들 수 있게 해야 안쪽 min-w-0 래퍼 + truncate가 실제로 동작한다.
		<div className={cn("flex min-w-0 items-center gap-3", className)}>
			<div className="inline-flex size-12 flex-[0_0_48px] items-center justify-center rounded-md bg-secondary text-foreground">
				<span className="inline-flex size-[22px]">{icon}</span>
			</div>
			<div className="flex min-w-0 flex-col gap-0.5">
				<span className="font-medium text-muted-foreground text-xs">
					{label}
				</span>
				<span className="truncate font-bold text-base text-foreground">
					{value}
				</span>
			</div>
		</div>
	);
}

// ---- Logo ------------------------------------------------------------------
// 사이즈별 정적 Tailwind 매핑 (dim 파생값을 클래스로 사전 계산: dim sm=28·md=36·lg=44·xl=64, gap≈dim*0.28, 타일 size/radius=dim·dim*0.3, 워드마크 fontSize=dim*0.5)
const LOGO_GAP_CLASS: Record<"sm" | "md" | "lg" | "xl", string> = {
	sm: "gap-2",
	md: "gap-2.5",
	lg: "gap-3",
	xl: "gap-[18px]",
};
const LOGO_TILE_CLASS: Record<"sm" | "md" | "lg" | "xl", string> = {
	sm: "size-7 flex-[0_0_28px] rounded-[8.4px]",
	md: "size-9 flex-[0_0_36px] rounded-[10.8px]",
	lg: "size-11 flex-[0_0_44px] rounded-[13.2px]",
	xl: "size-16 flex-[0_0_64px] rounded-[19.2px]",
};
const LOGO_WORD_CLASS: Record<"sm" | "md" | "lg" | "xl", string> = {
	sm: "text-[14px]",
	md: "text-[18px]",
	lg: "text-[22px]",
	xl: "text-[32px]",
};
// SVG 글리프 크기(=dim*0.56)는 style이 아닌 width/height 속성으로 전달.
const LOGO_GLYPH_DIM: Record<"sm" | "md" | "lg" | "xl", number> = {
	sm: 28 * 0.56,
	md: 36 * 0.56,
	lg: 44 * 0.56,
	xl: 64 * 0.56,
};

interface LogoProps {
	className?: string;
	lang?: "en" | "ko";
	size?: "sm" | "md" | "lg" | "xl";
	tone?: "brand" | "inverse";
	wordmark?: boolean;
}

export function Logo({
	size = "md",
	wordmark = true,
	lang = "en",
	tone = "brand",
	className,
}: LogoProps) {
	const glyphDim = LOGO_GLYPH_DIM[size] || LOGO_GLYPH_DIM.md;
	const glyph = tone === "inverse" ? "var(--color-primary)" : "var(--white)";
	const label = lang === "ko" ? "밤비" : "Bambi";
	return (
		<div
			className={cn(
				"inline-flex items-center",
				LOGO_GAP_CLASS[size] || LOGO_GAP_CLASS.md,
				className
			)}
		>
			<div
				className={cn(
					"inline-flex items-center justify-center",
					LOGO_TILE_CLASS[size] || LOGO_TILE_CLASS.md,
					tone === "inverse" ? "bg-white shadow-none" : "bg-primary shadow-lg"
				)}
			>
				<svg
					aria-hidden="true"
					fill="none"
					height={glyphDim}
					viewBox="0 0 24 24"
					width={glyphDim}
				>
					<title>밤비</title>
					<path
						d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"
						fill={glyph}
					/>
					<circle cx="16.5" cy="8" fill={glyph} r="1.15" />
				</svg>
			</div>
			{wordmark ? (
				<span
					className={cn(
						"font-extrabold leading-none tracking-[-0.02em]",
						LOGO_WORD_CLASS[size] || LOGO_WORD_CLASS.md,
						tone === "inverse" ? "text-white" : "text-foreground"
					)}
				>
					{label}
				</span>
			) : null}
		</div>
	);
}

// ---- SegmentedTabs ---------------------------------------------------------
interface TabItem {
	label: string;
	value: string;
}
interface SegmentedTabsProps {
	className?: string;
	items?: (TabItem | string)[];
	onChange?: (value: string) => void;
	value?: string;
	variant?: "solid" | "segment" | "underline";
}

export function SegmentedTabs({
	items = [],
	value,
	onChange,
	variant = "solid",
	className,
}: SegmentedTabsProps) {
	const norm: TabItem[] = items.map((it) =>
		typeof it === "string" ? { value: it, label: it } : it
	);
	const listVariant = variant === "underline" ? "line" : "default";

	return (
		<UiTabs
			className={cn("w-full", className)}
			onValueChange={(v) => onChange?.(v)}
			value={value}
		>
			<UiTabsList className="w-full" variant={listVariant}>
				{norm.map((it) => (
					<UiTabsTrigger key={it.value} value={it.value}>
						{it.label}
					</UiTabsTrigger>
				))}
			</UiTabsList>
		</UiTabs>
	);
}

// ---- Tag -------------------------------------------------------------------
interface TagProps {
	children?: ReactNode;
	className?: string;
	leftIcon?: ReactNode;
	onClick?: () => void;
	selected?: boolean;
}

export function Tag({
	selected = false,
	leftIcon,
	children,
	className,
	onClick,
}: TagProps) {
	return (
		<button
			className={cn(
				"inline-flex h-9 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-full px-4 font-semibold text-sm leading-none transition-colors",
				selected
					? SELECTED_TAG_CLASS
					: "border border-[color:var(--border-default)] bg-card text-muted-foreground",
				className
			)}
			onClick={onClick}
			type="button"
		>
			{leftIcon ? <span className="inline-flex size-4">{leftIcon}</span> : null}
			{children}
		</button>
	);
}

// ---- Switch ----------------------------------------------------------------
interface SwitchProps {
	checked?: boolean;
	className?: string;
	disabled?: boolean;
	onChange?: (checked: boolean) => void;
}

export function Switch({
	checked = false,
	onChange,
	disabled = false,
	className,
}: SwitchProps) {
	return (
		<UiSwitch
			checked={checked}
			className={className}
			disabled={disabled}
			onCheckedChange={(c) => onChange?.(c)}
		/>
	);
}

// ---- Input -----------------------------------------------------------------
interface InputProps {
	autoComplete?: string;
	className?: string;
	defaultValue?: string;
	error?: boolean;
	id?: string;
	inputClassName?: string;
	inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
	leadingIcon?: ReactNode;
	onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
	placeholder?: string;
	type?: string;
	value?: string;
}

export function Input({
	leadingIcon,
	type = "text",
	error = false,
	className,
	inputClassName,
	autoComplete,
	id,
	inputMode,
	value,
	defaultValue,
	placeholder,
	onChange,
}: InputProps) {
	if (leadingIcon) {
		return (
			<div className={cn("relative", className)}>
				<span className="absolute top-1/2 left-3 inline-flex size-5 -translate-y-1/2 text-muted-foreground">
					{leadingIcon}
				</span>
				<UiInput
					aria-invalid={error}
					aria-label={placeholder}
					autoComplete={autoComplete}
					className={cn("h-11 rounded-lg pl-10", inputClassName)}
					defaultValue={defaultValue}
					id={id}
					inputMode={inputMode}
					onChange={onChange}
					placeholder={placeholder}
					type={type}
					value={value}
				/>
			</div>
		);
	}
	return (
		<UiInput
			aria-invalid={error}
			aria-label={placeholder}
			autoComplete={autoComplete}
			className={cn("h-11 rounded-lg", className, inputClassName)}
			defaultValue={defaultValue}
			id={id}
			inputMode={inputMode}
			onChange={onChange}
			placeholder={placeholder}
			type={type}
			value={value}
		/>
	);
}

// ---- SearchField -----------------------------------------------------------
interface SearchFieldProps {
	className?: string;
	filterLabel?: string;
	onFilter?: () => void;
	placeholder?: string;
	showFilter?: boolean;
}

export function SearchField({
	placeholder = "검색",
	onFilter,
	showFilter = true,
	filterLabel,
	className,
}: SearchFieldProps) {
	return (
		<div className={cn("flex items-center gap-2.5", className)}>
			<div className="flex h-14 flex-1 items-center gap-3 rounded-lg border border-transparent bg-secondary px-[18px]">
				<span className="inline-flex size-5 text-[color:var(--text-subtle)]">
					<SearchIcon />
				</span>
				<input
					aria-label={placeholder}
					className="min-w-0 flex-1 border-none bg-transparent font-medium text-base text-foreground outline-none"
					placeholder={placeholder}
				/>
			</div>
			{showFilter && filterLabel ? (
				<button
					aria-label={filterLabel}
					className="inline-flex h-14 flex-[0_0_auto] cursor-pointer items-center gap-[7px] whitespace-nowrap rounded-lg border border-[color:var(--border-default)] bg-card px-4 font-bold text-foreground text-sm"
					onClick={onFilter}
					type="button"
				>
					<span className="inline-flex size-[18px]">
						<Filter />
					</span>
					{filterLabel}
				</button>
			) : null}
			{showFilter && !filterLabel ? (
				<button
					aria-label="필터"
					className="inline-flex h-14 w-14 flex-[0_0_56px] items-center justify-center rounded-lg border-none bg-primary text-primary-foreground shadow-lg"
					onClick={onFilter}
					type="button"
				>
					<span className="inline-flex size-[22px]">
						<Filter />
					</span>
				</button>
			) : null}
		</div>
	);
}

// ---- AppBar ----------------------------------------------------------------
interface AppBarProps {
	actions?: ReactNode;
	center?: boolean;
	className?: string;
	onBack?: () => void;
	subtitle?: ReactNode;
	title?: ReactNode;
	tone?: "default" | "inverse";
}

export function AppBar({
	title,
	subtitle,
	onBack,
	actions,
	center = false,
	tone = "default",
	className,
}: AppBarProps) {
	const fg = tone === "inverse" ? "text-white" : "text-foreground";
	const subFg =
		tone === "inverse"
			? "text-[color:var(--text-on-dark-muted)]"
			: "text-muted-foreground";
	return (
		<header
			className={cn(
				"flex h-[56px] items-center gap-3 px-2",
				tone === "inverse" ? "bg-ink-800" : "bg-transparent",
				className
			)}
		>
			{onBack ? (
				<button
					aria-label="뒤로"
					className={cn(
						"inline-flex size-10 flex-[0_0_40px] cursor-pointer items-center justify-center rounded-lg border-none",
						tone === "inverse" ? "bg-white/[0.08]" : "bg-secondary",
						fg
					)}
					onClick={onBack}
					type="button"
				>
					<span className="inline-flex size-[22px]">
						<ArrowNarrowLeft />
					</span>
				</button>
			) : (
				<span className="w-10 flex-[0_0_40px]" />
			)}
			<div
				className={cn(
					"flex min-w-0 flex-1 flex-col gap-px",
					center ? "items-center" : "items-start"
				)}
			>
				{title ? (
					<span className={cn("max-w-full truncate font-bold text-base", fg)}>
						{title}
					</span>
				) : null}
				{subtitle ? (
					<span className={cn("text-xs", subFg)}>{subtitle}</span>
				) : null}
			</div>
			<div className="flex min-w-10 flex-[0_0_auto] items-center justify-end gap-1.5">
				{actions}
			</div>
		</header>
	);
}

// ---- BottomNav -------------------------------------------------------------
interface NavItem {
	icon: IconComp;
	label: string;
	value: string;
}
interface BottomNavProps {
	badges?: Record<string, number>;
	className?: string;
	items?: NavItem[];
	onChange?: (value: string) => void;
	value?: string;
}

const DEFAULT_NAV_ITEMS: NavItem[] = [
	{ value: "home", label: "홈", icon: Home2 },
	{ value: "search", label: "탐색", icon: Search2 },
	{ value: "chat", label: "채팅", icon: Message },
	{ value: "saved", label: "저장", icon: BookmarkIcon },
	{ value: "me", label: "내 정보", icon: UserIcon },
];

export function BottomNav({
	items = DEFAULT_NAV_ITEMS,
	value = "home",
	onChange,
	badges = {},
	className,
}: BottomNavProps) {
	return (
		<nav
			className={cn(
				"flex items-stretch justify-around border-border border-t bg-card px-2 pt-2.5 pb-2",
				className
			)}
		>
			{items.map((it) => {
				const Icon = it.icon;
				const on = it.value === value;
				const count = badges[it.value];
				return (
					<button
						className={cn(
							"flex flex-1 cursor-pointer flex-col items-center gap-1 border-none bg-none px-0 py-1",
							on ? "text-primary" : "text-[color:var(--text-subtle)]"
						)}
						key={it.value}
						onClick={() => onChange?.(it.value)}
						type="button"
					>
						<span className="relative inline-flex size-6">
							<Icon />
							{count ? (
								<span className="absolute top-[-5px] right-[-8px] inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-coral-500 px-1 font-bold text-[10px] text-white shadow-[0_0_0_2px_var(--surface-card)]">
									{count}
								</span>
							) : null}
						</span>
						<span
							className={cn("text-[10px]", on ? "font-bold" : "font-medium")}
						>
							{it.label}
						</span>
					</button>
				);
			})}
		</nav>
	);
}

// ---- ChatBubble ------------------------------------------------------------
interface ChatBubbleProps {
	children?: ReactNode;
	className?: string;
	mine?: boolean;
	read?: boolean;
	time?: string;
}

export function ChatBubble({
	mine = false,
	time,
	read,
	children,
	className,
}: ChatBubbleProps) {
	return (
		<div
			className={cn(
				"flex flex-col gap-1",
				mine ? "items-end" : "items-start",
				className
			)}
		>
			<div
				className={cn(
					"max-w-[78%] break-words rounded-[18px] px-[14px] py-2.5 text-sm leading-normal",
					mine
						? "rounded-br-[6px] bg-primary text-primary-foreground"
						: "rounded-bl-[6px] bg-muted text-foreground"
				)}
			>
				{children}
			</div>
			{time ? (
				<span className="flex items-center gap-1 px-1 text-[10px] text-[color:var(--text-subtle)]">
					{mine && read ? (
						<span className="font-bold text-coral-500">읽음</span>
					) : null}
					{time}
				</span>
			) : null}
		</div>
	);
}

// ---- JobCard ---------------------------------------------------------------
interface JobCardProps {
	avatarName?: string;
	className?: string;
	featured?: boolean;
	location?: string;
	onChat?: () => void;
	onClick?: () => void;
	pay?: string;
	rating?: number;
	reviews?: number;
	title: string;
	verified?: boolean;
}

export function JobCard({
	title,
	avatarName,
	location,
	pay,
	rating,
	reviews,
	verified = false,
	featured = false,
	className,
	onClick,
	onChat,
}: JobCardProps) {
	const headFg = featured ? "text-coral-700" : "text-foreground";
	const subFg = "text-muted-foreground";
	return (
		// biome-ignore lint/a11y/useSemanticElements: 카드 내부에 채팅 버튼이 중첩되어 네이티브 button 사용 불가. tabIndex/onKeyDown으로 키보드 접근성 보장.
		<div
			className={cn(
				"flex cursor-pointer items-center gap-3 rounded-lg p-[14px]",
				featured
					? `${SELECTED_JOB_CARD_CLASS} shadow-none`
					: "border border-border bg-card text-foreground shadow-[var(--shadow-card)]",
				className
			)}
			onClick={onClick}
			onKeyDown={(e) => {
				if (e.key === "Enter" || e.key === " ") {
					e.preventDefault();
					onClick?.();
				}
			}}
			role="button"
			tabIndex={0}
		>
			<Avatar name={avatarName} size="md" square />
			<div className="flex min-w-0 flex-1 flex-col gap-1">
				<span
					className={cn("truncate font-bold text-sm leading-[1.3]", headFg)}
				>
					{title}
				</span>
				{location ? (
					<span className={cn("text-xs", subFg)}>{location}</span>
				) : null}
				<div className="flex flex-wrap items-center gap-2">
					{pay ? (
						<span className={cn("font-extrabold text-sm", headFg)}>{pay}</span>
					) : null}
					{verified ? (
						<span className="inline-flex h-5 items-center gap-[3px] whitespace-nowrap rounded-full bg-green-50 px-2 font-bold text-[10px] text-green-600">
							<span className="inline-flex size-[11px]">
								<CheckIcon />
							</span>
							인증 완료
						</span>
					) : null}
				</div>
				{typeof reviews === "number" ? (
					<div className="flex items-center gap-1.5">
						<span className="inline-flex size-[13px] text-coral-500">
							<StarIcon className="fill-coral-500" />
						</span>
						<span className={cn("text-xs", subFg)}>후기 {reviews}개</span>
						{typeof rating === "number" ? (
							<span className={cn("font-bold text-xs", headFg)}>
								{reviews > 0 ? rating.toFixed(1) : "신규"}
							</span>
						) : null}
					</div>
				) : null}
			</div>
			<button
				className={cn(
					"h-9 flex-[0_0_auto] cursor-pointer whitespace-nowrap rounded-lg px-[18px] font-bold text-sm",
					"border border-[color:var(--border-default)] bg-card text-foreground"
				)}
				onClick={(e) => {
					e.stopPropagation();
					onChat?.();
				}}
				type="button"
			>
				채팅
			</button>
		</div>
	);
}

// ---- StatGroup -------------------------------------------------------------
interface StatCell {
	label: string;
	tone?: "default" | "danger" | "primary";
	value: ReactNode;
}
interface StatGroupProps {
	className?: string;
	items: StatCell[];
}

export function StatGroup({ items, className }: StatGroupProps) {
	return (
		<div
			className={cn(
				"flex overflow-hidden rounded-lg border border-border bg-card shadow-sm",
				className
			)}
		>
			{items.map((it, i) => (
				<div
					className={cn(
						"flex flex-1 flex-col items-center gap-1 px-2 py-[14px]",
						i ? "border-border border-l" : "border-none"
					)}
					key={it.label}
				>
					<span className="font-medium text-muted-foreground text-xs">
						{it.label}
					</span>
					<span
						className={cn(
							"font-extrabold text-xl",
							it.tone === "danger" || it.tone === "primary"
								? "text-primary"
								: "text-foreground"
						)}
					>
						{it.value}
					</span>
				</div>
			))}
		</div>
	);
}

// ---- ScheduleCard ----------------------------------------------------------
type ScheduleStatus = "proposed" | "confirmed" | "declined";
const SCHEDULE_STATUS: Record<
	ScheduleStatus,
	{ tone: BadgeTone; label: string }
> = {
	proposed: { tone: "pending", label: "제안됨" },
	confirmed: { tone: "success", label: "일정 확정" },
	declined: { tone: "danger", label: "거절됨" },
};

interface ScheduleCardProps {
	byMe?: boolean;
	className?: string;
	date?: string;
	onConfirm?: () => void;
	onDecline?: () => void;
	onPropose?: () => void;
	place?: string;
	status?: ScheduleStatus;
	time?: string;
}

export function ScheduleCard({
	date,
	time,
	place,
	status = "proposed",
	byMe = false,
	onConfirm,
	onDecline,
	onPropose,
	className,
}: ScheduleCardProps) {
	const st = SCHEDULE_STATUS[status] || SCHEDULE_STATUS.proposed;
	return (
		<div
			className={cn(
				"flex w-full flex-col gap-[14px] rounded-lg border border-[color:var(--border-default)] bg-card p-4 shadow-sm",
				className
			)}
		>
			<div className="flex items-center justify-between">
				<span className="flex items-center gap-2 font-bold text-foreground text-sm">
					<span className="inline-flex size-[18px] text-coral-500">
						<ClockIcon />
					</span>
					면접 일정
				</span>
				<Badge dot tone={st.tone}>
					{st.label}
				</Badge>
			</div>
			<div className="flex flex-col gap-2 rounded-xl bg-secondary px-[14px] py-3">
				<span className="font-extrabold text-base text-foreground">{date}</span>
				<div className="flex flex-wrap gap-4">
					<span className="flex items-center gap-[5px] text-muted-foreground text-sm">
						<span className="inline-flex size-[15px]">
							<ClockIcon />
						</span>
						{time}
					</span>
					{place ? (
						<span className="flex items-center gap-[5px] text-muted-foreground text-sm">
							<span className="inline-flex size-[15px]">
								<MapPinIcon />
							</span>
							{place}
						</span>
					) : null}
				</div>
			</div>
			{renderScheduleActions({ status, byMe, onConfirm, onDecline, onPropose })}
		</div>
	);
}

function renderScheduleActions({
	status,
	byMe,
	onConfirm,
	onDecline,
	onPropose,
}: {
	status: ScheduleStatus;
	byMe: boolean;
	onConfirm?: () => void;
	onDecline?: () => void;
	onPropose?: () => void;
}) {
	if (status === "proposed") {
		if (byMe) {
			return (
				<span className="text-center text-[color:var(--text-subtle)] text-xs">
					상대방의 응답을 기다리고 있어요
				</span>
			);
		}
		return (
			<div className="flex gap-2">
				<Button block onClick={onDecline} size="md" variant="secondary">
					변경 요청
				</Button>
				<Button block onClick={onConfirm} size="md" variant="primary">
					일정 수락
				</Button>
			</div>
		);
	}
	if (status === "confirmed") {
		return (
			<span className="text-center font-semibold text-[color:var(--status-success-fg)] text-xs">
				면접 일정이 확정되었어요 · 연락처 공개 동의를 진행해 주세요
			</span>
		);
	}
	if (status === "declined" && onPropose) {
		return (
			<Button block onClick={onPropose} size="md" variant="soft">
				다른 일정 제안
			</Button>
		);
	}
	return null;
}
