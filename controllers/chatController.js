const Chat = require('../models/Chat');
const User = require('../models/User');
const Property = require('../models/Property');
const Message = require('../models/Message');

// Get user's chats
exports.getUserChats = async (req, res) => {
    try {
        const userId = req.user.id;

        const chats = await Chat.find({ participants: userId })
            .populate({
                path: 'participants',
                select: 'name email avatar'
            })
            .populate({
                path: 'messages',
                populate: {
                    path: 'sender',
                    select: 'name email avatar'
                }
            })
            .sort({ lastMessage: -1 });

        // Calculate unread counts
        const chatsWithUnread = chats.map(chat => {
            const unreadCount = chat.messages.filter(
                message => !message.read && message.sender._id.toString() !== userId
            ).length;

            return {
                ...chat.toObject(),
                unreadCount
            };
        });

        res.json(chatsWithUnread);
    } catch (error) {
        console.error('Error in getUserChats:', error);
        res.status(500).json({ message: 'Error fetching chats' });
    }
};

// Get a specific chat
exports.getChat = async (req, res) => {
    try {
        const chat = await Chat.findById(req.params.chatId)
            .populate({
                path: 'participants',
                select: 'name email avatar'
            })
            .populate({
                path: 'messages',
                populate: {
                    path: 'sender',
                    select: 'name email avatar'
                }
            });

        if (!chat) {
            return res.status(404).json({ message: 'Chat not found' });
        }

        // Verify user is a participant
        if (!chat.participants.some(p => p._id.toString() === req.user.id)) {
            return res.status(403).json({ message: 'Not authorized to access this chat' });
        }

        res.json(chat);
    } catch (error) {
        console.error('Error in getChat:', error);
        res.status(500).json({ message: 'Error fetching chat' });
    }
};

// Create a new chat or get existing one
exports.createOrGetChat = async (req, res) => {
    try {
        const { propertyId, ownerId } = req.body;

        // Check if property exists
        const property = await Property.findById(propertyId);
        if (!property) {
            return res.status(404).json({ message: 'Property not found' });
        }

        // Check if owner exists
        const owner = await User.findById(ownerId);
        if (!owner) {
            return res.status(404).json({ message: 'Owner not found' });
        }

        // Check if chat already exists
        let chat = await Chat.findOne({
            property: propertyId,
            participants: { $all: [req.user.id, ownerId] }
        }).populate('participants', 'name email');

        if (!chat) {
            // Create new chat
            chat = await Chat.create({
                property: propertyId,
                participants: [req.user.id, ownerId],
                messages: []
            });
            chat = await chat.populate('participants', 'name email');
        }

        res.json(chat);
    } catch (error) {
        res.status(500).json({ message: 'Error creating chat', error: error.message });
    }
};

// Send a message
exports.sendMessage = async (req, res) => {
    try {
        const { content } = req.body;
        const chatId = req.params.chatId;
        const userId = req.user.id;

        // Validate chat exists and user is a participant
        const chat = await Chat.findById(chatId);
        if (!chat) {
            return res.status(404).json({ message: 'Chat not found' });
        }

        if (!chat.participants.includes(userId)) {
            return res.status(403).json({ message: 'Not authorized to send messages in this chat' });
        }

        // Create new message
        const message = new Message({
            chat: chatId,
            sender: userId,
            content,
            read: false
        });

        await message.save();

        // Update chat with new message and lastMessage timestamp
        chat.messages.push(message._id);
        chat.lastMessage = new Date();
        await chat.save();

        // Populate message with sender details
        await message.populate('sender', 'name email avatar');

        // Emit socket event
        req.app.get('io').emit(`chat:${chatId}`, {
            type: 'newMessage',
            message
        });

        // Return updated chat
        const updatedChat = await Chat.findById(chatId)
            .populate({
                path: 'participants',
                select: 'name email avatar'
            })
            .populate({
                path: 'messages',
                populate: {
                    path: 'sender',
                    select: 'name email avatar'
                }
            });

        res.json(updatedChat);
    } catch (error) {
        console.error('Error in sendMessage:', error);
        res.status(500).json({ message: 'Error sending message' });
    }
};

// Mark messages as read
exports.markAsRead = async (req, res) => {
    try {
        const chatId = req.params.chatId;
        const userId = req.user.id;

        // Update all unread messages in this chat
        await Message.updateMany(
            {
                chat: chatId,
                sender: { $ne: userId },
                read: false
            },
            { read: true }
        );

        // Return updated chat
        const updatedChat = await Chat.findById(chatId)
            .populate({
                path: 'participants',
                select: 'name email avatar'
            })
            .populate({
                path: 'messages',
                populate: {
                    path: 'sender',
                    select: 'name email avatar'
                }
            });

        res.json(updatedChat);
    } catch (error) {
        console.error('Error in markAsRead:', error);
        res.status(500).json({ message: 'Error marking messages as read' });
    }
}; 