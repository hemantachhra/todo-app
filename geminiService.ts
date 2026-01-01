import { GoogleGenAI, Type, Modality } from "@google/genai";

export class GeminiService {
  static async getProductivityAdvice(tasks: any[], performance: any[], history: string[], language: 'English' | 'Hindi'): Promise<string> {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const historyContext = history.length > 0 ? `\n\nMemory Bank (Previous Exchanges):\n${history.join('\n')}` : "";
    
    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-preview',
      contents: `You are Ria, a sophisticated female productivity coach. Address the user directly as "You". 
      Analyze these missions: ${JSON.stringify(tasks)}. Performance stats: ${JSON.stringify(performance)}.${historyContext}
      
      STRICT REQUIREMENT: 
      - Response MUST be in ${language}. 
      - Use a feminine, professional, and elite tone. 
      - Coach the USER directly (e.g., "You should focus on...").
      - Provide 3 actionable strategic insights for the current day.
      - Be concise.`,
      config: {
        thinkingConfig: { thinkingBudget: 32768 }
      }
    });
    return response.text || (language === 'Hindi' ? "अपनी सीमाओं को आगे बढ़ाते रहें।" : "Keep pushing your boundaries.");
  }

  static async generateDailyRoadMap(tasks: any[], currentTime: string, language: 'English' | 'Hindi'): Promise<string> {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-preview',
      contents: `Current time is ${currentTime}. Here are the user's missions: ${JSON.stringify(tasks)}. 
      
      STRICT DIARY PROTOCOL:
      - Provide a clean, ledger-style diary list.
      - ONLY include the missions provided. Do NOT invent new major tasks.
      - You may add short "Buffer" or "Review" slots (max 10 mins).
      - Address the user as "You".
      
      FORMAT FOR EVERY LINE (STRICT):
      [HH:MM] >> [MISSION NAME] || [ONE-SENTENCE TACTIC]
      
      INSTRUCTIONS:
      - Plan starts from current time.
      - Response language: ${language}.
      - NO intro, NO outro. Just the data list.`,
      config: {
        thinkingConfig: { thinkingBudget: 16000 }
      }
    });
    return response.text || (language === 'Hindi' ? "डायरी विफल रही।" : "Diary protocol failed.");
  }
}

export const connectLiveAPI = (callbacks: any, context: { tasks: any[], reports: any[], history: string[], language: 'English' | 'Hindi' }) => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const contextSummary = `ACTIVE MISSIONS: ${JSON.stringify(context.tasks)}.`;
  const memorySummary = context.history.length > 0 
    ? `MEMORY BANK: ${context.history.slice(-10).join(' | ')}` 
    : "This is our first link.";
  
  return ai.live.connect({
    model: 'gemini-2.5-flash-native-audio-preview-09-2025',
    callbacks,
    config: {
      responseModalities: [Modality.AUDIO],
      inputAudioTranscription: {},
      outputAudioTranscription: {},
      systemInstruction: `CORE IDENTITY: You are Ria, a brilliant and elite female productivity coach. 
      Address the user directly as "You". 
      STRICT LANGUAGE: You MUST only speak in ${context.language}.
      CONTEXT: ${contextSummary}
      MEMORY: ${memorySummary}
      
      BEHAVIOR: You are supportive but strategic. Provide verbal coaching on their current missions. Keep responses focused and professional. Respond ONLY in ${context.language}.`,
      speechConfig: {
        voiceConfig: { 
          prebuiltVoiceConfig: { voiceName: 'Kore' }
        }
      }
    }
  });
};