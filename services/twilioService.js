require('dotenv').config();
const twilio = require('twilio');

class TwilioService {
    constructor() {
        this.accountSid = process.env.TWILIO_ACCOUNT_SID;
        this.authToken = process.env.TWILIO_AUTH_TOKEN;
        this.fromNumber = process.env.TWILIO_FROM_NUMBER;
        this.client = twilio(this.accountSid, this.authToken);
    }

    // Send SMS
    async sendSMS(to, body) {
        try {
            const message = await this.client.messages.create({
                from: this.fromNumber,
                to: to,
                body: body
            });
            console.log('✅ SMS sent:', message.sid);
            return { success: true, sid: message.sid };
        } catch (error) {
            console.error('❌ Error sending SMS:', error);
            return { success: false, error: error.message };
        }
    }

    // Send OTP via SMS
    async sendOTPviaSMS(phone, otp) {
        try {
            // Format phone number (add +91 if not present)
            const cleanPhone = phone.replace(/[^0-9]/g, '');
            const fullPhone = cleanPhone.startsWith('91') ? `+${cleanPhone}` : `+91${cleanPhone}`;

            const message = `Your OTP is: ${otp}. Please do not share this with anyone.`;

            const result = await this.sendSMS(fullPhone, message);
            return { success: result.success, channel: 'sms', data: result };
        } catch (error) {
            console.error('❌ Error sending OTP via SMS:', error);
            return { success: false, error: error.message };
        }
    }


    // Send OTP (main method for compatibility)
    async sendOTP(phone, otp) {
        console.log('🚀 Starting OTP delivery process for phone:', phone);
        console.log('🔢 OTP to send:', otp);

        // Send via SMS
        console.log('📨 Sending OTP via Twilio SMS...');
        const result = await this.sendOTPviaSMS(phone, otp);
        if (result.success) {
            console.log('✅ OTP sent successfully via SMS');
        } else {
            console.log('❌ SMS delivery failed');
        }
        return result;
    }
}

module.exports = new TwilioService();