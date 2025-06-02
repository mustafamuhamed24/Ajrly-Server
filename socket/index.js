const socketIO = require('socket.io');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Chat = require('../models/Chat');
const Notification = require('../models/Notification');

let io;
const onlineUsers = new Map(); // userId -> { socketId, lastSeen: Date }

const initializeSocket = (server) => {
    io = socketIO(server, {
        cors: {
            origin: [
                "http://localhost:3000",
                "https://mustafamuhamed24.github.io"
            ],
            methods: ["GET", "POST"],
            credentials: true
        }
    });

    // Authentication middleware
    io.use(async (socket, next) => {
        try {
            const token = socket.handshake.auth.token;
            if (!token) {
                return next(new Error('Authentication error'));
            }

            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            const user = await User.findById(decoded.id);

            if (!user) {
                return next(new Error('User not found'));
            }

            socket.user = user;
            next();
        } catch (error) {
            next(new Error('Authentication error'));
        }
    });

    io.on('connection', (socket) => {
        const userId = socket.user._id.toString();
        onlineUsers.set(userId, { socketId: socket.id, lastSeen: null });
        io.emit('user_online', { userId });
        console.log(`[SOCKET] User connected: ${userId}`);

        // Join user's room for private messages
        socket.join(socket.user._id.toString());

        // Handle new message
        socket.on('send_message', async (data) => {
            try {
                const { receiverId, content } = data;

                // Save message to database
                const message = await Chat.create({
                    sender: socket.user._id,
                    receiver: receiverId,
                    content
                });

                // Emit to both sender and receiver
                io.to([receiverId, socket.user._id.toString()]).emit('receive_message', {
                    message,
                    sender: {
                        _id: socket.user._id,
                        name: socket.user.name,
                        avatar: socket.user.avatar
                    }
                });

                // Create notification
                const notification = await Notification.create({
                    user: receiverId,
                    type: 'message',
                    content: `New message from ${socket.user.name}`,
                    relatedId: message._id
                });

                // Emit notification to receiver
                io.to(receiverId).emit('new_notification', notification);
            } catch (error) {
                console.error('Error sending message:', error);
                socket.emit('error', 'Failed to send message');
            }
        });

        // Handle typing status
        socket.on('typing', (data) => {
            const { receiverId, isTyping } = data;
            io.to(receiverId).emit('user_typing', {
                userId: socket.user._id,
                isTyping
            });
        });

        // Handle read receipts
        socket.on('mark_read', async (data) => {
            try {
                const { messageId } = data;
                await Chat.findByIdAndUpdate(messageId, { read: true });

                // Notify sender that message was read
                const message = await Chat.findById(messageId);
                if (message) {
                    io.to(message.sender.toString()).emit('message_read', {
                        messageId
                    });
                }
            } catch (error) {
                console.error('Error marking message as read:', error);
            }
        });

        // Handle disconnection
        socket.on('disconnect', () => {
            onlineUsers.set(userId, { socketId: null, lastSeen: new Date() });
            io.emit('user_offline', { userId, lastSeen: new Date() });
            console.log(`[SOCKET] User disconnected: ${userId}`);
        });
    });

    return io;
};

const getIO = () => {
    if (!io) {
        throw new Error('Socket.io not initialized');
    }
    return io;
};

// Helper to get online status for a list of userIds
function getUserStatus(userIds) {
    return userIds.map(id => {
        const entry = onlineUsers.get(id.toString());
        return {
            userId: id.toString(),
            online: !!(entry && entry.socketId),
            lastSeen: entry && entry.lastSeen ? entry.lastSeen : null
        };
    });
}

module.exports = {
    initializeSocket,
    getIO,
    getUserStatus
}; 