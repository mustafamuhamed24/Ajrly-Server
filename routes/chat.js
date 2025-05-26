const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const Chat = require('../models/Chat');

// Get chat history with a specific user
router.get('/:userId', auth, async (req, res) => {
    try {
        const messages = await Chat.find({
            $or: [
                { sender: req.user._id, receiver: req.params.userId },
                { sender: req.params.userId, receiver: req.user._id }
            ]
        })
            .sort({ createdAt: 1 })
            .populate('sender', 'name avatar')
            .populate('receiver', 'name avatar');

        res.json(messages);
    } catch (error) {
        console.error('Error fetching chat history:', error);
        res.status(500).json({ message: 'Error fetching chat history' });
    }
});

// Mark messages as read
router.put('/:userId/read', auth, async (req, res) => {
    try {
        await Chat.updateMany(
            {
                sender: req.params.userId,
                receiver: req.user._id,
                read: false
            },
            { read: true }
        );

        res.json({ message: 'Messages marked as read' });
    } catch (error) {
        console.error('Error marking messages as read:', error);
        res.status(500).json({ message: 'Error marking messages as read' });
    }
});

module.exports = router; 