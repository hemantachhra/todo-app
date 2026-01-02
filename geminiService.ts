
import { GoogleGenAI, Type, Modality, FunctionDeclaration } from "@google/genai";

export class GeminiService {
  static async getProductivityAdvice(tasks: any[], performance: any[], history: string[]): Promise<string> {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-preview',
      contents: `You are Ria, an elite coach. Analyze missions: ${JSON.stringify(tasks)}. Provide 3 actionable strategic insights. Concise, elite, feminine tone.`,
      config: { thinkingConfig: { thinkingBudget: 32768 } }
    });
    return response.text || "Push your boundaries, Commander.";
  }

  static async generateDailyRoadMap(tasks: any[], currentTime: string): Promise<string> {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-preview',
      contents: `Current time: ${currentTime}. Missions: ${JSON.stringify(tasks)}. Generate a ledger schedule. Format: [HH:MM] >> [MISSION] || [TACTIC]. No intro.`,
      config: { thinkingConfig: { thinkingBudget: 16000 } }
    });
    return response.text || "Roadmap offline.";
  }
}

const updateTaskFieldDeclaration: FunctionDeclaration = {
  name: 'update_task_field',
  parameters: {
    type: Type.OBJECT,
    description: 'Update specific mission fields.',
    properties: {
      field: { type: Type.STRING, enum: ['objective', 'category', 'priority', 'time', 'date', 'alarm'] },
      value: { type: Type.STRING }
    },
    required: ['field', 'value'],
  },
};

const launchMissionDeclaration: FunctionDeclaration = {
  name: 'launch_mission',
  parameters: { type: Type.OBJECT, properties: {} },
};

export const connectTaskEntryAPI = (callbacks: any) => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  return ai.live.connect({
    model: 'gemini-2.5-flash-native-audio-preview-09-2025',
    callbacks,
    config: {
      responseModalities: [Modality.AUDIO],
      tools: [{ functionDeclarations: [updateTaskFieldDeclaration, launchMissionDeclaration] }],
      inputAudioTranscription: {},
      outputAudioTranscription: {},
      systemInstruction: `You are Ria, the Elite Mission Assistant. 
      
      STRICT FLOW PROTOCOL:
      1. START: Greet immediately: "Ria standing by. What is your operational objective for this mission?"
      2. OBJECTIVE: Once provided, call 'update_task_field', then say: "Objective locked. What date and time do you prefer doing this task?"
      3. DATE/TIME: Once provided, call tools, then say: "Time parameters secured. What type of task do you want to mark it? A routine task or 5x speed?"
      4. CATEGORY: Once provided, call tool, then say: "Category secured. Set priority level: Regular, Important, or Urgent?"
      5. PRIORITY: Once provided, call tool, then say: "Priority set. Should I activate the alarm protocol for this mission?"
      6. ALARM: Once provided, call tool, then say: "Alarm configured. Mission locked."
      7. LAUNCH: Call 'launch_mission' tool.
      8. FINAL ASK: Ask "Shall we enter another mission into the ledger?"
         - IF YES: Say "Fresh ledger initialized. What is the next objective?" and restart at Step 1.
         - IF NO: Say "Operational link terminated. Good luck, commander." (Must use the word "terminated" or "good luck").

      RULES: No code-speak. Use "Important" for priority. Proactive voice only. Always confirm after calling a tool.`,
      speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } } }
    }
  });
};
