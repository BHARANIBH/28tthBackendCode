const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const OTP = require('../models/OTP');
const User = require('../models/User');
const twilioService = require('../services/twilioService');

// Generate random 6-digit OTP
function generateOTP() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

// Send OTP
router.post('/send', async (req, res) => {
    try {
        const { phone } = req.body;

        console.log('📞 OTP send request received for phone:', phone);

        // Validate phone number
        if (!phone || phone.length < 10) {
            console.log('❌ Invalid phone number provided:', phone);
            return res.status(400).json({
                success: false,
                message: 'Please enter a valid 10-digit phone number'
            });
        }

        const cleanPhone = phone.replace(/[^0-9]/g, '').slice(-10);
        console.log('📱 Cleaned phone number:', cleanPhone);

        // Check for too many attempts
        const recentOTPs = await OTP.find({
            phone: cleanPhone,
            createdAt: { $gt: new Date(Date.now() - 60 * 1000) } // Last 60 seconds
        });

        if (recentOTPs.length >= 3) {
            console.log('🚫 Rate limit exceeded for phone:', cleanPhone);
            return res.status(429).json({
                success: false,
                message: 'Too many attempts. Please wait a minute.'
            });
        }

        // Generate OTP
        const otp = generateOTP();
        console.log('🔢 Generated OTP:', otp);

        // Send OTP via Twilio
        console.log('📤 Sending OTP via Twilio service...');
        const sendResult = await twilioService.sendOTP(cleanPhone, otp);
        console.log('📤 Twilio service result:', sendResult);

        // Save OTP to database (for local verification fallback)
        await OTP.create({
            phone: cleanPhone,
            otp: otp,
            channel: sendResult.channel || 'whatsapp',
        });

        console.log(`📱 OTP sent to ${cleanPhone} via ${sendResult.channel || 'whatsapp'}: ${otp}`);

        // In mock mode, always include OTP for testing
        const isMockMode = process.env.MSG91_MODE === 'mock';
        // Always send debug_otp if SMS delivery failed (Twilio trial account)
        // so the customer can still log in by reading the OTP from the server response
        const smsFailed = !sendResult.success;

        res.json({
            success: true,
            message: `OTP sent via ${sendResult.channel || 'whatsapp'}${isMockMode ? ' (MOCK MODE)' : ''}`,
            channel: sendResult.channel,
            // Auto-fill OTP in development, mock mode, or when SMS delivery failed (trial account)
            debug_otp: (process.env.NODE_ENV === 'development' || isMockMode || smsFailed) ? otp : undefined
        });

    } catch (error) {
        console.error('Send OTP error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to send OTP. Please try again.'
        });
    }
});

// Verify OTP and Login/Register
router.post('/verify', async (req, res) => {
    try {
        const { phone, otp } = req.body;

        const cleanPhone = phone.replace(/[^0-9]/g, '').slice(-10);

        // Find valid OTP in database
        const otpRecord = await OTP.findOne({
            phone: cleanPhone,
            otp: otp,
            isVerified: false,
            expiresAt: { $gt: new Date() }
        });

        if (!otpRecord) {
            return res.status(400).json({
                success: false,
                message: 'Invalid or expired OTP'
            });
        }

        // Mark OTP as verified
        otpRecord.isVerified = true;
        await otpRecord.save();

        // Find or create user
        let user = await User.findOne({ phone: cleanPhone });

        if (!user) {
            // Create new user
            user = await User.create({
                phone: cleanPhone,
                name: `User${cleanPhone.slice(-4)}`,
                isPhoneVerified: true,
                lastLogin: new Date()
            });
        } else {
            // Update existing user
            user.lastLogin = new Date();
            user.isPhoneVerified = true;
            await user.save();
        }

        // Generate JWT token
        const token = jwt.sign(
            {
                id: user._id,
                userId: user._id,
                phone: user.phone,
                name: user.name,
                role: 'customer'
            },
            process.env.JWT_SECRET,
            { expiresIn: '30d' }
        );

        res.json({
            success: true,
            message: 'Login successful',
            token: token,
            user: {
                id: user._id,
                name: user.name || `User${cleanPhone.slice(-4)}`,
                phone: user.phone,
                email: user.email || '',
                orderCount: user.orderCount,
                isNewUser: !user.name || user.name === `User${cleanPhone.slice(-4)}`
            }
        });

    } catch (error) {
        console.error('Verify OTP error:', error);
        res.status(500).json({
            success: false,
            message: 'Verification failed. Please try again.'
        });
    }
});

// Resend OTP
router.post('/resend', async (req, res) => {
    try {
        const { phone } = req.body;
        const cleanPhone = phone.replace(/[^0-9]/g, '').slice(-10);

        // Generate new OTP
        const otp = generateOTP();

        // Send via Twilio
        const sendResult = await twilioService.sendOTP(cleanPhone, otp);

        // Save new OTP
        await OTP.create({
            phone: cleanPhone,
            otp: otp,
            channel: sendResult.channel || 'whatsapp',
        });

        console.log(`📱 OTP resent to ${cleanPhone}: ${otp}`);

        res.json({
            success: true,
            message: `OTP resent via ${sendResult.channel || 'whatsapp'}`,
            debug_otp: process.env.NODE_ENV === 'development' ? otp : undefined
        });

    } catch (error) {
        res.status(500).json({ success: false, message: 'Failed to resend OTP' });
    }
});

// Get user profile
router.get('/profile', async (req, res) => {
    try {
        const token = req.headers.authorization?.split(' ')[1];
        if (!token) {
            return res.status(401).json({ success: false, message: 'Not authenticated' });
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await User.findById(decoded.userId);

        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        res.json({
            success: true,
            user: {
                id: user._id,
                name: user.name,
                phone: user.phone,
                email: user.email,
                orderCount: user.orderCount,
                totalSpent: user.totalSpent,
                createdAt: user.createdAt
            }
        });

    } catch (error) {
        res.status(401).json({ success: false, message: 'Invalid token' });
    }
});

// Update user profile
router.put('/profile', async (req, res) => {
    try {
        const token = req.headers.authorization?.split(' ')[1];
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        const { name, email } = req.body;
        const user = await User.findByIdAndUpdate(
            decoded.userId,
            { name, email },
            { new: true }
        );

        res.json({
            success: true,
            user: {
                id: user._id,
                name: user.name,
                phone: user.phone,
                email: user.email
            }
        });

    } catch (error) {
        res.status(401).json({ success: false, message: 'Update failed' });
    }
});

// MSG91 Widget Token Verification
router.post('/verify-widget-token', async (req, res) => {
    try {
        const { access_token } = req.body;

        console.log('🔐 Verifying MSG91 widget token');

        if (!access_token) {
            return res.status(400).json({
                success: false,
                message: 'Access token is required'
            });
        }

        // Verify token with MSG91
        const url = 'https://control.msg91.com/api/v5/widget/verifyAccessToken';

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify({
                authkey: process.env.MSG91_AUTH_KEY,
                'access-token': access_token
            })
        });

        const result = await response.json();

        console.log('MSG91 verification result:', result);

        if (result.success) {
            // Extract user info from token
            const { mobile } = result.data || {};

            if (!mobile) {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid token - no mobile number found'
                });
            }

            // Check if user exists, create if not
            let user = await User.findOne({ phone: mobile });

            if (!user) {
                // Create new user
                user = new User({
                    phone: mobile,
                    name: `User ${mobile.slice(-4)}`, // Temporary name
                    email: null,
                    isVerified: true // Widget verification means they're verified
                });
                await user.save();
                console.log('👤 New user created:', mobile);
            } else {
                // Update existing user as verified
                user.isVerified = true;
                await user.save();
                console.log('👤 Existing user verified:', mobile);
            }

            // Generate JWT token for our app
            const token = jwt.sign(
                {
                    id: user._id,
                    phone: user.phone,
                    name: user.name
                },
                process.env.JWT_SECRET,
                { expiresIn: '7d' }
            );

            res.json({
                success: true,
                message: 'Authentication successful',
                token: token,
                user: {
                    id: user._id,
                    name: user.name,
                    phone: user.phone,
                    email: user.email
                }
            });

        } else {
            res.status(401).json({
                success: false,
                message: 'Token verification failed',
                error: result.message
            });
        }

    } catch (error) {
        console.error('Widget token verification error:', error);
        res.status(500).json({
            success: false,
            message: 'Verification failed',
            error: error.message
        });
    }
});

module.exports = router;