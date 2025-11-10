# 🚀 Quickstart Guide

Get up and running in 60 seconds!

## ⚡ Start in 3 Steps

### 1. Start Server
```bash
node server.js
```

### 2. Open New Terminal → Connect Client 1
```bash
nc localhost 4000
```
Then type:
```
LOGIN Alice
MSG Hello everyone!
```

### 3. Open Another Terminal → Connect Client 2
```bash
nc localhost 4000
```
Then type:
```
LOGIN Bob
MSG Hi Alice!
```

**🎉 Done!** Both clients should see each other's messages.

---

## 🧪 Quick Test Commands

Once logged in, try these:

```bash
MSG Hello world!           # Send message to everyone
WHO                        # List all users
DM Alice Private message   # Send private message
PING                       # Test connection
```


---

## ✅ Verification Checklist

Quickly verify everything works:

- [ ] Server starts on port 4000
- [ ] Client can connect
- [ ] LOGIN Alice → OK
- [ ] LOGIN Alice again → ERR username-taken
- [ ] MSG test → broadcasts to all
- [ ] WHO → lists users
- [ ] DM Bob hello → sends private message
- [ ] PING → PONG response
- [ ] Disconnect → others notified

---

## 🐛 Troubleshooting

**Port 4000 already in use?**
```bash
# Use different port
node server.js 5000
nc localhost 5000
```

**Can't connect?**
```bash
# Check if server is running
ps aux | grep node

# Try telnet instead of nc
telnet localhost 4000
```


---

