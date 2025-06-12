const path = require("path");
const fs = require("fs");

class DialogflowConfig {
  constructor() {
    this.loadConfiguration();
    this.validateConfiguration();
  }

  loadConfiguration() {
    this.config = {
      projectId: process.env.DIALOGFLOW_PROJECT_ID,
      location: process.env.DIALOGFLOW_LOCATION || "asia-southeast1",
      agentId: process.env.DIALOGFLOW_AGENT_ID,
      languageCode: process.env.DIALOGFLOW_LANGUAGE_CODE || "vi",
      credentialsJson: process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON,
      apiTimeout: parseInt(process.env.DIALOGFLOW_API_TIMEOUT) || 10000,
      apiVersion: "v3",
    };

    console.log("Dialogflow configuration loaded:", {
      projectId: this.config.projectId,
      location: this.config.location,
      agentId: this.config.agentId ? "configured" : "not configured",
      languageCode: this.config.languageCode,
    });
  }

  validateConfiguration() {
    const requiredFields = ["projectId", "agentId", "credentialsJson"];
    const missingFields = requiredFields.filter((field) => !this.config[field]);

    if (missingFields.length > 0) {
      const error = `Missing required Dialogflow configuration: ${missingFields.join(
        ", "
      )}`;
      console.error(error);
      throw new Error(error);
    }

    try {
      const jsonStr = this.config.credentialsJson.replace(/^'|'$/g, "");
      JSON.parse(jsonStr);
    } catch (error) {
      const errorMsg = `Invalid Google credentials JSON: ${error.message}`;
      console.error(errorMsg);
      throw new Error(errorMsg);
    }

    console.log("Dialogflow configuration validation passed");
  }

  getConfig() {
    return { ...this.config };
  }

  getSessionPath(sessionId) {
    return `projects/${this.config.projectId}/locations/${this.config.location}/agents/${this.config.agentId}/sessions/${sessionId}`;
  }

  isValidSessionId(sessionId) {
    return (
      sessionId &&
      typeof sessionId === "string" &&
      /^[a-zA-Z0-9_-]+$/.test(sessionId)
    );
  }

  isValidMessage(message) {
    return message && typeof message === "string" && message.trim().length > 0;
  }
}

module.exports = DialogflowConfig;
