const Property = require('../models/Property');
const Booking = require('../models/Booking');
const cloudinary = require('../config/cloudinary');
const { validateProperty } = require('../utils/validators');

// Get all properties
exports.getProperties = async (req, res) => {
    try {
        console.log('Fetching all properties...');
        console.log('Request query:', req.query);
        const properties = await Property.find()
            .populate('owner', 'name email')
            .sort({ createdAt: -1 });
        console.log(`Found ${properties.length} properties:`, properties.map(p => ({ id: p._id, title: p.title })));
        res.json(properties);
    } catch (error) {
        console.error('Error in getProperties:', error);
        res.status(500).json({ message: 'Error fetching properties', error: error.message });
    }
};

// Get property by ID
exports.getPropertyById = async (req, res) => {
    try {
        const property = await Property.findById(req.params.id)
            .populate('owner', 'name email');

        if (!property) {
            return res.status(404).json({ message: 'Property not found' });
        }

        res.json(property);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching property', error: error.message });
    }
};

// Create new property
exports.createProperty = async (req, res) => {
    try {
        // Validate property data
        const { error } = validateProperty(req.body);
        if (error) {
            return res.status(400).json({ message: error.details[0].message });
        }

        // Handle image uploads
        const imagePromises = req.files.map(file =>
            cloudinary.uploader.upload(file.path, {
                folder: 'properties',
                use_filename: true
            })
        );

        const uploadedImages = await Promise.all(imagePromises);

        // Create property with uploaded images
        const property = new Property({
            ...req.body,
            owner: req.user._id,
            images: uploadedImages.map(img => ({
                url: img.secure_url,
                publicId: img.public_id
            }))
        });

        await property.save();
        res.status(201).json(property);
    } catch (error) {
        res.status(500).json({ message: 'Error creating property', error: error.message });
    }
};

// Update property
exports.updateProperty = async (req, res) => {
    try {
        const property = await Property.findById(req.params.id);

        if (!property) {
            return res.status(404).json({ message: 'Property not found' });
        }

        // Check ownership
        if (property.owner.toString() !== req.user._id.toString()) {
            return res.status(403).json({ message: 'Not authorized to update this property' });
        }

        // Handle new image uploads
        let newImages = [];
        if (req.files && req.files.length > 0) {
            const imagePromises = req.files.map(file =>
                cloudinary.uploader.upload(file.path, {
                    folder: 'properties',
                    use_filename: true
                })
            );
            newImages = await Promise.all(imagePromises);
        }

        // Handle image deletions
        if (req.body.removedImages) {
            const removedImages = JSON.parse(req.body.removedImages);
            for (const imageId of removedImages) {
                const image = property.images.find(img => img._id.toString() === imageId);
                if (image) {
                    await cloudinary.uploader.destroy(image.publicId);
                }
            }
            property.images = property.images.filter(
                img => !removedImages.includes(img._id.toString())
            );
        }

        // Add new images
        property.images.push(...newImages.map(img => ({
            url: img.secure_url,
            publicId: img.public_id
        })));

        // Update other fields
        const updateData = JSON.parse(req.body.data);
        Object.keys(updateData).forEach(key => {
            if (key !== 'images' && key !== 'owner') {
                property[key] = updateData[key];
            }
        });

        await property.save();
        res.json(property);
    } catch (error) {
        res.status(500).json({ message: 'Error updating property', error: error.message });
    }
};

// Delete property
exports.deleteProperty = async (req, res) => {
    try {
        const property = await Property.findById(req.params.id);

        if (!property) {
            return res.status(404).json({ message: 'Property not found' });
        }

        // Check ownership
        if (property.owner.toString() !== req.user._id.toString()) {
            return res.status(403).json({ message: 'Not authorized to delete this property' });
        }

        // Delete images from cloudinary
        for (const image of property.images) {
            await cloudinary.uploader.destroy(image.publicId);
        }

        await property.remove();
        res.json({ message: 'Property deleted successfully' });
    } catch (error) {
        res.status(500).json({ message: 'Error deleting property', error: error.message });
    }
};

// Get dashboard statistics
exports.getStats = async (req, res) => {
    try {
        const totalProperties = await Property.countDocuments();
        const activeProperties = await Property.countDocuments({ status: 'active' });
        const totalBookings = await Booking.countDocuments();
        const totalRevenue = await Booking.aggregate([
            { $match: { status: 'completed' } },
            { $group: { _id: null, total: { $sum: '$totalAmount' } } }
        ]);

        res.json({
            totalProperties,
            activeProperties,
            totalBookings,
            totalRevenue: totalRevenue[0]?.total || 0
        });
    } catch (error) {
        res.status(500).json({ message: 'Error fetching statistics', error: error.message });
    }
};

// Get property bookings
exports.getPropertyBookings = async (req, res) => {
    try {
        const propertyId = req.params.id;
        console.log('Fetching bookings for property:', propertyId);

        // Check if property exists
        const property = await Property.findById(propertyId);
        if (!property) {
            console.log('Property not found:', propertyId);
            return res.status(404).json({ message: 'Property not found' });
        }

        const bookings = await Booking.find({
            property: propertyId,
            status: { $in: ['pending', 'confirmed'] }
        })
            .populate('user', 'name email')
            .sort({ createdAt: -1 });

        console.log('Found bookings:', bookings.length);
        res.json(bookings);
    } catch (error) {
        console.error('Error fetching property bookings:', error);
        res.status(500).json({
            message: 'Error fetching property bookings',
            error: error.message
        });
    }
}; 