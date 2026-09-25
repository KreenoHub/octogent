import type { ServerEvent } from "@octogent/octoplan-protocol";
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
