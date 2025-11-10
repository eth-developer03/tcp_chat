

const net = require('net');

// Configuration
const DEFAULT_PORT = 4000;
const IDLE_TIMEOUT =  300000; ; //  5 mins
const IDLE_CHECK_INTERVAL = 30000; ; // Check every 30 seconds

// Get port from environment variable, command line argument, or use default
const PORT = process.env.PORT || process.argv[2] || DEFAULT_PORT;

// Client storage: Map of socket -> client info
const clients = new Map();



function sendToClient(client, message) {
  if (client && client.socket && !client.socket.destroyed) {
    client.socket.write(message + '\n');
  }
}

/**
 * Broadcast a message to all authenticated clients
 */
function broadcast(message, excludeClient = null) {
  clients.forEach((client) => {
    if (client.authenticated && client !== excludeClient) {
      sendToClient(client, message);
    }
  });
}

/**
 * Broadcast a message to all authenticated clients including sender
 */
function broadcastToAll(message) {
  clients.forEach((client) => {
    if (client.authenticated) {
      sendToClient(client, message);
    }
  });
}

/**
 * Check if username is already taken
 */
function isUsernameTaken(username) {
  for (const client of clients.values()) {
    if (client.username === username) {
      return true;
    }
  }
  return false;
}

/**
 * Find client by username
 */
function findClientByUsername(username) {
  for (const client of clients.values()) {
    if (client.username === username && client.authenticated) {
      return client;
    }
  }
  return null;
}

/**
 * Handle LOGIN command
 */
function handleLogin(client, username) {
  // Validate username (basic validation)
  if (!username || username.trim().length === 0) {
    sendToClient(client, 'ERR invalid-username');
    return;
  }

  const cleanUsername = username.trim();

  // Check if username is taken
  if (isUsernameTaken(cleanUsername)) {
    sendToClient(client, 'ERR username-taken');
    return;
  }

  // Set username and mark as authenticated
  client.username = cleanUsername;
  client.authenticated = true;
  sendToClient(client, 'OK');

  console.log(`[SERVER] User '${cleanUsername}' logged in`);
}

/**
 * Handle MSG command (broadcast message)
 */
function handleMessage(client, text) {
  if (!client.authenticated) {
    sendToClient(client, 'ERR not-authenticated');
    return;
  }

  // Clean up the message text
  const cleanText = text.trim();
  
  if (cleanText.length === 0) {
    return; // Ignore empty messages
  }

  // Broadcast to all users including sender
  const message = `MSG ${client.username} ${cleanText}`;
  broadcastToAll(message);

  console.log(`[SERVER] ${client.username}: ${cleanText}`);
}

/**
 * Handle WHO command (list active users)
 */
function handleWho(client) {
  if (!client.authenticated) {
    sendToClient(client, 'ERR not-authenticated');
    return;
  }

  // Send list of all authenticated users
  clients.forEach((c) => {
    if (c.authenticated) {
      sendToClient(client, `USER ${c.username}`);
    }
  });
}

/**
 * Handle DM command (private message)
 */
function handleDirectMessage(client, targetUsername, text) {
  if (!client.authenticated) {
    sendToClient(client, 'ERR not-authenticated');
    return;
  }

  const cleanText = text.trim();
  
  if (cleanText.length === 0) {
    sendToClient(client, 'ERR empty-message');
    return;
  }

  // Find target client
  const targetClient = findClientByUsername(targetUsername.trim());
  
  if (!targetClient) {
    sendToClient(client, `ERR user-not-found`);
    return;
  }

  // Send private message to target
  sendToClient(targetClient, `DM ${client.username} ${cleanText}`);
  
  // Confirm to sender
  sendToClient(client, `DM-SENT ${targetUsername}`);

  console.log(`[SERVER] DM from ${client.username} to ${targetUsername}: ${cleanText}`);
}

/**
 * Handle PING command (heartbeat)
 */
function handlePing(client) {
  sendToClient(client, 'PONG');
}

/**
 * Parse and handle incoming command
 */
function handleCommand(client, line) {
  // Update last activity timestamp
  client.lastActivity = Date.now();

  // Parse command and arguments
  const parts = line.trim().split(' ');
  const command = parts[0].toUpperCase();

  switch (command) {
    case 'LOGIN':
      if (parts.length < 2) {
        sendToClient(client, 'ERR invalid-command');
        return;
      }
      handleLogin(client, parts[1]);
      break;

    case 'MSG':
      if (parts.length < 2) {
        sendToClient(client, 'ERR invalid-command');
        return;
      }
      // Join all parts after MSG as the message text
      const msgText = parts.slice(1).join(' ');
      handleMessage(client, msgText);
      break;

    case 'WHO':
      handleWho(client);
      break;

    case 'DM':
      if (parts.length < 3) {
        sendToClient(client, 'ERR invalid-command');
        return;
      }
      const targetUser = parts[1];
      const dmText = parts.slice(2).join(' ');
      handleDirectMessage(client, targetUser, dmText);
      break;

    case 'PING':
      handlePing(client);
      break;

    default:
      sendToClient(client, 'ERR unknown-command');
      break;
  }
}

/**
 * Handle client disconnect
 */
function handleDisconnect(client, reason = 'disconnected') {
  if (!client) return;

  const username = client.username;
  
  // Remove from clients map
  clients.delete(client.socket);

  // Notify other users if the client was authenticated
  if (client.authenticated && username) {
    broadcast(`INFO ${username} ${reason}`);
    console.log(`[SERVER] User '${username}' ${reason}`);
  }

  // Clean up socket
  if (!client.socket.destroyed) {
    client.socket.destroy();
  }
}

/**
 * Create and configure the TCP server
 */
function createServer() {
  const server = net.createServer((socket) => {
    console.log(`[SERVER] New connection from ${socket.remoteAddress}:${socket.remotePort}`);

    // Create client object
    const client = {
      socket: socket,
      username: null,
      authenticated: false,
      lastActivity: Date.now(),
      buffer: '' // Buffer for handling partial messages
    };

    // Add to clients map
    clients.set(socket, client);

    // Handle incoming data
    socket.on('data', (data) => {
      try {
        // Add to buffer
        client.buffer += data.toString();

        // Process complete lines (split by newline)
        const lines = client.buffer.split('\n');
        
        // Keep the last incomplete line in buffer
        client.buffer = lines.pop();

        // Process each complete line
        lines.forEach((line) => {
          const trimmedLine = line.trim();
          if (trimmedLine.length > 0) {
            handleCommand(client, trimmedLine);
          }
        });
      } catch (error) {
        console.error(`[SERVER] Error handling data:`, error.message);
        sendToClient(client, 'ERR server-error');
      }
    });

    // Handle client disconnect
    socket.on('end', () => {
      handleDisconnect(client, 'disconnected');
    });

    // Handle connection errors
    socket.on('error', (error) => {
      console.error(`[SERVER] Socket error:`, error.message);
      handleDisconnect(client, 'disconnected');
    });

    // Handle timeout
    socket.on('timeout', () => {
      console.log(`[SERVER] Socket timeout`);
      handleDisconnect(client, 'disconnected');
    });
  });

  return server;
}

/**
 * Start idle timeout checker
 * Disconnects clients who haven't sent any data in IDLE_TIMEOUT milliseconds
 */
function startIdleChecker() {
  setInterval(() => {
    const now = Date.now();
    
    clients.forEach((client) => {
      if (client.authenticated) {
        const idleTime = now - client.lastActivity;
        
        if (idleTime > IDLE_TIMEOUT) {
          console.log(`[SERVER] User '${client.username}' idle for ${idleTime}ms, disconnecting`);
          sendToClient(client, 'INFO idle-timeout');
          handleDisconnect(client, 'disconnected (idle)');
        }
      }
    });
  }, IDLE_CHECK_INTERVAL);
}

/**
 * Main server initialization
 */
function main() {
  const server = createServer();

  // Start listening
  server.listen(PORT, () => {
    console.log('═══════════════════════════════════════════════════');
    console.log('  TCP CHAT SERVER');
    console.log('═══════════════════════════════════════════════════');
    console.log(`  Port: ${PORT}`);
    console.log(`  Idle Timeout: ${IDLE_TIMEOUT / 1000}s`);
    console.log('═══════════════════════════════════════════════════');
    console.log(`  Connect using: nc localhost ${PORT}`);
    console.log('═══════════════════════════════════════════════════\n');
  });

  // Start idle timeout checker
  startIdleChecker();

  // Handle server errors
  server.on('error', (error) => {
    if (error.code === 'EADDRINUSE') {
      console.error(`[ERROR] Port ${PORT} is already in use`);
      process.exit(1);
    } else {
      console.error('[ERROR] Server error:', error.message);
    }
  });

  // Graceful shutdown
  process.on('SIGINT', () => {
    console.log('\n[SERVER] Shutting down gracefully...');
    
    // Notify all clients
    broadcastToAll('INFO server-shutdown');
    
    // Close all client connections
    clients.forEach((client) => {
      client.socket.destroy();
    });
    
    // Close server
    server.close(() => {
      console.log('[SERVER] Server closed');
      process.exit(0);
    });
  });
}

// Start the server
main();
