const inboxStore = new Map();

const CORS_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: CORS_HEADERS });
}

async function loadInbox(address, env) {
  const normalized = address.trim().toLowerCase();
  if (env?.INBOXES && typeof env.INBOXES.get === 'function') {
    try {
      const stored = await env.INBOXES.get(normalized);
      return stored ? JSON.parse(stored) : [];
    } catch (error) {
      console.warn('KV read failed', error);
      return [];
    }
  }
  return inboxStore.get(normalized) || [];
}

async function saveInbox(address, messages, env) {
  const normalized = address.trim().toLowerCase();
  if (env?.INBOXES && typeof env.INBOXES.put === 'function') {
    try {
      await env.INBOXES.put(normalized, JSON.stringify(messages));
    } catch (error) {
      console.warn('KV write failed', error);
    }
    return;
  }
  inboxStore.set(normalized, messages);
}

async function receiveInbound(address, from, subject, body, env) {
  const normalized = address.trim().toLowerCase();
  const storedMessage = {
    id: typeof crypto?.randomUUID === 'function' ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    from: from || 'inbound@external.email',
    subject: subject || 'No subject',
    body: body || '',
    time: new Date().toLocaleString(),
    timestamp: Date.now(),
    read: false, // New: track if message has been read
  };

  const inboxMessages = await loadInbox(normalized, env);
  inboxMessages.unshift(storedMessage);
  await saveInbox(normalized, inboxMessages.slice(0, 50), env);
  return storedMessage;
}

// Clean up old messages (older than 24 hours)
async function cleanupOldMessages(env) {
  if (!env?.INBOXES || typeof env.INBOXES.list !== 'function') {
    // If we don't have access to list keys, we can't do bulk cleanup
    return;
  }

  try {
    const oneDayAgo = Date.now() - (24 * 60 * 60 * 1000); // 24 hours in milliseconds
    let cleanedCount = 0;

    // List all keys in the KV namespace
    const { keys } = await env.INBOXES.list();

    for (const key of keys) {
      try {
        const messages = await loadInbox(key.name, env);
        const originalLength = messages.length;
        const filteredMessages = messages.filter(msg =>
          msg.timestamp && msg.timestamp > oneDayAgo
        );

        if (filteredMessages.length < originalLength) {
          await saveInbox(key.name, filteredMessages, env);
          cleanedCount += (originalLength - filteredMessages.length);
        }
      } catch (error) {
        console.warn(`Error processing key ${key.name}:`, error);
        // Continue with other keys
      }
    }

    if (cleanedCount > 0) {
      console.log(`Cleaned up ${cleanedCount} old messages`);
    }
  } catch (error) {
    console.error('Error during message cleanup:', error);
  }
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const pathname = url.pathname;

    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: CORS_HEADERS,
      });
    }

    if (request.method === 'GET' && pathname === '/messages') {
      const address = url.searchParams.get('address');
      if (!address) {
        return jsonResponse({ error: 'Missing address query parameter' }, 400);
      }

      const messages = await loadInbox(address, env);
      return jsonResponse({ success: true, messages });
    }

    if (request.method === 'POST' && pathname === '/inbound') {
      const requestText = await request.text();
      if (!requestText) {
        return jsonResponse({ error: 'Missing request body' }, 400);
      }

      let parsedBody;
      try {
        parsedBody = JSON.parse(requestText);
      } catch (parseError) {
        return jsonResponse({
          error: 'Invalid JSON in request body',
          details: parseError.message,
          rawBody: requestText,
        }, 400);
      }

      const { to, from, subject, body } = parsedBody;
      if (!to) {
        return jsonResponse({ error: 'Missing to field for inbound message' }, 400);
      }

      const normalizedTo = to.trim().toLowerCase();
      const inboxMessage = await receiveInbound(normalizedTo, from, subject, body, env);
      return jsonResponse({
        success: true,
        message: 'Inbound message stored',
        messageId: inboxMessage.id,
      });
    }

    if (request.method === 'DELETE' && pathname.startsWith('/messages/')) {
      const messageId = pathname.split('/')[2]; // Get ID from /messages/:id
      const address = url.searchParams.get('address');
      if (!address || !messageId) {
        return jsonResponse({ error: 'Missing address or message ID' }, 400);
      }

      const normalizedAddress = address.trim().toLowerCase();
      const messages = await loadInbox(normalizedAddress, env);
      const updatedMessages = messages.filter(msg => msg.id !== messageId);
      await saveInbox(normalizedAddress, updatedMessages, env);

      return jsonResponse({
        success: true,
        message: 'Message deleted successfully',
      });
    }

    if (request.method === 'PATCH' && pathname.startsWith('/messages/')) {
      const messageId = pathname.split('/')[2]; // Get ID from /messages/:id
      const address = url.searchParams.get('address');
      if (!address || !messageId) {
        return jsonResponse({ error: 'Missing address or message ID' }, 400);
      }

      const { read } = await request.json();
      if (typeof read !== 'boolean') {
        return jsonResponse({ error: 'Invalid read status' }, 400);
      }

      const normalizedAddress = address.trim().toLowerCase();
      const messages = await loadInbox(normalizedAddress, env);
      const messageIndex = messages.findIndex(msg => msg.id === messageId);

      if (messageIndex === -1) {
        return jsonResponse({ error: 'Message not found' }, 404);
      }

      messages[messageIndex].read = read;
      await saveInbox(normalizedAddress, messages, env);

      return jsonResponse({
        success: true,
        message: 'Message status updated successfully',
      });
    }

    if (request.method !== 'POST' || pathname !== '/send') {
      return jsonResponse({ error: 'Not Found' }, 404);
    }

    try {
      const requestText = await request.text();
      if (!requestText) {
        return jsonResponse({ error: 'Missing request body' }, 400);
      }

      let parsedBody;
      try {
        parsedBody = JSON.parse(requestText);
      } catch (parseError) {
        return jsonResponse({
          error: 'Invalid JSON in request body',
          details: parseError.message,
          rawBody: requestText,
        }, 400);
      }

      const { to, subject, body } = parsedBody;
      if (!to || !subject || !body) {
        return jsonResponse({ error: 'Missing to, subject, or body' }, 400);
      }

      const normalizedTo = to.trim().toLowerCase();
      const isLocalInbox = normalizedTo.endsWith('@infin.io');
      const storedMessage = {
        id: typeof crypto?.randomUUID === 'function' ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        from: 'you@webshark.email',
        subject,
        body,
        time: new Date().toLocaleString(),
        timestamp: Date.now(),
        read: false, // New: track if message has been read
      };

      if (isLocalInbox) {
        const inboxMessages = await loadInbox(normalizedTo, env);
        inboxMessages.unshift(storedMessage);
        await saveInbox(normalizedTo, inboxMessages.slice(0, 50), env);
        return jsonResponse({
          success: true,
          message: 'Email stored locally for preview',
          messageId: storedMessage.id,
        });
      }

      if (!env.MAILERSEND_API_KEY) {
        return jsonResponse({
          error: 'Missing MailerSend API key',
          details: 'Worker env var MAILERSEND_API_KEY is not set or not available',
        }, 500);
      }

      const mailersendResponse = await fetch('https://api.mailersend.com/v1/email', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.MAILERSEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: {
            email: 'hello@test-r9084zvzn0egw63d.mlsender.net',
            name: 'WebShark Email',
          },
          to: [{ email: to }],
          subject,
          html: body,
        }),
      });

      const mailersendText = await mailersendResponse.text();
      let mailersendData = null;
      try {
        mailersendData = mailersendText ? JSON.parse(mailersendText) : null;
      } catch (parseError) {
        mailersendData = { error: 'Invalid JSON response from MailerSend', raw: mailersendText };
      }

      if (!mailersendResponse.ok) {
        return jsonResponse({
          error: 'Failed to send email',
          details: mailersendData,
        }, mailersendResponse.status);
      }

      return jsonResponse({
        success: true,
        message: 'Email sent successfully',
        messageId: mailersendData?.message_id || null,
        mailersendData,
      });
    } catch (error) {
      return jsonResponse({ error: error.message }, 500);
    }
  },

  // Scheduled function for cleaning up old messages
  async scheduled(event, env, ctx) {
    // Wait until the cleanup is complete before allowing the worker to exit
    ctx.waitUntil(cleanupOldMessages(env));
  }
};
