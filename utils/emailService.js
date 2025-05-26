const nodemailer = require('nodemailer');
const handlebars = require('handlebars');
const fs = require('fs').promises;
const path = require('path');

// Create nodemailer transporter
const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: process.env.SMTP_PORT,
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
    }
});

// Load email template
const loadTemplate = async (templateName) => {
    const templatePath = path.join(__dirname, '../templates/emails', `${templateName}.hbs`);
    const template = await fs.readFile(templatePath, 'utf-8');
    return handlebars.compile(template);
};

// Send email
const sendEmail = async ({ to, subject, template, data }) => {
    try {
        // Load and compile template
        const compiledTemplate = await loadTemplate(template);
        const html = compiledTemplate(data);

        // Send email
        await transporter.sendMail({
            from: process.env.SMTP_FROM,
            to,
            subject,
            html
        });

        return true;
    } catch (error) {
        console.error('Error sending email:', error);
        return false;
    }
};

module.exports = {
    sendEmail
}; 