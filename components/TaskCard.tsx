
import React, { useState, useEffect } from 'react';
import { Task, SubTask } from '../types';

interface TaskCardProps {
  task: Task;
  onUpdate: (id: string, updates: Partial<Task>) => void;
  onDelete: (id: string) => void;
  onEdit: (task: Task) => void;
  onFocus: (task: Task) => void;
}

const TaskCard: React.FC<TaskCardProps> = ({ task, onUpdate, onDelete, onEdit, onFocus }) => {
  const [progress, setProgress] = useState(task.completionPercentage);

  useEffect(() => { setProgress(task.completionPercentage); }, [task.completionPercentage]);

  const urgencyColors = {
    Regular: 'text-blue-400 border-blue-500/20 bg-blue-500/10',
    Important: 'text-white border-pink-400/30 bg-pink-600',
    Urgent: 'text-white border-orange-500/30 bg-orange-700'
  };

  const categoryColors = {
    'routine': 'bg-blue-600 border-blue-400',
    '5x': 'bg-red-400 border-red-300'
  };

  return (
    <div className={`p-6 rounded-[2.5rem] bg-slate-900/80 border transition-all duration-500 ${task.isCompleted ? 'opacity-40 grayscale' : ''} ${task.isLocked ? 'border-white/5 shadow-inner' : 'border-blue-500/40 shadow-[0_0_15px_rgba(59,130,246,0.1)]'}`}>
      <div className="flex justify-between items-start mb-4">
        <div className="flex-1 pr-2">
          <div className="flex items-center gap-2 mb-2 flex-wrap">
             <span className={`px-2 py-1 rounded text-[9px] font-black uppercase tracking-widest border text-white ${categoryColors[task.category as keyof typeof categoryColors]}`}>
               {task.category === '5x' ? '5X Speed' : 'Routine'}
             </span>
             <span className={`px-2 py-1 rounded text-[9px] font-black uppercase tracking-widest border ${urgencyColors[task.urgency as keyof typeof urgencyColors]}`}>
               {task.urgency}
             </span>
             {task.isAlarmed && !task.isCompleted && (
               <span className="text-[12px] animate-pulse">🔔</span>
             )}
          </div>
          <h3 className="text-xl font-black italic tracking-tight text-white leading-tight">{task.title}</h3>
          <p className="text-[12px] font-bold text-slate-500 mt-1 uppercase tracking-[0.2em]">{task.time} {task.repeat === 'daily' ? '• DAILY' : ''}</p>
        </div>
        <div className="flex gap-2">
          <button 
            onClick={() => onEdit(task)} 
            className="w-10 h-10 rounded-xl bg-slate-950 flex items-center justify-center border border-white/5 text-slate-400 hover:text-blue-400 active:scale-90 transition-all"
          >
            ✏️
          </button>
          <button 
            onClick={() => onDelete(task.id)} 
            className="w-10 h-10 rounded-xl bg-slate-950 flex items-center justify-center border border-white/5 text-slate-600 hover:text-red-400 active:scale-90 transition-all"
          >
            ✕
          </button>
        </div>
      </div>

      <div className="space-y-4">
        <div className="flex justify-between items-end px-1 mb-2">
          <div className="flex flex-col gap-1">
            <button 
                onClick={() => onUpdate(task.id, { isLocked: !task.isLocked })}
                className={`flex items-center gap-2 text-[13px] font-black uppercase tracking-widest transition-all ${task.isLocked ? 'text-slate-600' : 'text-blue-400 hover:text-blue-300'}`}
             >
               <div className="w-5 h-5 flex items-center justify-center">
                 <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
                   <rect x="5" y="11" width="14" height="10" rx="2" stroke="currentColor" strokeWidth="2.5" />
                   <circle cx="12" cy="16" r="1.2" fill="currentColor" />
                   {task.isLocked ? (
                     <path d="M8 11V7C8 4.79086 9.79086 3 12 3C14.2091 3 16 4.79086 16 11" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
                   ) : (
                     <path d="M7 11V4C7 2.34315 8.34315 1 10 1C11.6569 1 13 2.34315 13 4" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="origin-bottom transform -translate-y-4 -translate-x-1.5 -rotate-[35deg]" />
                   )}
                 </svg>
               </div>
               {task.isLocked ? 'Secured' : 'Unlocked to Edit'}
             </button>
             {!task.isCompleted && (
               <button 
                 onClick={() => onFocus(task)}
                 className="flex items-center gap-2 text-[11px] font-black uppercase tracking-widest text-slate-500 hover:text-blue-400 transition-colors ml-1"
               >
                 <span>🎯</span> Focus Protocol
               </button>
             )}
          </div>
          <div className="flex flex-col items-end">
             <span className="text-2xl font-black text-white italic leading-none">{progress}%</span>
             <span className="text-[10px] font-black text-slate-600 uppercase tracking-widest mt-0.5">Progress</span>
          </div>
        </div>

        <div className="relative h-4 flex items-center px-1">
          <div className="absolute inset-0 bg-slate-950 rounded-full border border-white/5 shadow-inner"></div>
          <div className="absolute left-0 top-0 bottom-0 rounded-full bg-gradient-to-r from-blue-700 to-blue-400 transition-all duration-1000 shadow-[0_0_10px_rgba(59,130,246,0.3)]" style={{ width: `${progress}%` }}></div>
          <input 
            type="range" 
            min="0" 
            max="100" 
            value={progress} 
            disabled={task.isCompleted || task.isLocked}
            onChange={(e) => setProgress(parseInt(e.target.value))} 
            onPointerUp={() => onUpdate(task.id, { completionPercentage: progress, isCompleted: progress === 100, isLocked: true })} 
            className={`w-full h-full relative z-10 appearance-none bg-transparent cursor-pointer touch-none`}
            style={{ WebkitAppearance: 'none' }}
          />
        </div>
      </div>
    </div>
  );
};

export default TaskCard;
