
import React, { useState, useEffect, useRef } from 'react';
import { Task, TaskUrgency } from './types';
import BottomNav from './components/BottomNav';
import TaskCard from './components/TaskCard';
import AlarmModal from './components/AlarmModal';
import { GeminiService, connectLiveAPI, connectTaskEntryAPI } from './geminiService';
import { decode, decodeAudioData, createBlob } from './audioUtils';

const App: React.FC = () => {
  // --- UTILS & STATE ---
  const getTodayDateString = () => {
    const now = new Date();
    return `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}-${now.getDate().toString().padStart(2, '0')}`;
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
  
  // Form State
  const [showTaskForm, setShowTaskForm] = useState(false);
  const [formObjective, setFormObjective] = useState('');
  const [formDate, setFormDate] = useState(getTodayDateString());
  const [formTime, setFormTime] = useState(getCurrentTimeFormatted());
  const [formCategory, setFormCategory] = useState<'routine' | '5x_speed'>('routine');
  const [formUrgency, setFormUrgency] = useState<TaskUrgency>(TaskUrgency.REGULAR);
  const [formNotes, setFormNotes] = useState('');
  const [initialProgressValue, setInitialProgressValue] = useState(0);
  const [alarmEnabled, setAlarmEnabled] = useState(false);
  const [isFormProgressUnlocked, setIsFormProgressUnlocked] = useState(false);

  // Ref to track latest form values FOR AI ACCESS
  const formRef = useRef({
    objective: '',
    date: getTodayDateString(),
    time: getCurrentTimeFormatted(),
    category: 'routine' as 'routine' | '5x_speed',
    urgency: TaskUrgency.REGULAR,
    alarm: false,
    progress: 0
  });

  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [activeAlarm, setActiveAlarm] = useState<Task | null>(null);
  
  const [dailySchedule, setDailySchedule] = useState<string | null>(() => localStorage.getItem('daily_schedule'));
  const [isGeneratingSchedule, setIsGeneratingSchedule] = useState(false);
  const [coachingAdvice, setCoachingAdvice] = useState<string | null>(() => localStorage.getItem('coaching_advice'));
  const [isAdviceLoading, setIsAdviceLoading] = useState(false);

  // --- COACH & ASSISTANT LIVE API STATE ---
  const [isCoachActive, setIsCoachActive] = useState(false);
  const [isAiAssistActive, setIsAiAssistActive] = useState(false);
  const [riaStatus, setRiaStatus] = useState<'IDLE' | 'LISTENING' | 'SPEAKING'>('IDLE');
  const [assistTranscript, setAssistTranscript] = useState('');
  const [transcriptBuffer, setTranscriptBuffer] = useState('');
  const [micVolume, setMicVolume] = useState(0);
  
  const sessionRef = useRef<any>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const outAudioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const nextStartTimeRef = useRef(0);
  const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const visualizerIntervalRef = useRef<number | null>(null);

  // --- PERSISTENCE ---
  useEffect(() => { localStorage.setItem('tasks', JSON.stringify(tasks)); }, [tasks]);
  useEffect(() => { if (dailySchedule) localStorage.setItem('daily_schedule', dailySchedule); }, [dailySchedule]);
  useEffect(() => { if (coachingAdvice) localStorage.setItem('coaching_advice', coachingAdvice); }, [coachingAdvice]);

  // Keep ref in sync for Manual edits
  useEffect(() => {
    formRef.current = {
      objective: formObjective,
      date: formDate,
      time: formTime,
      category: formCategory,
      urgency: formUrgency,
      alarm: alarmEnabled,
      progress: initialProgressValue
    };
  }, [formObjective, formDate, formTime, formCategory, formUrgency, alarmEnabled, initialProgressValue]);

  // --- ALARMS ---
  useEffect(() => {
    const checkAlarms = () => {
      const now = new Date();
      const triggered = tasks.find(t => {
        if (!t.isAlarmed || t.isCompleted || t.isSnoozed || activeAlarm) return false;
        const [hours, minutes] = t.time.split(':').map(Number);
        const taskTime = new Date(t.date);
        taskTime.setHours(hours, minutes, 0, 0);
        const alarmTime = new Date(taskTime.getTime() - (t.alarmLeadTime || 0) * 60000);
        const diff = Math.abs(now.getTime() - alarmTime.getTime());
        return diff < 30000; 
      });
      if (triggered) setActiveAlarm(triggered);
    };
    const timer = setInterval(checkAlarms, 10000);
    return () => clearInterval(timer);
  }, [tasks, activeAlarm]);

  // Reset form when opening/closing
  useEffect(() => {
    if (showTaskForm && !editingTask) {
      resetFormFields();
    } else if (showTaskForm && editingTask) {
      setFormObjective(editingTask.title);
      setFormDate(editingTask.date);
      setFormTime(editingTask.time);
      setFormCategory(editingTask.category);
      setFormUrgency(editingTask.urgency);
      setFormNotes(editingTask.notes);
      setInitialProgressValue(editingTask.completionPercentage);
      setAlarmEnabled(editingTask.isAlarmed);
      setAssistTranscript('');
      setIsFormProgressUnlocked(false);
    }
  }, [showTaskForm, editingTask]);

  const resetFormFields = () => {
    setFormObjective('');
    setFormDate(getTodayDateString());
    setFormTime(getCurrentTimeFormatted());
    setFormCategory('routine');
    setFormUrgency(TaskUrgency.REGULAR);
    setFormNotes('');
    setInitialProgressValue(0);
    setAlarmEnabled(false);
    setAssistTranscript('');
    setTranscriptBuffer('');
    setIsFormProgressUnlocked(false);
  };

  // --- AUDIO VISUALIZATION ---
  const startMicVisualization = (analyser: AnalyserNode) => {
    const dataArray = new Uint8Array(analyser.frequencyBinCount);
    const update = () => {
      analyser.getByteFrequencyData(dataArray);
      let sum = 0;
      for (let i = 0; i < dataArray.length; i++) {
        sum += dataArray[i];
      }
      const average = sum / dataArray.length;
      setMicVolume(average);
      visualizerIntervalRef.current = requestAnimationFrame(update);
    };
    update();
  };

  const stopVoiceSession = () => {
    setIsCoachActive(false);
    setIsAiAssistActive(false);
    setRiaStatus('IDLE');
    setMicVolume(0);
    if (visualizerIntervalRef.current) cancelAnimationFrame(visualizerIntervalRef.current);
    if (sessionRef.current) {
        try { sessionRef.current.close(); } catch(e) {}
        sessionRef.current = null;
    }
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close().catch(() => {});
    }
    if (outAudioContextRef.current && outAudioContextRef.current.state !== 'closed') {
      outAudioContextRef.current.close().catch(() => {});
    }
    sourcesRef.current.forEach(s => { try { s.stop(); } catch(e) {} });
    sourcesRef.current.clear();
  };

  // --- AI ASSISTANT (FOR TASK ENTRY) ---
  const startAiAssistSession = async () => {
    try {
      if (isAiAssistActive) return;
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      outAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      const sessionPromise = connectTaskEntryAPI({
        onopen: () => {
          setIsAiAssistActive(true);
          setRiaStatus('LISTENING');
          
          const source = audioContextRef.current!.createMediaStreamSource(stream);
          analyserRef.current = audioContextRef.current!.createAnalyser();
          analyserRef.current.fftSize = 256;
          source.connect(analyserRef.current);
          startMicVisualization(analyserRef.current);

          const scriptProcessor = audioContextRef.current!.createScriptProcessor(4096, 1, 1);
          scriptProcessor.onaudioprocess = (e) => {
            if (audioContextRef.current?.state === 'suspended') {
              audioContextRef.current.resume();
            }
            const inputData = e.inputBuffer.getChannelData(0);
            const pcmBlob = createBlob(inputData);
            sessionPromise.then(s => s.sendRealtimeInput({ media: pcmBlob }));
          };
          source.connect(scriptProcessor);
          scriptProcessor.connect(audioContextRef.current!.destination);
          
          // CRITICAL: Proactive Greeting
          sessionPromise.then(s => s.sendRealtimeInput({ text: "Assistant initiate link. Greet the commander." }));
        },
        onmessage: async (message: any) => {
          // Sentence-based transcription logic
          if (message.serverContent?.outputTranscription) {
            setTranscriptBuffer(prev => (prev + message.serverContent.outputTranscription.text));
          }
          if (message.serverContent?.turnComplete) {
            setAssistTranscript(prev => (prev + " " + transcriptBuffer).trim());
            setTranscriptBuffer('');
          }

          if (message.toolCall) {
            for (const fc of message.toolCall.functionCalls) {
              if (fc.name === 'update_task_field') {
                const { field, value } = fc.args;
                if (field === 'objective') { setFormObjective(value); formRef.current.objective = value; }
                if (field === 'category') { 
                  const v = value.toLowerCase().includes('5x') ? '5x_speed' : 'routine'; 
                  setFormCategory(v as any); 
                  formRef.current.category = v as any; 
                }
                if (field === 'priority') { 
                  const val = value.charAt(0).toUpperCase() + value.slice(1).toLowerCase(); 
                  if (val === 'Important' || val === 'Priority') { 
                    setFormUrgency(TaskUrgency.IMPORTANT); 
                    formRef.current.urgency = TaskUrgency.IMPORTANT; 
                  } else if (Object.values(TaskUrgency).includes(val as TaskUrgency)) { 
                    setFormUrgency(val as TaskUrgency); 
                    formRef.current.urgency = val as TaskUrgency; 
                  } 
                }
                if (field === 'time') { setFormTime(value); formRef.current.time = value; }
                if (field === 'date') { setFormDate(value); formRef.current.date = value; }
                if (field === 'alarm') { 
                  const isOn = value.toLowerCase() === 'on' || value.toLowerCase() === 'yes'; 
                  setAlarmEnabled(isOn); 
                  formRef.current.alarm = isOn; 
                }
                if (field === 'progress') { 
                  const prog = Math.min(100, Math.max(0, parseInt(value) || 0)); 
                  setInitialProgressValue(prog); 
                  formRef.current.progress = prog; 
                }
                sessionPromise.then(s => s.sendToolResponse({ functionResponses: { id: fc.id, name: fc.name, response: { result: "Protocol updated." } } }));
              } else if (fc.name === 'launch_mission') {
                const success = saveCurrentForm(true);
                if (success) {
                  sessionPromise.then(s => s.sendToolResponse({ functionResponses: { id: fc.id, name: fc.name, response: { result: "Mission launched." } } }));
                  setAssistTranscript("PROTOCOL SECURED. MISSION INITIALIZED.");
                  // Reset form for potential next mission
                  resetFormFields();
                } else {
                  sessionPromise.then(s => s.sendToolResponse({ functionResponses: { id: fc.id, name: fc.name, response: { result: "Error: Objective missing." } } }));
                }
              }
            }
          }
          if (message.serverContent?.interrupted) {
            sourcesRef.current.forEach(s => { try { s.stop(); } catch(e) {} });
            sourcesRef.current.clear();
            nextStartTimeRef.current = 0;
            setRiaStatus('LISTENING');
          }
          if (message.serverContent?.modelTurn?.parts) {
            for (const part of message.serverContent.modelTurn.parts) {
              if (part.inlineData?.data) {
                if (outAudioContextRef.current?.state === 'suspended') await outAudioContextRef.current.resume();
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
        },
        onclose: () => stopVoiceSession(),
        onerror: () => stopVoiceSession()
      }, 'English');
      sessionRef.current = await sessionPromise;
    } catch (e) { console.error(e); }
  };

  // --- COACH LOGIC ---
  const runStrategicAnalysis = async () => {
    setIsAdviceLoading(true);
    try {
      const todayStr = getTodayDateString();
      const todayMissions = tasks.filter(t => t.date === todayStr);
      const advice = await GeminiService.getProductivityAdvice(todayMissions, [], [], 'English');
      setCoachingAdvice(advice);
    } catch (e) { console.error(e); }
    finally { setIsAdviceLoading(false); }
  };

  const startCoachSession = async () => {
    try {
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      outAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const sessionPromise = connectLiveAPI({
        onopen: () => {
          setIsCoachActive(true);
          setRiaStatus('LISTENING');
          const source = audioContextRef.current!.createMediaStreamSource(stream);
          analyserRef.current = audioContextRef.current!.createAnalyser();
          analyserRef.current.fftSize = 256;
          source.connect(analyserRef.current);
          startMicVisualization(analyserRef.current);

          const scriptProcessor = audioContextRef.current!.createScriptProcessor(4096, 1, 1);
          scriptProcessor.onaudioprocess = (e) => {
            if (audioContextRef.current?.state === 'suspended') audioContextRef.current.resume();
            const inputData = e.inputBuffer.getChannelData(0);
            const pcmBlob = createBlob(inputData);
            sessionPromise.then(s => s.sendRealtimeInput({ media: pcmBlob }));
          };
          source.connect(scriptProcessor);
          scriptProcessor.connect(audioContextRef.current!.destination);
          sessionPromise.then(s => s.sendRealtimeInput({ text: "Ria, provide the performance analysis briefing." }));
        },
        onmessage: async (message: any) => {
          if (message.serverContent?.interrupted) {
            sourcesRef.current.forEach(s => { try { s.stop(); } catch(e) {} });
            sourcesRef.current.clear();
            nextStartTimeRef.current = 0;
            setRiaStatus('LISTENING');
          }
          if (message.serverContent?.modelTurn?.parts) {
            for (const part of message.serverContent.modelTurn.parts) {
              if (part.inlineData?.data) {
                if (outAudioContextRef.current?.state === 'suspended') await outAudioContextRef.current.resume();
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
        },
        onclose: () => stopVoiceSession(),
        onerror: () => stopVoiceSession()
      }, { tasks, reports: [], history: [], language: 'English' });
      sessionRef.current = await sessionPromise;
    } catch (e) { console.error(e); }
  };

  // --- SAVING LOGIC ---
  const saveCurrentForm = (fromAI = false) => {
    const currentData = fromAI ? formRef.current : {
      objective: formObjective,
      category: formCategory,
      urgency: formUrgency,
      time: formTime,
      date: formDate,
      alarm: alarmEnabled,
      progress: initialProgressValue
    };

    if (!currentData.objective || currentData.objective.trim() === '') return false;

    const taskData: Task = {
      id: editingTask ? editingTask.id : Math.random().toString(36).substr(2, 9),
      title: currentData.objective || 'Untitled Mission',
      category: currentData.category,
      urgency: currentData.urgency,
      time: currentData.time,
      date: currentData.date,
      completionPercentage: currentData.progress,
      notes: formNotes,
      interimNotes: formNotes || (editingTask ? editingTask.interimNotes : ''),
      isAlarmed: currentData.alarm,
      alarmLeadTime: currentData.alarm ? 0 : 0,
      isDailyRepeat: false,
      isRepeatAtTime: false,
      isSnoozed: false,
      isCompleted: currentData.progress === 100
    };

    setTasks(prev => {
      if (editingTask) return prev.map(t => t.id === editingTask.id ? taskData : t);
      return [...prev, taskData];
    });

    if (!fromAI) {
      resetFormFields();
      setEditingTask(null);
    }
    return true;
  };

  const handleSaveTaskForm = (e: React.FormEvent) => { e.preventDefault(); saveCurrentForm(); setShowTaskForm(false); stopVoiceSession(); };
  const updateTask = (id: string, updates: Partial<Task>) => setTasks(prev => prev.map(t => t.id === id ? { ...t, ...updates } : t));
  const deleteTask = (id: string) => setTasks(prev => prev.filter(t => t.id !== id));
  const handleEditTask = (task: Task) => { setEditingTask(task); setShowTaskForm(true); };
  const handleAlarmStop = (id: string) => { updateTask(id, { isAlarmed: false }); setActiveAlarm(null); };

  // --- CALCULATIONS ---
  const todayMissions = tasks.filter(t => t.date === getTodayDateString());
  const avgCompletion = todayMissions.length > 0 ? Math.round(todayMissions.reduce((acc, t) => acc + t.completionPercentage, 0) / todayMissions.length) : 0;
  const circumference = 2 * Math.PI * 76;
  const dashOffset = circumference - (circumference * avgCompletion) / 100;

  return (
    <div className="min-h-screen pb-24 bg-[#020617] text-slate-100 font-['Space_Grotesk'] overflow-x-hidden">
      <header className="px-6 pt-10 pb-8 sticky top-0 z-40 bg-[#020617]/95 backdrop-blur-xl border-b border-white/5 shadow-2xl">
        <div className="flex justify-between items-end max-w-2xl mx-auto">
          <div>
            <h1 className="text-3xl font-black italic tracking-tighter text-white uppercase">TO DO LIST</h1>
            <p className="text-sm font-bold text-blue-500 tracking-[0.4em] uppercase mt-1">Strategic Operations</p>
          </div>
          <button onClick={() => { setEditingTask(null); setShowTaskForm(true); }} className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-700 flex items-center justify-center text-4xl font-light shadow-2xl border border-blue-400/20 active:scale-90 transition-all">+</button>
        </div>
      </header>

      <main className="px-6 pt-6 max-w-2xl mx-auto">
        {activeTab === 'routine' ? (
          <div className="space-y-8">
            <button onClick={() => { setEditingTask(null); setShowTaskForm(true); setTimeout(startAiAssistSession, 500); }} className="w-full py-6 rounded-3xl bg-blue-600/10 border-2 border-blue-500/30 flex items-center justify-center gap-4 text-blue-400 font-black uppercase tracking-[0.2em] shadow-xl hover:bg-blue-600 hover:text-white transition-all">🎙️ Assistant</button>
            <div className="grid grid-cols-3 gap-3">
              <div className="p-4 rounded-3xl bg-slate-900/40 border border-blue-500/10 text-center transition-all hover:bg-slate-900"><span className="text-2xl font-black">{todayMissions.length}</span><br/><span className="text-[8px] text-slate-500 font-black uppercase tracking-widest">Total</span></div>
              <div className="p-4 rounded-3xl bg-slate-900/40 border border-amber-500/10 text-center transition-all hover:bg-slate-900"><span className="text-2xl font-black text-amber-500">{todayMissions.filter(t=>!t.isCompleted).length}</span><br/><span className="text-[8px] text-amber-500 font-black uppercase tracking-widest">Active</span></div>
              <div className="p-4 rounded-3xl bg-slate-900/40 border border-green-500/10 text-center transition-all hover:bg-slate-900"><span className="text-2xl font-black text-green-500">{todayMissions.filter(t=>t.isCompleted).length}</span><br/><span className="text-[8px] text-green-500 font-black uppercase tracking-widest">Done</span></div>
            </div>
            <div className="space-y-6">{todayMissions.map(task => <TaskCard key={task.id} task={task} onUpdate={updateTask} onDelete={deleteTask} onEdit={handleEditTask} />)}</div>
          </div>
        ) : activeTab === 'list' ? (
          <div className="space-y-4">{tasks.sort((a,b) => b.date.localeCompare(a.date)).map(task => (
            <div key={task.id} className="p-5 rounded-3xl bg-slate-900/50 border border-white/5 flex justify-between items-center transition-all hover:bg-slate-900/70 shadow-lg">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-full bg-slate-950 border border-white/10 flex items-center justify-center">{task.isAlarmed ? '🔔' : '🔕'}</div>
                <div><h3 className={`font-bold ${task.isCompleted ? 'text-slate-600 line-through' : 'text-white'}`}>{task.title}</h3><p className="text-[10px] text-slate-500 uppercase tracking-widest">{task.date} • {task.time}</p></div>
              </div>
              <div className="flex gap-2">
                <button onClick={() => handleEditTask(task)} className="h-10 px-5 text-blue-500 font-black uppercase text-[10px] bg-blue-500/10 rounded-xl border border-blue-500/20 active:scale-95 transition-all">Edit</button>
                <button onClick={() => deleteTask(task.id)} className="w-10 h-10 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center text-red-500 transition-all">✕</button>
              </div>
            </div>
          ))}</div>
        ) : activeTab === 'ai' ? (
          <div className="space-y-10 py-6 flex flex-col items-center max-w-lg mx-auto">
            <h2 className="text-4xl font-black italic text-white uppercase tracking-tighter">RIA COACH</h2>
            <div className="p-10 rounded-[3rem] bg-slate-900/60 border border-blue-500/20 text-center shadow-2xl relative w-full">
              <h2 className="text-xs font-black text-blue-500 uppercase tracking-[0.5em] mb-6">Efficiency Level</h2>
              <div className="relative inline-block mb-6">
                <svg className="w-48 h-48 transform -rotate-90" viewBox="0 0 192 192">
                  <circle cx="96" cy="96" r="76" fill="none" stroke="#0f172a" strokeWidth="14" />
                  <circle cx="96" cy="96" r="76" fill="none" stroke="#3b82f6" strokeWidth="14" strokeDasharray={circumference} strokeDashoffset={dashOffset} strokeLinecap="round" />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center"><span className="text-5xl font-black text-white">{avgCompletion}%</span></div>
              </div>
            </div>
            <div className="w-full space-y-6">
               <div className="p-6 rounded-[2rem] bg-slate-900/60 border border-blue-500/20 shadow-2xl">
                  <h3 className="text-xs font-black text-blue-500 uppercase tracking-[0.4em] mb-4">Strategic Advice</h3>
                  {isAdviceLoading ? (
                    <div className="py-10 flex flex-col items-center gap-4">
                       <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                       <p className="text-[10px] font-black text-slate-500 uppercase animate-pulse">Analyzing Performance...</p>
                    </div>
                  ) : coachingAdvice ? (
                    <div className="space-y-4 text-slate-200 leading-relaxed font-medium">
                       {coachingAdvice.split('\n').map((para, i) => <p key={i}>{para}</p>)}
                    </div>
                  ) : (
                    <p className="text-slate-500 italic text-center py-6">Mission data awaiting analysis. Tap below to begin.</p>
                  )}
               </div>
               <div className="flex flex-col gap-4">
                  <button onClick={runStrategicAnalysis} className="w-full py-5 bg-slate-900 border border-slate-800 text-blue-400 font-black uppercase tracking-widest rounded-2xl shadow-xl transition-all hover:bg-slate-800">Refresh Analysis</button>
                  <button onClick={isCoachActive ? stopVoiceSession : startCoachSession} className={`w-full py-6 rounded-[1.8rem] font-black uppercase tracking-[0.2em] text-xl transition-all flex items-center justify-center gap-4 ${isCoachActive ? 'bg-red-600' : 'bg-[#0f172a] border border-blue-500/30'}`}>
                    {isCoachActive ? 'ABORT LINK' : 'LIVE BRIEFING'}
                  </button>
               </div>
            </div>
          </div>
        ) : null}
      </main>

      {showTaskForm && (
        <div className="fixed inset-0 z-[100] bg-black/95 backdrop-blur-2xl flex items-start justify-center p-4 pt-safe overflow-y-auto">
          <div className="w-full max-w-lg bg-slate-900 rounded-[2.5rem] p-8 border border-blue-500/30 shadow-2xl mt-32 mb-10 relative">
            <div className="absolute -top-16 left-1/2 -translate-x-1/2 z-20">
              <button type="button" onClick={isAiAssistActive ? stopVoiceSession : startAiAssistSession} className={`w-32 h-32 rounded-full flex flex-col items-center justify-center border-4 transition-all duration-500 ${isAiAssistActive ? 'bg-amber-600 border-amber-400 animate-pulse' : 'bg-blue-600 border-blue-400'}`}>
                <span className="text-4xl mb-1">{isAiAssistActive ? '📡' : '🎙️'}</span>
                <span className="text-[10px] font-black uppercase tracking-widest">{isAiAssistActive ? 'STOP' : 'ASSISTANT'}</span>
              </button>
            </div>
            <div className="mt-16 mb-8 text-center">
              <h2 className="text-2xl font-black italic uppercase text-blue-400">{editingTask ? 'Modify Mission' : 'New Mission'}</h2>
              {isAiAssistActive && (
                 <div className="p-4 bg-blue-500/10 border border-blue-400/30 rounded-2xl mt-4 min-h-[80px]">
                    <div className="text-sm font-bold text-white italic">
                      {assistTranscript || transcriptBuffer || 'Awaiting Ria command...'}
                    </div>
                 </div>
              )}
            </div>
            <form onSubmit={handleSaveTaskForm} className="space-y-6">
              <textarea 
                value={formObjective} 
                onChange={(e) => setFormObjective(e.target.value)} 
                onFocus={(e) => isAiAssistActive && e.target.blur()}
                readOnly={isAiAssistActive}
                rows={1} 
                placeholder="Operational Objective..." 
                className={`w-full bg-slate-950 border border-slate-800 rounded-2xl p-4 text-lg font-medium outline-none focus:border-blue-500 transition-all text-white ${isAiAssistActive ? 'opacity-80' : ''}`} 
              />
              <div className="grid grid-cols-2 gap-4">
                <input type="date" value={formDate} readOnly={isAiAssistActive} onFocus={(e) => isAiAssistActive && e.target.blur()} onChange={(e) => setFormDate(e.target.value)} className="bg-slate-950 border border-slate-800 rounded-xl p-4 text-white outline-none [color-scheme:dark]" />
                <input type="time" value={formTime} readOnly={isAiAssistActive} onFocus={(e) => isAiAssistActive && e.target.blur()} onChange={(e) => setFormTime(e.target.value)} className="bg-slate-950 border border-slate-800 rounded-xl p-4 text-white outline-none [color-scheme:dark]" />
              </div>
              <div className="space-y-5">
                <div className="flex justify-between items-center mb-1">
                   <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Current Progress: {initialProgressValue}%</label>
                   <button type="button" onClick={() => setIsFormProgressUnlocked(!isFormProgressUnlocked)} className={`text-[10px] font-black px-6 py-4 rounded-2xl border transition-all ${isFormProgressUnlocked ? 'bg-blue-600 border-blue-400 text-white animate-pulse' : 'bg-slate-800 border-slate-700 text-slate-400'}`}>
                     {isFormProgressUnlocked ? '🔓 UNLOCKED' : '🔒 LOCKED'}
                   </button>
                </div>
                <input 
                  type="range" 
                  min="0" max="100" step="1" 
                  value={initialProgressValue} 
                  disabled={!isFormProgressUnlocked}
                  onChange={(e) => setInitialProgressValue(parseInt(e.target.value))} 
                  onPointerUp={() => setIsFormProgressUnlocked(false)} // AUTO LOCK
                  className={`w-full h-4 bg-slate-800 rounded-lg appearance-none accent-blue-500 transition-all ${isFormProgressUnlocked ? 'opacity-100' : 'opacity-20 cursor-not-allowed'}`} 
                />
                <div className="grid grid-cols-2 gap-2">
                   <button type="button" onClick={() => setFormCategory('routine')} className={`py-4 text-xs font-black uppercase border rounded-xl ${formCategory === 'routine' ? 'bg-blue-600 border-blue-400 text-white' : 'bg-slate-950 border-slate-800 text-slate-500'}`}>Routine</button>
                   <button type="button" onClick={() => setFormCategory('5x_speed')} className={`py-4 text-xs font-black uppercase border rounded-xl ${formCategory === '5x_speed' ? 'bg-amber-600 border-amber-400 text-white' : 'bg-slate-950 border-slate-800 text-slate-500'}`}>5x Speed</button>
                </div>
                <div className="grid grid-cols-3 gap-2">
                   {Object.values(TaskUrgency).map((urg) => (
                     <button key={urg} type="button" onClick={() => setFormUrgency(urg)} className={`py-4 text-[10px] font-black uppercase border rounded-xl ${formUrgency === urg ? 'bg-blue-600 border-blue-400 text-white' : 'bg-slate-950 border-slate-800 text-slate-500'}`}>
                       {urg}
                     </button>
                   ))}
                </div>
                <div className="flex items-center justify-between p-4 bg-slate-950 rounded-2xl border border-slate-800">
                  <span className="text-[10px] font-black text-slate-300 uppercase tracking-widest">Alarm Protocol</span>
                  <button type="button" onClick={() => setAlarmEnabled(!alarmEnabled)} className={`w-14 h-7 rounded-full relative transition-all ${alarmEnabled ? 'bg-blue-600' : 'bg-slate-800'}`}>
                    <div className={`absolute top-1 w-5 h-5 bg-white rounded-full transition-all ${alarmEnabled ? 'right-1' : 'left-1'}`} />
                  </button>
                </div>
              </div>
              <div className="pt-8 flex flex-col gap-3">
                <button type="submit" className="w-full py-5 bg-blue-600 text-white font-black rounded-2xl uppercase tracking-widest shadow-xl shadow-blue-600/30">
                  {editingTask ? 'Update Mission' : 'Launch Mission'}
                </button>
                <button type="button" onClick={() => { setShowTaskForm(false); stopVoiceSession(); }} className="w-full py-2 text-slate-600 text-[10px] font-black uppercase tracking-widest">Abort protocol</button>
              </div>
            </form>
          </div>
        </div>
      )}
      {activeAlarm && <AlarmModal task={activeAlarm} onStop={handleAlarmStop} onSnooze={(id, m) => { updateTask(id, { isSnoozed: true }); setActiveAlarm(null); setTimeout(() => updateTask(id, { isSnoozed: false }), m * 60000); }} onPostpone={(id, d, t) => { updateTask(id, { date: d, time: t, isSnoozed: false, isAlarmed: true }); setActiveAlarm(null); }} />}
      <BottomNav activeTab={activeTab} setActiveTab={setActiveTab} />
    </div>
  );
};

export default App;
