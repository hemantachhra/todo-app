
import { GoogleGenAI, Type, Modality, FunctionDeclaration } from "@google/genai";

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
    return response.text || "Keep pushing your boundaries.";
  }

  static async generateDailyRoadMap(tasks: any[], currentTime: string, language: 'English' | 'Hindi'): Promise<string> {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-preview',
      contents: `Current time is ${currentTime}. Here are the user's missions: ${JSON.stringify(tasks)}. 
      
      STRICT DIARY PROTOCOL:
      - Provide a clean, ledger-style diary list.
      - ONLY include the missions provided. 
      
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
    return response.text || "Diary protocol failed.";
  }
}

const updateTaskFieldDeclaration: FunctionDeclaration = {
  name: 'update_task_field',
  parameters: {
    type: Type.OBJECT,
    description: 'Update specific mission fields based on user input.',
    properties: {
      field: {
        type: Type.STRING,
        description: 'The field name to update.',
        enum: ['objective', 'category', 'priority', 'time', 'date', 'alarm', 'progress']
      },
      value: {
        type: Type.STRING,
        description: 'The value to set. Category (routine/5x_speed), Priority (Regular/Important/Urgent), Time (HH:MM), Date (YYYY-MM-DD), Alarm (on/off), Progress (0-100).'
      }
    },
    required: ['field', 'value'],
  },
};

const launchMissionDeclaration: FunctionDeclaration = {
  name: 'launch_mission',
  parameters: {
    type: Type.OBJECT,
    description: 'Saves and locks the mission into the system permanently.',
    properties: {},
  },
};

export const connectLiveAPI = (callbacks: any, context: { tasks: any[], reports: any[], history: string[], language: 'English' | 'Hindi' }) => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  return ai.live.connect({
    model: 'gemini-2.5-flash-native-audio-preview-09-2025',
    callbacks,
    config: {
      responseModalities: [Modality.AUDIO],
      inputAudioTranscription: {},
      outputAudioTranscription: {},
      systemInstruction: `CORE IDENTITY: You are Ria, an elite female productivity coach. Address the user directly as "You". 
      You MUST ONLY speak in ${context.language}. Start immediately with analysis.`,
      speechConfig: {
        voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } }
      }
    }
  });
};

export const connectTaskEntryAPI = (callbacks: any, language: string) => {
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
      Your mission: Execute a simple, strict step-by-step task entry flow.

      FLOW PROTOCOL (MANDATORY STEPS):
      1. START: Greet instantly: "Ria standing by. What is your operational objective for this mission?"
      2. OBJECTIVE: Once user provides objective, call 'update_task_field', then say: "Objective locked. For what date and time shall we schedule this?"
      3. DATE & TIME: Once provided, call 'update_task_field' for both, then say: "Date and Time locked. Is this a Routine task or a Five-X Speed operation?"
      4. CATEGORY: Once provided, call 'update_task_field', then say: "Category secured. What is the priority level? Regular, Important, or Urgent?"
      5. PRIORITY: Once provided, call 'update_task_field', then say: "Priority set. Should I activate the alarm protocol for this mission?"
      6. ALARM: Once answered, call 'update_task_field', then say: "Alarm configured. Mission locked and ready for launch." 
      7. LAUNCH: Summarize and call 'launch_mission' tool.
      8. FINAL LOOP: Ask: "Shall we enter another mission into the ledger?"
         - If Yes: Say "Resetting protocols. What is the next objective?" and continue step 1.
         - If No: Say "Operational link terminated. Good luck, commander."

      STRICT RULES:
      - NO CODE-SPEAK: NEVER say "HH:MM" or "YYYY-MM-DD". Use natural speech like "Tomorrow at 5 PM".
      - PROACTIVE: You drive the conversation.
      - TERMINOLOGY: Always use "Important" as a priority level.
      - TOOL USE: You MUST call 'update_task_field' every time a user provides a detail.
      - LANGUAGE: ${language} only.`,
      speechConfig: {
        voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } }
      }
    }
  });
};
