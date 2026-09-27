// Contract stub (D35): the integrations tentacle replaces this with pixel tentacle cards (D23).
import type { TentacleCardsSlotProps } from "../components/slots";

export const TentacleCards = ({ tentacles }: TentacleCardsSlotProps) => (
  <div className="op-tentacle-cards" data-testid="tentacle-cards">
    {tentacles.length} tentacles
  </div>
);
