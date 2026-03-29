import { Type } from "@sinclair/typebox";
import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { formatTillDoneStatus, getPendingTask, type TillDoneState } from "../lib/tilldone.ts";

export default function tilldoneExtension(pi: ExtensionAPI) {
  let state: TillDoneState = { tasks: [], active: false };

  // Sync state with session entries on start
  pi.on("session_start", async (_event, ctx) => {
    const entries = ctx.sessionManager.getEntries();
    const lastState = entries
      .filter((e: any) => e.type === "custom" && e.customType === "tilldone-state")
      .pop() as any;
    if (lastState && lastState.data) {
      state = lastState.data as TillDoneState;
    }
    updateUi(ctx);
  });

  function persist() {
    pi.appendEntry("tilldone-state", state);
  }

  function updateUi(ctx: ExtensionContext) {
    if (state.active && state.tasks.length > 0) {
      const pendingCount = state.tasks.filter((t) => !t.completed).length;
      const theme = ctx.ui.theme;
      ctx.ui.setStatus(
        "tilldone",
        theme.fg("accent", `tilldone: ${state.tasks.length - pendingCount}/${state.tasks.length}`)
      );
      ctx.ui.setWidget("tilldone-list", formatTillDoneStatus(state), { placement: "aboveEditor" });
    } else {
      ctx.ui.setStatus("tilldone", undefined);
      ctx.ui.setWidget("tilldone-list", undefined);
    }
  }

  // Hook user input to activate tilldone
  pi.on("input", async (event, ctx) => {
    // Only activate on user messages (interactive/rpc) that aren't slash commands
    if (event.source !== "extension" && !event.text.startsWith("/") && !state.active) {
      state.active = true;
      state.tasks = []; // Clear old tasks for new flow
      persist();
      updateUi(ctx);
    }
    return { action: "continue" };
  });

  // Tools for the agent
  pi.registerTool({
    name: "tilldone_set_tasks",
    label: "Set Tasks",
    description:
      "Initialize or update the list of subtasks for the current request. Use this first to plan your work into manageable steps.",
    parameters: Type.Object({
      tasks: Type.Array(Type.String(), { description: "The list of subtasks to complete sequentially." }),
    }),
    async execute(_id, params, _signal, _onUpdate, ctx) {
      // Ask user for approval if updating an existing list midway
      if (state.tasks.length > 0 && ctx.hasUI) {
        const approved = await ctx.ui.confirm(
          "Update Task List?",
          "The agent wants to replace the current TILLDONE task list with a new one. Do you approve?"
        );
        if (!approved) {
          return {
            content: [{ type: "text", text: "Task list update was denied by the user." }],
            details: { rejectedTasks: params.tasks },
            isError: true,
          };
        }
      }

      state.tasks = params.tasks.map((text, i) => ({ id: String(i), text, completed: false }));
      state.active = true;
      persist();
      updateUi(ctx);
      return {
        content: [{ type: "text", text: `Tasks set: ${params.tasks.length} subtasks identified.` }],
        details: { tasks: params.tasks },
        isError: false,
      };
    },
  });

  pi.registerTool({
    name: "tilldone_complete_task",
    label: "Complete Task",
    description: "Mark the current active subtask as completed.",
    parameters: Type.Object({}),
    async execute(_id, _params, _signal, _onUpdate, ctx) {
      const pending = getPendingTask(state);
      if (pending) {
        pending.completed = true;
        persist();
        updateUi(ctx);
        const next = getPendingTask(state);
        return {
          content: [
            {
              type: "text",
              text: `Task "${pending.text}" completed.${
                next ? ` Next: ${next.text}` : " All tasks finished!"
              }`,
            },
          ],
          details: { completedTask: pending.text, nextTask: next?.text },
          isError: false,
        };
      }
      return { content: [{ type: "text", text: "No pending tasks found." }], details: {}, isError: true };
    },
  });

  // Block commands without tasks defined
  pi.on("tool_call", async (event) => {
    if (event.toolName === "bash" && state.active && state.tasks.length === 0) {
      return {
        block: true,
        reason:
          "TILLDONE: You must define subtasks using `tilldone_set_tasks` before running executable commands.",
      };
    }
  });

  // Inject guidance context before agent starts
  pi.on("before_agent_start", async () => {
    if (state.active) {
      let content = "[TILLDONE MODE ACTIVE]\n";
      if (state.tasks.length === 0) {
        content += "You MUST first break the user request into sequential subtasks using `tilldone_set_tasks`.";
      } else {
        const pending = getPendingTask(state);
        if (pending) {
          content += `Progress: ${state.tasks.filter((t) => t.completed).length}/${state.tasks.length}.\n`;
          content += `Next subtask to work on: "${pending.text}".\n`;
          content += "Once you have completed this step, you MUST call `tilldone_complete_task` and then end your turn.";
        }
      }
      return {
        message: { customType: "tilldone-context", content, display: false },
      };
    }
  });

  // Auto-looping and cleanup
  pi.on("agent_end", async (event, ctx) => {
    if (!state.active) return;

    const pending = getPendingTask(state);
    if (pending) {
      // Trigger next turn
      pi.sendMessage(
        {
          customType: "tilldone-followup",
          content: `Continuing with next task: "${pending.text}"...`,
          display: true,
        },
        { triggerTurn: true, deliverAs: "followUp" }
      );
    } else if (state.tasks.length > 0) {
      // Everything done
      state.active = false;
      persist();
      updateUi(ctx);
      pi.sendMessage({
        customType: "tilldone-finished",
        content: "### All Tasks Completed! ✓",
        display: true,
      });
    }
  });

  // Stop command
  pi.registerCommand("tilldone-stop", {
    description: "Deactivate the TILLDONE flow and clear the task list.",
    handler: async (_args, ctx) => {
      state.active = false;
      state.tasks = [];
      persist();
      updateUi(ctx);
      ctx.ui.notify("TILLDONE flow stopped.", "info");
    },
  });
}
