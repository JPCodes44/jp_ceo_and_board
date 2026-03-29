import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Key } from "@mariozechner/pi-tui";

import { getNextThemeName, getPreferredThemeNames } from "../lib/theme-cycle.ts";

export default function themeCycleExtension(pi: ExtensionAPI) {
  pi.registerShortcut(Key.ctrl("x"), {
    description: "Cycle Pi theme",
    handler: async (ctx) => {
      if (!ctx.hasUI) {
        return;
      }

      const themeNames = ctx.ui.getAllThemes().map((theme) => theme.name);
      const preferredThemeNames = getPreferredThemeNames(themeNames);
      const nextTheme = getNextThemeName(themeNames, ctx.ui.theme.name);
      if (!nextTheme) {
        ctx.ui.notify(
          "No preferred themes are available. Reload Pi to load .pi/themes.",
          "warning",
        );
        return;
      }

      const result = ctx.ui.setTheme(nextTheme);
      if (!result.success) {
        ctx.ui.notify(result.error ?? `Failed to switch to theme \"${nextTheme}\".`, "error");
        return;
      }

      ctx.ui.notify(`Theme: ${nextTheme} (${preferredThemeNames.join(" → ")})`, "info");
    },
  });
}
