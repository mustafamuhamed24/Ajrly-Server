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

        // Emit socket events
        const io = req.app.get('io');
        if (io) {
            // Emit to all connected clients
            io.emit('booking:created', { booking: populatedBooking });

            // Emit to specific users
            io.to(`user:${req.user._id}`).emit('booking:created', { booking: populatedBooking });
            if (property.owner && property.owner._id && property.owner._id.toString() !== req.user._id.toString()) {
                io.to(`user:${property.owner._id}`).emit('booking:created', { booking: populatedBooking });
            }
        }

        res.status(201).json(populatedBooking);
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

// Update booking status
exports.updateBookingStatus = async (req, res) => {
    try {
        const { status } = req.body;
        const booking = await Booking.findById(req.params.id)
            .populate('property')
            .populate('user', 'name email');

        if (!booking) {
            return res.status(404).json({ message: 'Booking not found' });
        }

        // Check if user is authorized to update this booking
        if (booking.property.owner.toString() !== req.user._id.toString()) {
            return res.status(403).json({ message: 'Not authorized to update this booking' });
        }

        booking.status = status;
        await booking.save();

        // Emit socket events
        const io = req.app.get('io');
        if (io) {
            io.emit('booking:updated', { booking });
            io.to(`user:${booking.user._id}`).emit('booking:updated', { booking });
            io.to(`user:${booking.property.owner}`).emit('booking:updated', { booking });
        }

        res.json(booking);
    } catch (error) {
        res.status(500).json({ message: 'Error updating booking status', error: error.message });
    }
};

// Cancel booking
exports.cancelBooking = async (req, res) => {
    try {
        const booking = await Booking.findById(req.params.id)
            .populate('property')
            .populate('user', 'name email');

        if (!booking) {
            return res.status(404).json({ message: 'Booking not found' });
        }

        // Check if user is authorized to cancel this booking
        if (booking.user._id.toString() !== req.user._id.toString() &&
            booking.property.owner.toString() !== req.user._id.toString()) {
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
            to: booking.user.email,
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
                guestName: booking.user.name,
                checkIn: booking.checkIn,
                checkOut: booking.checkOut
            }
        });

        // Emit socket events
        const io = req.app.get('io');
        if (io) {
            io.emit('booking:cancelled', { booking });
            io.to(`user:${booking.user._id}`).emit('booking:cancelled', { booking });
            io.to(`user:${booking.property.owner}`).emit('booking:cancelled', { booking });
        }

        res.json(booking);
    } catch (error) {
        res.status(500).json({ message: 'Error cancelling booking', error: error.message });
    }
};

// Get property owner's bookings
exports.getOwnerBookings = async (req, res) => {
    try {
        console.log('Fetching bookings for property owner:', req.user._id);

        // First, get all properties owned by the user
        const properties = await Property.find({ owner: req.user._id });
        const propertyIds = properties.map(property => property._id);

        console.log('Found properties owned by user:', propertyIds);

        // Then find all bookings for these properties
        const bookings = await Booking.find({
            property: { $in: propertyIds }
        })
            .populate({
                path: 'property',
                select: 'title location images price owner'
            })
            .populate('user', 'name email phone')
            .sort({ createdAt: -1 });

        console.log('Found bookings for properties:', bookings.length);

        // Add additional booking details
        const bookingsWithDetails = bookings.map(booking => ({
            ...booking.toObject(),
            propertyDetails: {
                title: booking.property.title,
                location: booking.property.location,
                images: booking.property.images,
                price: booking.property.price
            },
            guestDetails: {
                name: booking.user.name,
                email: booking.user.email,
                phone: booking.user.phone
            }
        }));

        res.json(bookingsWithDetails);
    } catch (error) {
        console.error('Error in getOwnerBookings:', error);
        res.status(500).json({
            message: 'Error fetching owner bookings',
            error: error.message
        });
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