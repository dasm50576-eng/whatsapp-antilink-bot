const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason
} = require("@whiskeysockets/baileys");

const P = require("pino");

const GROUP_NAME = "পানু বাঁচ ছেলে";

// যেসব মেসেজে লিংক থাকলে ডিলিট হবে
const URL_REGEX =
  /(https?:\/\/[^\s]+|www\.[^\s]+|chat\.whatsapp\.com\/[^\s]+|t\.me\/[^\s]+)/i;

async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState("./auth_info");

  const sock = makeWASocket({
    auth: state,
    logger: P({ level: "silent" }),
    printQRInTerminal: false
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect } = update;

    if (connection === "open") {
      console.log("✅ WhatsApp Bot Connected!");
      console.log("🛡️ Anti-Link Protection is ON");
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

    // শুধু WhatsApp Group-এ কাজ করবে
    if (!jid || !jid.endsWith("@g.us")) return;

    const text =
      msg.message.conversation ||
      msg.message.extendedTextMessage?.text ||
      msg.message.imageMessage?.caption ||
      msg.message.videoMessage?.caption ||
      "";

    if (!URL_REGEX.test(text)) return;

    try {
      const metadata = await sock.groupMetadata(jid);

      const sender = msg.key.participant;

      const member = metadata.participants.find(
        (p) => p.id === sender
      );

      // Admin হলে লিংক পাঠাতে পারবে
      if (member?.admin) {
        console.log("👑 Admin link allowed");
        return;
      }

      // লিংক পাঠানো সদস্যের মেসেজ ডিলিট
      await sock.sendMessage(jid, {
        delete: msg.key
      });

      console.log("🚫 Link deleted from:", sender);

      // Warning message
      const warning = await sock.sendMessage(jid, {
        text: "🚫 লিংক পাঠানো নিষেধ!\n\n⚠️ Anti-Link Bot মেসেজটি ডিলিট করেছে।"
      });

      // Warning 10 সেকেন্ড পরে মুছে ফেলবে
      setTimeout(async () => {
        try {
          await sock.sendMessage(jid, {
            delete: warning.key
          });
        } catch (e) {}
      }, 10000);

    } catch (error) {
      console.log("❌ Delete error:", error.message);
    }
  });
}

startBot();
