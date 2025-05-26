const Joi = require('joi');

// Property validation schema
const propertySchema = Joi.object({
    title: Joi.string().required().min(3).max(100),
    description: Joi.string().required().min(10).max(1000),
    type: Joi.string().required().valid('apartment', 'house', 'villa', 'condo', 'studio', 'duplex'),
    price: Joi.number().required().min(0),
    bedrooms: Joi.number().required().min(0),
    bathrooms: Joi.number().required().min(0),
    area: Joi.number().required().min(0),
    status: Joi.string().valid('active', 'inactive', 'pending'),
    location: Joi.object({
        address: Joi.string().required(),
        city: Joi.string().required(),
        state: Joi.string().required(),
        country: Joi.string().required(),
        coordinates: Joi.object({
            type: Joi.string().valid('Point'),
            coordinates: Joi.array().items(Joi.number()).length(2)
        })
    }).required(),
    amenities: Joi.array().items(Joi.string()),
    images: Joi.array().items(
        Joi.object({
            url: Joi.string().required(),
            publicId: Joi.string().required()
        })
    )
});

// Review validation schema
const reviewSchema = Joi.object({
    rating: Joi.number().required().min(1).max(5),
    comment: Joi.string().required().min(10).max(500)
});

// Booking validation schema
const bookingSchema = Joi.object({
    propertyId: Joi.string().required(),
    checkIn: Joi.date().iso().required(),
    checkOut: Joi.date().iso().min(Joi.ref('checkIn')).required(),
    paymentMethod: Joi.string().valid('vodafone_cash', 'mizza').required(),
    totalAmount: Joi.number().min(0).required(),
    depositAmount: Joi.number().min(0).required(),
    totalNights: Joi.number().min(1).required()
});

// Validate property data
const validateProperty = (data) => {
    return propertySchema.validate(data);
};

// Validate review data
const validateReview = (data) => {
    return reviewSchema.validate(data);
};

// Validate booking data
const validateBooking = (data) => {
    return bookingSchema.validate(data);
};

module.exports = {
    validateProperty,
    validateReview,
    validateBooking
}; 