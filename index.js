const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason
} = require("@whiskeysockets/baileys");

const P = require("pino");
const http = require("http");

const BOT_NUMBER = process.env.BOT_NUMBER;

// Render-এর জন্য HTTP server
const PORT = process.env.PORT || 10000;

http.createServer((req, res) => {
  res.writeHead(200, {
    "Content-Type": "text/plain"
  });
  res.end("WhatsApp Anti-Link Bot is running!");
}).listen(PORT, "0.0.0.0", () => {
  console.log(`🌐 Server running on port ${PORT}`);
});

async function startBot() {
  const { state, saveCreds } =
    await useMultiFileAuthState("./auth_info");

  const sock = makeWASocket({
    auth: state,
    logger: P({ level: "silent" }),
    printQRInTerminal: false
  });

  sock.ev.on("creds.update", saveCreds);

  // WhatsApp account যুক্ত না থাকলে Pairing Code
  if (!state.creds.registered) {
    if (!BOT_NUMBER) {
      console.log("❌ BOT_NUMBER সেট করা নেই!");
      return;
    }

    const phoneNumber = BOT_NUMBER.replace(/\D/g, "");

    setTimeout(async () => {
      try {
        const code = await sock.requestPairingCode(phoneNumber);

        console.log("");
        console.log("================================");
        console.log("🔐 WHATSAPP PAIRING CODE");
        console.log("================================");
        console.log(code);
        console.log("================================");
        console.log("WhatsApp > Linked Devices > Link a device");
        console.log("তারপর Pairing Code ব্যবহার করো।");
      } catch (error) {
        console.log("❌ Pairing Code Error:", error.message);
      }
    }, 3000);
  }

  sock.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect } = update;

    if (connection === "open") {
      console.log("✅ WhatsApp Connected!");
      console.log("🛡️ Anti-Link Bot is ON");
    }

    if (connection === "close") {
      const shouldReconnect =
        lastDisconnect?.error?.output?.statusCode !==
        DisconnectReason.loggedOut;

      if (shouldReconnect) {
        console.log("🔄 Reconnecting...");
        startBot();
      } else {
        console.log("❌ WhatsApp logged out.");
      }
    }
  });

  sock.ev.on("messages.upsert", async ({ messages }) => {
    const msg = messages[0];

    if (!msg || !msg.message) return;
    if (msg.key.fromMe) return;

    const jid = msg.key.remoteJid;

    // শুধু Group-এ কাজ করবে
    if (!jid || !jid.endsWith("@g.us")) return;

    const text =
      msg.message.conversation ||
      msg.message.extendedTextMessage?.text ||
      msg.message.imageMessage?.caption ||
      msg.message.videoMessage?.caption ||
      "";

    const hasLink =
      /(https?:\/\/|www\.|chat\.whatsapp\.com\/|t\.me\/)/i.test(text);

    if (!hasLink) return;

    try {
      const metadata = await sock.groupMetadata(jid);

      const sender = msg.key.participant;

      const member = metadata.participants.find(
        (p) => p.id === sender
      );

      // Admin-এর link allow
      if (member?.admin) {
        console.log("👑 Admin link allowed");
        return;
      }

      // Link message delete
      await sock.sendMessage(jid, {
        delete: msg.key
      });

      console.log("🚫 Link deleted");

      // Warning
      const warning = await sock.sendMessage(jid, {
        text:
          "🚫 লিংক পাঠানো নিষেধ!\n\n" +
          "⚠️ Anti-Link Bot মেসেজটি ডিলিট করেছে।"
      });

      // 10 সেকেন্ড পরে warning delete
      setTimeout(async () => {
        try {
          await sock.sendMessage(jid, {
            delete: warning.key
          });
        } catch (e) {}
      }, 10000);

    } catch (error) {
      console.log("❌ Delete Error:", error.message);
    }
  });
}

startBot();
