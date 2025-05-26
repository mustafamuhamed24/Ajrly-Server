const socketIO = require('socket.io');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Chat = require('../models/Chat');
const Notification = require('../models/Notification');

let io;

const initializeSocket = (server) => {
    io = socketIO(server, {
        cors: {
            origin: [
                process.env.CLIENT_URL || "http://localhost:3000",
                "https://mustafamuhamed24.github.io",
                "https://mustafamuhamed24.github.io/Ajrly-Client"
            ],
            methods: ["GET", "POST"],
            credentials: true,
            allowedHeaders: ["Content-Type", "Authorization"]
        },
        transports: ['websocket', 'polling'],
        allowEIO3: true,
        pingTimeout: 60000,
        pingInterval: 25000,
        upgradeTimeout: 30000,
        allowUpgrades: true,
        perMessageDeflate: {
            threshold: 2048
        }
    });

    // Add connection error handling
    io.engine.on("connection_error", (err) => {
        console.log('Connection error:', err);
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
        console.log('User connected:', socket.user._id);

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

                // Emit to receiver
                io.to(receiverId).emit('receive_message', {
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
            console.log('User disconnected:', socket.user._id);
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

module.exports = {
    initializeSocket,
    getIO
}; 