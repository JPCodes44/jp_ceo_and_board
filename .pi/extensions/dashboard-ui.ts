import type { ExtensionAPI, Theme } from '@mariozechner/pi-coding-agent';
import type { Component, TUI } from '@mariozechner/pi-tui';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export default function Dashboard(pi: ExtensionAPI) {
  let selectedTeam: string | null = null;

  const getTeams = (): Record<string, string[]> => {
    try {
      // expected format in .pi/agents/teams.yaml:
      // board:
      //   - ceo
      //   - technical-architect
      const dir = join(process.cwd(), '.pi', 'agents');
      const yamlPath = join(dir, 'teams.yaml');
      const yaml = readFileSync(yamlPath, 'utf-8');

      const teamMembers: Record<string, string[]> = {};
      let currentTeam: string | null = null;

      for (const line of yaml.split('\n')) {
        const teamMatch = line.match(/^([a-z0-9-]+):\s*$/i);
        if (teamMatch) {
          currentTeam = teamMatch[1];
          teamMembers[currentTeam] = [];
          continue;
        }

        const memberMatch = line.match(/^\s*-\s*([a-z0-9-]+)\s*$/i);
        if (memberMatch && currentTeam) {
          teamMembers[currentTeam].push(memberMatch[1]);
        }
      }

      return teamMembers;
    } catch {
      return {};
    }
  };

  const getMemberLines = (member: string): string[] => {
    const dir = join(process.cwd(), '.pi', 'agents');
    const mdPath = join(dir, `${member}.md`);
    if (!existsSync(mdPath)) {
      return [];
    }
    return readFileSync(mdPath, 'utf-8').split('\n');
  };

  const getTeamPromptLines = (team: string, members: string[]): string[] => {
    const lines: string[] = [`Team members: ${members.join(', ')}`, ''];

    for (const member of members) {
      const memberLines = getMemberLines(member);
      if (memberLines.length === 0) {
        continue;
      }
      lines.push(`## ${member}`);
      lines.push(...memberLines);
      lines.push('');
    }

    if (lines.length === 2) {
      return [`Team ${team} has no configured member briefs.`];
    }

    return lines;
  };

  const dashboardWidget = (): ((tui: TUI, theme: Theme) => Component) => {
    return (_tui, theme) => {
      return {
        render(width: number): string[] {
          const border = (s: string) => theme.fg('border', s);
          const accent = (s: string) => theme.fg('accent', s);
          const muted = (s: string) => theme.fg('muted', s);

          const teams = getTeams();
          const teamNames = Object.keys(teams);
          const currentTeam =
            selectedTeam && teams[selectedTeam]
              ? selectedTeam
              : (teamNames[0] ?? null);
          const members = currentTeam ? teams[currentTeam] : [];

          const memberDocs: Record<string, string[]> = {};
          for (const member of members) {
            memberDocs[member] = getMemberLines(member);
          }

          const cardWidth = Math.max(32, Math.min(56, width - 2));
          const gap = '  ';
          const maxFitPerRow = Math.max(
            1,
            Math.floor((width + gap.length) / (cardWidth + gap.length)),
          );
          const cardsPerRow = Math.min(3, maxFitPerRow);

          const allNames = members.length > 0 ? members : ['Planner'];
          const cards = allNames.map((name) => {
            const desc = (
              memberDocs[name]?.find((line) => line.trim().length > 0) ??
              'No description available.'
            ).trim();

            const inner = cardWidth - 2;
            const line = (value: string, paint?: (s: string) => string) => {
              const padded = ` ${value}`.padEnd(inner, ' ');
              return `│${paint ? paint(padded) : padded}│`;
            };

            return [
              border(`┌${'─'.repeat(inner)}┐`),
              line(name, accent),
              line(`○ ${currentTeam ?? 'unassigned'}`, muted),
              line('[───] 0%', border),
              line(desc),
              border(`└${'─'.repeat(inner)}┘`),
            ];
          });

          const lines: string[] = [
            accent(`Team: ${currentTeam ?? 'none selected'}`),
            '',
          ];

          const height = cards[0]?.length ?? 0;
          for (let start = 0; start < cards.length; start += cardsPerRow) {
            const rowCards = cards.slice(start, start + cardsPerRow);
            for (let row = 0; row < height; row += 1) {
              lines.push(rowCards.map((card) => card[row]).join(gap));
            }
            if (start + cardsPerRow < cards.length) {
              lines.push('');
            }
          }

          return lines;
        },
        invalidate() {},
      };
    };
  };

  pi.registerCommand('team-select', {
    description: 'Select a team to view its dashboard',
    handler: async (_event, ctx) => {
      const teams = getTeams();
      const teamNames = Object.keys(teams);
      if (teamNames.length === 0) {
        return;
      }

      const selected = await ctx.ui.select('Select a team', teamNames);
      if (!selected) {
        return;
      }

      selectedTeam = selected;
      ctx.ui.setWidget('agent-dashboard', dashboardWidget(), {
        placement: 'aboveEditor',
      });

      pi.on('before_agent_start', async (_event) => {
        const currentTeams = getTeams();
        const members = currentTeams[selected] ?? [];

        return {
          systemPrompt: `${_event.systemPrompt}\n\n## Selected Team: ${selected}\n\n${getTeamPromptLines(selected, members).join('\n')}`,
        };
      });
    },
  });

  pi.on('session_start', async (_event, ctx) => {
    const teams = getTeams();
    const teamNames = Object.keys(teams);

    if (!selectedTeam || !teams[selectedTeam]) {
      selectedTeam = teamNames[0] ?? null;
    }

    ctx.ui.setWidget('agent-dashboard', dashboardWidget(), {
      placement: 'aboveEditor',
    });
  });
}
