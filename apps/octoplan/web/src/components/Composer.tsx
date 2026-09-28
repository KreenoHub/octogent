import { type KeyboardEvent, useEffect, useRef, useState } from "react";
import { useOctoplan } from "../app/useOctoplan";

/** Text pushed into the composer from outside (e.g. "ask follow-up"); a new nonce re-applies it. */
export type ComposerPrefill = { text: string; nonce: number };

export const Composer = ({
  sessionId,
  prefill,
}: {
  sessionId: string | null;
  prefill?: ComposerPrefill | null;
}) => {
  const { sendClientEvent } = useOctoplan();
  const [text, setText] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!prefill) return;
    setText((current) => prefill.text + current);
    const input = inputRef.current;
    if (!input) return;
    input.focus();
    // Put the caret after the quote so the user types the question right away.
    requestAnimationFrame(() => input.setSelectionRange(prefill.text.length, prefill.text.length));
  }, [prefill]);

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
        ref={inputRef}
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
