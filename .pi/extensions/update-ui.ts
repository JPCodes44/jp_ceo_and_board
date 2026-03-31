import type { ExtensionAPI } from '@mariozechner/pi-coding-agent';

export const updateUI = (pi: ExtensionAPI) => {
  pi.registerCommand('update UI', {
    description: 'say hello',
    handler: async (_args, ctx) => {
      ctx.ui.notify('Hello!');
    },
  });
};
