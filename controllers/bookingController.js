const Booking = require('../models/Booking');
const Property = require('../models/Property');
const { sendEmail } = require('../utils/emailService');
const { validateBooking } = require('../utils/validators');

// Create new booking
exports.createBooking = async (req, res) => {
    try {
        const { propertyId, checkIn, checkOut, paymentMethod, totalAmount, depositAmount, totalNights } = req.body;

        // Debug logging
        console.log('Booking attempt for propertyId:', propertyId);
        console.log('User making booking:', req.user ? req.user._id : 'No user');
        console.log('Booking request body:', req.body);

        // Validate booking data
        const { error } = validateBooking(req.body);
        if (error) {
            console.log('Booking validation error:', error.details[0].message);
            return res.status(400).json({ message: error.details[0].message });
        }

        // Check if property exists and is active
        const property = await Property.findById(propertyId);
        console.log('Fetched property:', property);
        if (!property) {
            console.log('Property not found for booking:', propertyId);
            return res.status(404).json({ message: 'Property not found' });
        }
        console.log('Property status:', property.status);
        if (property.status !== 'active') {
            console.log('Property is not active:', property.status);
            return res.status(400).json({ message: 'Property is not available for booking' });
        }

        // Check for overlapping bookings
        const overlappingBooking = await Booking.findOne({
            property: propertyId,
            status: { $in: ['pending', 'confirmed'] },
            $or: [
                {
                    checkIn: { $lte: new Date(checkOut) },
                    checkOut: { $gte: new Date(checkIn) }
                }
            ]
        });

        if (overlappingBooking) {
            console.log('Overlapping booking found:', overlappingBooking);
            return res.status(400).json({ message: 'Property is already booked for these dates' });
        }

        // Generate unique booking ID
        const uniqueId = `BK${Date.now()}${Math.floor(Math.random() * 1000)}`;

        // Create booking
        const booking = new Booking({
            uniqueId,
            property: propertyId,
            user: req.user._id,
            checkIn: new Date(checkIn),
            checkOut: new Date(checkOut),
            totalNights,
            totalAmount,
            depositAmount,
            paymentMethod,
            status: 'pending',
            paymentStatus: 'pending'
        });
        console.log('Booking object before save:', booking);

        await booking.save();

        // Populate booking with property and user details
        const populatedBooking = await Booking.findById(booking._id)
            .populate('property')
            .populate('user', 'name email');

        // Send confirmation emails
        await sendEmail({
            to: req.user.email,
            subject: 'Booking Confirmation',
            template: 'booking-confirmation',
            data: {
                bookingId: booking.uniqueId,
                propertyName: property.title,
                checkIn: checkIn,
                checkOut: checkOut,
                totalAmount: totalAmount,
                depositAmount: depositAmount
            }
        });

        await sendEmail({
            to: property.owner.email,
            subject: 'New Booking Notification',
            template: 'owner-notification',
            data: {
                bookingId: booking.uniqueId,
                propertyName: property.title,
                guestName: req.user.name,
                checkIn: checkIn,
                checkOut: checkOut,
                totalAmount: totalAmount,
                depositAmount: depositAmount
            }
        });

        res.status(201).json(populatedBooking);

        // --- SOCKET.IO EMIT ---
        const io = req.app.get('io');
        if (io) {
            // Notify the user who made the booking
            io.to(`user:${req.user._id}`).emit('booking:success', { booking: populatedBooking });
            // Notify the property owner if different
            if (property.owner && property.owner._id && property.owner._id.toString() !== req.user._id.toString()) {
                io.to(`user:${property.owner._id}`).emit('booking:success', { booking: populatedBooking });
            }
        }
        // --- END SOCKET.IO EMIT ---
    } catch (error) {
        console.error('Error creating booking:', error);
        res.status(500).json({ message: 'Error creating booking', error: error.message });
    }
};

// Get user's bookings
exports.getUserBookings = async (req, res) => {
    try {
        console.log('Fetching bookings for user:', req.user._id);

        const bookings = await Booking.find({ user: req.user._id })
            .populate({
                path: 'property',
                select: 'title location images price'
            })
            .sort({ createdAt: -1 });

        console.log('Found bookings:', bookings.length);

        res.json(bookings);
    } catch (error) {
        console.error('Error in getUserBookings:', error);
        res.status(500).json({
            message: 'Error fetching bookings',
            error: error.message
        });
    }
};

// Get booking by ID
exports.getBookingById = async (req, res) => {
    try {
        const booking = await Booking.findById(req.params.id)
            .populate('property')
            .populate('user', 'name email');

        if (!booking) {
            return res.status(404).json({ message: 'Booking not found' });
        }

        // Check if user is authorized to view this booking
        if (booking.user._id.toString() !== req.user._id.toString() &&
            booking.property.owner.toString() !== req.user._id.toString()) {
            return res.status(403).json({ message: 'Not authorized to view this booking' });
        }

        res.json(booking);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching booking', error: error.message });
    }
};

// Cancel booking
exports.cancelBooking = async (req, res) => {
    try {
        const booking = await Booking.findById(req.params.id)
            .populate('property');

        if (!booking) {
            return res.status(404).json({ message: 'Booking not found' });
        }

        // Check if user is authorized to cancel this booking
        if (booking.user.toString() !== req.user._id.toString()) {
            return res.status(403).json({ message: 'Not authorized to cancel this booking' });
        }

        // Check if booking can be cancelled
        const checkIn = new Date(booking.checkIn);
        const now = new Date();
        const hoursUntilCheckIn = (checkIn - now) / (1000 * 60 * 60);

        if (hoursUntilCheckIn < 24) {
            return res.status(400).json({ message: 'Bookings can only be cancelled at least 24 hours before check-in' });
        }

        booking.status = 'cancelled';
        booking.cancellationDate = new Date();
        await booking.save();

        // Send cancellation emails
        await sendEmail({
            to: req.user.email,
            subject: 'Booking Cancellation Confirmation',
            template: 'booking-cancellation',
            data: {
                bookingId: booking._id,
                propertyName: booking.property.title,
                checkIn: booking.checkIn,
                checkOut: booking.checkOut,
                refundAmount: booking.depositAmount
            }
        });

        await sendEmail({
            to: booking.property.owner.email,
            subject: 'Booking Cancellation Notification',
            template: 'owner-cancellation-notification',
            data: {
                bookingId: booking._id,
                propertyName: booking.property.title,
                guestName: req.user.name,
                checkIn: booking.checkIn,
                checkOut: booking.checkOut
            }
        });

        res.json(booking);
    } catch (error) {
        res.status(500).json({ message: 'Error cancelling booking', error: error.message });
    }
};

// Get property owner's bookings
exports.getOwnerBookings = async (req, res) => {
    try {
        const bookings = await Booking.find()
            .populate({
                path: 'property',
                match: { owner: req.user._id }
            })
            .populate('user', 'name email')
            .sort({ createdAt: -1 });

        const filteredBookings = bookings.filter(booking => booking.property !== null);
        res.json(filteredBookings);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching bookings', error: error.message });
    }
};

// Delete booking
exports.deleteBooking = async (req, res) => {
    try {
        const booking = await Booking.findById(req.params.id);
        if (!booking) {
            return res.status(404).json({ message: 'Booking not found' });
        }
        // Allow user to delete their own booking or admin to delete any booking
        if (booking.user.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
            return res.status(403).json({ message: 'Not authorized to delete this booking' });
        }
        await booking.deleteOne();
        res.json({ message: 'Booking deleted successfully' });
    } catch (error) {
        console.error('Error deleting booking:', error);
        res.status(500).json({ message: 'Error deleting booking', error: error.message });
    }
}; 