import { useExpandable } from "../app/expandAll";
import { type ToolBlock, shortToolName, summarizeTools } from "../app/streamView";

export const ToolRow = ({ tool }: { tool: ToolBlock }) => (
  <div className="op-tool-row" data-testid="tool-row" title={tool.summary}>
    <span className="op-tool-name">{shortToolName(tool.name)}</span>
    <span className="op-tool-summary">{tool.summary}</span>
  </div>
);

/** D19: a run of tool calls as one summary row ("Read 4 files, recorded 3 decisions"). */
export const ToolGroupRow = ({ tools }: { tools: ToolBlock[] }) => {
  const [collapsed, toggle] = useExpandable(true);
  return (
    <div className="op-tool-group" data-testid="tool-group">
      <button
        type="button"
        className="op-tool-group-toggle"
        aria-expanded={!collapsed}
        onClick={toggle}
      >
        <span className="op-tool-group-count">{tools.length} tools</span>
        <span className="op-tool-summary">{summarizeTools(tools)}</span>
      </button>
      {collapsed ? null : (
        <div className="op-tool-group-rows">
          {tools.map((tool) => (
            <ToolRow key={tool.id} tool={tool} />
          ))}
        </div>
      )}
    </div>
  );
};
