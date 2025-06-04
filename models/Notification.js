const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    type: {
        type: String,
        enum: ['message', 'booking_request', 'booking_approved', 'booking_rejected', 'system'],
        required: true
    },
    title: {
        type: String,
        required: true
    },
    content: {
        type: String,
        required: true
    },
    read: {
        type: Boolean,
        default: false
    },
    sender: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    relatedId: {
        type: mongoose.Schema.Types.ObjectId,
        refPath: 'type'
    },
    metadata: {
        type: Map,
        of: mongoose.Schema.Types.Mixed
    }
}, {
    timestamps: true
});

// Index for faster queries
notificationSchema.index({ user: 1, read: 1 });
notificationSchema.index({ createdAt: -1 });
notificationSchema.index({ type: 1, relatedId: 1 });

// Virtual for formatted timestamp
notificationSchema.virtual('formattedTimestamp').get(function () {
    return this.createdAt;
});

// Method to mark as read
notificationSchema.methods.markAsRead = async function () {
    this.read = true;
    return this.save();
};

module.exports = mongoose.model('Notification', notificationSchema); 