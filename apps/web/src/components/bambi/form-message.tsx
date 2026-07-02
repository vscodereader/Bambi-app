import { Alert, AlertDescription } from "@bambi-app/ui/components/alert";
import { CircleAlert } from "lucide-react";

interface FieldErrorProps {
	id: string;
	message?: string;
}

interface FormErrorProps {
	message: null | string;
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
