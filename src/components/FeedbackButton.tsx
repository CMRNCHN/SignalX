import { useState } from "react";

interface FeedbackButtonProps {
  onSubmit: (feedback: string) => Promise<void>;
}

export function FeedbackButton({ onSubmit }: FeedbackButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitStatus, setSubmitStatus] = useState<"" | "success" | "error">("");

  const handleSubmit = async () => {
    const trimmed = feedback.trim();
    if (!trimmed) {
      setSubmitStatus("error");
      setTimeout(() => setSubmitStatus(""), 2000);
      return;
    }

    setIsSubmitting(true);
    try {
      await onSubmit(trimmed);
      setFeedback("");
      setSubmitStatus("success");
      setTimeout(() => {
        setIsOpen(false);
        setSubmitStatus("");
      }, 1000);
    } catch (err) {
      console.error("Feedback submission error:", err);
      setSubmitStatus("error");
      setTimeout(() => setSubmitStatus(""), 2000);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <button
        className="feedback-button"
        onClick={() => setIsOpen(true)}
        title="Share feedback"
        aria-label="Open feedback dialog"
      >
        💬
      </button>

      {isOpen && (
        <div className="feedback-overlay" onClick={() => setIsOpen(false)}>
          <div className="feedback-modal" onClick={(e) => e.stopPropagation()}>
            <div className="feedback-header">
              <h3>Send Feedback</h3>
              <button
                className="feedback-close"
                onClick={() => setIsOpen(false)}
                aria-label="Close feedback"
              >
                ✕
              </button>
            </div>

            <textarea
              className="feedback-textarea"
              placeholder="Describe the change you'd like to see..."
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              disabled={isSubmitting}
              autoFocus
            />

            <div className="feedback-footer">
              <button
                className="feedback-cancel"
                onClick={() => setIsOpen(false)}
                disabled={isSubmitting}
              >
                Cancel
              </button>
              <button
                className="feedback-submit"
                onClick={handleSubmit}
                disabled={isSubmitting}
              >
                {isSubmitting ? "Sending..." : "Send"}
              </button>
            </div>

            {submitStatus === "success" && (
              <div className="feedback-status success">✓ Feedback sent!</div>
            )}
            {submitStatus === "error" && (
              <div className="feedback-status error">✗ Please enter feedback</div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
