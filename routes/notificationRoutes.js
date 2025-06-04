const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const {
    getNotifications,
    getUnreadCount,
    markAsRead,
    markAllAsRead,
    deleteNotification,
    clearAllNotifications
} = require('../controllers/notificationController');

// Get all notifications
router.get('/', protect, getNotifications);

// Get unread notification count
router.get('/unread/count', protect, getUnreadCount);

// Mark a notification as read
router.put('/:notificationId/read', protect, markAsRead);

// Mark all notifications as read
router.put('/read/all', protect, markAllAsRead);

// Delete a notification
router.delete('/:notificationId', protect, deleteNotification);

// Clear all notifications
router.delete('/', protect, clearAllNotifications);

module.exports = router; 