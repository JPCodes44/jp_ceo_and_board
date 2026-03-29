export interface TillDoneTask {
  id: string;
  text: string;
  completed: boolean;
}

export interface TillDoneState {
  tasks: TillDoneTask[];
  active: boolean;
}

export function formatTillDoneStatus(state: TillDoneState): string[] {
  if (!state.active || state.tasks.length === 0) {
    return [];
  }

  const lines = ["**Tasks:**"];
  state.tasks.forEach((task, index) => {
    const icon = task.completed ? "✓" : "☐";
    lines.push(`${index + 1}. ${icon} ${task.text}`);
  });
  return lines;
}

export function getPendingTask(state: TillDoneState): TillDoneTask | undefined {
  return state.tasks.find((t) => !t.completed);
}
