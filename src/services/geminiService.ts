import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY as string });

export async function suggestActivities(location: string, availability: string) {
  const prompt = `Suggest 5 fun activities for a "Dad League" based in ${location}. 
  The dads have availability like: ${availability}. 
  Think of things like watching a game, trivia, golfing, bike rides, or other unique local ideas.
  Return the suggestions as a JSON array of objects with 'title', 'description', and 'category'.`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              title: { type: Type.STRING },
              description: { type: Type.STRING },
              category: { type: Type.STRING }
            },
            required: ["title", "description", "category"]
          }
        }
      }
    });

    return JSON.parse(response.text);
  } catch (error) {
    console.error("Error suggesting activities:", error);
    return [];
  }
}
