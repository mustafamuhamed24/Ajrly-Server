const express = require('express');
const router = express.Router();
const { register, login, getMe, resetPassword } = require('../controllers/auth');
const { protect } = require('../middleware/auth');

// Auth routes
router.post('/register', register);
router.post('/login', login);
router.get('/me', protect, getMe);
router.post('/reset-password', resetPassword);

module.exports = router; 