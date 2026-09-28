import { OctoplanProvider } from "./app/useOctoplan";
import { CockpitLayout } from "./components/CockpitLayout";

export const App = () => (
  <OctoplanProvider>
    <CockpitLayout />
  </OctoplanProvider>
);
