const User = require('../models/User');
const Property = require('../models/Property');
const Booking = require('../models/Booking');
const cloudinary = require('../config/cloudinary');
const sharp = require('sharp');

// Statistics - now returns user-specific stats
exports.getStatistics = async (req, res, next) => {
    try {
        const userId = req.user._id;
        
        // Get user's properties
        const userProperties = await Property.find({ owner: userId });
        const totalProperties = userProperties.length;
        const activeProperties = userProperties.filter(p => p.status === 'available').length;
        
        // Get user's bookings
        const userBookings = await Booking.find({ user: userId });
        const totalBookings = userBookings.length;
        
        // Calculate user's revenue
        const totalRevenueAgg = await Booking.aggregate([
            { $match: { user: userId, status: 'completed' } },
            { $group: { _id: null, total: { $sum: "$totalPrice" } } }
        ]);
        const totalRevenue = totalRevenueAgg[0]?.total || 0;

        res.json({
            totalProperties,
            activeProperties,
            totalBookings,
            totalRevenue
        });
    } catch (err) {
        next(err);
    }
};

// Optimize image before upload
const optimizeImage = async (buffer) => {
    try {
        return await sharp(buffer)
            .resize(1200, 800, { fit: 'inside', withoutEnlargement: true })
            .jpeg({ quality: 80 })
            .toBuffer();
    } catch (err) {
        console.error('Error optimizing image:', err);
        return buffer;
    }
};

// Properties - now returns user's own properties
exports.listProperties = async (req, res, next) => {
    try {
        const properties = await Property.find({ owner: req.user._id });
        res.json(properties);
    } catch (err) {
        next(err);
    }
};

exports.createProperty = async (req, res) => {
    try {
        console.log('Received files:', req.files);
        console.log('Received body:', req.body);

        // Validate required fields
        const requiredFields = ['title', 'description', 'type', 'price', 'area', 'bedrooms', 'bathrooms'];
        const missingFields = requiredFields.filter(field => !req.body[field]);

        if (missingFields.length > 0) {
            return res.status(400).json({
                success: false,
                message: `Missing required fields: ${missingFields.join(', ')}`
            });
        }

        // Parse location if it's a string
        let location = req.body.location;
        if (typeof location === 'string') {
            try {
                location = JSON.parse(location);
            } catch (err) {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid location format'
                });
            }
        }

        // Handle file uploads
        let images = [];
        if (req.files && req.files.length > 0) {
            try {
                console.log('Processing images...');
                // Upload to Cloudinary
                const uploadPromises = req.files.map(file => {
                    return new Promise((resolve, reject) => {
                        const uploadStream = cloudinary.uploader.upload_stream(
                            {
                                folder: 'properties',
                                resource_type: 'auto'
                            },
                            (error, result) => {
                                if (error) {
                                    console.error('Cloudinary upload error:', error);
                                    reject(error);
                                } else {
                                    console.log('Successfully uploaded image:', result.secure_url);
                                    resolve({ url: result.secure_url, publicId: result.public_id });
                                }
                            }
                        );
                        uploadStream.end(file.buffer);
                    });
                });
                images = await Promise.all(uploadPromises);
                console.log('All images uploaded successfully:', images);
            } catch (uploadError) {
                console.error('Image upload error:', uploadError);
                return res.status(400).json({
                    success: false,
                    message: 'Error uploading images',
                    error: uploadError.message
                });
            }
        }

        // Build property data
        const propertyData = {
            ...req.body,
            location,
            images,
            owner: req.user._id,
            price: Number(req.body.price),
            area: Number(req.body.area),
            bedrooms: Number(req.body.bedrooms),
            bathrooms: Number(req.body.bathrooms),
            views: 0,
            featured: req.body.featured === 'true'
        };
        delete propertyData.uniqueId;

        console.log('Creating property with data:', propertyData);

        // Create property
        const property = new Property(propertyData);
        await property.save();

        console.log('Property created successfully:', property);

        res.status(201).json({
            success: true,
            data: property
        });
    } catch (err) {
        console.error('Error creating property:', err);
        res.status(500).json({
            success: false,
            message: err.message || 'Error creating property'
        });
    }
};

exports.updateProperty = async (req, res, next) => {
    try {
        console.log('Received files:', req.files);
        console.log('Received body:', req.body);
        let updateData = req.body;
        if (req.body.data) {
            updateData = JSON.parse(req.body.data);
        }

        // Find the property
        const property = await Property.findById(req.params.id);
        if (!property) {
            return res.status(404).json({ success: false, message: 'Property not found' });
        }

        // Handle removed images
        if (req.body.removedImages) {
            const removedImages = JSON.parse(req.body.removedImages);
            // Remove from Cloudinary
            for (const imageId of removedImages) {
                const image = property.images.find(img => img._id?.toString() === imageId || img.publicId === imageId);
                if (image) {
                    await cloudinary.uploader.destroy(image.publicId);
                }
            }
            // Remove from property.images array
            property.images = property.images.filter(
                img => !removedImages.includes(img._id?.toString()) && !removedImages.includes(img.publicId)
            );
        }

        // Handle new image uploads
        if (req.files && req.files.length > 0) {
            try {
                const uploadPromises = req.files.map(file => {
                    return new Promise((resolve, reject) => {
                        const uploadStream = cloudinary.uploader.upload_stream(
                            {
                                folder: 'properties',
                                resource_type: 'auto'
                            },
                            (error, result) => {
                                if (error) {
                                    console.error('Cloudinary upload error:', error);
                                    reject(error);
                                } else {
                                    console.log('Successfully uploaded image:', result.secure_url);
                                    resolve({ url: result.secure_url, publicId: result.public_id });
                                }
                            }
                        );
                        uploadStream.end(file.buffer);
                    });
                });
                const newImages = await Promise.all(uploadPromises);
                property.images.push(...newImages);
            } catch (uploadError) {
                console.error('Image upload error:', uploadError);
                return res.status(400).json({
                    success: false,
                    message: 'Error uploading images',
                    error: uploadError.message
                });
            }
        }

        // Update other fields (except images)
        Object.keys(updateData).forEach(key => {
            if (key !== 'images' && updateData[key] !== undefined) {
                property[key] = updateData[key];
            }
        });

        await property.save();
        console.log('Property images after update:', property.images);
        res.json(property);
    } catch (err) {
        console.error('Update property error:', err);
        next(err);
    }
};

exports.deleteProperty = async (req, res, next) => {
    try {
        await Property.findByIdAndDelete(req.params.id);
        res.json({ message: 'Property deleted' });
    } catch (err) {
        next(err);
    }
};

exports.getPropertyById = async (req, res) => {
    try {
        const property = await Property.findById(req.params.id);
        if (!property) {
            return res.status(404).json({ success: false, message: 'Property not found' });
        }
        res.json(property);
    } catch (err) {
        res.status(500).json({ success: false, message: 'Failed to fetch property' });
    }
};

// Bookings - now returns user's own bookings
exports.listBookings = async (req, res, next) => {
    try {
        const bookings = await Booking.find({ user: req.user._id })
            .populate('property')
            .populate('user', 'name email');
        res.json(bookings);
    } catch (err) {
        next(err);
    }
};

exports.updateBookingStatus = async (req, res, next) => {
    try {
        const booking = await Booking.findByIdAndUpdate(req.params.id, { status: req.body.status }, { new: true });
        res.json(booking);
    } catch (err) {
        next(err);
    }
};

exports.deleteBooking = async (req, res, next) => {
    try {
        await Booking.findByIdAndDelete(req.params.id);
        res.json({ message: 'Booking deleted' });
    } catch (err) {
        next(err);
    }
};

// Users - now returns only the current user
exports.listUsers = async (req, res, next) => {
    try {
        const user = await User.findById(req.user._id).select('-password');
        res.json([user]);
    } catch (err) {
        next(err);
    }
};

exports.updateUserRole = async (req, res, next) => {
    try {
        const user = await User.findByIdAndUpdate(req.params.id, { role: req.body.role }, { new: true });
        res.json(user);
    } catch (err) {
        next(err);
    }
};

exports.deleteUser = async (req, res, next) => {
    try {
        await User.findByIdAndDelete(req.params.id);
        res.json({ message: 'User deleted' });
    } catch (err) {
        next(err);
    }
}; 