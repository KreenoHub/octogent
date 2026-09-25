import type { ServerEvent } from "@octogent/octoplan-protocol";
import { fireEvent, within } from "@testing-library/react";
import { act, render } from "@testing-library/react";
import type { ReactNode } from "react";
import { createFakeTransport } from "../../web/src/app/transport";
import { OctoplanProvider } from "../../web/src/app/useOctoplan";
import { CockpitLayout } from "../../web/src/components/CockpitLayout";

/** Renders the full cockpit on a fake event feed. */
export const renderCockpit = (extra?: ReactNode) => {
  const transport = createFakeTransport();
  const view = render(
    <OctoplanProvider transport={transport}>
      <CockpitLayout />
      {extra}
    </OctoplanProvider>,
  );
  const emit = (...events: ServerEvent[]) =>
    act(() => {
      for (const event of events) transport.emit(event);
    });
  return { ...view, transport, emit };
};

/** Answers every question in the real QuestionRoundCard with its first option, by keyboard. */
export const answerFirstOptions = (scope: HTMLElement) => {
  const card = within(scope).getByRole("form", { name: /question round/i });
  card.focus();
  const count = card.querySelectorAll('[data-testid^="qc-question-"]').length;
  for (let index = 0; index < count; index++) {
    fireEvent.keyDown(card, { key: "1" });
    if (index < count - 1) fireEvent.keyDown(card, { key: "Tab" });
  }
  fireEvent.keyDown(card, { key: "Enter" });
};
