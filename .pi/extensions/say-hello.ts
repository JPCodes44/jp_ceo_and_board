import type { ExtensionAPI } from '@mariozechner/pi-coding-agent';

export default function (pi: ExtensionAPI) {
  pi.registerCommand('say-hello', {
    description: 'say hello',
    handler: async (_args, ctx) => {
      ctx.ui.notify('Hello!');
    },
  });
}
