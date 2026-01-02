
import React, { useState, useEffect } from 'react';
import { Task } from '../types';

interface TaskCardProps {
  task: Task;
  onUpdate: (id: string, updates: Partial<Task>) => void;
  onDelete: (id: string) => void;
  onEdit: (task: Task) => void;
}

const TaskCard: React.FC<TaskCardProps> = ({ task, onUpdate, onDelete, onEdit }) => {
  const [progress, setProgress] = useState(task.completionPercentage);
  const [statusComment, setStatusComment] = useState(task.interimNotes || '');
  const [showConfirm, setShowConfirm] = useState(false);
  const [isUnlocked, setIsUnlocked] = useState(false);

  useEffect(() => {
    setProgress(task.completionPercentage);
  }, [task.completionPercentage]);

  useEffect(() => {
    setStatusComment(task.interimNotes || '');
  }, [task.interimNotes]);

  const commitChanges = () => {
    onUpdate(task.id, { 
      completionPercentage: progress,
      interimNotes: statusComment,
      isCompleted: progress === 100 
    });
    setIsUnlocked(false);
  };

  const hasChanges = progress !== task.completionPercentage || statusComment !== (task.interimNotes || '');

  return (
    <div className={`p-8 rounded-[2.5rem] bg-slate-900/80 border border-white/5 shadow-2xl relative transition-all duration-500 ${task.isCompleted ? 'opacity-50 grayscale scale-[0.98]' : ''}`}>
      <div className="flex justify-between items-start mb-8">
        <div className="flex-1 pr-4">
          <h3 className="text-xl font-bold text-white">{task.title}</h3>
          <p className="text-sm text-slate-500 font-black mt-2 uppercase tracking-widest">{task.time} • {task.urgency}</p>
        </div>
        <div className="flex gap-2">
          {!showConfirm ? (
            <>
              {hasChanges && <button onClick={commitChanges} className="px-4 h-12 rounded-xl bg-blue-600 text-white text-[11px] font-black uppercase">SAVE</button>}
              <button onClick={() => onEdit(task)} className="w-12 h-12 rounded-xl bg-slate-950 border border-white/5 flex items-center justify-center text-slate-400 text-[10px] font-black">EDIT</button>
              <button onClick={() => setShowConfirm(true)} className="w-12 h-12 rounded-xl bg-slate-950 border border-white/5 flex items-center justify-center text-slate-400 text-2xl">✕</button>
            </>
          ) : (
            <div className="flex gap-2 p-2 bg-slate-950 rounded-xl border border-red-500/20">
              <button onClick={() => onDelete(task.id)} className="px-3 py-1 bg-red-600 text-white text-[10px] font-black rounded-lg">DEL</button>
              <button onClick={() => setShowConfirm(false)} className="px-3 py-1 bg-slate-800 text-white text-[10px] font-black rounded-lg">ESC</button>
            </div>
          )}
        </div>
      </div>

      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <button onClick={() => setIsUnlocked(!isUnlocked)} className={`text-[10px] font-bold px-3 py-1 rounded-full border transition-all ${isUnlocked ? 'bg-blue-600 border-blue-400 text-white animate-pulse' : 'bg-slate-800 border-slate-700 text-slate-400'}`}>
            {isUnlocked ? '🔓 UNLOCKED' : '🔒 LOCKED'}
          </button>
          <span className="text-3xl font-black text-white">{progress}%</span>
        </div>
        <div className={`relative h-6 flex items-center px-1 transition-opacity duration-300 ${isUnlocked ? 'opacity-100' : 'opacity-40'}`}>
          <div className="absolute inset-0 bg-slate-950 rounded-full border border-white/5"></div>
          <div className="absolute left-0 top-0 bottom-0 rounded-full bg-blue-500" style={{ width: `${progress}%` }}></div>
          <input 
            type="range" 
            min="0" max="100" step="1"
            value={progress}
            disabled={!isUnlocked}
            onChange={(e) => setProgress(parseInt(e.target.value))}
            onPointerUp={() => setIsUnlocked(false)} // AUTO LOCK
            className="w-full h-full relative z-10 appearance-none bg-transparent cursor-pointer"
          />
        </div>
        <input 
          type="text"
          value={statusComment}
          onChange={(e) => setStatusComment(e.target.value)}
          placeholder="Status update..."
          className="w-full bg-slate-950 border border-slate-800 rounded-2xl py-4 px-5 text-slate-300 outline-none"
        />
        {hasChanges && <button onClick={commitChanges} className="w-full py-4 bg-blue-600 text-white font-black uppercase rounded-2xl">CONFIRM CHANGES</button>}
      </div>
    </div>
  );
};

export default TaskCard;
