const express = require('express');
const router = express.Router();
const dialogflowController = require('../controllers/dialogflowController');
const rateLimit = require('express-rate-limit');

const chatLimiter = rateLimit({
  windowMs: 60000, // 1 minute
  max: 30,
  message: { error: 'Quá nhiều tin nhắn, thử lại sau.' }
});

const validateChatRequest = (req, res, next) => {
  const { message, sessionId } = req.body;
  if (!message || typeof message !== 'string' || !sessionId || typeof sessionId !== 'string') {
    return res.status(400).json({ error: 'Message and sessionId are required' });
  }
  req.body.message = message.trim().substring(0, 1000);
  req.body.sessionId = sessionId.trim();
  next();
};

router.post('/message', chatLimiter, validateChatRequest, async (req, res) => {
  try {
    const { message, sessionId } = req.body;
    const response = await dialogflowController.sendTextMessage(message, sessionId);
    res.json({
      success: true,
      sessionId,
      response: response,
    });
  } catch (error) {
    console.error('Chat message error:', error.message);
    res.status(500).json({ success: false, error: 'Lỗi xử lý tin nhắn' });
  }
});

router.post('/event', chatLimiter, async (req, res) => {
  try {
    const { eventName, sessionId, parameters } = req.body;
    if (!eventName || !sessionId) {
      return res.status(400).json({ success: false, error: 'EventName and sessionId are required' });
    }
    const response = await dialogflowController.sendEvent(eventName, sessionId, parameters || {});
    res.json({
      success: true,
      sessionId,
      event: eventName,
      response: response,
    });
  } catch (error) {
    console.error('Chat event error:', error.message);
    res.status(500).json({ success: false, error: 'Lỗi xử lý event' });
  }
});

router.delete('/session/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    await dialogflowController.clearSession(sessionId);
    res.json({ success: true, message: 'Session reset' });
  } catch (error) {
    console.error('Clear session error:', error.message);
    res.status(500).json({ success: false, error: 'Lỗi reset session' });
  }
});

router.get('/health', async (req, res) => {
  try {
    const isHealthy = await dialogflowController.testConnection();
    res.json({
      success: true,
      status: isHealthy ? 'healthy' : 'unhealthy',
    });
  } catch (error) {
    console.error('Health check error:', error.message);
    res.status(500).json({ success: false, status: 'unhealthy', error: 'Lỗi kết nối Dialogflow' });
  }
});

module.exports = router;