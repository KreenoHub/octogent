import type { SDKUserMessage } from "@anthropic-ai/claude-agent-sdk";

// Streaming-input mode: the SDK keeps a session alive as long as this iterable is open,
// so follow-up turns (messages, revisions) are pushed instead of starting new queries.
export type InputQueue = {
  push: (text: string) => void;
  close: () => void;
  readonly closed: boolean;
  iterable: AsyncIterable<SDKUserMessage>;
};

export const userMessage = (text: string): SDKUserMessage => ({
  type: "user",
  message: { role: "user", content: text },
  parent_tool_use_id: null,
});

export const createInputQueue = (): InputQueue => {
  const pending: SDKUserMessage[] = [];
  let wake: (() => void) | null = null;
  let closed = false;

  const notify = () => {
    const resume = wake;
    wake = null;
    resume?.();
  };

  return {
    push: (text) => {
      if (closed) return;
      pending.push(userMessage(text));
      notify();
    },
    close: () => {
      closed = true;
      notify();
    },
    get closed() {
      return closed;
    },
    iterable: {
      async *[Symbol.asyncIterator]() {
        while (true) {
          const next = pending.shift();
          if (next) {
            yield next;
            continue;
          }
          if (closed) return;
          await new Promise<void>((resolve) => {
            wake = resolve;
          });
        }
      },
    },
  };
};
