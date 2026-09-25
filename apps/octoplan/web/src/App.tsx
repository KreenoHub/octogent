import { useServerConnection } from "./app/useServerConnection";
import { CockpitLayout } from "./components/CockpitLayout";

export const App = () => {
  const connection = useServerConnection();
  return <CockpitLayout connection={connection} />;
};
