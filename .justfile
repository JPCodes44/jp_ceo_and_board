default:
  @just --list

# g1

# 1. default pi
pi:
  pi

ext-pure-focus:
  pi -e extensions/pure-focus.ts

ext-minimal:
  pi -e extensions/minimal.ts -e extensions/theme-cycler.ts

ext-cross-agent:
  pi -e extensions/cross-agent.ts -e extensions/minimal.ts

ext-purpose-gate:
  pi -e extensions/purpose-gate.ts -e extensions/minimal.ts

ext-tool-counter:
  pi -e extensions/tool-counter.ts

ext-tool-counter-widget:
  pi -e extensions/tool-counter-widget.ts -e extensions/minimal.ts

ext-subagent-widget:
  pi -e extensions/subagent-widget.ts -e extensions/pure-focus.ts -e extensions/theme-cycler.ts



