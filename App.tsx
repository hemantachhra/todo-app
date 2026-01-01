
import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Task, TaskUrgency, DailyReport, APP_SCORE_CONFIG } from './types';
import BottomNav from './components/BottomNav';
import TaskCard from './components/TaskCard';
import AlarmModal from './components/AlarmModal';
import { connectLiveAPI, GeminiService } from './geminiService';
import { decode, decodeAudioData, createBlob } from './audioUtils';
import { LiveServerMessage } from '@google/genai';

const App: React.FC = () => {
  const getTodayDateString = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = (now.getMonth() + 1).toString().padStart(2, '0');
    const day = now.getDate().toString().padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const getCurrentTimeFormatted = () => {
    const now = new Date();
    return `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
  };

  const [activeTab, setActiveTab] = useState('routine');
  const [tasks, setTasks] = useState<Task[]>(() => {
    const saved = localStorage.getItem('tasks');
    return saved ? JSON.parse(saved) : [];
  });
  const [reports, setReports] = useState<DailyReport[]>(() => {
    const saved = localStorage.getItem('reports');
    return saved ? JSON.parse(saved) : [];
  });
  const [memoryBank, setMemoryBank] = useState<string[]>(() => {
    const saved = localStorage.getItem('memory_bank');
    return saved ? JSON.parse(saved) : [];
  });
  const [dayPlan, setDayPlan] = useState<string | null>(() => localStorage.getItem('day_plan'));
  const [aiAdvice, setAiAdvice] = useState<string>(() => localStorage.getItem('ai_advice') || "");
  const [selectedLanguage, setSelectedLanguage] = useState<'English' | 'Hindi'>(() => {
    const saved = localStorage.getItem('selected_language');
    return (saved === 'English' || saved === 'Hindi') ? saved : 'English';
  });

  const [activeAlarm, setActiveAlarm] = useState<Task | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [showTaskForm, setShowTaskForm] = useState(false);
  const [taskToEdit, setTaskToEdit] = useState<Task | null>(null);
  const [showReportBook, setShowReportBook] = useState(false);
  const [isProcessingAdvice, setIsProcessingAdvice] = useState(false);
  const [isProcessingRoadmap, setIsProcessingRoadmap] = useState(false);
  const [audioUnlocked, setAudioUnlocked] = useState(false);

  // Audio Context for Alarm
  const alarmAudioCtx = useRef<AudioContext | null>(null);

  // Live API Refs
  const sessionRef = useRef<any>(null);
  const audioContextsRef = useRef<{ input: AudioContext; output: AudioContext } | null>(null);
  const nextStartTimeRef = useRef<number>(0);
  const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const micStreamRef = useRef<MediaStream | null>(null);

  const currentInputTranscription = useRef<string>("");
  const currentOutputTranscription = useRef<string>("");

  useEffect(() => { localStorage.setItem('tasks', JSON.stringify(tasks)); }, [tasks]);
  useEffect(() => { localStorage.setItem('reports', JSON.stringify(reports)); }, [reports]);
  useEffect(() => { localStorage.setItem('memory_bank', JSON.stringify(memoryBank)); }, [memoryBank]);
  useEffect(() => { if (dayPlan) localStorage.setItem('day_plan', dayPlan); else localStorage.removeItem('day_plan'); }, [dayPlan]);
  useEffect(() => { if (aiAdvice) localStorage.setItem('ai_advice', aiAdvice); else localStorage.removeItem('ai_advice'); }, [aiAdvice]);
  useEffect(() => { localStorage.setItem('selected_language', selectedLanguage); }, [selectedLanguage]);

  useEffect(() => {
    const unlock = () => {
      if (!alarmAudioCtx.current) alarmAudioCtx.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      const ctx = alarmAudioCtx.current;
      if (ctx.state === 'suspended') ctx.resume();
      const buffer = ctx.createBuffer(1, 1, 22050);
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(ctx.destination);
      source.start(0);
      setAudioUnlocked(true);
      window.removeEventListener('click', unlock);
      window.removeEventListener('touchstart', unlock);
    };
    window.addEventListener('click', unlock);
    window.addEventListener('touchstart', unlock);
    return () => {
      window.removeEventListener('click', unlock);
      window.removeEventListener('touchstart', unlock);
    };
  }, []);

  const startAlarmSound = () => {
    try {
      if (!alarmAudioCtx.current) alarmAudioCtx.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      const ctx = alarmAudioCtx.current;
      if (ctx.state === 'suspended') ctx.resume();
      const now = ctx.currentTime;
      const playBeep = (freq: number, start: number) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, start);
        gain.gain.setValueAtTime(0.2, start);
        gain.gain.exponentialRampToValueAtTime(0.001, start + 0.6);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(start);
        osc.stop(start + 0.7);
      };
      playBeep(880, now);
      playBeep(1320, now + 0.15);
      playBeep(1760, now + 0.3);
    } catch(e) { console.error("Alarm Sound Failure:", e); }
  };

  useEffect(() => {
    const checkAlarms = () => {
      const currentTimeStr = getCurrentTimeFormatted();
      const today = getTodayDateString();
      const triggeredTask = tasks.find(t => 
        t.date === today && t.time === currentTimeStr && t.isAlarmed && !t.isCompleted && !t.isSnoozed && !activeAlarm
      );
      if (triggeredTask) setActiveAlarm(triggeredTask);
    };
    const timer = setInterval(checkAlarms, 3000);
    return () => clearInterval(timer);
  }, [tasks, activeAlarm]);

  useEffect(() => {
    let interval: any;
    if (activeAlarm) {
      startAlarmSound();
      interval = setInterval(startAlarmSound, 1200);
    }
    return () => clearInterval(interval);
  }, [activeAlarm]);

  const startLiveSession = async () => {
    try {
      const inputCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      const outputCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      await inputCtx.resume();
      await outputCtx.resume();
      audioContextsRef.current = { input: inputCtx, output: outputCtx };
      const micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      micStreamRef.current = micStream;
      const sessionPromise = connectLiveAPI({
        onopen: () => {
          const source = inputCtx.createMediaStreamSource(micStream);
          const scriptProcessor = inputCtx.createScriptProcessor(4096, 1, 1);
          scriptProcessor.onaudioprocess = (evt) => {
            const inputData = evt.inputBuffer.getChannelData(0);
            const pcmBlob = createBlob(inputData);
            sessionPromise.then(session => { if (session) session.sendRealtimeInput({ media: pcmBlob }); });
          };
          source.connect(scriptProcessor);
          scriptProcessor.connect(inputCtx.destination);
          (window as any)._scriptProcessor = scriptProcessor; 
        },
        onmessage: async (message: LiveServerMessage) => {
          if (message.serverContent?.inputTranscription) currentInputTranscription.current += message.serverContent.inputTranscription.text;
          if (message.serverContent?.outputTranscription) currentOutputTranscription.current += message.serverContent.outputTranscription.text;
          if (message.serverContent?.turnComplete) {
            const userSaid = currentInputTranscription.current.trim();
            const assistantSaid = currentOutputTranscription.current.trim();
            if (userSaid || assistantSaid) {
              setMemoryBank(prev => [...prev, `[${new Date().toLocaleTimeString()}] User: ${userSaid}`, `Ria: ${assistantSaid}`].slice(-30));
            }
            currentInputTranscription.current = "";
            currentOutputTranscription.current = "";
          }
          const base64Audio = message.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
          if (base64Audio && audioContextsRef.current) {
            setIsSpeaking(true);
            const outCtx = audioContextsRef.current.output;
            nextStartTimeRef.current = Math.max(nextStartTimeRef.current, outCtx.currentTime);
            const audioBuffer = await decodeAudioData(decode(base64Audio), outCtx, 24000, 1);
            const source = outCtx.createBufferSource();
            source.buffer = audioBuffer;
            source.connect(outCtx.destination);
            source.addEventListener('ended', () => {
              sourcesRef.current.delete(source);
              if (sourcesRef.current.size === 0) setIsSpeaking(false);
            });
            source.start(nextStartTimeRef.current);
            nextStartTimeRef.current += audioBuffer.duration;
            sourcesRef.current.add(source);
          }
        },
        onclose: () => { setIsRecording(false); setIsSpeaking(false); },
        onerror: () => stopLiveSession(),
      }, { tasks, reports, history: memoryBank, language: selectedLanguage });
      sessionRef.current = await sessionPromise;
      setIsRecording(true);
    } catch (err) { setIsRecording(false); }
  };

  const stopLiveSession = () => {
    if (sessionRef.current) {
      micStreamRef.current?.getTracks().forEach(t => t.stop());
      if (audioContextsRef.current) {
         audioContextsRef.current.input.close().catch(() => {});
         audioContextsRef.current.output.close().catch(() => {});
      }
      sessionRef.current.close();
      sessionRef.current = null;
    }
    setIsRecording(false);
    setIsSpeaking(false);
  };

  const toggleVoiceInteraction = () => isRecording ? stopLiveSession() : startLiveSession();

  const handleGenerateRoadMap = async () => {
    setIsProcessingRoadmap(true);
    setDayPlan(""); 
    try {
      const time = new Date().toLocaleTimeString();
      const plan = await GeminiService.generateDailyRoadMap(tasks, time, selectedLanguage);
      setDayPlan(plan);
    } catch (error) {
      setDayPlan(selectedLanguage === 'Hindi' ? "सिंक विफल। पुनः प्रयास करें।" : "Matrix Sync Failure. Re-trying...");
    } finally {
      setIsProcessingRoadmap(false);
    }
  };

  const handleFetchAdvice = async () => {
    setIsProcessingAdvice(true);
    try {
      const advice = await GeminiService.getProductivityAdvice(tasks, reports, memoryBank, selectedLanguage);
      setAiAdvice(advice);
    } catch (error) {
      setAiAdvice(selectedLanguage === 'Hindi' ? "कनेक्शन खो गया। पुनः लिंक करें।" : "Connection Lost. Re-link required.");
    } finally {
      setIsProcessingAdvice(false);
    }
  };

  const handleSaveTaskForm = (e: React.FormEvent) => {
    e.preventDefault();
    const f = e.target as any;
    const title = f.title.value;
    const category = f.category.value;
    const urgency = f.urgency.value;
    const time = f.time.value;
    const date = f.date.value;
    const isAlarmed = f.enableAlarm.checked;

    if (taskToEdit) {
      updateTask(taskToEdit.id, { title, category, urgency, time, date, isAlarmed });
    } else {
      const newTask: Task = {
        id: Math.random().toString(36).substr(2, 9),
        title, 
        category, 
        urgency, 
        time, 
        date: date || getTodayDateString(),
        completionPercentage: 0, 
        notes: '', 
        interimNotes: '', 
        isAlarmed, 
        isSnoozed: false, 
        isCompleted: false
      };
      setTasks([...tasks, newTask]);
    }
    setShowTaskForm(false); 
    setTaskToEdit(null);
    if (!audioUnlocked) setAudioUnlocked(true); 
  };

  const updateTask = (id: string, updates: Partial<Task>) => setTasks(prev => prev.map(t => t.id === id ? { ...t, ...updates } : t));
  const deleteTask = (id: string) => setTasks(prev => prev.filter(t => t.id !== id));
  const openEditModal = (task: Task) => { setShowReportBook(false); setTaskToEdit(task); setShowTaskForm(true); };

  const todayStr = getTodayDateString();
  const todayActiveTasks = tasks.filter(t => t.date === todayStr && !t.isCompleted);
  const performanceStats = useMemo(() => {
    const todayTasks = tasks.filter(t => t.date === todayStr);
    let currentScore = 0;
    let maxPossibleScore = 0;
    todayTasks.forEach(task => {
      const multiplier = APP_SCORE_CONFIG.multipliers[task.urgency] || 1;
      const basePoints = APP_SCORE_CONFIG.completion['100'];
      currentScore += (task.completionPercentage / 100) * basePoints * multiplier;
      maxPossibleScore += basePoints * multiplier;
    });
    return { current: currentScore, max: maxPossibleScore, percentage: maxPossibleScore > 0 ? Math.round((currentScore / maxPossibleScore) * 100) : 0 };
  }, [tasks, todayStr]);

  const displayScore = performanceStats.current % 1 === 0 ? performanceStats.current : parseFloat(performanceStats.current.toFixed(1));

  return (
    <div className="min-h-screen pb-24 relative overflow-x-hidden select-none">
      <header className="px-6 pt-6 pb-4 sticky top-0 z-40 glass border-b border-blue-500/20 rounded-b-[2.5rem] shadow-lg">
        <div className="flex justify-between items-center">
          <div className="flex-1">
            <h1 className="text-xl font-black tracking-tighter uppercase italic truncate pr-2">
              {activeTab === 'routine' ? 'Active Missions' : activeTab === 'list' ? 'Task Registry' : activeTab === 'analytics' ? 'Performance' : 'AI AT YOUR SERVICE'}
            </h1>
            <div className="flex items-center gap-2">
              <p className="text-[10px] text-blue-400 font-bold uppercase tracking-widest">TO DO LIST</p>
              <span className="text-[8px] px-1.5 py-0.5 rounded bg-blue-500/20 border border-blue-500/30 text-blue-300 font-black">V4.1</span>
            </div>
          </div>
          {activeTab === 'routine' && (
            <button onClick={() => { setTaskToEdit(null); setShowTaskForm(true); }} className="w-14 h-14 rounded-[1.1rem] bg-gradient-to-br from-blue-600 to-indigo-700 flex items-center justify-center shadow-xl active:scale-90 transition-all text-3xl font-black border border-blue-400/20">+</button>
          )}
        </div>
      </header>

      <main className={`pt-4 ${activeTab === 'ai' ? 'px-4' : 'px-6'}`}>
        {activeTab === 'routine' ? (
          <div className="flex flex-col gap-3">
            {todayActiveTasks.map(task => <TaskCard key={task.id} task={task} onUpdate={updateTask} onDelete={deleteTask} />)}
            {todayActiveTasks.length === 0 && <div className="py-24 text-center opacity-30 text-xs uppercase font-black tracking-widest">No Missions Logged</div>}
          </div>
        ) : activeTab === 'list' ? (
          <div className="space-y-4">
            {tasks.sort((a,b) => b.date.localeCompare(a.date)).map(task => (
              <div key={task.id} className="glass p-4 rounded-3xl border border-white/5 shadow-lg">
                <div className="flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <h3 className={`text-sm font-bold truncate ${task.isCompleted ? 'text-slate-600 line-through' : 'text-slate-100'}`}>{task.title}</h3>
                    <p className="text-[9px] text-slate-500 uppercase font-bold">{task.date} • {task.time}</p>
                  </div>
                  <button onClick={() => openEditModal(task)} className="ml-4 px-3 py-1.5 bg-blue-600/10 border border-blue-500/30 text-[8px] font-black text-blue-300 rounded-lg uppercase">Edit</button>
                </div>
              </div>
            ))}
          </div>
        ) : activeTab === 'analytics' ? (
          <div className="space-y-6">
             <div className="glass p-6 rounded-[2rem] border border-blue-500/20 shadow-[0_0_25px_rgba(59,130,246,0.15)]">
                <p className="text-[10px] text-slate-400 uppercase tracking-[0.2em] mb-4 font-black">Efficiency Metric</p>
                <div className="flex items-baseline gap-2 italic tracking-tighter">
                   <span className="text-6xl font-black text-blue-400 neo-text-glow">{displayScore}</span>
                   <span className="text-2xl font-black text-slate-600">/</span>
                   <span className="text-3xl font-black text-slate-500">{performanceStats.max}</span>
                </div>
             </div>
             <button onClick={() => setShowReportBook(true)} className="w-full py-6 bg-gradient-to-br from-indigo-600 to-blue-700 rounded-[2rem] flex items-center justify-between px-8 shadow-xl">
               <div className="text-left">
                 <h2 className="text-xl font-black italic uppercase">OPEN AUDIT BOOK</h2>
               </div>
               <span className="text-4xl">📗</span>
             </button>
          </div>
        ) : (
          <div className="flex flex-col gap-6 animate-in slide-in-from-right-8 duration-700">
             <div className="glass p-5 rounded-3xl border border-white/10 flex justify-between items-center">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Language Protocol</p>
                <div className="flex gap-2 bg-slate-900 p-1 rounded-xl">
                  <button onClick={() => setSelectedLanguage('English')} className={`px-4 py-1.5 rounded-lg text-[10px] font-black ${selectedLanguage === 'English' ? 'bg-blue-600 text-white' : 'text-slate-500'}`}>English</button>
                  <button onClick={() => setSelectedLanguage('Hindi')} className={`px-4 py-1.5 rounded-lg text-[10px] font-black ${selectedLanguage === 'Hindi' ? 'bg-blue-600 text-white' : 'text-slate-500'}`}>Hindi</button>
                </div>
             </div>

             {/* Strategy Engine Box */}
             <div className="glass p-6 rounded-[2.5rem] border border-white/5 shadow-lg flex flex-col relative overflow-hidden">
                <div className="flex justify-between items-center mb-5">
                   <h2 className="text-sm font-black uppercase italic tracking-tighter text-blue-400">STRATEGY ENGINE</h2>
                   <button onClick={handleFetchAdvice} className={`px-5 py-2.5 bg-blue-600 text-white text-[10px] font-black rounded-xl uppercase tracking-widest active:scale-95 transition-transform ${isProcessingAdvice ? 'animate-pulse' : ''}`}>Analyse</button>
                </div>
                <div className="text-[16px] text-slate-200 min-h-[300px] p-6 bg-slate-950/80 rounded-2xl border border-white/5 whitespace-pre-wrap leading-relaxed shadow-inner font-medium relative overflow-y-auto">
                  {isProcessingAdvice && (
                    <div className="absolute inset-0 z-20 bg-slate-950/95 backdrop-blur-2xl flex flex-col items-center justify-center rounded-2xl text-center p-8">
                       <span className="text-7xl block mb-6 animate-bounce">⚡</span>
                       <p className="text-[13px] font-black text-blue-400 uppercase tracking-[0.5em] animate-pulse">RIA IS WORKING...</p>
                       <div className="mt-4 flex flex-col gap-1 w-full max-w-[150px]">
                          <div className="h-1 bg-blue-500/20 rounded-full overflow-hidden">
                             <div className="h-full bg-blue-500 animate-[shimmer_2s_infinite]" style={{width: '60%'}}></div>
                          </div>
                          <p className="text-[8px] text-slate-600 font-black uppercase tracking-widest">CALIBRATING NEURALS</p>
                       </div>
                    </div>
                  )}
                  {aiAdvice || (selectedLanguage === 'Hindi' ? "रणनीति विश्लेषण आदेशों की प्रतीक्षा है..." : "Awaiting strategy analysis commands...")}
                </div>
                <button 
                  onClick={handleGenerateRoadMap} 
                  disabled={isProcessingRoadmap}
                  className={`w-full mt-5 py-5 bg-indigo-600/20 border border-indigo-500/30 text-indigo-300 text-[11px] font-black rounded-2xl uppercase tracking-[0.25em] active:bg-indigo-600/40 transition-all ${isProcessingRoadmap ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  {isProcessingRoadmap ? 'SYNCING MISSION DATA...' : 'Deploy Daily Road Map'}
                </button>
             </div>

             {/* Road Map Box */}
             {(dayPlan !== null || isProcessingRoadmap) && (
               <div className="glass p-6 rounded-[2.5rem] border border-blue-500/20 shadow-[0_0_50px_rgba(59,130,246,0.2)] flex flex-col animate-in slide-in-from-bottom-10 zoom-in-95 duration-500 relative overflow-hidden">
                  <div className="flex justify-between items-center mb-5">
                     <h2 className="text-sm font-black uppercase italic tracking-tighter text-indigo-400">DAILY MISSION PROTOCOL</h2>
                     <button onClick={() => setDayPlan(null)} className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Dismiss</button>
                  </div>
                  <div className="text-[16px] text-indigo-100 p-6 bg-slate-950/60 rounded-2xl border border-white/5 whitespace-pre-wrap leading-relaxed shadow-inner font-medium min-h-[250px] relative">
                    {isProcessingRoadmap && (
                      <div className="absolute inset-0 z-20 bg-slate-950/95 backdrop-blur-2xl flex flex-col items-center justify-center rounded-2xl text-center p-8">
                        <span className="text-6xl block mb-4 animate-spin">🚀</span>
                        <p className="text-[12px] font-black text-indigo-400 uppercase tracking-[0.5em] animate-pulse">GENERATING DIARY...</p>
                        <div className="mt-4 w-full max-w-[150px] h-1 bg-indigo-500/20 rounded-full overflow-hidden">
                           <div className="h-full bg-indigo-500 animate-[shimmer_1.5s_infinite]" style={{width: '40%'}}></div>
                        </div>
                        <p className="text-[8px] text-slate-600 mt-2 font-black uppercase tracking-widest">MAPPING TARGETS</p>
                      </div>
                    )}
                    {dayPlan}
                  </div>
               </div>
             )}

             <div className="glass p-8 rounded-[2.5rem] border border-white/5 mb-8">
                <div className="flex justify-center py-4">
                  <button onClick={toggleVoiceInteraction} className={`w-36 h-36 rounded-full flex flex-col items-center justify-center transition-all duration-700 ${isRecording ? 'bg-red-500 shadow-[0_0_100px_rgba(239,68,68,0.7)] scale-110' : 'bg-slate-900 border border-blue-500/20 shadow-xl'}`}>
                    <span className="text-5xl mb-2">{isRecording ? '⏹️' : '🎤'}</span>
                    <span className="text-[10px] font-black uppercase tracking-[0.2em]">{isRecording ? 'LIVE' : 'ACTIVATE'}</span>
                  </button>
                </div>
             </div>
          </div>
        )}
      </main>

      {showReportBook && (
        <div className="fixed inset-0 z-[70] glass backdrop-blur-3xl flex flex-col animate-in slide-in-from-bottom-20 duration-500">
          <header className="p-8 pt-14 border-b border-white/10 flex justify-between items-center">
             <h2 className="text-2xl font-black italic uppercase">Audit Registry</h2>
             <button onClick={() => setShowReportBook(false)} className="w-12 h-12 rounded-2xl bg-slate-900 text-2xl flex items-center justify-center">✕</button>
          </header>
          <div className="flex-1 overflow-y-auto p-6 space-y-8 pb-32">
             {tasks.sort((a,b) => b.date.localeCompare(a.date)).map(task => (
              <div key={task.id} className="glass p-6 rounded-[2.5rem] border border-white/5 shadow-2xl space-y-6">
                 <div className="flex justify-between items-start">
                   <div className="flex-1 min-w-0 mr-4">
                     <h3 className={`font-black text-xl italic truncate ${task.isCompleted ? 'text-green-400' : 'text-slate-100'}`}>{task.title}</h3>
                     <p className="text-[10px] text-slate-500 font-black uppercase">{task.date.split('-').reverse().join('/')} • {task.time}</p>
                   </div>
                 </div>
                 <div className="space-y-4">
                    <div className="space-y-2">
                       <label className="text-[10px] font-black text-blue-400/70 uppercase tracking-[0.3em] block">Interim Tasks Pending</label>
                       <textarea 
                          id={`audit-textarea-${task.id}`}
                          value={task.interimNotes || ''} 
                          onChange={(e) => updateTask(task.id, { interimNotes: e.target.value })} 
                          className="w-full bg-slate-900/60 border border-slate-800 rounded-2xl p-4 text-xs text-slate-300 resize-none h-24 shadow-inner outline-none focus:border-blue-500/50" 
                          placeholder="List pending milestones..." 
                       />
                    </div>
                    <button 
                      onClick={(e) => {
                        const textarea = document.getElementById(`audit-textarea-${task.id}`);
                        if (textarea) textarea.blur();
                        const btn = e.currentTarget;
                        btn.innerText = "MISSION LOG COMMITTED ✓";
                        btn.classList.add("text-green-400", "border-green-500/60", "bg-green-500/20");
                        setTimeout(() => {
                           btn.innerText = "SYNC LOG ENTRY";
                           btn.classList.remove("text-green-400", "border-green-500/60", "bg-green-500/20");
                        }, 2500);
                      }}
                      className="w-full py-4 bg-blue-600/10 border border-blue-500/30 text-blue-300 text-[10px] font-black rounded-2xl uppercase tracking-[0.25em] active:scale-95 transition-all shadow-lg"
                    >
                      SYNC LOG ENTRY
                    </button>
                 </div>
              </div>
             ))}
             {tasks.length === 0 && <div className="text-center py-20 opacity-30 text-xs font-black uppercase tracking-widest">No Data Logged</div>}
          </div>
        </div>
      )}

      {showTaskForm && (
        <div className="fixed inset-0 z-[80] flex items-start justify-center bg-black/90 backdrop-blur-xl p-4 pt-2 animate-in fade-in duration-300">
          <div className="w-full max-w-md glass rounded-[2.5rem] p-6 border border-blue-500/40 shadow-2xl overflow-y-auto max-h-[90vh]">
            <h2 className="text-2xl font-black uppercase italic tracking-tighter mb-6 text-center">{taskToEdit ? 'Protocol Update' : 'New Task Protocol'}</h2>
            <form onSubmit={handleSaveTaskForm} className="space-y-5">
              <div>
                <label className="text-[10px] font-black text-blue-400 uppercase tracking-[0.2em] mb-1.5 block">Objective</label>
                <textarea name="title" required rows={2} defaultValue={taskToEdit?.title || ""} className="w-full bg-slate-950 border border-slate-800 rounded-xl p-4 text-sm focus:border-blue-500 outline-none transition-all resize-none shadow-inner" placeholder="Mission objective..." />
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5 block">Category</label>
                  <select name="category" defaultValue={taskToEdit?.category || 'routine'} className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm outline-none focus:border-blue-500 cursor-pointer">
                    <option value="routine">Routine</option>
                    <option value="5x_speed">5x Speed</option>
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5 block">Grade</label>
                  <select name="urgency" defaultValue={taskToEdit?.urgency || TaskUrgency.REGULAR} className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm outline-none focus:border-blue-500 cursor-pointer">
                    <option value={TaskUrgency.REGULAR}>Regular</option>
                    <option value={TaskUrgency.PRIORITY}>Priority (2x)</option>
                    <option value={TaskUrgency.URGENT}>Urgent (3x)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5 block">Date</label>
                  <input name="date" type="date" required defaultValue={taskToEdit?.date || getTodayDateString()} className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm [color-scheme:dark]" />
                </div>
                <div>
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5 block">Time</label>
                  <input name="time" type="time" required defaultValue={taskToEdit?.time || getCurrentTimeFormatted()} className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm [color-scheme:dark]" />
                </div>
              </div>

              <div className="flex items-center justify-between p-4 bg-slate-950/80 rounded-[1.2rem] border border-slate-800/80 shadow-inner">
                <p className="text-[11px] font-black uppercase tracking-widest text-white">🔔 Smart Alarm</p>
                <input type="checkbox" name="enableAlarm" defaultChecked={taskToEdit ? taskToEdit.isAlarmed : false} className="w-6 h-6 accent-blue-500 cursor-pointer" />
              </div>

              <div className="pt-2 space-y-3">
                <button type="submit" className="w-full py-4 bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-black rounded-[1.2rem] uppercase text-sm tracking-[0.2em] shadow-lg active:scale-95 transition-all">
                  {taskToEdit ? 'COMMIT MODIFICATION' : 'SAVE PROTOCOL'}
                </button>
                <button type="button" onClick={() => { setShowTaskForm(false); setTaskToEdit(null); }} className="w-full py-1 text-slate-600 text-[10px] font-black uppercase tracking-[0.3em] text-center">Abort Mission</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {activeAlarm && <AlarmModal task={activeAlarm} onStop={(id) => { updateTask(id, { isAlarmed: false }); setActiveAlarm(null); }} onSnooze={(id, m) => { updateTask(id, { isSnoozed: true }); setActiveAlarm(null); setTimeout(() => updateTask(id, { isSnoozed: false }), m * 60000); }} onPostpone={(id, d, t) => { updateTask(id, { date: d, time: t, isSnoozed: false, isAlarmed: true }); setActiveAlarm(null); }} />}

      <BottomNav activeTab={activeTab} setActiveTab={setActiveTab} />
    </div>
  );
};

export default App;
