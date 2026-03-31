import type { ExtensionAPI } from '@mariozechner/pi-coding-agent';
import { Type } from '@sinclair/typebox';

export default function echoTool(pi: ExtensionAPI) {
  pi.registerTool({
    name: 'echo-tool',
    label: 'echo text',
    description: 'echos data back to the user',
    parameters: Type.Object({
      message: Type.String({ description: 'Message to echo' }),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
      return {
        content: [{ type: 'text', text: `Echo ${params.message}` }],
        details: {},
      };
    },
  });
}
