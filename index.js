import { Client, GatewayIntentBits, ActivityType } from "discord.js";
import { REST } from "@discordjs/rest";
import { Routes } from "discord-api-types/v9";
import dotenv from "dotenv";
import { joinAndPlay } from "./joinAndPlay.js";
import { commands, FMs } from "./commands.js"; // New

dotenv.config();

const TOKEN = process.env.TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;

const connections = new Map();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

// When bot joins a new server
client.on("guildCreate", async (guild) => {
  const rest = new REST({ version: "9" }).setToken(TOKEN);

  try {
    console.log(`Registering commands for guild ${guild.name} (${guild.id})`);

    await rest.put(Routes.applicationGuildCommands(CLIENT_ID, guild.id), { body: commands });

    console.log(`Successfully registered commands in ${guild.name}`);
  } catch (error) {
    console.error(`Failed to register commands in ${guild.name}`, error);
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
      await rest.put(Routes.applicationGuildCommands(CLIENT_ID, guild.id), { body: commands });
      console.log(`✅ Synced slash commands for guild: ${guild.name} (${guild.id})`);
    } catch (error) {
      console.error(`❌ Failed to sync commands for ${guild.name} (${guild.id})`, error);
    }
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
  if (!channel || channel.type !== 2) return; // 2 = voice channel
  const nonBotMembers = channel.members.filter((member) => !member.user.bot);
  if (nonBotMembers.size === 0) {
    console.log("All users left. Disconnecting bot.");
    if (player) player.stop();
    connection.destroy();
    connections.delete(guildId);
  }
});

client.on("interactionCreate", async (interaction) => {
  if (!interaction.isCommand()) return;

  const { commandName } = interaction;

  if (commandName === "play") {
    const station = interaction.options.getString("station");
    const voiceChannel = interaction.member.voice.channel;

    if (!voiceChannel) {
      return interaction.reply("You need to join a voice channel first!");
    }

    const permissions = voiceChannel.permissionsFor(interaction.client.user);
    if (!permissions?.has("Connect") || !permissions.has("Speak")) {
      return interaction.reply("I need permissions to join and speak in your voice channel!");
    }

    const streamUrl = FMs[station]?.url;
    if (!streamUrl) {
      return interaction.reply("Invalid station.");
    }

    await joinAndPlay(voiceChannel, streamUrl, connections, interaction.guild.id);

    interaction.reply(`Now playing ${FMs[station].message}`);
    client.user.setPresence({
      activities: [{ name: FMs[station].message, type: ActivityType.Listening }],
    });
  }

  if (commandName === "stop") {
    const connInfo = connections.get(interaction.guild.id);
    if (connInfo) {
      connInfo.player.stop();
      connInfo.connection.destroy();
      connections.delete(interaction.guild.id);
      interaction.reply("Stopped streaming and disconnected!");
    } else {
      interaction.reply("I'm not connected to any voice channel.");
    }
  }
});

client.login(TOKEN);
