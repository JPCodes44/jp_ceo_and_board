import { isToolCallEventType, type ExtensionAPI } from "@mariozechner/pi-coding-agent";

import {
  DEFAULT_PROTECTED_PATHS,
  isProtectedPath,
} from "../lib/protected-paths.ts";

function blockReason(targetPath: string): string {
  return `Path \"${targetPath}\" is protected by local repo policy.`;
}

export default function protectedPathsExtension(pi: ExtensionAPI) {
  const root = process.cwd();

  pi.on("tool_call", async (event, ctx) => {
    if (isToolCallEventType("write", event) || isToolCallEventType("edit", event)) {
      const targetPath = event.input.path;

      if (!isProtectedPath(root, targetPath, DEFAULT_PROTECTED_PATHS)) {
        return undefined;
      }

      if (ctx.hasUI) {
        ctx.ui.notify(`Blocked write to protected path: ${targetPath}`, "warning");
      }

      return {
        block: true,
        reason: blockReason(targetPath),
      };
    }

    return undefined;
  });
}
