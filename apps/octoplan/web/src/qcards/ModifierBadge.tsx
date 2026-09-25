import type { AnswerModifier } from "@octogent/octoplan-protocol";

export const ModifierBadge = ({ modifier }: { modifier: AnswerModifier }) => {
  if (modifier === "none") {
    return null;
  }
  return (
    <span className={`qc-badge qc-badge--${modifier}`}>
      {modifier === "parked" ? "PARKED" : "TENTATIVE"}
    </span>
  );
};
