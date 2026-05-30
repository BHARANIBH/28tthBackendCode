const fs = require('fs');
const path = require('path');
const readline = require('readline');

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

console.log('🔧 MSG91 Configuration Setup');
console.log('=============================');
console.log('');

rl.question('Enter your MSG91 Auth Key (from Dashboard → API): ', (authKey) => {
    rl.question('Enter your MSG91 Template ID (from Dashboard → Templates): ', (templateId) => {
        rl.question('Enter your WhatsApp Number (registered with MSG91, format: 918XXXXXXXXX): ', (whatsappNumber) => {

            // Read current .env file
            const envPath = path.join(__dirname, '.env');
            let envContent = fs.readFileSync(envPath, 'utf8');

            // Replace the MSG91 values
            envContent = envContent.replace(
                /MSG91_AUTH_KEY=.*/,
                `MSG91_AUTH_KEY=${authKey}`
            );
            envContent = envContent.replace(
                /MSG91_TEMPLATE_ID=.*/,
                `MSG91_TEMPLATE_ID=${templateId}`
            );
            envContent = envContent.replace(
                /MSG91_WHATSAPP_NUMBER=.*/,
                `MSG91_WHATSAPP_NUMBER=${whatsappNumber}`
            );

            // Write back to .env file
            fs.writeFileSync(envPath, envContent);

            console.log('');
            console.log('✅ MSG91 credentials updated successfully!');
            console.log('');
            console.log('📋 Updated values:');
            console.log(`   Auth Key: ${authKey.substring(0, 10)}...`);
            console.log(`   Template ID: ${templateId}`);
            console.log(`   WhatsApp Number: ${whatsappNumber}`);
            console.log('');
            console.log('🧪 Run "node test-msg91.js" to test the integration');

            rl.close();
        });
    });
});