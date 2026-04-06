import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { ExtensionAPI } from '@mariozechner/pi-coding-agent';

export default function mode(pi: ExtensionAPI) {
  let activeAgent: { name: string; prompt: string } | null = null;

  pi.registerCommand('mode', {
    description: 'Switch agent mode',
    handler: async (_args, ctx) => {
      const agentsDir = join(process.cwd(), '.pi', 'agents');

      try {
        const agents = (await readdir(agentsDir, { withFileTypes: true }))
          .filter((d) => d.isFile() && d.name.endsWith('.md'))
          .map((d) => d.name.replace(/\.md$/, ''));

        if (agents.length === 0) {
          ctx.ui.notify('No agent files found', 'warning');
          return;
        }

        const options = ['(none - default)', ...agents];
        const selected = await ctx.ui.select('Select agent mode', options);

        if (selected === undefined) return;

        if (selected === '(none - default)') {
          activeAgent = null;
          ctx.ui.setStatus('mode', undefined);
          ctx.ui.notify('Agent mode cleared', 'info');
          return;
        }

        const content = await readFile(
          join(agentsDir, `${selected}.md`),
          'utf-8',
        );
        activeAgent = { name: selected, prompt: content };
        ctx.ui.setStatus('mode', `🤖 ${selected}`);
        ctx.ui.notify(`Switched to ${selected} mode`, 'info');
      } catch {
        ctx.ui.notify('Could not read agents directory', 'error');
      }
    },
  });

  pi.on('before_agent_start', (event) => {
    if (!activeAgent) return;
    return {
      systemPrompt: `${event.systemPrompt}\n\n---\n\n# Active Agent: ${activeAgent.name}\n\n${activeAgent.prompt}`,
    };
  });
}
