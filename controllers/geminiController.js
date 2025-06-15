const { GoogleGenAI } = require("@google/genai");

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

exports.generateContent = async (req, res) => {
  try {
    const { prompt } = req.body;

    if (!prompt) {
      return res.status(400).json({ error: "Prompt is required" });
    }

    const systemPrompt = `Bạn là một chuyên gia tư vấn đặt phòng khách sạn. Hãy trả lời các câu hỏi của khách hàng về:
    - Tư vấn chọn khách sạn phù hợp
    - Thông tin về giá cả và các loại phòng
    - Các tiện nghi và dịch vụ của khách sạn
    - Chính sách đặt phòng và hủy phòng
    - Các địa điểm tham quan gần khách sạn
    
    Hãy trả lời một cách chuyên nghiệp và hữu ích.`;

    const fullPrompt = `${systemPrompt}\n\nCâu hỏi của khách hàng: ${prompt}`;

    const response = await ai.models.generateContent({
      model: "gemini-2.0-flash",
      contents: fullPrompt,
    });

    res.json({ response: response.text });
  } catch (error) {
    console.error("Error generating content:", error);
    res.status(500).json({ error: "Failed to generate content" });
  }
};
