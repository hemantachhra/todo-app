
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
  
  // Form State
  const [showTaskForm, setShowTaskForm] = useState(false);
  const [formObjective, setFormObjective] = useState('');
  const [formDate, setFormDate] = useState('');
  const [formTime, setFormTime] = useState('');
  const [formCategory, setFormCategory] = useState<'routine' | '5x_speed'>('routine');
  const [formUrgency, setFormUrgency] = useState<TaskUrgency>(TaskUrgency.REGULAR);
  const [alarmEnabled, setAlarmEnabled] = useState(false);
  const [isFormProgressUnlocked, setIsFormProgressUnlocked] = useState(false);
  const [initialProgressValue, setInitialProgressValue] = useState(0);

  // Ref for AI tool access
  const formRef = useRef({ objective: '', date: '', time: '', category: 'routine', urgency: TaskUrgency.REGULAR, alarm: false });

  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [activeAlarm, setActiveAlarm] = useState<Task | null>(null);

  // AI Assistant States
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

  useEffect(() => { localStorage.setItem('tasks', JSON.stringify(tasks)); }, [tasks]);

  useEffect(() => {
    formRef.current = { objective: formObjective, date: formDate, time: formTime, category: formCategory, urgency: formUrgency, alarm: alarmEnabled };
  }, [formObjective, formDate, formTime, formCategory, formUrgency, alarmEnabled]);

  const resetFormFields = () => {
    setFormObjective('');
    setFormDate(new Date().toISOString().split('T')[0]);
    setFormTime(new Date().toTimeString().slice(0, 5));
    setFormCategory('routine');
    setFormUrgency(TaskUrgency.REGULAR);
    setAlarmEnabled(false);
    setInitialProgressValue(0);
    // Note: assistTranscript and transcriptBuffer are intentionally not reset immediately during the loop
    // so the user can read the confirmation before the next prompt starts.
  };

  const stopVoiceSession = () => {
    setIsAiAssistActive(false);
    setRiaStatus('IDLE');
    if (sessionRef.current) { sessionRef.current.close(); sessionRef.current = null; }
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
          const scriptProcessor = audioContextRef.current!.createScriptProcessor(4096, 1, 1);
          scriptProcessor.onaudioprocess = (e) => {
            if (!sessionRef.current) return;
            const inputData = e.inputBuffer.getChannelData(0);
            sessionPromise.then(s => s.sendRealtimeInput({ media: createBlob(inputData) }));
          };
          source.connect(scriptProcessor);
          scriptProcessor.connect(audioContextRef.current!.destination);
          // Initial nudge
          sessionPromise.then(s => s.sendRealtimeInput({ text: "Ria, the commander is ready. Initiate mission protocol." }));
        },
        onmessage: async (message: any) => {
          if (message.serverContent?.outputTranscription) {
            setTranscriptBuffer(prev => prev + message.serverContent.outputTranscription.text);
          }
          if (message.serverContent?.turnComplete) {
            const finalPhrase = transcriptBuffer.trim();
            setAssistTranscript(prev => (prev + "\n" + finalPhrase).trim());
            setTranscriptBuffer('');

            // AUTO-SLEEP Logic: If Ria says goodbye, close the session
            const farewellKeywords = ["good luck", "terminated", "goodbye", "operational link terminated"];
            if (farewellKeywords.some(key => finalPhrase.toLowerCase().includes(key))) {
              setTimeout(() => {
                setShowTaskForm(false);
                stopVoiceSession();
              }, 4000);
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
                  const p = value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
                  if (p === 'Important' || p === 'Priority') setFormUrgency(TaskUrgency.IMPORTANT);
                  else if (p === 'Urgent') setFormUrgency(TaskUrgency.URGENT);
                  else setFormUrgency(TaskUrgency.REGULAR);
                }
                if (field === 'alarm') setAlarmEnabled(value.toLowerCase() === 'on' || value.toLowerCase().includes('yes'));
                sessionPromise.then(s => s.sendToolResponse({ functionResponses: { id: fc.id, name: fc.name, response: { result: "Parameter locked." } } }));
              } else if (fc.name === 'launch_mission') {
                const success = saveCurrentForm(true);
                if (success) {
                   resetFormFields(); // FRESH SCREEN
                   sessionPromise.then(s => s.sendToolResponse({ functionResponses: { id: fc.id, name: fc.name, response: { result: "Mission launched and ledger cleared." } } }));
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
        },
        onclose: () => stopVoiceSession()
      });
      sessionRef.current = await sessionPromise;
    } catch (e) { console.error("Assistant Error:", e); }
  };

  const saveCurrentForm = (fromAI = false) => {
    const data = fromAI ? formRef.current : { objective: formObjective, date: formDate, time: formTime, category: formCategory, urgency: formUrgency, alarm: alarmEnabled };
    if (!data.objective) return false;
    const newTask: Task = {
      id: Math.random().toString(36).substr(2, 9),
      title: data.objective,
      date: data.date || new Date().toISOString().split('T')[0],
      time: data.time || new Date().toTimeString().slice(0, 5),
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

  const todayMissions = tasks.filter(t => t.date === new Date().toISOString().split('T')[0]);

  return (
    <div className="min-h-screen pb-24 bg-[#020617] text-slate-100 font-['Space_Grotesk'] overflow-x-hidden">
      <header className="px-6 pt-10 pb-8 sticky top-0 z-40 bg-[#020617]/95 backdrop-blur-xl border-b border-white/5 shadow-2xl">
        <div className="flex justify-between items-end max-w-2xl mx-auto">
          <div><h1 className="text-3xl font-black italic tracking-tighter text-white uppercase">TO DO LIST</h1><p className="text-[10px] font-black text-blue-500 tracking-[0.4em] uppercase mt-1">Operational Briefing</p></div>
          <button onClick={() => { setEditingTask(null); setShowTaskForm(true); }} className="w-16 h-16 rounded-2xl bg-blue-600 flex items-center justify-center text-4xl shadow-2xl active:scale-90 transition-all">+</button>
        </div>
      </header>

      <main className="px-6 pt-6 max-w-2xl mx-auto">
        {activeTab === 'routine' && (
          <div className="space-y-8">
            <button onClick={() => { setShowTaskForm(true); setTimeout(startAiAssistSession, 500); }} className="w-full py-6 rounded-3xl bg-blue-600/10 border-2 border-blue-500/30 flex items-center justify-center gap-4 text-blue-400 font-black uppercase tracking-[0.2em] shadow-xl hover:bg-blue-600 hover:text-white transition-all">🎙️ Initiate Ria Link</button>
            <div className="grid grid-cols-3 gap-3">
               <div className="p-4 rounded-3xl bg-slate-900 border border-white/5 text-center"><span className="text-2xl font-black">{todayMissions.length}</span><br/><span className="text-[8px] text-slate-500 uppercase font-black">Total</span></div>
               <div className="p-4 rounded-3xl bg-slate-900 border border-white/5 text-center"><span className="text-2xl font-black text-amber-500">{todayMissions.filter(t=>!t.isCompleted).length}</span><br/><span className="text-[8px] text-amber-500 uppercase font-black">Active</span></div>
               <div className="p-4 rounded-3xl bg-slate-900 border border-white/5 text-center"><span className="text-2xl font-black text-green-500">{todayMissions.filter(t=>t.isCompleted).length}</span><br/><span className="text-[8px] text-green-500 uppercase font-black">Done</span></div>
            </div>
            <div className="space-y-6">{todayMissions.map(task => <TaskCard key={task.id} task={task} onUpdate={(id, up) => setTasks(prev => prev.map(t=>t.id===id?{...t,...up}:t))} onDelete={id => setTasks(prev => prev.filter(t=>t.id!==id))} onEdit={t => {setEditingTask(t); setShowTaskForm(true);}} />)}</div>
          </div>
        )}
      </main>

      {showTaskForm && (
        <div className="fixed inset-0 z-[100] bg-black/95 backdrop-blur-2xl flex items-start justify-center p-4 pt-safe overflow-y-auto">
          <div className="w-full max-w-lg bg-slate-900 rounded-[2.5rem] p-8 border border-blue-500/30 shadow-2xl mt-32 mb-10 relative">
            <div className="absolute -top-16 left-1/2 -translate-x-1/2">
              <button onClick={isAiAssistActive ? stopVoiceSession : startAiAssistSession} className={`w-32 h-32 rounded-full border-4 flex flex-col items-center justify-center transition-all ${isAiAssistActive ? 'bg-amber-600 border-amber-400 animate-pulse shadow-[0_0_40px_rgba(217,119,6,0.6)]' : 'bg-blue-600 border-blue-400'}`}>
                <span className="text-4xl">{isAiAssistActive ? '📡' : '🎙️'}</span>
                <span className="text-[10px] font-black uppercase tracking-widest">{isAiAssistActive ? riaStatus : 'ASSISTANT'}</span>
              </button>
            </div>
            <div className="mt-16 mb-8 text-center">
              <h2 className="text-2xl font-black italic uppercase text-blue-400">{editingTask ? 'Modify Mission' : 'New Mission'}</h2>
              <div className="p-4 bg-blue-500/10 border border-blue-400/30 rounded-2xl mt-4 min-h-[80px] text-sm font-bold text-white italic whitespace-pre-line text-left">
                {assistTranscript || transcriptBuffer || 'Ria initializing strategic link...'}
              </div>
            </div>
            <form onSubmit={e => { e.preventDefault(); saveCurrentForm(); }} className="space-y-6">
              <textarea value={formObjective} onChange={e => setFormObjective(e.target.value)} readOnly={isAiAssistActive} placeholder="Objective Description..." className={`w-full bg-slate-950 border border-slate-800 rounded-2xl p-4 text-white outline-none focus:border-blue-500 transition-all ${isAiAssistActive ? 'opacity-80' : ''}`} rows={1} />
              <div className="grid grid-cols-2 gap-4">
                <input type="date" value={formDate} onChange={e => setFormDate(e.target.value)} readOnly={isAiAssistActive} className="bg-slate-950 border border-slate-800 rounded-xl p-4 text-white [color-scheme:dark]" />
                <input type="time" value={formTime} onChange={e => setFormTime(e.target.value)} readOnly={isAiAssistActive} className="bg-slate-950 border border-slate-800 rounded-xl p-4 text-white [color-scheme:dark]" />
              </div>
              <div className="space-y-5">
                 <div className="flex justify-between items-center mb-1">
                   <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Progress Level: {initialProgressValue}%</label>
                   <button type="button" onClick={() => setIsFormProgressUnlocked(!isFormProgressUnlocked)} className={`text-[10px] font-black px-4 py-2 rounded-xl border transition-all ${isFormProgressUnlocked ? 'bg-blue-600 text-white animate-pulse' : 'bg-slate-800 text-slate-500'}`}>{isFormProgressUnlocked ? '🔓 UNLOCKED' : '🔒 LOCKED'}</button>
                 </div>
                 <input type="range" min="0" max="100" value={initialProgressValue} disabled={!isFormProgressUnlocked} onChange={e => setInitialProgressValue(parseInt(e.target.value))} onPointerUp={() => setIsFormProgressUnlocked(false)} className={`w-full h-4 bg-slate-800 rounded-lg appearance-none accent-blue-500 transition-all ${isFormProgressUnlocked ? 'opacity-100' : 'opacity-20'}`} />
                 <div className="grid grid-cols-2 gap-2">
                    <button type="button" onClick={() => setFormCategory('routine')} className={`py-4 text-xs font-black uppercase border rounded-xl transition-all ${formCategory === 'routine' ? 'bg-blue-600 border-blue-400 text-white shadow-lg shadow-blue-900/40' : 'bg-slate-950 border-slate-800 text-slate-500'}`}>Routine</button>
                    <button type="button" onClick={() => setFormCategory('5x_speed')} className={`py-4 text-xs font-black uppercase border rounded-xl transition-all ${formCategory === '5x_speed' ? 'bg-amber-600 border-amber-400 text-white shadow-lg shadow-amber-900/40' : 'bg-slate-950 border-slate-800 text-slate-500'}`}>5x Speed</button>
                 </div>
                 <div className="grid grid-cols-3 gap-2">
                    {Object.values(TaskUrgency).map(urg => (
                      <button key={urg} type="button" onClick={() => setFormUrgency(urg)} className={`py-4 text-[10px] font-black uppercase border rounded-xl transition-all ${formUrgency === urg ? 'bg-blue-600 border-blue-400 text-white' : 'bg-slate-950 border-slate-800 text-slate-500'}`}>{urg}</button>
                    ))}
                 </div>
              </div>
              <div className="pt-8 flex flex-col gap-3">
                <button type="submit" className="w-full py-5 bg-blue-600 text-white font-black rounded-2xl uppercase tracking-widest shadow-xl shadow-blue-600/40 active:scale-95 transition-all">Manual Launch</button>
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
