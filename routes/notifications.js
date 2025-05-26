const express = require('express');
const router = express.Router();
const Notification = require('../models/Notification');
const { protect } = require('../middleware/auth');

// Get all notifications for the logged-in user
router.get('/', protect, async (req, res) => {
    const notifications = await Notification.find({ user: req.user._id }).sort({ createdAt: -1 });
    res.json(notifications);
});

// Mark a notification as read
router.put('/:id/read', protect, async (req, res) => {
    const notification = await Notification.findOneAndUpdate(
        { _id: req.params.id, user: req.user._id },
        { read: true },
        { new: true }
    );
    res.json(notification);
});

// Create a notification (for demo/testing)
router.post('/', protect, async (req, res) => {
    const { message } = req.body;
    const notification = await Notification.create({
        user: req.user._id,
        message
    });
    res.status(201).json(notification);
});

module.exports = router; 