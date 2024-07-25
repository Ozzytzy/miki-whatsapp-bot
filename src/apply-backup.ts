import "dotenv/config";
import makeWASocket, * as Baileys from "@whiskeysockets/baileys";
import { createMessageContext } from "./utils";
import type * as Types from "./utils/typings/types";

(async () => {
	const PIN = String(Math.floor(Math.random() * 999999));
	console.log("Your PIN: " + PIN);
	const { state, saveCreds } = await Baileys.useMultiFileAuthState("./data/session");

	const bot = makeWASocket({
		printQRInTerminal: true,
		browser: Baileys.Browsers.appropriate("Miki"),
		version: (await Baileys.fetchLatestBaileysVersion()).version,
		auth: state,
	});

	bot.ev.on("connection.update", (update) => {
		const { connection, lastDisconnect } = update;
		if (connection === "close") {
			console.error("Disconnected from WhatsApp.");
		} else if (connection === "connecting") {
			console.log("Connecting to WhatsApp...");
		} else if (connection === "open") {
			console.log("Connected to WhatsApp.");
			console.log("Waiting for /applybackup command from owner...");
		}
	});

	bot.ev.on("creds.update", () => saveCreds());

	const promptees = new Promptees();
	const Context = createMessageContext({}, bot, promptees);

	bot.ev.on("messages.upsert", async (update) => {
		if (update.type !== "notify") return;
		const m = update.messages[0];
		if (!m.message) return;
		if (m.key?.fromMe) return;
		if (m.key?.id?.length === 16 && m.key.id.startsWith("BAE5")) return;
		if (m.key?.remoteJid === "status@broadcast") return;
		if (m.message.protocolMessage) return;
		if (m.message.reactionMessage) return;
		if (m.message.pollUpdateMessage) return;

		const context = new Context(m);
		const id = context.userId().out + context.chatId().out;
		if (promptees.isPrompting(id)) return promptees.returnPrompt(id, context);
		console.log(context.userId().out);
		if (context.userId().out === process.env.OWNER_NUMBER + "@s.whatsapp.net") {
			console.log(context.command().out);
			if (context.command().out === "applybackup") {
				const content = context.quotedMsgContent().out;
				console.log(content);
				if (
					context.quotedMsgType().out === "documentMessage" &&
					content &&
					typeof content !== "string" &&
					"fileName" in content &&
					/^MIKIBACKUP_\d+\.json$/.test(content.fileName || "")
				) {
					while (true) {
						const _context = await context.reply({ text: "Enter PIN:" }).waitInput().out;
						/*this will never happen ->*/ if (_context === "timeout") return;
						console.log(_context.text().out);
						if (_context.text().out === PIN) {
							try {
								_context.react("✅");
								context.reply({ text: "Loading..." });
								console.log("Downloading file...");
								const media = (await context.quotedMedia("buffer").out)!;
								console.log("Loading file...");
								const DB = JSON.parse(media.toString()) as Types.LOCALDB;
								const info = `Backup file info:\n  Name: ${content.fileName}\n  Time: ${new Date(
									(DB.system as Types.SYSTEMDB).backupTime
								).toLocaleString()}`;
								console.log(info);
								console.log("Saving file...");
								if (!fs.existsSync("./data/")) fs.mkdirSync("./data/");
								fs.writeFileSync("./data/db.json", media!);
								console.log("Done! Now you can start the bot.");
								await context.react("✅").reply({ text: "Done! Now you can start the bot.\n\n" + info }).out;
								return process.exit(0);
							} catch (e) {
								context.reply({ text: String(e) });
								continue;
							}
						} else {
							_context.react("❌");
							continue;
						}
					}
				} else {
					return context.react("❌").reply({ text: "Please reply to a backup file." });
				}
			}
		}
	});
})();
