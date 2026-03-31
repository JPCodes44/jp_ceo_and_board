import type { ExtensionAPI } from '@mariozechner/pi-coding-agent';
import { Type } from '@sinclair/typebox';

export default function (pi: ExtensionAPI) {
  pi.on('session_start', async (_event, ctx) => {
    ctx.ui.notify('session started');
  });
}
