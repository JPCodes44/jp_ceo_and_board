import type { ExtensionAPI } from '@mariozechner/pi-coding-agent';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export default function Dashboard(pi: ExtensionAPI) {
  const getTeams = (): Record<string, string[]> => {
    try {
      const dir = join(process.cwd(), '.pi', 'agents');
      const yamlPath = join(dir, 'teams.yaml');
      const yaml = readFileSync(yamlPath, 'utf-8');

      const members = new Set<string>();
      for (const line of yaml.split('\n')) {
        const match = line.match(/^\s*-\s*([a-z0-9-]+)\s*$/i);
        if (match) {
          members.add(match[1]);
        }
      }

      const entries: Record<string, string[]> = {};
      for (const member of members) {
        const mdPath = join(dir, `${member}.md`);
        if (existsSync(mdPath)) {
          entries[member] = readFileSync(mdPath, 'utf-8').split('\n');
        }
      }

      return entries;
    } catch {
      return {};
    }
  };

  pi.registerCommand('team-select', {
    description: 'Select a team to view its dashboard',
    handler: async (_event, ctx) => {
      const teams = getTeams();
      if (teams === null) {
        return;
      }
      const selected = await ctx.ui.select('Select a team', Object.keys(teams));
      if (!selected) {
        return;
      }

      pi.on('before_agent_start', async (_event) => {
        return {
          systemPrompt: `${_event.systemPrompt}\n\n## Selected Agent: ${selected}\n\n${teams[selected]}`,
        };
      });
    },
  });

  pi.on('session_start', async (_event, ctx) => {
    const teams = getTeams();
    const names = Object.keys(teams);

    ctx.ui.setWidget(
      'agent-dashboard',
      (_tui, theme) => {
        return {
          // to keep it simple, we just render a static dashboard based on markdown files in .pi/agents
          render(width: number): string[] {
            const border = (s: string) => theme.fg('border', s);
            const accent = (s: string) => theme.fg('accent', s);
            const muted = (s: string) => theme.fg('muted', s);

            const cardWidth = Math.max(32, Math.min(56, width - 2));
            const gap = '  ';
            const visibleCount = Math.max(
              1,
              Math.floor((width + gap.length) / (cardWidth + gap.length)),
            );

            const selectedNames = names.slice(0, visibleCount);
            if (selectedNames.length === 0) {
              selectedNames.push('Planner');
            }

            const cards = selectedNames.map((name) => {
              const desc = (
                teams[name].find((line) => line.trim().length > 0) ??
                'Architecture and implementation planning'
              ).trim();

              const inner = cardWidth - 2;
              const line = (value: string, paint?: (s: string) => string) => {
                const padded = ` ${value}`.padEnd(inner, ' ');
                return `│${paint ? paint(padded) : padded}│`;
              };

              return [
                border(`┌${'─'.repeat(inner)}┐`),
                line(name, accent),
                line('○ idle', muted),
                line('[───] 0%', border),
                line(desc),
                border(`└${'─'.repeat(inner)}┘`),
              ];
            });

            const lines: string[] = [];
            const height = cards[0]?.length ?? 0;
            for (let row = 0; row < height; row += 1) {
              lines.push(cards.map((card) => card[row]).join(gap));
            }
            return lines;
          },
          invalidate() {},
        };
      },
      { placement: 'aboveEditor' },
    );
  });
}
