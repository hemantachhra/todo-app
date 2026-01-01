
import React, { useState, useEffect } from 'react';
import { Task, TaskUrgency } from '../types';

interface TaskCardProps {
  task: Task;
  onUpdate: (id: string, updates: Partial<Task>) => void;
  onDelete: (id: string) => void;
}

const TaskCard: React.FC<TaskCardProps> = ({ task, onUpdate, onDelete }) => {
  const [internalValue, setInternalValue] = useState(task.completionPercentage);
  const [isDirty, setIsDirty] = useState(false);

  useEffect(() => {
    setInternalValue(task.completionPercentage);
    setIsDirty(false);
  }, [task.completionPercentage]);

  const getUrgencyColor = (urgency: TaskUrgency) => {
    switch (urgency) {
      case TaskUrgency.URGENT: return 'border-red-500 text-red-400';
      case TaskUrgency.PRIORITY: return 'border-orange-500 text-orange-400';
      default: return 'border-blue-500 text-blue-400';
    }
  };

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseInt(e.target.value);
    setInternalValue(val);
    setIsDirty(val !== task.completionPercentage);
  };

  const handleCommit = () => {
    onUpdate(task.id, { 
      completionPercentage: internalValue,
      isCompleted: internalValue === 100 
    });
    setIsDirty(false);
  };

  const handleReset = () => {
    setInternalValue(task.completionPercentage);
    setIsDirty(false);
  };

  return (
    <div className={`glass p-5 rounded-[2.5rem] border-l-4 ${getUrgencyColor(task.urgency)} mb-4 animate-in fade-in slide-in-from-bottom-4 shadow-xl border-t border-r border-b border-white/5 relative overflow-hidden`}>
      <div className="flex justify-between items-start mb-4">
        <div className="flex-1 mr-4">
          <h3 className="text-xl font-black italic tracking-tighter text-slate-100">{task.title}</h3>
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mt-1">{task.time} • {task.urgency} GRADE</p>
        </div>
        <button 
          onClick={() => onDelete(task.id)}
          className="w-8 h-8 rounded-xl bg-slate-900 flex items-center justify-center text-slate-600 hover:text-red-400 border border-white/5 transition-colors"
        >
          ✕
        </button>
      </div>

      <div className="mt-4 space-y-3">
        <div className="flex justify-between items-end text-[10px] font-black uppercase tracking-[0.2em] mb-1">
          <span className="text-slate-500">Target Level</span>
          <span className={`${isDirty ? 'text-orange-400 animate-pulse' : 'text-blue-400'} neo-text-glow`}>
            {internalValue}% {isDirty && '(Unsynced)'}
          </span>
        </div>
        
        <div className="relative pt-1">
          <input 
            type="range" 
            min="0" 
            max="100" 
            value={internalValue}
            onChange={handleSliderChange}
            className="w-full h-2 bg-slate-900 rounded-full appearance-none cursor-pointer accent-blue-500 border border-white/5"
          />
        </div>

        {isDirty && (
          <div className="flex gap-2 animate-in slide-in-from-top-2 duration-300">
            <button 
              onClick={handleCommit}
              className="flex-1 py-3 bg-blue-600/20 border border-blue-500/40 rounded-xl text-[9px] font-black text-blue-300 uppercase tracking-widest active:bg-blue-600/40"
            >
              Commit Progress
            </button>
            <button 
              onClick={handleReset}
              className="px-4 py-3 bg-slate-900 border border-slate-800 rounded-xl text-[9px] font-black text-slate-500 uppercase tracking-widest"
            >
              Reset
            </button>
          </div>
        )}
      </div>
      
      {task.isCompleted && !isDirty && (
        <div className="mt-4 pt-4 border-t border-green-500/10 flex items-center justify-center gap-2">
          <span className="text-[10px] font-black uppercase tracking-[0.3em] text-green-400 italic">Protocol Completed</span>
          <span className="text-sm">⚡</span>
        </div>
      )}
    </div>
  );
};

export default TaskCard;
