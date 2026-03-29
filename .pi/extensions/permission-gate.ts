import {
  isToolCallEventType,
  type ExtensionAPI,
  type ToolCallEventResult,
} from "@mariozechner/pi-coding-agent";

const DANGEROUS_COMMAND_PATTERNS = [
  /\brm\s+-rf\b/i,
  /\bgit\s+push\b/i,
  /\bgit\s+reset\s+--hard\b/i,
  /\bgit\s+clean\s+-fd\b/i,
  /\bsudo\b/i,
  /\bnpm\s+publish\b/i,
];

function shouldGateCommand(command: string): boolean {
  return DANGEROUS_COMMAND_PATTERNS.some((pattern) => pattern.test(command));
}

export default function permissionGateExtension(pi: ExtensionAPI) {
  pi.on("tool_call", async (event, ctx): Promise<ToolCallEventResult | undefined> => {
    if (!isToolCallEventType("bash", event)) {
      return undefined;
    }

    const command = event.input.command.trim();
    if (!shouldGateCommand(command)) {
      return undefined;
    }

    if (!ctx.hasUI) {
      return {
        block: true,
        reason: "Risky bash command blocked because no interactive approval UI is available.",
      };
    }

    const approved = await ctx.ui.confirm("Approve risky command?", command);
    if (approved) {
      return undefined;
    }

    return {
      block: true,
      reason: "User denied risky bash command.",
    };
  });
}

export { DANGEROUS_COMMAND_PATTERNS, shouldGateCommand };
