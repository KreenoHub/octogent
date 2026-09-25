import { type KeyboardEvent, useState } from "react";
import { useOctoplan } from "../app/useOctoplan";

export const Composer = ({ sessionId }: { sessionId: string | null }) => {
  const { sendClientEvent } = useOctoplan();
  const [text, setText] = useState("");

  const send = () => {
    const message = text.trim();
    if (!sessionId || !message) return;
    if (sendClientEvent({ type: "send-message", sessionId, text: message })) setText("");
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
    event.preventDefault();
    send();
  };

  return (
    <div className="op-composer">
      <textarea
        className="op-composer-input"
        aria-label="Message Claude"
        placeholder={sessionId ? "Message Claude · Enter to send, Shift+Enter for a new line" : ""}
        rows={2}
        value={text}
        disabled={!sessionId}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={onKeyDown}
      />
      <button
        type="button"
        className="op-button op-button--primary"
        disabled={!sessionId || !text.trim()}
        onClick={send}
      >
        Send
      </button>
    </div>
  );
};
