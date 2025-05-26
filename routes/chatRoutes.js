const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const Chat = require('../models/Chat');
const Message = require('../models/Message');

// Test route
router.get('/test', (req, res) => {
    res.json({ message: 'Chat routes are working' });
});

// Get all chats for the current user
router.get('/', protect, async (req, res) => {
    try {
        const chats = await Chat.find({
            participants: req.user.id
        })
            .populate('participants', 'name email avatar')
            .populate('property', 'title images')
            .populate({
                path: 'messages',
                populate: {
                    path: 'sender',
                    select: 'name avatar'
                }
            })
            .sort('-updatedAt');

        res.json(chats);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Create or get a chat
router.post('/create', protect, async (req, res) => {
    try {
        const { propertyId, ownerId } = req.body;

        // Check if chat already exists
        let chat = await Chat.findOne({
            property: propertyId,
            participants: { $all: [req.user.id, ownerId] }
        })
            .populate('participants', 'name email avatar')
            .populate('property', 'title images')
            .populate({
                path: 'messages',
                populate: {
                    path: 'sender',
                    select: 'name avatar'
                }
            });

        if (chat) {
            return res.json(chat);
        }

        // Create new chat
        chat = new Chat({
            property: propertyId,
            participants: [req.user.id, ownerId],
            messages: []
        });

        await chat.save();

        // Populate the chat with user and property details
        chat = await Chat.findById(chat._id)
            .populate('participants', 'name email avatar')
            .populate('property', 'title images');

        res.status(201).json(chat);
    } catch (error) {
        console.error('Error creating chat:', error);
        res.status(500).json({ message: error.message });
    }
});

// Send a message
router.post('/:chatId/messages', protect, async (req, res) => {
    try {
        const { content } = req.body;
        const chat = await Chat.findById(req.params.chatId);

        if (!chat) {
            return res.status(404).json({ message: 'Chat not found' });
        }

        // Check if user is a participant
        if (!chat.participants.includes(req.user.id)) {
            return res.status(403).json({ message: 'Not authorized' });
        }

        const message = new Message({
            chat: chat._id,
            sender: req.user.id,
            content,
            read: false
        });

        await message.save();

        // Add message to chat
        chat.messages.push(message._id);
        chat.updatedAt = Date.now();
        await chat.save();

        // Populate message with sender details
        const populatedMessage = await Message.findById(message._id)
            .populate('sender', 'name avatar');

        // Get updated chat with all messages
        const updatedChat = await Chat.findById(chat._id)
            .populate('participants', 'name email avatar')
            .populate('property', 'title images')
            .populate({
                path: 'messages',
                populate: {
                    path: 'sender',
                    select: 'name avatar'
                }
            });

        res.status(201).json(updatedChat);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Mark messages as read
router.put('/:chatId/read', protect, async (req, res) => {
    try {
        const chat = await Chat.findById(req.params.chatId);

        if (!chat) {
            return res.status(404).json({ message: 'Chat not found' });
        }

        // Check if user is a participant
        if (!chat.participants.includes(req.user.id)) {
            return res.status(403).json({ message: 'Not authorized' });
        }

        // Mark all unread messages as read
        await Message.updateMany(
            {
                chat: chat._id,
                sender: { $ne: req.user.id },
                read: false
            },
            { read: true }
        );

        // Get updated chat
        const updatedChat = await Chat.findById(chat._id)
            .populate('participants', 'name email avatar')
            .populate('property', 'title images')
            .populate({
                path: 'messages',
                populate: {
                    path: 'sender',
                    select: 'name avatar'
                }
            });

        res.json(updatedChat);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

module.exports = router; 