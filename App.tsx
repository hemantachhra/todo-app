
import React, { useState, useEffect, useRef } from 'react';
import { Task, TaskUrgency } from './types';
import BottomNav from './components/BottomNav';
import TaskCard from './components/TaskCard';
import AlarmModal from './components/AlarmModal';
import { GeminiService, connectTaskEntryAPI } from './geminiService';
import { decode, decodeAudioData, createBlob } from './audioUtils';

// Helper for AudioContext polyfill
const AudioContextClass = (window as any).AudioContext || (window as any).webkitAudioContext;

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState('routine');
  const [tasks, setTasks] = useState<Task[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('tasks') || '[]');
    } catch (e) {
      return [];
    }
  });
  const [lastDeletedTask, setLastDeletedTask] = useState<Task | null>(null);
  const [showTaskForm, setShowTaskForm] = useState(false);
  const [isAiMode, setIsAiMode] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [activeAlarmTask, setActiveAlarmTask] = useState<Task | null>(null);
  
  // Form State
  const [formObjective, setFormObjective] = useState('');
  const [formDate, setFormDate] = useState(new Date().toISOString().split('T')[0]);
  const [formTime, setFormTime] = useState(new Date().toTimeString().slice(0, 5));
  const [formUrgency, setFormUrgency] = useState<TaskUrgency>(TaskUrgency.REGULAR);
  const [formCategory, setFormCategory] = useState<'routine' | '5x'>('routine');
  const [alarmEnabled, setAlarmEnabled] = useState(false);
  const [formRepeat, setFormRepeat] = useState<'once' | 'daily'>('once');
  const [alarmOffset, setAlarmOffset] = useState<0 | 10 | 30>(0);

  // Focus Mode State
  const [focusedTask, setFocusedTask] = useState<Task | null>(null);
  const [timerSeconds, setTimerSeconds] = useState(1500); 
  const [isTimerActive, setIsTimerActive] = useState(false);

  // AI Assistant State
  // FIXED: Changed category type from 'routine' as const to 'routine' as 'routine' | '5x' to allow state sync
  const formRef = useRef({ objective: '', date: '', time: '', urgency: TaskUrgency.REGULAR, category: 'routine' as 'routine' | '5x', alarm: false });
  const objectiveInputRef = useRef<HTMLTextAreaElement>(null);
  const [isAiAssistActive, setIsAiAssistActive] = useState(false);
  const [riaStatus, setRiaStatus] = useState<'IDLE' | 'LISTENING' | 'SPEAKING'>('IDLE');
  const [assistTranscript, setAssistTranscript] = useState('');
  const [transcriptBuffer, setTranscriptBuffer] = useState('');
  const [micVolume, setMicVolume] = useState(0);

  // Coach State
  const [coachingAdvice, setCoachingAdvice] = useState<{text: string, sources: any[]} | null>(null);
  const [isAdviceLoading, setIsAdviceLoading] = useState(false);

  const sessionRef = useRef<any>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const outAudioContextRef = useRef<AudioContext | null>(null);
  const nextStartTimeRef = useRef(0);
  const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const visualizerIntervalRef = useRef<number | null>(null);
  const timerIntervalRef = useRef<number | null>(null);

  // Sync tasks to local storage
  useEffect(() => {
    localStorage.setItem('tasks', JSON.stringify(tasks));
  }, [tasks]);

  // Sync form state to ref for AI logic
  useEffect(() => {
    formRef.current = { 
      objective: formObjective, 
      date: formDate, 
      time: formTime, 
      urgency: formUrgency, 
      category: formCategory, 
      alarm: alarmEnabled 
    };
  }, [formObjective, formDate, formTime, formUrgency, formCategory, alarmEnabled]);

  // Auto-focus logic for manual plus button
  useEffect(() => {
    if (showTaskForm && !isAiMode) {
      const timer = setTimeout(() => {
        if (objectiveInputRef.current) {
          objectiveInputRef.current.focus();
        }
      }, 400);
      return () => clearTimeout(timer);
    }
  }, [showTaskForm, isAiMode]);

  // Alarm Check Logic
  useEffect(() => {
    const checkAlarms = () => {
      const now = new Date();
      const currentDate = now.toISOString().split('T')[0];
      
      const triggeredTask = tasks.find(t => {
        if (!t.isAlarmed || t.isCompleted || t.isSnoozed) return false;
        
        const isDateMatch = t.repeat === 'daily' || t.date === currentDate;
        if (!isDateMatch) return false;

        const [h, m] = t.time.split(':').map(Number);
        const alarmDate = new Date();
        alarmDate.setHours(h, m, 0, 0);
        
        const finalAlarmTime = new Date(alarmDate.getTime() - (t.alarmOffset || 0) * 60000);
        
        return (now.getHours() === finalAlarmTime.getHours() && now.getMinutes() === finalAlarmTime.getMinutes());
      });

      if (triggeredTask && !activeAlarmTask) {
        setActiveAlarmTask(triggeredTask);
      }
    };

    const interval = setInterval(checkAlarms, 1000);
    return () => clearInterval(interval);
  }, [tasks, activeAlarmTask]);

  // Timer Logic
  useEffect(() => {
    if (isTimerActive && timerSeconds > 0) {
      timerIntervalRef.current = window.setInterval(() => setTimerSeconds(s => s - 1), 1000);
    } else if (timerSeconds === 0) {
      setIsTimerActive(false);
    }
    return () => { if (timerIntervalRef.current) clearInterval(timerIntervalRef.current); };
  }, [isTimerActive, timerSeconds]);

  // Fetch coach advice when the AI tab is selected
  useEffect(() => {
    if (activeTab === 'ai' && !coachingAdvice) {
      fetchCoachAdvice();
    }
  }, [activeTab]);

  const resetFormFields = () => {
    setFormObjective('');
    setFormDate(new Date().toISOString().split('T')[0]);
    setFormTime(new Date().toTimeString().slice(0, 5));
    setFormUrgency(TaskUrgency.REGULAR);
    setFormCategory('routine');
    setAlarmEnabled(false);
    setFormRepeat('once');
    setAlarmOffset(0);
    setEditingTask(null);
  };

  const startManualEdit = (task: Task) => {
    setFormObjective(task.title);
    setFormDate(task.date);
    setFormTime(task.time);
    setFormUrgency(task.urgency);
    setFormCategory(task.category as 'routine' | '5x');
    setAlarmEnabled(task.isAlarmed);
    setFormRepeat(task.repeat || 'once');
    setAlarmOffset(task.alarmOffset || 0);
    setEditingTask(task);
    setIsAiMode(false);
    setShowTaskForm(true);
  };

  const stopVoiceSession = () => {
    setIsAiAssistActive(false);
    setRiaStatus('IDLE');
    setMicVolume(0);
    if (visualizerIntervalRef.current) cancelAnimationFrame(visualizerIntervalRef.current);
    if (sessionRef.current) { try { sessionRef.current.close(); } catch(e){} sessionRef.current = null; }
    if (audioContextRef.current) { audioContextRef.current.close().catch(()=>{}); audioContextRef.current = null; }
    if (outAudioContextRef.current) { outAudioContextRef.current.close().catch(()=>{}); outAudioContextRef.current = null; }
    sourcesRef.current.forEach(s => { try { s.stop(); } catch(e){} });
    sourcesRef.current.clear();
  };

  const startAiAssistantSession = async () => {
    if (isAiAssistActive) return;
    try {
      if (!AudioContextClass) throw new Error("AudioContext not supported");
      audioContextRef.current = new AudioContextClass({ sampleRate: 16000 });
      outAudioContextRef.current = new AudioContextClass({ sampleRate: 24000 });
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const sessionPromise = connectTaskEntryAPI({
        onopen: () => {
          setIsAiAssistActive(true);
          setRiaStatus('LISTENING');
          const source = audioContextRef.current!.createMediaStreamSource(stream);
          const analyser = audioContextRef.current!.createAnalyser();
          analyser.fftSize = 256;
          source.connect(analyser);
          const updateVisuals = () => {
            const dataArray = new Uint8Array(analyser.frequencyBinCount);
            analyser.getByteFrequencyData(dataArray);
            let sum = 0;
            for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
            const avg = sum / dataArray.length;
            setMicVolume(avg);
            visualizerIntervalRef.current = requestAnimationFrame(updateVisuals);
          };
          updateVisuals();
          const scriptProcessor = audioContextRef.current!.createScriptProcessor(4096, 1, 1);
          scriptProcessor.onaudioprocess = (e) => {
            if (!sessionRef.current) return;
            sessionPromise.then(s => s.sendRealtimeInput({ media: createBlob(e.inputBuffer.getChannelData(0)) }));
          };
          source.connect(scriptProcessor);
          scriptProcessor.connect(audioContextRef.current!.destination);
        },
        onmessage: async (message: any) => {
          if (message.serverContent?.outputTranscription) setTranscriptBuffer(prev => prev + message.serverContent.outputTranscription.text);
          if (message.serverContent?.turnComplete) {
            setAssistTranscript(prev => (prev + "\n" + transcriptBuffer.trim()).trim());
            setTranscriptBuffer('');
          }
          if (message.toolCall) {
            for (const fc of message.toolCall.functionCalls) {
              const { field, value } = fc.args;
              if (fc.name === 'update_task_field') {
                if (field === 'objective') setFormObjective(value);
                if (field === 'time') setFormTime(value);
                if (field === 'date') setFormDate(value);
                if (field === 'priority') {
                  const p = value.toLowerCase();
                  if (p.includes('important')) setFormUrgency(TaskUrgency.IMPORTANT);
                  else if (p.includes('urgent')) setFormUrgency(TaskUrgency.URGENT);
                  else setFormUrgency(TaskUrgency.REGULAR);
                }
                if (field === 'category') {
                  const val = value.toLowerCase();
                  if (val.includes('5x') || val.includes('five x') || val.includes('strategic')) setFormCategory('5x');
                  else setFormCategory('routine');
                }
                if (field === 'alarm') setAlarmEnabled(value.toLowerCase().includes('on') || value.toLowerCase().includes('yes') || value.toLowerCase() === 'true');
                sessionPromise.then(s => s.sendToolResponse({ functionResponses: { id: fc.id, name: fc.name, response: { result: "Field updated." } } }));
              } else if (fc.name === 'launch_mission') {
                const success = saveCurrentForm(true);
                if (success) {
                  sessionPromise.then(s => s.sendToolResponse({ functionResponses: { id: fc.id, name: fc.name, response: { result: "Mission recorded." } } }));
                }
              }
            }
          }
          if (message.serverContent?.modelTurn?.parts) {
            for (const part of message.serverContent.modelTurn.parts) {
              if (part.inlineData?.data) {
                setRiaStatus('SPEAKING');
                const buffer = await decodeAudioData(decode(part.inlineData.data), outAudioContextRef.current!, 24000, 1);
                const source = outAudioContextRef.current!.createBufferSource();
                source.buffer = buffer;
                source.connect(outAudioContextRef.current!.destination);
                nextStartTimeRef.current = Math.max(nextStartTimeRef.current, outAudioContextRef.current!.currentTime);
                source.start(nextStartTimeRef.current);
                nextStartTimeRef.current += buffer.duration;
                sourcesRef.current.add(source);
                source.onended = () => { 
                  sourcesRef.current.delete(source); 
                  if (sourcesRef.current.size === 0) setRiaStatus('LISTENING'); 
                };
              }
            }
          }
        }
      });
      sessionRef.current = await sessionPromise;
    } catch (e) { console.error(e); stopVoiceSession(); }
  };

  const fetchCoachAdvice = async () => {
    setIsAdviceLoading(true);
    try {
      const advice = await GeminiService.getProductivityAdvice(tasks, [], []);
      setCoachingAdvice(advice);
    } catch (e) {
      console.error("Coaching advice error:", e);
      setCoachingAdvice({
        text: "Tactical uplink failure. Analysis unavailable.",
        sources: []
      });
    } finally {
      setIsAdviceLoading(false);
    }
  };

  const deleteTask = (id: string) => {
    const taskToDelete = tasks.find(t => t.id === id);
    if (!taskToDelete) return;
    if (window.confirm(`URGENT: Permanent deletion of mission "${taskToDelete.title}"?`)) {
      setLastDeletedTask(taskToDelete);
      setTasks(prev => prev.filter(t => t.id !== id));
    }
  };

  const restoreTask = () => {
    if (lastDeletedTask) {
      setTasks(prev => [...prev, lastDeletedTask]);
      setLastDeletedTask(null);
    }
  };

  const startFocusOnTask = (task: Task) => {
    setFocusedTask(task);
    setTimerSeconds(1500);
    setIsTimerActive(true);
    setActiveTab('focus');
  };

  const terminateFocusProtocol = (markComplete: boolean = false) => {
    if (markComplete && focusedTask) {
      setTasks(prev => prev.map(t => t.id === focusedTask.id ? { ...t, completionPercentage: 100, isCompleted: true, isLocked: true } : t));
    }
    setFocusedTask(null);
    setIsTimerActive(false);
    setActiveTab('routine');
  };

  const saveCurrentForm = (fromAI = false) => {
    // Logic for AI confirmation or manual confirmation
    const objective = fromAI ? formRef.current.objective : formObjective;
    const date = fromAI ? formRef.current.date : formDate;
    const time = fromAI ? formRef.current.time : formTime;
    const urgency = fromAI ? formRef.current.urgency : formUrgency;
    const category = fromAI ? formRef.current.category : formCategory;
    const alarm = fromAI ? formRef.current.alarm : alarmEnabled;

    if (!objective.trim()) { 
      return false; 
    }

    const newTask: Task = {
      id: (editingTask && !fromAI) ? editingTask.id : Math.random().toString(36).substr(2, 9),
      title: objective,
      date: date,
      time: time,
      urgency: urgency as TaskUrgency,
      category: category as 'routine' | '5x',
      completionPercentage: 0,
      notes: '',
      isAlarmed: alarm,
      isCompleted: false,
      isSnoozed: false,
      isLocked: true,
      repeat: formRepeat,
      alarmOffset: alarmOffset
    };

    if (editingTask && !fromAI) {
      setTasks(prev => prev.map(t => t.id === editingTask.id ? newTask : t));
      setEditingTask(null);
    } else {
      setTasks(prev => [...prev, newTask]);
    }

    resetFormFields();
    
    // Close session only on manual deploy
    if (!fromAI) {
      setShowTaskForm(false);
      stopVoiceSession();
    }
    
    return true;
  };

  const formatTime = (totalSeconds: number) => {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const todayMissions = tasks.filter(t => t.repeat === 'daily' || t.date === new Date().toISOString().split('T')[0]);
  const activeMissions = tasks.filter(t => !t.isCompleted);
  const completedCount = todayMissions.filter(t => t.isCompleted).length;
  const pendingCount = todayMissions.length - completedCount;
  const progressPercent = todayMissions.length > 0 ? Math.round((completedCount / todayMissions.length) * 100) : 0;

  return (
    <div className="min-h-screen pb-32 bg-[#020617] text-slate-100 font-['Space_Grotesk'] overflow-x-hidden">
      <header className="px-6 pt-10 pb-4 sticky top-0 z-40 bg-[#020617]/95 backdrop-blur-xl border-b border-white/5">
        <div className="flex justify-between items-center max-w-2xl mx-auto">
          <div className="flex items-center gap-4">
            <h1 className="text-3xl font-black italic tracking-tighter uppercase neo-text-glow leading-none shrink-0">TO DO LIST</h1>
            <div className="flex items-center gap-2">
               <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse"></div>
               <p className="text-[11px] font-black text-blue-500 tracking-[0.2em] uppercase whitespace-nowrap">Tactical Mode Active</p>
            </div>
          </div>
        </div>
      </header>

      <main className="px-6 pt-2 max-w-2xl mx-auto">
        {activeTab === 'routine' && (
          <div className="space-y-4">
            {lastDeletedTask && (
               <div className="animate-in slide-in-from-top-4 duration-500">
                <button onClick={restoreTask} className="w-full py-4 bg-red-600/10 border border-red-500/30 rounded-2xl text-[12px] font-black uppercase tracking-widest text-red-400 hover:bg-red-600/20 transition-all">
                  ⚠️ RESTORE PREVIOUS MISSION?
                </button>
               </div>
            )}

            <div className="flex gap-4 mb-4">
              <button 
                onClick={() => { setIsAiMode(true); setShowTaskForm(true); startAiAssistantSession(); }}
                className="flex-1 py-5 rounded-[1.5rem] bg-blue-600 text-white font-black uppercase tracking-[0.3em] hover:brightness-110 active:scale-[0.98] transition-all shadow-lg border border-blue-400 text-sm flex items-center justify-center gap-3"
              >
                🎙️ AI Assistant
              </button>
              <button 
                onClick={() => { resetFormFields(); setIsAiMode(false); setShowTaskForm(true); }} 
                className="w-16 h-16 rounded-[1.5rem] bg-blue-600 flex items-center justify-center text-3xl shadow-[0_0_20px_rgba(59,130,246,0.4)] active:scale-90 transition-all border border-blue-400 shrink-0"
              >
                +
              </button>
            </div>

            <div className="p-6 rounded-[2.5rem] bg-slate-900/40 border border-blue-500/20 flex flex-col items-center justify-center shadow-2xl relative overflow-hidden">
              <p className="text-[13px] font-black text-slate-500 uppercase tracking-[0.5em] mb-4">Strategic Capacity</p>
              <div className="relative w-40 h-40 flex items-center justify-center">
                 <svg className="absolute inset-0 -rotate-90" viewBox="0 0 100 100">
                   <circle cx="50" cy="50" r="45" fill="none" stroke="#0f172a" strokeWidth="10" />
                   <circle cx="50" cy="50" r="45" fill="none" stroke="#3b82f6" strokeWidth="10" strokeDasharray="283" strokeDashoffset={283 - (283 * progressPercent / 100)} className="transition-all duration-1000 ease-out" strokeLinecap="round" />
                 </svg>
                 <div className="flex flex-col items-center">
                    <span className="text-5xl font-black text-white italic tracking-tighter">{progressPercent}%</span>
                    <span className="text-[11px] font-bold text-blue-400 uppercase tracking-widest mt-1">Efficiency</span>
                 </div>
              </div>
              <div className="mt-6 grid grid-cols-3 gap-8 text-center w-full max-w-[300px]">
                 <div><p className="text-[11px] font-black text-slate-500 uppercase tracking-widest mb-1">Active</p><p className="text-xl font-black text-white">{todayMissions.length}</p></div>
                 <div><p className="text-[11px] font-black text-slate-500 uppercase tracking-widest mb-1">Pending</p><p className="text-xl font-black text-amber-500">{pendingCount}</p></div>
                 <div><p className="text-[11px] font-black text-slate-500 uppercase tracking-widest mb-1">Complete</p><p className="text-xl font-black text-green-400">{completedCount}</p></div>
              </div>
            </div>

            <div className="space-y-4">
              {todayMissions.length > 0 ? (
                <div className="grid grid-cols-1 gap-4">
                  {todayMissions.map(task => (
                    <TaskCard 
                      key={task.id} 
                      task={task} 
                      onFocus={(t) => startFocusOnTask(t)} 
                      onUpdate={(id, up) => setTasks(prev => prev.map(t => t.id === id ? { ...t, ...up } : t))} 
                      onDelete={deleteTask} 
                      onEdit={startManualEdit} 
                    />
                  ))}
                </div>
              ) : (
                <div className="text-center py-10 bg-slate-900/30 rounded-[3rem] border-2 border-dashed border-slate-800/50 flex flex-col items-center">
                  <span className="text-5xl block mb-4 opacity-40">🛸</span>
                  <p className="text-white font-black uppercase tracking-widest text-2xl mb-4">Awaiting Command Inputs</p>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'lines' && (
          <div className="space-y-6 pb-20 animate-in fade-in duration-500">
            <h2 className="text-2xl font-black italic tracking-tighter uppercase text-white mb-6">Tactical Edit View</h2>
            <div className="space-y-3">
              {activeMissions.length > 0 ? activeMissions.map(task => (
                <div key={task.id} className="flex items-center justify-between p-5 bg-slate-900/60 border border-white/5 rounded-2xl transition-all group">
                  <div className="flex items-center gap-4">
                     <div className={`w-3 h-3 rounded-full ${task.urgency === TaskUrgency.URGENT ? 'bg-orange-700' : task.urgency === TaskUrgency.IMPORTANT ? 'bg-pink-600' : 'bg-blue-500'}`}></div>
                     <div>
                       <p className="text-sm font-black text-white leading-tight italic tracking-tight uppercase">{task.title}</p>
                       <p className="text-[11px] font-bold text-slate-500 uppercase tracking-widest mt-0.5">{task.category} • {task.urgency} • {task.completionPercentage}%</p>
                     </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <button onClick={() => startManualEdit(task)} className="w-10 h-10 bg-slate-950 border border-white/5 rounded-xl flex items-center justify-center text-slate-400 hover:text-blue-400 transition-all">✏️</button>
                    <button onClick={() => deleteTask(task.id)} className="w-10 h-10 bg-slate-950 border border-white/5 rounded-xl flex items-center justify-center text-slate-400 hover:text-red-400 transition-all">✕</button>
                  </div>
                </div>
              )) : (
                <div className="py-20 text-center opacity-30 italic font-black uppercase tracking-[0.4em]">No active missions</div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'focus' && focusedTask && (
          <div className="flex flex-col items-center justify-center py-10 space-y-12 animate-in fade-in duration-500">
             <div className="text-center">
               <h1 className="text-4xl font-black text-white px-8 h-20 flex items-center justify-center leading-tight italic tracking-tighter">Pomodoro Technique</h1>
               <h2 className="text-blue-500 text-[12px] font-black uppercase tracking-[0.5em] mt-4 pulse-text">Deep Focus Protocol</h2>
             </div>
             
             <div className="w-full max-w-sm bg-slate-950/50 p-6 rounded-[2.5rem] border border-white/5 text-center">
               <p className="text-[12px] font-black text-slate-500 uppercase tracking-widest mb-2">Target [{focusedTask.category}]</p>
               <h3 className="text-xl font-black text-blue-400 italic">{focusedTask.title}</h3>
             </div>

             <div className="relative w-72 h-72 flex items-center justify-center group">
               <div className="absolute inset-0 rounded-full border-4 border-slate-900 shadow-[0_0_80px_rgba(59,130,246,0.1)]"></div>
               <svg className="w-full h-full -rotate-90">
                 <circle cx="50%" cy="50%" r="48%" className="fill-none stroke-blue-500 stroke-[8px] transition-all duration-1000" style={{ strokeDasharray: '603', strokeDashoffset: (603 - (603 * (timerSeconds / 1500))).toString() }} strokeLinecap="round" />
               </svg>
               <div className="absolute flex flex-col items-center">
                 <span className="text-7xl font-black tracking-tighter text-white tabular-nums">{formatTime(timerSeconds)}</span>
                 <span className="text-[13px] font-black text-slate-500 uppercase tracking-[0.3em] mt-3">{isTimerActive ? 'Engaged' : 'Standby'}</span>
               </div>
             </div>

             <div className="flex flex-col gap-4 w-full max-w-xs">
               <div className="flex gap-4">
                 <button onClick={() => setIsTimerActive(!isTimerActive)} className={`flex-1 py-6 rounded-3xl font-black uppercase tracking-widest text-sm shadow-xl transition-all ${isTimerActive ? 'bg-slate-800 text-slate-400' : 'bg-blue-600 text-white shadow-blue-600/30'}`}>
                   {isTimerActive ? 'Standby' : 'Engage'}
                 </button>
                 <button onClick={() => { setTimerSeconds(1500); setIsTimerActive(false); }} className="px-8 py-6 bg-slate-900 border border-white/5 rounded-3xl font-black uppercase text-[12px] tracking-widest text-slate-400">Reset</button>
               </div>
               <button onClick={() => terminateFocusProtocol(true)} className="w-full py-5 bg-gradient-to-r from-emerald-600 to-green-500 text-black font-black rounded-3xl uppercase tracking-[0.2em] text-sm shadow-xl hover:scale-[1.02] active:scale-95 transition-all">Complete Mission & Exit</button>
               <button onClick={() => terminateFocusProtocol(false)} className="w-full py-2 text-slate-600 text-[12px] font-black uppercase tracking-widest hover:text-red-400">Abort Session</button>
             </div>
          </div>
        )}

        {activeTab === 'ai' && (
          <div className="space-y-6 pb-20 animate-in fade-in duration-500">
             <div className="flex justify-between items-center mb-6">
               <h2 className="text-2xl font-black italic tracking-tighter uppercase text-white">Ria Tactical Analysis</h2>
               <button onClick={fetchCoachAdvice} disabled={isAdviceLoading} className="px-4 py-2 bg-blue-600/20 border border-blue-500/40 rounded-full text-[10px] font-black uppercase tracking-widest text-blue-400">Refresh Intel</button>
             </div>
             {isAdviceLoading ? (
               <div className="p-10 text-center bg-slate-900/40 rounded-[2.5rem] border border-blue-500/20">
                 <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                 <p className="text-blue-400 font-black uppercase tracking-[0.2em]">Processing Operational Data...</p>
               </div>
             ) : coachingAdvice ? (
               <div className="space-y-4">
                 <div className="p-8 bg-slate-900/40 rounded-[2.5rem] border border-blue-500/20 whitespace-pre-wrap text-slate-300 leading-relaxed font-medium">
                   {coachingAdvice.text}
                 </div>
                 {coachingAdvice.sources && coachingAdvice.sources.length > 0 && (
                   <div className="px-4 py-2">
                     <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Intelligence Sources</p>
                     <div className="flex flex-wrap gap-2">
                       {coachingAdvice.sources.map((chunk: any, i: number) => (
                         chunk.web && (
                           <a 
                             key={i} 
                             href={chunk.web.uri} 
                             target="_blank" 
                             rel="noopener noreferrer"
                             className="px-3 py-1 bg-blue-900/20 border border-blue-500/30 rounded-full text-[9px] text-blue-400 hover:bg-blue-600/20 transition-all flex items-center gap-2"
                           >
                             <span>🌐</span> {chunk.web.title || 'Source'}
                           </a>
                         )
                       ))}
                     </div>
                   </div>
                 )}
               </div>
             ) : (
               <div className="p-10 text-center bg-slate-900/40 rounded-[2.5rem] border border-white/5 opacity-50 italic">
                 Awaiting operational data for analysis.
               </div>
             )}
          </div>
        )}

        {activeTab === 'analytics' && (
          <div className="space-y-6 pb-20 animate-in fade-in duration-500">
             <h2 className="text-2xl font-black italic tracking-tighter uppercase text-white mb-6">Mission Debrief</h2>
             <div className="grid grid-cols-2 gap-4">
               <div className="p-6 bg-slate-900/40 rounded-[2rem] border border-blue-500/20">
                 <p className="text-[11px] font-black text-slate-500 uppercase tracking-widest mb-1">Total Deployed</p>
                 <p className="text-3xl font-black text-white italic">{tasks.length}</p>
               </div>
               <div className="p-6 bg-slate-900/40 rounded-[2rem] border-green-500/20">
                 <p className="text-[11px] font-black text-slate-500 uppercase tracking-widest mb-1">Combat Success</p>
                 <p className="text-3xl font-black text-green-400 italic">{tasks.filter(t => t.isCompleted).length}</p>
               </div>
             </div>
             <div className="p-8 bg-slate-900/40 rounded-[2.5rem] border border-white/5">
                <p className="text-[12px] font-black text-slate-500 uppercase tracking-[0.3em] mb-4">Output Breakdown</p>
                <div className="space-y-6">
                   <div>
                     <div className="flex justify-between text-[11px] font-black uppercase tracking-widest text-slate-400 mb-2">
                        <span>Routine Operations</span>
                        <span>{tasks.filter(t => t.category === 'routine').length}</span>
                     </div>
                     <div className="h-2 bg-slate-950 rounded-full overflow-hidden">
                       <div className="h-full bg-blue-600" style={{ width: tasks.length ? `${(tasks.filter(t => t.category === 'routine').length / tasks.length) * 100}%` : '0%' }}></div>
                     </div>
                   </div>
                   <div>
                     <div className="flex justify-between text-[11px] font-black uppercase tracking-widest text-red-400 mb-2">
                        <span>5X Speed Strategy</span>
                        <span>{tasks.filter(t => t.category === '5x').length}</span>
                     </div>
                     <div className="h-2 bg-slate-950 rounded-full overflow-hidden">
                       <div className="h-full bg-red-400" style={{ width: tasks.length ? `${(tasks.filter(t => t.category === '5x').length / tasks.length) * 100}%` : '0%' }}></div>
                     </div>
                   </div>
                </div>
             </div>
          </div>
        )}
      </main>

      {/* Task Creation Modal */}
      {showTaskForm && (
        <div className="fixed inset-0 z-[100] bg-black/98 backdrop-blur-3xl flex items-start justify-center p-4 pt-safe overflow-y-auto">
          <div className={`w-full max-lg bg-slate-950 rounded-[3rem] p-8 border border-blue-500/30 shadow-[0_0_100px_rgba(59,130,246,0.1)] ${isAiMode ? 'mt-32' : 'mt-10'} mb-10 relative transition-all duration-500`}>
            {isAiMode && (
              <div className="absolute -top-16 left-1/2 -translate-x-1/2 flex flex-col items-center">
                <button 
                  onClick={isAiAssistActive ? stopVoiceSession : startAiAssistantSession} 
                  className={`w-36 h-36 rounded-full border-[8px] flex flex-col items-center justify-center transition-all duration-300 relative overflow-hidden ${isAiAssistActive ? 'bg-red-600 border-red-400 shadow-red-600/30' : 'bg-blue-600 border-blue-400 shadow-blue-600/30'}`}
                >
                  {/* RE-IMPLEMENTED SOUND BAR VISUALIZER */}
                  <div className="flex items-end justify-center gap-[3px] h-8 w-full absolute top-[35%] -translate-y-1/2 pointer-events-none px-12 overflow-hidden">
                    {[...Array(10)].map((_, i) => (
                      <div 
                        key={i} 
                        className="w-[3px] bg-white rounded-full transition-all duration-75 shadow-sm"
                        style={{ height: isAiAssistActive ? `${Math.min(24, Math.max(4, micVolume * 0.5))}px` : '4px' }}
                      ></div>
                    ))}
                  </div>
                  <div className="flex flex-col items-center z-10 pt-10">
                    <span className="text-4xl mb-1">{isAiAssistActive ? '📡' : '🎙️'}</span>
                    <span className="text-[10px] font-black uppercase tracking-tighter opacity-60">
                      {isAiAssistActive ? (riaStatus === 'SPEAKING' ? 'TRANS' : 'RECV') : 'OFFLINE'}
                    </span>
                  </div>
                  {isAiAssistActive && (
                    <div className="absolute inset-0 rounded-full bg-white/5 animate-pulse pointer-events-none"></div>
                  )}
                </button>
              </div>
            )}
            
            {!isAiMode && (
              <div className="mb-8 text-center">
                <h2 className="text-3xl font-black italic tracking-tighter uppercase text-white">{editingTask ? 'Edit Manifest' : 'Manual Entry'}</h2>
                <div className="h-1 w-12 bg-blue-600 mx-auto mt-2 rounded-full"></div>
              </div>
            )}

            <form onSubmit={e => { e.preventDefault(); saveCurrentForm(); }} className="space-y-6">
              <div className="space-y-2">
                <label className="text-[12px] font-black text-slate-500 uppercase tracking-widest ml-4">Deployment Task</label>
                <textarea 
                  ref={objectiveInputRef} 
                  value={formObjective} 
                  onChange={e => setFormObjective(e.target.value)} 
                  placeholder="Enter task objective..." 
                  className="w-full bg-slate-900 border border-slate-800 rounded-3xl p-5 text-white text-xl font-bold outline-none focus:border-blue-500 transition-colors" 
                  rows={2} 
                />
              </div>

              {/* Category Buttons */}
              <div className="space-y-2">
                <label className="text-[12px] font-black text-slate-500 uppercase tracking-widest ml-4">Category Protocol</label>
                <div className="grid grid-cols-2 gap-4">
                  <button 
                    type="button" 
                    onClick={() => setFormCategory('routine')}
                    className={`py-4 rounded-2xl text-[13px] font-black uppercase tracking-widest border transition-all ${formCategory === 'routine' ? 'bg-blue-600 border-blue-400 text-white shadow-lg' : 'bg-slate-900 border-slate-800 text-slate-500'}`}
                  >
                    Routine
                  </button>
                  <button 
                    type="button" 
                    onClick={() => setFormCategory('5x')}
                    className={`py-4 rounded-2xl text-[13px] font-black uppercase tracking-widest border transition-all ${formCategory === '5x' ? 'bg-red-400 border-red-300 text-white shadow-lg' : 'bg-slate-900 border-slate-800 text-slate-500'}`}
                  >
                    5X Speed
                  </button>
                </div>
              </div>

              {/* Priority Buttons */}
              <div className="space-y-2">
                <label className="text-[12px] font-black text-slate-500 uppercase tracking-widest ml-4">Priority Protocol</label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setFormUrgency(TaskUrgency.REGULAR)}
                    className={`py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest border transition-all ${formUrgency === TaskUrgency.REGULAR ? 'bg-blue-600 border-blue-400 text-white' : 'bg-slate-900 border-slate-800 text-slate-500'}`}
                  >
                    Regular
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormUrgency(TaskUrgency.IMPORTANT)}
                    className={`py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest border transition-all ${formUrgency === TaskUrgency.IMPORTANT ? 'bg-pink-600 border-pink-400 text-white shadow-lg shadow-pink-900/20' : 'bg-slate-900 border-slate-800 text-slate-500'}`}
                  >
                    Important
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormUrgency(TaskUrgency.URGENT)}
                    className={`py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest border transition-all ${formUrgency === TaskUrgency.URGENT ? 'bg-orange-700 border-orange-500 text-white shadow-lg shadow-orange-900/20' : 'bg-slate-900 border-slate-800 text-slate-500'}`}
                  >
                    Urgent
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2"><label className="text-[12px] font-black text-slate-500 uppercase tracking-widest ml-4">Date</label><input type="date" value={formDate} onChange={e => setFormDate(e.target.value)} className="w-full bg-slate-900 border border-slate-800 rounded-2xl p-4 text-white [color-scheme:dark] text-base font-bold outline-none focus:border-blue-500" /></div>
                <div className="space-y-2"><label className="text-[12px] font-black text-slate-500 uppercase tracking-widest ml-4">Launch Time</label><input type="time" value={formTime} onChange={e => setFormTime(e.target.value)} className="w-full bg-slate-900 border border-slate-800 rounded-2xl p-4 text-white [color-scheme:dark] text-base font-bold outline-none focus:border-blue-500" /></div>
              </div>

              {/* Alarm Configuration */}
              <div className="space-y-4">
                <div 
                  onClick={() => setAlarmEnabled(!alarmEnabled)} 
                  className={`p-5 rounded-2xl border flex items-center justify-between cursor-pointer transition-all ${alarmEnabled ? 'bg-blue-600 border-blue-400 shadow-xl' : 'bg-slate-900 border-slate-800'}`}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-xl">{alarmEnabled ? '🔔' : '🔕'}</span>
                    <span className="text-[12px] font-black uppercase tracking-widest text-white">Tactical Alarm {alarmEnabled ? 'ENGAGED' : 'OFFLINE'}</span>
                  </div>
                  <div className={`w-10 h-6 rounded-full relative transition-colors ${alarmEnabled ? 'bg-white/20' : 'bg-slate-700'}`}>
                    <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${alarmEnabled ? 'left-5' : 'left-1'}`}></div>
                  </div>
                </div>

                {alarmEnabled && (
                  <div className="space-y-4 animate-in fade-in slide-in-from-top-2 duration-300">
                    <div className="space-y-2">
                      <label className="text-[11px] font-black text-slate-500 uppercase tracking-widest ml-4">Alarm Timing Offset</label>
                      <div className="grid grid-cols-3 gap-2">
                        <button type="button" onClick={() => setAlarmOffset(0)} className={`py-3 rounded-xl text-[9px] font-black uppercase tracking-widest border transition-all ${alarmOffset === 0 ? 'bg-blue-600 border-blue-400 text-white' : 'bg-slate-900 border-slate-800 text-slate-500'}`}>Exact</button>
                        <button type="button" onClick={() => setAlarmOffset(10)} className={`py-3 rounded-xl text-[9px] font-black uppercase tracking-widest border transition-all ${alarmOffset === 10 ? 'bg-blue-600 border-blue-400 text-white' : 'bg-slate-900 border-slate-800 text-slate-500'}`}>10m Prior</button>
                        <button type="button" onClick={() => setAlarmOffset(30)} className={`py-3 rounded-xl text-[9px] font-black uppercase tracking-widest border transition-all ${alarmOffset === 30 ? 'bg-blue-600 border-blue-400 text-white' : 'bg-slate-900 border-slate-800 text-slate-500'}`}>30m Prior</button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
              
              <div className="pt-4 flex flex-col gap-4">
                <button type="submit" className="w-full py-6 bg-blue-600 text-white font-black rounded-[2rem] uppercase tracking-[0.4em] shadow-2xl active:scale-95 transition-all text-sm border border-blue-400">
                  DEPLOY MISSION
                </button>
                <button type="button" onClick={() => { setShowTaskForm(false); stopVoiceSession(); resetFormFields(); }} className="w-full py-2 text-slate-600 text-[13px] font-black uppercase tracking-[0.5em] hover:text-white transition-colors">Abort</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {activeAlarmTask && (
        <AlarmModal 
          task={activeAlarmTask} 
          onStop={(id) => { 
            setTasks(prev => prev.map(t => t.id === id ? { ...t, isAlarmed: false, isLocked: true } : t)); 
            setActiveAlarmTask(null); 
          }} 
          onSnooze={(id, mins) => { 
            const now = new Date(); 
            now.setMinutes(now.getMinutes() + mins); 
            setTasks(prev => prev.map(t => t.id === id ? { ...t, time: now.toTimeString().slice(0, 5), isSnoozed: false, isLocked: true } : t)); 
            setActiveAlarmTask(null); 
          }} 
          onPostpone={(id, date, time) => { 
            setTasks(prev => prev.map(t => t.id === id ? { ...t, date, time, isSnoozed: false, isLocked: true } : t)); 
            setActiveAlarmTask(null); 
          }} 
        />
      )}
      <BottomNav activeTab={activeTab} setActiveTab={setActiveTab} />
    </div>
  );
};

export default App;
