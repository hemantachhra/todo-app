
export enum TaskUrgency {
  REGULAR = 'Regular',
  PRIORITY = 'Priority',
  URGENT = 'Urgent'
}

export interface Task {
  id: string;
  title: string;
  description?: string;
  date: string; // ISO String
  time: string; // HH:mm
  urgency: TaskUrgency;
  completionPercentage: number;
  notes: string;
  interimNotes?: string; // New: interim tasks pending
  category: 'routine' | '5x_speed';
  isAlarmed: boolean;
  isSnoozed: boolean;
  snoozeTime?: number;
  isCompleted: boolean;
}

export interface DailyReport {
  date: string;
  score: number;
  tasksCompleted: number;
  totalTasks: number;
  aiAnalysis?: string;
}

export interface ScoreConfig {
  completion: {
    '100': number;
    '75-99': number;
    '50-74': number;
    '25-49': number;
    '0-24': number;
  };
  multipliers: {
    [key in TaskUrgency]: number;
  };
}

export const APP_SCORE_CONFIG: ScoreConfig = {
  completion: {
    '100': 10,
    '75-99': 8,
    '50-74': 5,
    '25-49': 2,
    '0-24': 0,
  },
  multipliers: {
    [TaskUrgency.REGULAR]: 1,
    [TaskUrgency.PRIORITY]: 2,
    [TaskUrgency.URGENT]: 3,
  },
};
