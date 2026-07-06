import { Alert, AlertDescription } from "@bambi-app/ui/components/alert";
import { Label } from "@bambi-app/ui/components/label";
import { CircleAlert } from "lucide-react";
import type { ReactNode } from "react";

interface FieldErrorProps {
	id: string;
	message?: string;
}

interface FieldLabelProps {
	children: ReactNode;
	htmlFor: string;
	optional?: boolean;
}

interface FieldHintProps {
	children: ReactNode;
	id?: string;
}

interface FormErrorProps {
	message: null | string;
}

export function FieldLabel({ children, htmlFor, optional }: FieldLabelProps) {
	return (
		<Label htmlFor={htmlFor}>
			{children}
			{optional ? (
				<span className="font-normal text-muted-foreground text-xs">선택</span>
			) : (
				<span aria-hidden="true" className="text-destructive">
					*
				</span>
			)}
		</Label>
	);
}

export function FieldHint({ children, id }: FieldHintProps) {
	return (
		<p className="text-muted-foreground text-xs" id={id}>
			{children}
		</p>
	);
}

export function FieldError({ id, message }: FieldErrorProps) {
	if (!message) {
		return null;
	}

	return (
		<p className="text-destructive text-xs" id={id}>
			{message}
		</p>
	);
}

export function FormError({ message }: FormErrorProps) {
	if (!message) {
		return null;
	}

	return (
		<Alert variant="destructive">
			<CircleAlert />
			<AlertDescription>{message}</AlertDescription>
		</Alert>
	);
}
