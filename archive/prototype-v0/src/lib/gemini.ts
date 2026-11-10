import { GoogleGenAI, Type } from "@google/genai";
import { FlowchartData, ProcessStep } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export async function analyzeTableImage(base64Image: string, mimeType: string): Promise<FlowchartData> {
  const response = await ai.models.generateContent({
    // Changed from internal preview model to a public model available to all API keys
    model: "gemini-2.5-flash",
    contents: [
      {
        inlineData: {
          data: base64Image,
          mimeType: mimeType,
        },
      },
      {
        text: `Analyze this Workday Business Process Steps table screenshot.
Extract the data and map it to a structured format for a swimlane flowchart.

CRITICAL EXTRACTION RULES:
1. Extract all rows from the table.
2. The "Group" column defines the swimlanes. Extract unique values in order of appearance.
3. The "Step" column is the identifier/name.
4. The "Type" column determines the shape (Initiation, Approval, Action, End).
5. The "If" column contains conditions for decision diamonds.
6. The "Specify" column contains detailed labels for Action steps.
7. The "Order" column determines sequence and sometimes contains conditions.
8. Extract "Additional Information" and "Due Date" if present.

Return a JSON object with:
- title: A generated title for the process (e.g., "Create Journal Process Overview")
- swimlanes: Array of unique group names in order.
- steps: Array of step objects with fields: id (generate a unique ID), step, order, condition (from 'If' column), type, specify, optional, group, additionalInfo, dueDate.

Ensure the output is valid JSON matching the requested schema.`,
      },
    ],
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING },
          swimlanes: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
          },
          steps: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                id: { type: Type.STRING },
                step: { type: Type.STRING },
                order: { type: Type.STRING },
                condition: { type: Type.STRING },
                type: { type: Type.STRING },
                specify: { type: Type.STRING },
                optional: { type: Type.STRING },
                group: { type: Type.STRING },
                additionalInfo: { type: Type.STRING },
                dueDate: { type: Type.STRING },
              },
              required: ["id", "step", "type", "group"],
            },
          },
        },
        required: ["title", "swimlanes", "steps"],
      },
    },
  });

  const text = response.text;
  if (!text) {
    throw new Error("No response from Gemini");
  }

  try {
    let cleanText = text.trim();
    if (cleanText.startsWith('```json')) {
      cleanText = cleanText.replace(/^```json/, '').replace(/```$/, '').trim();
    } else if (cleanText.startsWith('```')) {
      cleanText = cleanText.replace(/^```/, '').replace(/```$/, '').trim();
    }
    return JSON.parse(cleanText) as FlowchartData;
  } catch (e) {
    console.error("Failed to parse JSON:", text);
    throw new Error("Failed to parse AI response");
  }
}
