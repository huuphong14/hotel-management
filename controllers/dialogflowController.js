const { SessionsClient } = require("@google-cloud/dialogflow-cx");
const DialogflowConfig = require("../config/dialogflow");
const hotelSearchService = require('../services/hotelSearchService');

class DialogflowController {
  constructor() {
    // Store the DialogflowConfig instance
    this.config = new DialogflowConfig();
    const config = this.config.getConfig();

    this.sessionsClient = new SessionsClient({
      credentials: JSON.parse(config.credentialsJson.replace(/^'|'$/g, "")),
      apiEndpoint: `${config.location}-dialogflow.googleapis.com`,
    });
    this.projectId = config.projectId;
    this.location = config.location;
    this.agentId = config.agentId;
    this.languageCode = config.languageCode;
  }

  createSessionPath(sessionId) {
    return this.sessionsClient.projectLocationAgentSessionPath(
      this.projectId,
      this.location,
      this.agentId,
      sessionId
    );
  }

  async sendTextMessage(message, sessionId) {
    if (
      !this.config.isValidSessionId(sessionId) ||
      !this.config.isValidMessage(message)
    ) {
      throw new Error("Invalid sessionId or message");
    }

    try {
      const sessionPath = this.createSessionPath(sessionId);
      const request = {
        session: sessionPath,
        queryInput: {
          text: { text: message },
          languageCode: this.languageCode,
        },
      };

      const [response] = await this.sessionsClient.detectIntent(request);
      const formatted = this.formatResponse(response);

      // Nếu intent là SearchHotels thì gọi hotelSearchService
      if (formatted.intent === 'SearchHotels') {
        // Lấy parameters từ Dialogflow
        const params = formatted.parameters?.fields || {};
        // Xử lý tìm kiếm khách sạn
        const hotelResult = await hotelSearchService.formatHotelSearchResponse(params);
        return {
          ...hotelResult,
          intent: formatted.intent,
          parameters: formatted.parameters,
        };
      }
      // Nếu không phải intent SearchHotels thì trả về như cũ
      return formatted;
    } catch (error) {
      console.error("Error sending text message:", error.message);
      throw new Error("Dialogflow API error");
    }
  }

  async sendEvent(eventName, sessionId, parameters = {}) {
    if (!this.config.isValidSessionId(sessionId) || !eventName) {
      throw new Error("Invalid sessionId or eventName");
    }

    try {
      const sessionPath = this.createSessionPath(sessionId);
      const request = {
        session: sessionPath,
        queryInput: {
          event: { event: eventName, parameters },
          languageCode: this.languageCode,
        },
      };

      const [response] = await this.sessionsClient.detectIntent(request);
      return this.formatResponse(response);
    } catch (error) {
      console.error("Error sending event:", error.message);
      throw new Error("Dialogflow event error");
    }
  }

  formatResponse(response) {
    const queryResult = response.queryResult;
    const textResponses =
      queryResult.responseMessages
        ?.filter((msg) => msg.text && msg.text.text)
        .flatMap((msg) => msg.text.text) || [];

    return {
      responseText: textResponses.join("\n"),
      intent: queryResult.intent?.displayName || null,
      parameters: queryResult.parameters || {},
    };
  }

  async clearSession(sessionId) {
    if (!this.config.isValidSessionId(sessionId)) {
      throw new Error("Invalid sessionId");
    }
    return this.sendEvent("WELCOME", sessionId, {});
  }

  async testConnection() {
    try {
      const testSessionId = "test-session-" + Date.now();
      await this.sendTextMessage("Hello", testSessionId);
      return true;
    } catch (error) {
      console.error("Dialogflow connection test failed:", error.message);
      throw error; // Re-throw to allow index.js to catch it
    }
  }
}

module.exports = new DialogflowController();
