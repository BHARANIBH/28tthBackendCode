const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    name: {
        type: String,
        default: '',
    },
    email: {
        type: String,
        sparse: true,
        unique: true,
    },
    phone: {
        type: String,
        required: true,
        unique: true,
    },
    isPhoneVerified: {
        type: Boolean,
        default: false,
    },
    defaultAddressId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Address',
    },
    orderCount: {
        type: Number,
        default: 0,
    },
    totalSpent: {
        type: Number,
        default: 0,
    },
    createdAt: {
        type: Date,
        default: Date.now,
    },
    lastLogin: {
        type: Date,
        default: Date.now,
    },
});

module.exports = mongoose.model('User', userSchema);