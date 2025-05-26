const Booking = require('../models/Booking');
const Property = require('../models/Property');
const transporter = require('../config/email');
const User = require('../models/User');
const Notification = require('../models/Notification');

// @desc    Create booking
// @route   POST /api/bookings
// @access  Private
exports.createBooking = async (req, res, next) => {
    try {
        const { propertyId, checkIn, checkOut, guests, specialRequests } = req.body;

        // Check if property exists
        const property = await Property.findById(propertyId);
        if (!property) {
            return res.status(404).json({ message: 'Property not found' });
        }

        // Check if property is available
        if (!property.isAvailable) {
            return res.status(400).json({ message: 'Property is not available' });
        }

        // Check for overlapping bookings
        const overlappingBooking = await Booking.findOne({
            property: propertyId,
            status: { $ne: 'cancelled' },
            $or: [
                {
                    checkIn: { $lte: new Date(checkOut) },
                    checkOut: { $gte: new Date(checkIn) }
                }
            ]
        });

        if (overlappingBooking) {
            return res.status(400).json({ message: 'Property is already booked for these dates' });
        }

        // Calculate total price
        const days = Math.ceil((new Date(checkOut) - new Date(checkIn)) / (1000 * 60 * 60 * 24));
        const totalPrice = property.price * days;

        const booking = await Booking.create({
            property: propertyId,
            user: req.user._id,
            checkIn,
            checkOut,
            totalPrice,
            guests,
            specialRequests
        });

        // Send confirmation email
        const user = await User.findById(req.user._id);
        const propertyDetails = `${property.title}, ${property.location.address}, ${property.location.city}`;
        await transporter.sendMail({
            from: process.env.EMAIL_FROM,
            to: user.email,
            subject: 'Booking Confirmation',
            html: `<h2>Booking Confirmed!</h2><p>Dear ${user.name},</p><p>Your booking for <b>${propertyDetails}</b> from <b>${checkIn}</b> to <b>${checkOut}</b> is confirmed.</p><p>Total Price: <b>$${totalPrice}</b></p>`
        });

        res.status(201).json(booking);
    } catch (err) {
        next(err);
    }
};

// @desc    Get all bookings
// @route   GET /api/bookings
// @access  Private/Admin
exports.getBookings = async (req, res, next) => {
    try {
        const bookings = await Booking.find()
            .populate('property')
            .populate('user', 'name email')
            .sort('-createdAt');

        res.json(bookings);
    } catch (err) {
        next(err);
    }
};

// @desc    Get user bookings
// @route   GET /api/bookings/user/:userId
// @access  Private
exports.getUserBookings = async (req, res, next) => {
    try {
        const bookings = await Booking.find({ user: req.params.userId })
            .populate('property')
            .sort('-createdAt');

        res.json(bookings);
    } catch (err) {
        next(err);
    }
};

// @desc    Update booking status
// @route   PUT /api/bookings/:id
// @access  Private
exports.updateBookingStatus = async (req, res, next) => {
    try {
        const { status } = req.body;
        const booking = await Booking.findById(req.params.id)
            .populate('property')
            .populate('user', 'name email');

        if (!booking) {
            return res.status(404).json({ message: 'Booking not found' });
        }

        // Check if user is the property owner
        const isOwner = booking.property.owner.toString() === req.user._id.toString();
        const isBookingUser = booking.user._id.toString() === req.user._id.toString();

        // Owner can only approve pending bookings
        if (isOwner && status === 'owner_approved') {
            if (booking.status !== 'pending') {
                return res.status(400).json({ message: 'Can only approve pending bookings' });
            }
            booking.status = 'owner_approved';
            booking.ownerApprovalDate = new Date();
            await booking.save();

            // Create notification for the booking user
            await Notification.create({
                user: booking.user._id,
                message: `Your booking for "${booking.property.title}" has been approved by the owner!`
            });

            return res.json(booking);
        }

        // Booking user can only confirm after owner approval
        if (isBookingUser && status === 'booked_successful') {
            if (booking.status !== 'owner_approved') {
                return res.status(400).json({ message: 'Booking must be approved by owner first' });
            }
            booking.status = 'booked_successful';
            await booking.save();

            // Create notification for the owner
            await Notification.create({
                user: booking.property.owner,
                message: `Your property "${booking.property.title}" has been booked successfully!`
            });

            return res.json(booking);
        }

        return res.status(403).json({ message: 'Not authorized to update this booking' });
    } catch (err) {
        next(err);
    }
};

// @desc    Delete booking
// @route   DELETE /api/bookings/:id
// @access  Private
exports.deleteBooking = async (req, res, next) => {
    try {
        const booking = await Booking.findById(req.params.id)
            .populate('property');

        if (!booking) {
            return res.status(404).json({ message: 'Booking not found' });
        }

        // Check if user is the booking user or property owner
        const isOwner = booking.property.owner.toString() === req.user._id.toString();
        const isBookingUser = booking.user.toString() === req.user._id.toString();

        if (!isOwner && !isBookingUser) {
            return res.status(403).json({ message: 'Not authorized to delete this booking' });
        }

        // Only allow deletion of pending bookings
        if (booking.status !== 'pending') {
            return res.status(400).json({ message: 'Can only delete pending bookings' });
        }

        await booking.remove();
        res.json({ message: 'Booking removed' });
    } catch (err) {
        next(err);
    }
}; 