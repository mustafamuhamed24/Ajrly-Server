const socketIO = require('socket.io');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Chat = require('../models/Chat');
const Notification = require('../models/Notification');
const Booking = require('../models/Booking');

let io;
const onlineUsers = new Map(); // userId -> { socketId, lastSeen: Date }

const initializeSocket = (server) => {
    // Parse CORS origins from environment variable
    const corsOrigins = process.env.SOCKET_CORS_ORIGIN
        ? process.env.SOCKET_CORS_ORIGIN.split(',')
        : process.env.NODE_ENV === 'production'
            ? ['https://mustafamuhamed24.github.io']
            : ['http://localhost:3000'];

    io = socketIO(server, {
        cors: {
            origin: corsOrigins,
            methods: ["GET", "POST"],
            credentials: true
        },
        pingTimeout: parseInt(process.env.SOCKET_PING_TIMEOUT) || 60000,
        pingInterval: parseInt(process.env.SOCKET_PING_INTERVAL) || 25000,
        maxHttpBufferSize: parseInt(process.env.SOCKET_MAX_HTTP_BUFFER_SIZE) || 1e8,
        transports: ['websocket', 'polling']
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

        // Join user's room for private messages and notifications
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
                    title: 'New Message',
                    content: `New message from ${socket.user.name}`,
                    sender: socket.user._id,
                    relatedId: message._id
                });

                // Emit notification to receiver
                io.to(receiverId).emit('new_notification', notification);
            } catch (error) {
                console.error('Error sending message:', error);
                socket.emit('error', 'Failed to send message');
            }
        });

        // Handle booking request
        socket.on('booking_request', async (data) => {
            try {
                const { propertyId, ownerId, startDate, endDate } = data;

                // Create booking request
                const booking = await Booking.create({
                    property: propertyId,
                    tenant: socket.user._id,
                    owner: ownerId,
                    startDate,
                    endDate,
                    status: 'pending'
                });

                // Create notification for property owner
                const notification = await Notification.create({
                    user: ownerId,
                    type: 'booking_request',
                    title: 'New Booking Request',
                    content: `${socket.user.name} wants to book your property`,
                    sender: socket.user._id,
                    relatedId: booking._id,
                    metadata: {
                        propertyId,
                        startDate,
                        endDate
                    }
                });

                // Emit notification to property owner
                io.to(ownerId).emit('new_notification', notification);
            } catch (error) {
                console.error('Error creating booking request:', error);
                socket.emit('error', 'Failed to create booking request');
            }
        });

        // Handle booking status update
        socket.on('booking_status_update', async (data) => {
            try {
                const { bookingId, status, tenantId } = data;

                // Update booking status
                const booking = await Booking.findByIdAndUpdate(
                    bookingId,
                    { status },
                    { new: true }
                );

                if (!booking) {
                    throw new Error('Booking not found');
                }

                // Create notification for tenant
                const notification = await Notification.create({
                    user: tenantId,
                    type: status === 'approved' ? 'booking_approved' : 'booking_rejected',
                    title: status === 'approved' ? 'Booking Approved' : 'Booking Rejected',
                    content: status === 'approved'
                        ? 'Your booking request has been approved'
                        : 'Your booking request has been rejected',
                    sender: socket.user._id,
                    relatedId: booking._id,
                    metadata: {
                        propertyId: booking.property,
                        status
                    }
                });

                // Emit notification to tenant
                io.to(tenantId).emit('new_notification', notification);
            } catch (error) {
                console.error('Error updating booking status:', error);
                socket.emit('error', 'Failed to update booking status');
            }
        });

        // Handle mark notification as read
        socket.on('mark_notification_read', async (data) => {
            try {
                const { notificationId } = data;
                const notification = await Notification.findById(notificationId);

                if (notification && notification.user.toString() === socket.user._id.toString()) {
                    await notification.markAsRead();
                    socket.emit('notification_read', { notificationId });
                }
            } catch (error) {
                console.error('Error marking notification as read:', error);
                socket.emit('error', 'Failed to mark notification as read');
            }
        });

        // Handle mark all notifications as read
        socket.on('mark_all_notifications_read', async () => {
            try {
                await Notification.updateMany(
                    { user: socket.user._id, read: false },
                    { read: true }
                );
                socket.emit('all_notifications_read');
            } catch (error) {
                console.error('Error marking all notifications as read:', error);
                socket.emit('error', 'Failed to mark all notifications as read');
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