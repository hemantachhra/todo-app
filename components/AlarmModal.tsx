
import React, { useEffect, useState } from 'react';
import { Task } from '../types';

interface AlarmModalProps {
  task: Task;
  onStop: (id: string) => void;
  onSnooze: (id: string, minutes: number) => void;
  onPostpone: (id: string, newDate: string, newTime: string) => void;
}

const AlarmModal: React.FC<AlarmModalProps> = ({ task, onStop, onSnooze, onPostpone }) => {
  const [pulse, setPulse] = useState(false);
  const [view, setView] = useState<'alert' | 'reschedule'>('alert');
  const [newDate, setNewDate] = useState(task.date);
  const [newTime, setNewTime] = useState(task.time);

  useEffect(() => {
    const interval = setInterval(() => setPulse(p => !p), 1000);
    return () => clearInterval(interval);
  }, []);

  const handlePostponeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onPostpone(task.id, newDate, newTime);
  };

  if (view === 'reschedule') {
    return (
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 glass backdrop-blur-3xl animate-in fade-in duration-300">
        <div className="w-full max-w-md p-8 rounded-[2.5rem] border border-blue-500/30 bg-slate-950 shadow-2xl">
          <h2 className="text-xl font-black italic uppercase tracking-tighter mb-6 text-blue-400">Reschedule Protocol</h2>
          <form onSubmit={handlePostponeSubmit} className="space-y-6">
            <div>
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-2">New Target Date</label>
              <input 
                type="date" 
                value={newDate} 
                onChange={(e) => setNewDate(e.target.value)}
                className="w-full bg-slate-900 border border-slate-800 rounded-2xl p-4 text-sm [color-scheme:dark] outline-none focus:border-blue-500 text-white"
              />
            </div>
            <div>
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-2">New Target Time</label>
              <input 
                type="time" 
                value={newTime} 
                onChange={(e) => setNewTime(e.target.value)}
                className="w-full bg-slate-900 border border-slate-800 rounded-2xl p-4 text-sm [color-scheme:dark] outline-none focus:border-blue-500 text-white"
              />
            </div>
            <div className="pt-4 space-y-3">
              <button type="submit" className="w-full py-4 bg-blue-600 text-white font-black rounded-2xl uppercase text-xs tracking-widest shadow-lg shadow-blue-900/40">Confirm Postpone</button>
              <button type="button" onClick={() => setView('alert')} className="w-full py-2 text-slate-500 text-[10px] font-black uppercase tracking-widest">Back</button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 glass backdrop-blur-2xl animate-in zoom-in-95 duration-300">
      <div className={`w-full max-w-md p-8 rounded-[3rem] border-2 transition-all duration-500 flex flex-col items-center gap-6 text-center ${
        pulse ? 'border-red-500 bg-red-500/10 shadow-[0_0_80px_rgba(239,68,68,0.4)]' : 'border-blue-500 bg-blue-500/10 shadow-[0_0_40px_rgba(59,130,246,0.2)]'
      }`}>
        <div className="w-24 h-24 rounded-full bg-slate-950 flex items-center justify-center animate-pulse border border-white/5 shadow-inner">
          <span className="text-5xl">🚨</span>
        </div>
        
        <div className="w-full">
          <p className="text-blue-400 uppercase tracking-[0.3em] text-[10px] font-black mb-2 italic">Urgent Mission Alert</p>
          <div className="bg-slate-950 p-6 rounded-[2rem] border border-white/5 shadow-inner mb-4">
            <h2 className="text-2xl font-black italic tracking-tighter text-white break-words">{task.title}</h2>
          </div>
          <div className="px-4 py-2 bg-slate-900/80 rounded-full border border-white/5 inline-flex items-center gap-3">
             <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></span>
             <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest">{task.urgency} • Target: {task.time}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 w-full mt-4">
          <button 
            onClick={() => onStop(task.id)}
            className="py-6 bg-gradient-to-r from-green-500 to-emerald-600 text-black font-black rounded-[1.8rem] uppercase text-sm tracking-widest shadow-xl active:scale-95 transition-all"
          >
            Acknowledge & Start
          </button>
          
          <div className="grid grid-cols-2 gap-3">
            <button 
              onClick={() => onSnooze(task.id, 5)}
              className="py-4 bg-slate-900 border border-slate-800 text-white text-[10px] font-black rounded-2xl uppercase tracking-widest hover:bg-slate-800"
            >
              Snooze (5m)
            </button>
            <button 
              onClick={() => onSnooze(task.id, 30)}
              className="py-4 bg-indigo-900/40 border border-indigo-500/30 text-indigo-300 text-[10px] font-black rounded-2xl uppercase tracking-widest hover:bg-indigo-900/60 shadow-lg shadow-indigo-900/20"
            >
              Snooze (30m)
            </button>
          </div>

          <button 
            onClick={() => setView('reschedule')}
            className="py-4 bg-slate-900/50 border border-dashed border-slate-700 text-slate-500 text-[10px] font-black rounded-2xl uppercase tracking-widest hover:text-blue-400 hover:border-blue-500/50 transition-all"
          >
            Postpone Protocol
          </button>
        </div>

        <p className="text-slate-600 text-[9px] font-bold uppercase tracking-[0.2em] mt-2 italic">Looping Audio Protocol Active</p>
      </div>
    </div>
  );
};

export default AlarmModal;