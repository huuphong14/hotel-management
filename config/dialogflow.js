const path = require('path');
const fs = require('fs');

class DialogflowConfig {
  constructor() {
    this.loadConfiguration();
    this.validateConfiguration();
  }

  loadConfiguration() {
    this.config = {
      projectId: process.env.DIALOGFLOW_PROJECT_ID,
      location: process.env.DIALOGFLOW_LOCATION || 'asia-southeast1',
      agentId: process.env.DIALOGFLOW_AGENT_ID,
      languageCode: process.env.DIALOGFLOW_LANGUAGE_CODE || 'vi',
      credentialsPath: process.env.GOOGLE_APPLICATION_CREDENTIALS,
      apiTimeout: parseInt(process.env.DIALOGFLOW_API_TIMEOUT) || 10000,
      apiVersion: 'v3',
    };

    console.log('Dialogflow configuration loaded:', {
      projectId: this.config.projectId,
      location: this.config.location,
      agentId: this.config.agentId ? 'configured' : 'not configured',
      languageCode: this.config.languageCode,
    });
  }

  validateConfiguration() {
    const requiredFields = ['projectId', 'agentId', 'credentialsPath'];
    const missingFields = requiredFields.filter(field => !this.config[field]);

    if (missingFields.length > 0) {
      const error = `Missing required Dialogflow configuration: ${missingFields.join(', ')}`;
      console.error(error);
      throw new Error(error);
    }

    if (!fs.existsSync(this.config.credentialsPath)) {
      const error = `Google credentials file not found: ${this.config.credentialsPath}`;
      console.error(error);
      throw new Error(error);
    }

    try {
      JSON.parse(fs.readFileSync(this.config.credentialsPath, 'utf8'));
    } catch (error) {
      const errorMsg = `Invalid Google credentials file: ${error.message}`;
      console.error(errorMsg);
      throw new Error(errorMsg);
    }

    console.log('Dialogflow configuration validation passed');
  }

  getConfig() {
    return { ...this.config };
  }

  getSessionPath(sessionId) {
    return `projects/${this.config.projectId}/locations/${this.config.location}/agents/${this.config.agentId}/sessions/${sessionId}`;
  }

  isValidSessionId(sessionId) {
    return sessionId && typeof sessionId === 'string' && /^[a-zA-Z0-9_-]+$/.test(sessionId);
  }

  isValidMessage(message) {
    return message && typeof message === 'string' && message.trim().length > 0;
  }
}

module.exports = DialogflowConfig;