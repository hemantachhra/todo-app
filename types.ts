
export enum TaskUrgency {
  REGULAR = 'Regular',
  IMPORTANT = 'Important',
  URGENT = 'Urgent'
}

export interface SubTask {
  id: string;
  title: string;
  isCompleted: boolean;
}

export interface Task {
  id: string;
  title: string;
  description?: string;
  date: string;
  time: string;
  urgency: TaskUrgency;
  completionPercentage: number;
  notes: string;
  interimNotes?: string;
  category: 'routine' | '5x';
  isAlarmed: boolean;
  isSnoozed: boolean;
  isCompleted: boolean;
  isLocked?: boolean;
  subtasks?: SubTask[];
  repeat?: 'once' | 'daily';
  alarmOffset?: 0 | 10 | 30; // offset in minutes
}
