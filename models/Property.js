const mongoose = require('mongoose');

const propertySchema = new mongoose.Schema({
    uniqueId: {
        type: String,
        required: false,
        unique: true
    },
    title: {
        type: String,
        required: true,
        trim: true
    },
    description: {
        type: String,
        required: true
    },
    type: {
        type: String,
        required: true,
        enum: ['apartment', 'house', 'villa', 'condo', 'studio', 'duplex']
    },
    price: {
        type: Number,
        required: true,
        min: 0
    },
    bedrooms: {
        type: Number,
        required: true,
        min: 0
    },
    bathrooms: {
        type: Number,
        required: true,
        min: 0
    },
    area: {
        type: Number,
        required: true,
        min: 0
    },
    status: {
        type: String,
        required: true,
        enum: ['active', 'inactive', 'pending'],
        default: 'pending'
    },
    location: {
        address: {
            type: String,
            required: true
        },
        city: {
            type: String,
            required: true
        },
        state: {
            type: String,
            required: true
        },
        country: {
            type: String,
            required: true
        },
        coordinates: {
            type: {
                type: String,
                enum: ['Point'],
                default: 'Point'
            },
            coordinates: {
                type: [Number],
                default: [0, 0]
            }
        }
    },
    images: [{
        url: {
            type: String,
            required: true
        },
        publicId: {
            type: String,
            required: true
        }
    }],
    amenities: [{
        type: String
    }],
    owner: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    bookings: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Booking'
    }],
    rating: {
        type: Number,
        min: 0,
        max: 5,
        default: 0
    },
    reviews: [{
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        },
        rating: {
            type: Number,
            required: true,
            min: 1,
            max: 5
        },
        comment: {
            type: String,
            required: true
        },
        createdAt: {
            type: Date,
            default: Date.now
        }
    }]
}, {
    timestamps: true
});

// Index for location search
propertySchema.index({ 'location.coordinates': '2dsphere' });

// Generate unique ID before saving
propertySchema.pre('save', async function (next) {
    if (!this.uniqueId || this.uniqueId === 'undefined') {
        const count = await mongoose.model('Property').countDocuments();
        this.uniqueId = `PROP${(count + 1).toString().padStart(6, '0')}`;
    }
    next();
});

// Calculate average rating
propertySchema.methods.calculateRating = function () {
    if (this.reviews.length === 0) return 0;
    const sum = this.reviews.reduce((acc, review) => acc + review.rating, 0);
    this.rating = sum / this.reviews.length;
    return this.rating;
};

const Property = mongoose.model('Property', propertySchema);

module.exports = Property; 