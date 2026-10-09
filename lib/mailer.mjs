import nodemailer from 'nodemailer';

// Sends through LCC's own Google Workspace mailbox (smtp.gmail.com, an app password).
// SMTP_USER / SMTP_PASS live in the server .env; without them nothing is sent.
let transport;
export const emailConfigured = () => !!(process.env.SMTP_USER && process.env.SMTP_PASS);

export async function sendEmail({ to, subject, text, attachments }) {
  if (!emailConfigured()) throw new Error('Email is not set up on the server (SMTP_USER / SMTP_PASS)');
  transport ??= nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com', port: 465, secure: true,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
  return transport.sendMail({ from: { name: 'LCC Bathrooms & Services', address: process.env.SMTP_USER }, to, subject, text, attachments });
}
