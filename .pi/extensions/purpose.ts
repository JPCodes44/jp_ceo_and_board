import type { ExtensionAPI } from '@mariozechner/pi-coding-agent';

export default function purpose(pi: ExtensionAPI) {
  let purposeValue: string | undefined;

  pi.on('session_start', async (_event, ctx) => {
    purposeValue = await ctx.ui.input('What is the Purpose of this agent?');
  });

  pi.on('before_agent_start', (event) => {
    return {
      systemPrompt: `${event.systemPrompt} Purpose of this agent is: ${purposeValue}`,
    };
  });
}
