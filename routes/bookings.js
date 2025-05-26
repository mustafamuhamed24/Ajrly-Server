const express = require('express');
const router = express.Router();
const {
    createBooking,
    getBookings,
    getUserBookings,
    updateBookingStatus,
    deleteBooking
} = require('../controllers/bookings');
const { protect } = require('../middleware/auth');
const Booking = require('../models/booking');

// Protected routes
router.post('/', protect, createBooking);
router.get('/user/:userId', protect, getUserBookings);
router.delete('/:id', protect, deleteBooking);

// All authenticated users can access these routes
router.get('/', protect, getBookings);
router.put('/:id', protect, updateBookingStatus);

// Get all bookings for the current user
router.get('/mine', protect, async (req, res) => {
    try {
        const bookings = await Booking.find({ user: req.user._id });
        res.json(bookings);
    } catch (err) {
        res.status(500).json({ message: 'Failed to fetch bookings' });
    }
});

module.exports = router; 