
import React, { useState, useEffect, useRef } from 'react';
import { Task, TaskUrgency } from './types';
import BottomNav from './components/BottomNav';
import TaskCard from './components/TaskCard';
import AlarmModal from './components/AlarmModal';
import { GeminiService, connectTaskEntryAPI } from './geminiService';
import { decode, decodeAudioData, createBlob } from './audioUtils';

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState('routine');
  const [tasks, setTasks] = useState<Task[]>(() => JSON.parse(localStorage.getItem('tasks') || '[]'));
  const [showTaskForm, setShowTaskForm] = useState(false);
  const [formObjective, setFormObjective] = useState('');
  const [formDate, setFormDate] = useState(new Date().toISOString().split('T')[0]);
  const [formTime, setFormTime] = useState(new Date().toTimeString().slice(0, 5));
  const [formCategory, setFormCategory] = useState<'routine' | '5x_speed'>('routine');
  const [formUrgency, setFormUrgency] = useState<TaskUrgency>(TaskUrgency.REGULAR);
  const [alarmEnabled, setAlarmEnabled] = useState(false);

  // Focus Mode State
  const [focusedTask, setFocusedTask] = useState<Task | null>(null);
  const [timerSeconds, setTimerSeconds] = useState(1500); // 25 mins
  const [isTimerActive, setIsTimerActive] = useState(false);

  const formRef = useRef({ objective: '', date: '', time: '', category: 'routine', urgency: TaskUrgency.REGULAR, alarm: false });
  const [coachingAdvice, setCoachingAdvice] = useState<{text: string, sources: any[]} | null>(null);
  const [isAdviceLoading, setIsAdviceLoading] = useState(false);

  const [isAiAssistActive, setIsAiAssistActive] = useState(false);
  const [riaStatus, setRiaStatus] = useState<'IDLE' | 'LISTENING' | 'SPEAKING'>('IDLE');
  const [assistTranscript, setAssistTranscript] = useState('');
  const [transcriptBuffer, setTranscriptBuffer] = useState('');
  const [micVolume, setMicVolume] = useState(0);

  const sessionRef = useRef<any>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const outAudioContextRef = useRef<AudioContext | null>(null);
  const nextStartTimeRef = useRef(0);
  const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const visualizerIntervalRef = useRef<number | null>(null);
  const timerIntervalRef = useRef<number | null>(null);

  useEffect(() => { localStorage.setItem('tasks', JSON.stringify(tasks)); }, [tasks]);

  useEffect(() => {
    formRef.current = { objective: formObjective, date: formDate, time: formTime, category: formCategory, urgency: formUrgency, alarm: alarmEnabled };
  }, [formObjective, formDate, formTime, formCategory, formUrgency, alarmEnabled]);

  // Timer Effect
  useEffect(() => {
    if (isTimerActive && timerSeconds > 0) {
      timerIntervalRef.current = window.setInterval(() => {
        setTimerSeconds(s => s - 1);
      }, 1000);
    } else if (timerSeconds === 0) {
      setIsTimerActive(false);
      alert("Deep Work session complete. Great job, Commander.");
    }
    return () => {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    };
  }, [isTimerActive, timerSeconds]);

  const resetFormFields = () => {
    setFormObjective('');
    setFormDate(new Date().toISOString().split('T')[0]);
    setFormTime(new Date().toTimeString().slice(0, 5));
    setFormCategory('routine');
    setFormUrgency(TaskUrgency.REGULAR);
    setAlarmEnabled(false);
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

  const startAiAssistSession = async () => {
    if (isAiAssistActive) return;
    try {
      audioContextRef.current = new AudioContext({ sampleRate: 16000 });
      outAudioContextRef.current = new AudioContext({ sampleRate: 24000 });
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      const sessionPromise = connectTaskEntryAPI({
        onopen: () => {
          setIsAiAssistActive(true);
          setRiaStatus('LISTENING');
          const source = audioContextRef.current!.createMediaStreamSource(stream);
          const analyser = audioContextRef.current!.createAnalyser();
          source.connect(analyser);
          
          const updateVisuals = () => {
            if (!isAiAssistActive) return;
            const dataArray = new Uint8Array(analyser.frequencyBinCount);
            analyser.getByteFrequencyData(dataArray);
            let sum = 0;
            for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
            setMicVolume(sum / dataArray.length);
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
            const phrase = transcriptBuffer.trim();
            setAssistTranscript(prev => (prev + "\n" + phrase).trim());
            setTranscriptBuffer('');
            if (["good luck", "terminated", "goodbye"].some(k => phrase.toLowerCase().includes(k))) {
              setTimeout(() => { setShowTaskForm(false); stopVoiceSession(); }, 3000);
            }
          }
          if (message.toolCall) {
            for (const fc of message.toolCall.functionCalls) {
              if (fc.name === 'update_task_field') {
                const { field, value } = fc.args;
                if (field === 'objective') setFormObjective(value);
                if (field === 'time') setFormTime(value);
                if (field === 'date') setFormDate(value);
                if (field === 'category') setFormCategory(value.toLowerCase().includes('5x') ? '5x_speed' : 'routine');
                if (field === 'priority') {
                  const p = value.toLowerCase();
                  if (p.includes('important')) setFormUrgency(TaskUrgency.IMPORTANT);
                  else if (p.includes('urgent')) setFormUrgency(TaskUrgency.URGENT);
                  else setFormUrgency(TaskUrgency.REGULAR);
                }
                if (field === 'alarm') setAlarmEnabled(value.toLowerCase().includes('on') || value.toLowerCase().includes('yes'));
                sessionPromise.then(s => s.sendToolResponse({ functionResponses: { id: fc.id, name: fc.name, response: { result: "locked" } } }));
              } else if (fc.name === 'launch_mission') {
                saveCurrentForm(true);
                resetFormFields();
                sessionPromise.then(s => s.sendToolResponse({ functionResponses: { id: fc.id, name: fc.name, response: { result: "launched" } } }));
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
                source.onended = () => { sourcesRef.current.delete(source); if (sourcesRef.current.size === 0) setRiaStatus('LISTENING'); };
              }
            }
          }
        }
      });
      sessionRef.current = await sessionPromise;
    } catch (e) { console.error(e); stopVoiceSession(); }
  };

  const saveCurrentForm = (fromAI = false) => {
    const data = fromAI ? formRef.current : { objective: formObjective, date: formDate, time: formTime, category: formCategory, urgency: formUrgency, alarm: alarmEnabled };
    if (!data.objective) return false;
    const newTask: Task = {
      id: Math.random().toString(36).substr(2, 9),
      title: data.objective,
      date: data.date,
      time: data.time,
      urgency: data.urgency as TaskUrgency,
      category: data.category as any,
      completionPercentage: 0,
      notes: '',
      isAlarmed: data.alarm,
      isCompleted: false,
      isSnoozed: false
    };
    setTasks(prev => [...prev, newTask]);
    if (!fromAI) { setShowTaskForm(false); stopVoiceSession(); resetFormFields(); }
    return true;
  };

  const runStrategicAnalysis = async () => {
    setIsAdviceLoading(true);
    try { setCoachingAdvice(await GeminiService.getProductivityAdvice(tasks, [], [])); } catch (e) { console.error(e); }
    finally { setIsAdviceLoading(false); }
  };

  const startFocusOnTask = (task: Task) => {
    setFocusedTask(task);
    setTimerSeconds(1500);
    setIsTimerActive(true);
    setActiveTab('focus');
  };

  const formatTime = (totalSeconds: number) => {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const todayMissions = tasks.filter(t => t.date === new Date().toISOString().split('T')[0]);

  return (
    <div className="min-h-screen pb-24 bg-[#020617] text-slate-100 font-['Space_Grotesk']">
      <header className="px-6 pt-10 pb-8 sticky top-0 z-40 bg-[#020617]/95 backdrop-blur-xl border-b border-white/5">
        <div className="flex justify-between items-end max-w-2xl mx-auto">
          <div><h1 className="text-3xl font-black italic tracking-tighter uppercase">TO DO LIST</h1><p className="text-[10px] font-black text-blue-500 tracking-[0.4em] uppercase mt-1">Operational Briefing</p></div>
          <button onClick={() => { resetFormFields(); setShowTaskForm(true); }} className="w-16 h-16 rounded-2xl bg-blue-600 flex items-center justify-center text-4xl shadow-2xl active:scale-90 transition-all">+</button>
        </div>
      </header>

      <main className="px-6 pt-6 max-w-2xl mx-auto">
        {activeTab === 'routine' && (
          <div className="space-y-8">
            <button onClick={() => { setShowTaskForm(true); setTimeout(startAiAssistSession, 500); }} className="w-full py-6 rounded-3xl bg-blue-600/10 border-2 border-blue-500/30 flex items-center justify-center gap-4 text-blue-400 font-black uppercase tracking-[0.2em] hover:bg-blue-600 hover:text-white transition-all">🎙️ Initiate Ria Link</button>
            <div className="space-y-6">{todayMissions.length > 0 ? todayMissions.map(task => <TaskCard key={task.id} task={task} onFocus={startFocusOnTask} onUpdate={(id, up) => setTasks(prev => prev.map(t=>t.id===id?{...t,...up}:t))} onDelete={id => setTasks(prev => prev.filter(t=>t.id!==id))} onEdit={t => {setFormObjective(t.title); setFormUrgency(t.urgency); setShowTaskForm(true);}} />) : <p className="text-center py-12 text-slate-500 italic">No missions today, Commander. Initiate link to deploy.</p>}</div>
          </div>
        )}

        {activeTab === 'focus' && (
          <div className="flex flex-col items-center justify-center py-10 space-y-12">
            <div className="text-center">
              <h2 className="text-blue-500 text-[10px] font-black uppercase tracking-[0.5em] mb-4">Focus Protocol Active</h2>
              <h1 className="text-2xl font-black text-white px-8">{focusedTask ? focusedTask.title : 'Deep Work Session'}</h1>
            </div>

            <div className="relative w-72 h-72 flex items-center justify-center">
              <div className="absolute inset-0 rounded-full border-4 border-slate-900 shadow-[0_0_50px_rgba(59,130,246,0.1)]"></div>
              <svg className="w-full h-full -rotate-90">
                <circle 
                  cx="50%" cy="50%" r="48%" 
                  className="fill-none stroke-blue-500 stroke-[4px] transition-all duration-1000"
                  style={{ strokeDasharray: '603', strokeDashoffset: (603 - (603 * (timerSeconds / 1500))).toString() }}
                />
              </svg>
              <div className="absolute flex flex-col items-center">
                <span className="text-6xl font-black tracking-tighter text-white tabular-nums">{formatTime(timerSeconds)}</span>
                <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest mt-2">remaining</span>
              </div>
            </div>

            <div className="flex gap-4 w-full max-w-xs">
              <button 
                onClick={() => setIsTimerActive(!isTimerActive)}
                className={`flex-1 py-5 rounded-3xl font-black uppercase tracking-widest text-sm shadow-xl transition-all ${isTimerActive ? 'bg-slate-800 text-slate-400' : 'bg-blue-600 text-white shadow-blue-600/30'}`}
              >
                {isTimerActive ? 'Pause' : 'Resume'}
              </button>
              <button 
                onClick={() => { setTimerSeconds(1500); setIsTimerActive(false); }}
                className="px-8 py-5 bg-slate-900 border border-white/5 rounded-3xl font-black uppercase text-[10px] tracking-widest text-slate-400"
              >
                Reset
              </button>
            </div>

            <div className="p-6 bg-slate-900/50 border border-white/5 rounded-[2rem] max-w-sm text-center">
              <p className="text-blue-400 italic font-medium leading-relaxed">"Eliminate all distractions. Your objective is the only reality for the next {Math.floor(timerSeconds/60)} minutes."</p>
            </div>
          </div>
        )}

        {activeTab === 'ai' && (
          <div className="space-y-10 py-6 max-w-lg mx-auto">
            <div className="p-8 rounded-[2.5rem] bg-slate-900 border border-blue-500/20 shadow-2xl">
              <h3 className="text-xs font-black text-blue-500 uppercase tracking-[0.4em] mb-6">Strategic Intelligence</h3>
              {isAdviceLoading ? (
                <div className="py-12 flex flex-col items-center gap-4 animate-pulse">
                  <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                  <p className="text-[10px] font-black text-slate-500 uppercase">Analyzing...</p>
                </div>
              ) : coachingAdvice ? (
                <div className="space-y-8">
                  <p className="text-slate-200 leading-relaxed font-medium italic text-lg">{coachingAdvice.text}</p>
                  
                  {coachingAdvice.sources && coachingAdvice.sources.length > 0 && (
                    <div className="pt-6 border-t border-white/5">
                      <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] mb-4">Research Sources</h4>
                      <div className="flex flex-wrap gap-2">
                        {coachingAdvice.sources.map((chunk: any, i: number) => {
                          const uri = chunk.web?.uri || chunk.maps?.uri;
                          const title = chunk.web?.title || chunk.maps?.title || "Research Link";
                          if (!uri) return null;
                          return (
                            <a 
                              key={i} 
                              href={uri} 
                              target="_blank" 
                              rel="noopener noreferrer"
                              className="px-3 py-1.5 bg-slate-800 border border-white/5 rounded-lg text-[10px] text-blue-400 font-bold hover:bg-blue-600 hover:text-white transition-all max-w-full truncate"
                            >
                              {title}
                            </a>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-slate-500 italic text-center py-12">No data. Trigger briefing for strategic insights.</p>
              )}
            </div>
            <button onClick={runStrategicAnalysis} className="w-full py-6 bg-blue-600 text-white font-black uppercase tracking-widest rounded-3xl shadow-xl shadow-blue-600/30 active:scale-95 transition-all">Operational Analysis</button>
          </div>
        )}

        {activeTab === 'analytics' && (
          <div className="py-10 text-center space-y-8">
             <div className="p-10 rounded-[3rem] bg-slate-900 border border-white/5">
                <div className="text-6xl font-black text-blue-500 mb-2">
                   {tasks.length > 0 ? Math.round((tasks.filter(t=>t.isCompleted).length / tasks.length) * 100) : 0}%
                </div>
                <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.5em]">Global Mission Success</p>
             </div>
             
             <div className="grid grid-cols-2 gap-4">
                <div className="p-6 rounded-3xl bg-slate-900/50 border border-white/5">
                  <span className="text-2xl font-black text-white">{tasks.filter(t=>t.isCompleted).length}</span>
                  <p className="text-[10px] font-black text-slate-500 uppercase mt-1">Completed</p>
                </div>
                <div className="p-6 rounded-3xl bg-slate-900/50 border border-white/5">
                  <span className="text-2xl font-black text-white">{tasks.filter(t=>!t.isCompleted).length}</span>
                  <p className="text-[10px] font-black text-slate-500 uppercase mt-1">Active</p>
                </div>
             </div>
          </div>
        )}
      </main>

      {showTaskForm && (
        <div className="fixed inset-0 z-[100] bg-black/95 backdrop-blur-2xl flex items-start justify-center p-4 pt-safe overflow-y-auto">
          <div className="w-full max-w-lg bg-slate-900 rounded-[2.5rem] p-8 border border-blue-500/30 shadow-2xl mt-32 mb-10 relative">
            <div className="absolute -top-16 left-1/2 -translate-x-1/2">
              <button 
                onClick={isAiAssistActive ? stopVoiceSession : startAiAssistSession} 
                className={`w-32 h-32 rounded-full border-4 flex flex-col items-center justify-center transition-all duration-300 relative ${isAiAssistActive ? 'bg-amber-600 border-amber-400' : 'bg-blue-600 border-blue-400'}`}
                style={{ transform: `scale(${1 + micVolume / 150})` }}
              >
                <span className="text-4xl mb-1">{isAiAssistActive ? '📡' : '🎙️'}</span>
                <span className="text-[10px] font-black uppercase tracking-widest">{isAiAssistActive ? riaStatus : 'ASSISTANT'}</span>
              </button>
            </div>
            <div className="mt-16 mb-8">
              <div className="p-5 bg-slate-950 border border-blue-500/20 rounded-3xl min-h-[100px] text-sm font-bold text-white italic whitespace-pre-line text-left shadow-inner">
                {assistTranscript || transcriptBuffer || 'Ria initializing...'}
              </div>
            </div>
            <form onSubmit={e => { e.preventDefault(); saveCurrentForm(); }} className="space-y-6">
              <textarea value={formObjective} onChange={e => setFormObjective(e.target.value)} readOnly={isAiAssistActive} placeholder="Objective Description..." className="w-full bg-slate-950 border border-slate-800 rounded-2xl p-4 text-white outline-none focus:border-blue-500" rows={1} />
              <div className="grid grid-cols-2 gap-4">
                <input type="date" value={formDate} onChange={e => setFormDate(e.target.value)} readOnly={isAiAssistActive} className="bg-slate-950 border border-slate-800 rounded-xl p-4 text-white [color-scheme:dark]" />
                <input type="time" value={formTime} onChange={e => setFormTime(e.target.value)} readOnly={isAiAssistActive} className="bg-slate-950 border border-slate-800 rounded-xl p-4 text-white [color-scheme:dark]" />
              </div>
              <div className="pt-8 flex flex-col gap-3">
                <button type="submit" className="w-full py-5 bg-blue-600 text-white font-black rounded-2xl uppercase tracking-widest shadow-xl shadow-blue-600/40">Manual Launch</button>
                <button type="button" onClick={() => { setShowTaskForm(false); stopVoiceSession(); }} className="w-full py-2 text-slate-600 text-[10px] font-black uppercase tracking-widest">Abort protocol</button>
              </div>
            </form>
          </div>
        </div>
      )}
      <BottomNav activeTab={activeTab} setActiveTab={setActiveTab} />
    </div>
  );
};

export default App;
