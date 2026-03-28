export type TaskMode = "ship-task" | "repo-review" | "general";

export interface TaskModeResult {
  mode: TaskMode;
  reason: string;
}

const REVIEW_PATTERNS = [
  /\breview\b/i,
  /\baudit\b/i,
  /\bfindings\b/i,
  /\bcode review\b/i,
];

const SHIP_PATTERNS = [
  /\bimplement\b/i,
  /\bbuild\b/i,
  /\bcreate\b/i,
  /\bfix\b/i,
  /\badd\b/i,
];

export function detectTaskMode(input: string): TaskModeResult {
  if (REVIEW_PATTERNS.some((pattern) => pattern.test(input))) {
    return {
      mode: "repo-review",
      reason: "Matched review-oriented language.",
    };
  }

  if (SHIP_PATTERNS.some((pattern) => pattern.test(input))) {
    return {
      mode: "ship-task",
      reason: "Matched implementation-oriented language.",
    };
  }

  return {
    mode: "general",
    reason: "No specific task mode keywords matched.",
  };
}

export function recommendedPrompt(mode: TaskMode): string {
  switch (mode) {
    case "repo-review":
      return ".pi/prompts/review.md";
    case "ship-task":
      return ".pi/prompts/prime.md";
    default:
      return ".pi/SYSTEM.md";
  }
}
