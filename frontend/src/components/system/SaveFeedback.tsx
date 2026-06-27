type SaveFeedbackType = "info" | "success" | "error";

type SaveFeedbackProps = {
    type: SaveFeedbackType;
    message: string;
};

const styles: Record<SaveFeedbackType, string> = {
    info: "border-blue-200 bg-blue-50 text-blue-800",
    success: "border-green-200 bg-green-50 text-green-800",
    error: "border-red-200 bg-red-50 text-red-800",
};

export function SaveFeedback({ type, message }: SaveFeedbackProps) {
    return (
        <div
            className={`rounded border px-3 py-2 text-sm ${styles[type]}`}
            role="status"
            aria-live="polite"
        >
            {message}
        </div>
    );
}
