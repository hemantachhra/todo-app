
import { GoogleGenAI, Type, Modality, FunctionDeclaration } from "@google/genai";

export class GeminiService {
  static async getProductivityAdvice(tasks: any[], performance: any[], history: string[]): Promise<{text: string, sources: any[]}> {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-preview',
      contents: `You are Ria, an elite productivity coach. Current missions: ${JSON.stringify(tasks)}. 
      Search for the most effective scientific productivity frameworks to complete these missions faster.
      Provide 3 strategic insights. Elite feminine tone.`,
      config: {
        tools: [{ googleSearch: {} }],
        thinkingConfig: { thinkingBudget: 32768 }
      }
    });
    
    return {
      text: response.text || "Push your boundaries, Commander.",
      sources: response.candidates?.[0]?.groundingMetadata?.groundingChunks || []
    };
  }
}

const updateTaskFieldDeclaration: FunctionDeclaration = {
  name: 'update_task_field',
  parameters: {
    type: Type.OBJECT,
    description: 'Update mission parameters.',
    properties: {
      field: { 
        type: Type.STRING, 
        enum: ['objective', 'category', 'priority', 'time', 'date', 'alarm']
      },
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
      
      STRICT FLOW:
      1. GREET: "Ria standing by. What is your operational objective for this mission?"
      2. OBJECTIVE -> GOTO DATE/TIME: "Objective locked. What date and time?"
      3. DATE/TIME -> GOTO CATEGORY: "Time parameters secured. Routine or 5x speed?"
      4. CATEGORY -> GOTO PRIORITY: "Category secured. Priority level: Regular, Important, or Urgent?"
      5. PRIORITY -> GOTO ALARM: "Priority set. Activate alarm protocol?"
      6. ALARM -> FINISH: "Alarm configured. Mission locked."
      7. CALL 'launch_mission' tool.
      8. ASK: "Shall we enter another mission?"
         - YES: "Fresh ledger initialized. Next objective?" (Restart)
         - NO: "Operational link terminated. Good luck, commander."

      RULES: Always use 'locked' terminology. 'Important' is the standard high priority.`,
      speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } } }
    }
  });
};
