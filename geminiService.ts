
import { GoogleGenAI, Type, Modality, FunctionDeclaration } from "@google/genai";

export class GeminiService {
  static async getProductivityAdvice(tasks: any[], performance: any[], history: string[]): Promise<{text: string, sources: any[]}> {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-preview',
      contents: `You are Ria, an elite operational intelligence officer. 
      Analyze the current mission manifest: ${JSON.stringify(tasks)}. 
      
      CRITICAL CATEGORY ANALYSIS:
      - "5x Speed" tasks are growth-oriented mission critical tasks designed to exponentially boost business and personal development.
      - "Routine" tasks are day-to-day operations like meetings, samples, and maintenance.
      
      Identify if there is enough focus on "5x Speed" tasks compared to "Routine". 
      Identify tactical bottlenecks and suggest 3 high-impact strategic shifts to increase daily output. 
      Use military-grade, sharp terminology.
      
      CRITICAL INSTRUCTIONS:
      1. Do NOT include raw HTML tags.
      2. Do NOT include technical status markers.
      3. Do NOT use complex Markdown. Use plain text or very simple bullet points.
      4. Start the advice directly without introductory status reports.`,
      config: { 
        tools: [{ googleSearch: {} }],
        thinkingConfig: { thinkingBudget: 10000 }
      }
    });
    
    return {
      text: response.text || "Operational intelligence uplink failed. Maintain manual protocol.",
      sources: response.candidates?.[0]?.groundingMetadata?.groundingChunks || []
    };
  }

  static async breakdownTask(taskTitle: string): Promise<string[]> {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: `Break down this mission into 3-5 high-speed tactical sub-steps: "${taskTitle}". 
      Return ONLY a JSON array of strings. Avoid fluff. Actionable only.`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: { type: Type.STRING }
        }
      }
    });
    
    try {
      return JSON.parse(response.text || "[]");
    } catch (e) {
      return ["Initiate reconnaissance", "Establish primary objective", "Execute tactical sweep"];
    }
  }
}

const updateTaskFieldDeclaration: FunctionDeclaration = {
  name: 'update_task_field',
  parameters: {
    type: Type.OBJECT,
    properties: {
      field: { type: Type.STRING, enum: ['objective', 'category', 'priority', 'time', 'date', 'alarm'] },
      value: { type: Type.STRING, description: "The value to set. Dates MUST be YYYY-MM-DD. Times MUST be HH:MM." }
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
      systemInstruction: `You are Ria, a friendly but highly efficient tactical mission assistant.

STRICT CONVERSATIONAL PROTOCOL:
1. START: Immediately say: "Hey there, I am Ria, I am happy to assist you. What is your mission today?" Stop and wait for the objective.
2. SILENCE HANDLING: If the user doesn't respond for a while, repeat: "What is your mission?" one more time. If they still don't respond, say: "Try again later. Take care, Bye." and terminate the conversation.
3. OBJECTIVE GATHERED: Once the objective is provided, call 'update_task_field' for 'objective' and say: "Mission locked, what is the category?"
4. CATEGORY GATHERED: Once category (5X Speed or Routine) is provided, call 'update_task_field' for 'category' and ask for "Priority level?"
5. CONTINUITY: Follow the sequence for Date/Time and Alarm.
6. TOOL USAGE: Call 'update_task_field' IMMEDIATELY after every single piece of information the user provides.
7. DEPLOYMENT: Once all mission data is collected, ask: "Do you want me to Deploy this mission?"
   - IF USER SAYS YES: You MUST call the 'launch_mission' tool immediately.
8. POST-DEPLOYMENT: After calling 'launch_mission', ask: "Mission deployed. Would you like to enter another mission?"
   - If YES: Restart the flow from "What is your mission?" and reset all fields using 'update_task_field' as you gather them.
   - If NO: Say: "Goodbye, wish you all the best for your missions. Happy to assist you." then stop.

TONE: Helpful, polite, and efficient. Avoid excessive military jargon. Strictly adhere to tool calling when data is provided.`,
      speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } } }
    }
  });
};
