const axios = require('axios');

const getAccessToken = async () => {
    const tokenEndpoint = `https://login.microsoftonline.com/${process.env.O365_TENANT_ID}/oauth2/v2.0/token`;
    const tokenRequestBody = {
        client_id: process.env.O365_CLIENT_ID,
        scope: 'https://graph.microsoft.com/.default',
        client_secret: process.env.O365_CLIENT_SECRET,
        grant_type: 'client_credentials',
    };

    try {
        const response = await axios.post(tokenEndpoint, new URLSearchParams(tokenRequestBody), {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        });
        return response.data.access_token;
    } catch (error) {
        console.error('Failed to get OAuth2 access token for Graph API:', error.response ? JSON.stringify(error.response.data, null, 2) : error.message);
        throw new Error('Could not authenticate with email service. Check server credentials.');
    }
};

const sendMailWithGraphAPI = async (mailPayload) => {
    try {
        const accessToken = await getAccessToken();
        const graphApiUrl = `https://graph.microsoft.com/v1.0/users/${process.env.O365_USER_EMAIL}/sendMail`;
        await axios.post(graphApiUrl, mailPayload, {
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            }
        });
    } catch (error) {
        const recipient = mailPayload.message?.toRecipients?.[0]?.emailAddress?.address || 'unknown recipient';
        console.error(`Error sending email to ${recipient} via Graph API:`, error.response ? JSON.stringify(error.response.data, null, 2) : error.message);
        throw new Error('Could not send email. Please try again later.');
    }
};

const emailTemplates = {
    signup: (otp) => ({
        subject: 'Your Account Verification Code',
        content: `<div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;"><h2>Account Verification</h2><p>Thank you for signing up for the AI Document Assistant. Please use the following One-Time Password to verify your email address:</p><p style="font-size: 24px; font-weight: bold; letter-spacing: 2px; color: #833ab4;">${otp}</p><p>This code is valid for 10 minutes.</p><p>If you did not request this, please ignore this email.</p></div>`,
    }),
    delete_account: (otp) => ({
        subject: 'Your Account Deletion Verification Code',
        content: `<div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;"><h2>Account Deletion Request</h2><p>We received a request to delete your account. For your security, please use the following verification code to confirm this action:</p><p style="font-size: 24px; font-weight: bold; letter-spacing: 2px; color: #d93025;">${otp}</p><p>This code is valid for 10 minutes. This action is irreversible.</p><p>If you did not request this change, you can safely ignore this email.</p></div>`,
    }),
    forgot_password: (otp) => ({
        subject: 'Your Password Reset Code',
        content: `<div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;"><h2>Password Reset Request</h2><p>We received a request to reset your password. Please use the following verification code to proceed:</p><p style="font-size: 24px; font-weight: bold; letter-spacing: 2px; color: #007bff;">${otp}</p><p>This code is valid for 10 minutes.</p><p>If you did not request a password reset, you can safely ignore this email.</p></div>`,
    }),
    change_password: (otp) => ({
        subject: 'Your Password Change Verification Code',
        content: `<div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;"><h2>Confirm Your Password Change</h2><p>To confirm your password change, please use the following verification code:</p><p style="font-size: 24px; font-weight: bold; letter-spacing: 2px; color: #17a2b8;">${otp}</p><p>This code is valid for 10 minutes.</p><p>If you did not request this change, please contact support immediately.</p></div>`,
    }),
};


const sendOtpEmail = async (email, otp, purpose) => {
  const template = emailTemplates[purpose];
  if (!template) {
      console.error(`OTP email requested for unhandled purpose: '${purpose}'`);
      throw new Error(`OTP email requested for an unhandled purpose.`);
  }

  const { subject, content } = template(otp);
  
  const mailPayload = {
    message: {
      subject,
      body: { contentType: 'HTML', content },
      toRecipients: [{ emailAddress: { address: email } }],
    },
    saveToSentItems: 'false',
  };

  try {
    await sendMailWithGraphAPI(mailPayload);
    console.log(`${purpose.replace('_', ' ')} OTP email sent to ${email} via Microsoft Graph API.`);
  } catch(error) {
    throw error;
  }
};

module.exports = {
  sendOtpEmail,
};
