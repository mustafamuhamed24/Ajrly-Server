const mongoose = require('mongoose');

const bookingSchema = new mongoose.Schema({
    uniqueId: {
        type: String,
        required: true,
        unique: true
    },
    property: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Property',
        required: true
    },
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    checkIn: {
        type: Date,
        required: true
    },
    checkOut: {
        type: Date,
        required: true
    },
    totalNights: {
        type: Number,
        required: true
    },
    totalAmount: {
        type: Number,
        required: true
    },
    depositAmount: {
        type: Number,
        required: true
    },
    ownerAmount: {
        type: Number
    },
    paymentMethod: {
        type: String,
        enum: ['vodafone_cash', 'mizza'],
        required: true
    },
    status: {
        type: String,
        enum: ['pending', 'owner_approved', 'booked_successful'],
        default: 'pending'
    },
    paymentStatus: {
        type: String,
        enum: ['pending', 'completed', 'failed', 'refunded'],
        default: 'pending'
    },
    ownerApprovalDate: {
        type: Date
    },
    cancellationDate: {
        type: Date
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

// Add indexes for better query performance
bookingSchema.index({ property: 1, checkIn: 1, checkOut: 1 });
bookingSchema.index({ user: 1, createdAt: -1 });
bookingSchema.index({ status: 1 });

// Generate unique ID before saving
bookingSchema.pre('save', async function (next) {
    if (!this.uniqueId) {
        const count = await mongoose.model('Booking').countDocuments();
        this.uniqueId = `BOOK${(count + 1).toString().padStart(6, '0')}`;
    }
    next();
});

// Calculate total nights
bookingSchema.pre('save', function (next) {
    if (this.checkIn && this.checkOut) {
        const diffTime = Math.abs(this.checkOut - this.checkIn);
        this.totalNights = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    }
    next();
});

// Calculate amounts
bookingSchema.pre('save', function (next) {
    if (this.totalAmount) {
        // Calculate deposit (25% of total amount)
        this.depositAmount = this.totalAmount * 0.25;

        // Calculate owner amount (total - deposit)
        this.ownerAmount = this.totalAmount - this.depositAmount;
    }
    next();
});

module.exports = mongoose.model('Booking', bookingSchema); 