import fs from "fs";
import { Client, GatewayIntentBits, ActivityType, Partials, PermissionsBitField } from "discord.js";
import { REST } from "@discordjs/rest";
import { Routes } from "discord-api-types/v9";
import dotenv from "dotenv";
import { joinAndPlay } from "./joinAndPlay.js";
import { commands, FMs } from "./commands.js";

dotenv.config();

const TOKEN = process.env.TOKEN;
const OWNER_ID = process.env.OWNER_ID;
const TARGET_USER_ID = process.env.TARGET_USER_ID;

if (!TOKEN) {
  throw new Error("Missing TOKEN in .env");
}

if (!OWNER_ID) {
  throw new Error("Missing OWNER_ID in .env");
}

if (!TARGET_USER_ID) {
  throw new Error("Missing TARGET_USER_ID in .env");
}

const connections = new Map();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildPresences,
  ],
  partials: [Partials.GuildMember],
});

const SESSIONS_FILE = "./presence-sessions.json";

function loadSessions() {
  try {
    return JSON.parse(fs.readFileSync(SESSIONS_FILE, "utf8"));
  } catch {
    return {};
  }
}

function saveSessions(data) {
  fs.writeFileSync(SESSIONS_FILE, JSON.stringify(data, null, 2));
}

const sessions = loadSessions();

function isOnlineStatus(status) {
  return status === "online" || status === "idle" || status === "dnd";
}

function ensureUserTracking(guildId, userId) {
  if (!sessions[guildId]) sessions[guildId] = {};
  if (!sessions[guildId][userId]) {
    sessions[guildId][userId] = {
      activeSession: null,
      history: [],
    };
  }
  return sessions[guildId][userId];
}

function formatDuration(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return `${hours}h ${minutes}m ${seconds}s`;
}

client.on("presenceUpdate", (oldPresence, newPresence) => {
  if (!newPresence?.guild || !newPresence?.userId) return;
  if (newPresence.userId !== TARGET_USER_ID) return;

  const guildId = newPresence.guild.id;
  const userId = newPresence.userId;

  const oldStatus = oldPresence?.status ?? "offline";
  const newStatus = newPresence?.status ?? "offline";

  const userData = ensureUserTracking(guildId, userId);

  // offline -> online
  if (!isOnlineStatus(oldStatus) && isOnlineStatus(newStatus)) {
    if (!userData.activeSession) {
      userData.activeSession = {
        start: new Date().toISOString(),
        startStatus: newStatus,
      };

      saveSessions(sessions);
      console.log(`User ${userId} came online in guild ${guildId} at ${userData.activeSession.start}`);
    }
  }

  // online -> offline
  if (isOnlineStatus(oldStatus) && !isOnlineStatus(newStatus)) {
    if (userData.activeSession) {
      const end = new Date().toISOString();
      const startMs = new Date(userData.activeSession.start).getTime();
      const endMs = new Date(end).getTime();
      const durationMs = endMs - startMs;

      const finishedSession = {
        start: userData.activeSession.start,
        end,
        startStatus: userData.activeSession.startStatus,
        endStatus: newStatus,
        durationMs,
      };

      userData.history.push(finishedSession);
      userData.activeSession = null;

      saveSessions(sessions);
      console.log(`User ${userId} went offline in guild ${guildId} at ${end}. Duration: ${formatDuration(durationMs)}`);
    }
  }
});

client.once("clientReady", async () => {
  console.log(`Logged in as ${client.user.tag}`);
  console.log(
    `Invite: https://discord.com/oauth2/authorize?client_id=${client.user.id}&permissions=3145728&scope=bot%20applications.commands`
  );

  const rest = new REST({ version: "9" }).setToken(TOKEN);

  for (const guild of client.guilds.cache.values()) {
    try {
      await rest.put(Routes.applicationGuildCommands(client.user.id, guild.id), {
        body: commands,
      });
      console.log(`✅ Synced slash commands for guild: ${guild.name} (${guild.id})`);
    } catch (error) {
      console.error(`❌ Failed to sync commands for ${guild.name} (${guild.id})`, error);
    }
  }
});

client.on("guildCreate", async (guild) => {
  const rest = new REST({ version: "9" }).setToken(TOKEN);

  try {
    console.log(`Registering commands for guild ${guild.name} (${guild.id})`);

    await rest.put(Routes.applicationGuildCommands(client.user.id, guild.id), {
      body: commands,
    });

    console.log(`Successfully registered commands in ${guild.name}`);
  } catch (error) {
    console.error(`Failed to register commands in ${guild.name}`, error);
  }
});

client.on("voiceStateUpdate", (oldState, newState) => {
  const guildId = oldState.guild.id;
  const connInfo = connections.get(guildId);
  if (!connInfo) return;

  const { connection, player } = connInfo;
  const botChannelId = connection.joinConfig.channelId;

  if (oldState.channelId !== botChannelId && newState.channelId !== botChannelId) return;

  const channel = oldState.guild.channels.cache.get(botChannelId);
  if (!channel || channel.type !== 2) return;

  const nonBotMembers = channel.members.filter((member) => !member.user.bot);

  if (nonBotMembers.size === 0) {
    if (connInfo.ffmpegProcess) {
      connInfo.ffmpegProcess.kill("SIGKILL");
    }

    console.log("All users left. Disconnecting bot.");

    if (player) player.stop();
    connection.destroy();
    connections.delete(guildId);
  }
});

client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const { commandName } = interaction;

  if (commandName === "play") {
    const station = interaction.options.getString("station");
    const voiceChannel = interaction.member.voice.channel;

    if (!voiceChannel) {
      return interaction.reply("You need to join a voice channel first!");
    }

    const permissions = voiceChannel.permissionsFor(interaction.client.user);
    if (!permissions?.has(PermissionsBitField.Flags.Connect) || !permissions.has(PermissionsBitField.Flags.Speak)) {
      return interaction.reply("I need permissions to join and speak in your voice channel!");
    }

    const streamUrl = FMs[station]?.url;
    if (!streamUrl) {
      return interaction.reply("Invalid station.");
    }

    await joinAndPlay(voiceChannel, streamUrl, connections, interaction.guild.id);

    await interaction.reply(`Now playing ${FMs[station].message}`);

    client.user.setPresence({
      activities: [{ name: FMs[station].message, type: ActivityType.Listening }],
    });
  }

  if (commandName === "stop") {
    const connInfo = connections.get(interaction.guild.id);

    if (connInfo) {
      if (connInfo.ffmpegProcess) {
        connInfo.ffmpegProcess.kill("SIGKILL");
      }

      connInfo.player.stop();
      connInfo.connection.destroy();
      connections.delete(interaction.guild.id);

      await interaction.reply("Stopped streaming and disconnected!");
    } else {
      await interaction.reply("I'm not connected to any voice channel.");
    }
  }
});

client.on("messageCreate", async (message) => {
  try {
    if (message.author.bot) return;
    if (!message.guild) return;

    // only you can use these text commands
    if (message.author.id !== OWNER_ID) return;

    const guildId = message.guild.id;
    const userData = sessions[guildId]?.[TARGET_USER_ID];

    if (message.content === "!onlinecount") {
      const total = userData?.history?.length ?? 0;
      return await message.reply(`Tracked completed online sessions: ${total}`);
    }

    if (message.content === "!onlinecurrent") {
      if (!userData?.activeSession) {
        return await message.reply("The tracked user is currently offline.");
      }

      const durationMs = Date.now() - new Date(userData.activeSession.start).getTime();

      return await message.reply(
        `The tracked user is currently online.\nStarted: ${userData.activeSession.start}\nOnline for: ${formatDuration(
          durationMs
        )}`
      );
    }

    if (message.content === "!onlinelast") {
      const last = userData?.history?.[userData.history.length - 1];

      if (!last) {
        return await message.reply("No completed sessions found yet.");
      }

      return await message.reply(
        `Last session:\nStart: ${last.start}\nEnd: ${last.end}\nDuration: ${formatDuration(last.durationMs)}`
      );
    }

    if (message.content === "!onlineall") {
      const history = userData?.history ?? [];

      if (history.length === 0) {
        return await message.reply("No completed sessions found yet.");
      }

      const lines = history
        .slice(-10)
        .map(
          (session, index) =>
            `${index + 1}. Start: ${session.start} | End: ${session.end} | Duration: ${formatDuration(
              session.durationMs
            )}`
        );

      return await message.reply(`Last ${lines.length} sessions:\n${lines.join("\n")}`);
    }
  } catch (error) {
    console.error("messageCreate error:", error);
    if (!message.replied && !message.deferred) {
      await message.reply("Something went wrong while processing the command.");
    }
  }
});

client.login(TOKEN);
