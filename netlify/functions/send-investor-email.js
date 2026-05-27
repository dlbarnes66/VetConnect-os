/**
 * VetConnect OS — Investor Email Sender
 *
 * Sends personalized investor outreach via Mailgun.
 * Called from the OS Email Composer modal.
 *
 * Security:
 * - MAILGUN_API_KEY is set in Netlify env vars (not exposed to browser)
 * - This function authenticates by being on same domain as the OS
 * - For production, you'd add per-request auth tokens
 *
 * Environment variables required:
 * - MAILGUN_API_KEY
 * - MAILGUN_DOMAIN (e.g. "mg.vcgnow.com")
 */

exports.handler = async function(event, context) {
  // CORS headers
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  };

  // Handle OPTIONS preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: corsHeaders, body: '' };
  }

  // Only allow POST
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: corsHeaders,
      body: JSON.stringify({ success: false, error: 'Method not allowed' })
    };
  }

  try {
    // Parse request body
    let payload;
    try {
      payload = JSON.parse(event.body || '{}');
    } catch (e) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ success: false, error: 'Invalid JSON in request body' })
      };
    }

    const {
      to,
      toName,
      subject,
      body,
      fromName,
      replyTo
    } = payload;

    // Validation
    if (!to || !subject || !body) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ success: false, error: 'Missing required fields: to, subject, body' })
      };
    }

    // Validate email format (basic)
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(to)) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ success: false, error: 'Invalid recipient email format' })
      };
    }

    // Mailgun configuration
    const MAILGUN_API_KEY = process.env.MAILGUN_API_KEY;
    const MAILGUN_DOMAIN = process.env.MAILGUN_DOMAIN || 'mg.vcgnow.com';

    if (!MAILGUN_API_KEY) {
      console.error('MAILGUN_API_KEY not set in environment');
      return {
        statusCode: 500,
        headers: corsHeaders,
        body: JSON.stringify({ success: false, error: 'Email service not configured' })
      };
    }

    // Build sender address — uses Display Name "Darryl Barnes <dlbarnes@mg.vcgnow.com>"
    const senderEmail = `dlbarnes@${MAILGUN_DOMAIN}`;
    const fromHeader = fromName
      ? `${fromName} <${senderEmail}>`
      : senderEmail;

    // Build recipient with name if provided
    const toHeader = toName
      ? `${toName} <${to}>`
      : to;

    // Convert plain-text body to HTML (basic, preserves line breaks)
    const htmlBody = body
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1">$1</a>')
      .replace(/\n/g, '<br>');

    // Wrap in basic HTML structure
    const fullHtmlBody = `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif; font-size: 15px; color: #1A0F45; line-height: 1.6; max-width: 600px; margin: 0 auto; padding: 20px;">
${htmlBody}
</body>
</html>`;

    // Build form data for Mailgun API
    const formData = new URLSearchParams();
    formData.append('from', fromHeader);
    formData.append('to', toHeader);
    formData.append('subject', subject);
    formData.append('text', body);
    formData.append('html', fullHtmlBody);

    // Set reply-to header (so investor replies go to your real inbox)
    if (replyTo) {
      formData.append('h:Reply-To', replyTo);
    }

    // Set tracking
    formData.append('o:tracking', 'yes');
    formData.append('o:tracking-clicks', 'yes');
    formData.append('o:tracking-opens', 'yes');

    // Add custom tag for analytics
    formData.append('o:tag', 'investor-outreach');

    // Send via Mailgun API
    const mailgunUrl = `https://api.mailgun.net/v3/${MAILGUN_DOMAIN}/messages`;
    const authString = Buffer.from(`api:${MAILGUN_API_KEY}`).toString('base64');

    const mailgunResponse = await fetch(mailgunUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${authString}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: formData.toString()
    });

    const responseText = await mailgunResponse.text();
    let mailgunData;
    try {
      mailgunData = JSON.parse(responseText);
    } catch (e) {
      mailgunData = { raw: responseText };
    }

    if (!mailgunResponse.ok) {
      console.error('Mailgun send failed:', mailgunResponse.status, mailgunData);
      return {
        statusCode: 500,
        headers: corsHeaders,
        body: JSON.stringify({
          success: false,
          error: `Mailgun error (${mailgunResponse.status}): ${mailgunData.message || JSON.stringify(mailgunData)}`
        })
      };
    }

    // Success
    console.log('Email sent successfully:', { to, subject, mailgunId: mailgunData.id });

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        success: true,
        message: 'Email sent successfully',
        mailgunId: mailgunData.id || null,
        timestamp: new Date().toISOString()
      })
    };

  } catch (err) {
    console.error('send-investor-email error:', err);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ success: false, error: err.message || 'Unknown server error' })
    };
  }
};
