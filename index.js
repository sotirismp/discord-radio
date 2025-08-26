import { ActivityType, Client, GatewayIntentBits } from "discord.js";
import dotenv from "dotenv";
import { joinAndPlay } from "./joinAndPlay.js";
dotenv.config();

const connections = new Map(); // guildId => { connection, player, channelId }
const TOKEN = process.env.TOKEN;

const FMs = {
  "!sok": {
    url: "https://n0d.radiojar.com/zeqcyyvu48hvv?rj-ttl=5&rj-tok=AAABmOWrowwAeCPyrZw7_C750g",
    message: "Χαλκίδα SOK FM 104.8",
  },
  "!dpg": { url: "https://stream.7000fm.gr/radio/8000/radio.mp3", message: "DPG 7000 FM" },
  "!athens": { url: "https://netradio.live24.gr/athensdeejay", message: "Athens Radio DJ" },
  "!music": {
    url: "https://netradio.live24.gr/music892",
    message: "Music 89.2",
  },
  "!pepper": {
    url: "https://netradio.live24.gr/pepper9660?1756205793",
    message: "Pepper FM 96.6",
  },
  "!galaxy": {
    url: "https://galaxy.live24.gr/galaxy9292",
    message: "Galaxy FM 92",
  },
  "!kiss": {
    url: "https://antares.dribbcast.com/proxy/kiss961?mp=/stream",
    message: "Kiss FM 96.1",
  },
  "!best": {
    url: "https://best.live24.gr/best1222",
    message: "Best FM 92.6",
  },
};

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.MessageContent,
  ],
});

client.once("clientReady", () => {
  console.log(`Logged in as ${client.user.tag}`);
  console.log(
    `Invite the bot at: https://discord.com/oauth2/authorize?client_id=${client.user.id}&permissions=3145728&integration_type=0&scope=bot`
  );
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

client.on("messageCreate", async (message) => {
  const { content } = message;
  if (Object.keys(FMs).includes(content)) {
    const voiceChannel = message.member.voice.channel;
    if (!voiceChannel) return message.reply("Join a voice channel first!");

    const permissions = voiceChannel.permissionsFor(message.client.user);
    if (!permissions || !permissions.has("ViewChannel")) {
      return message.reply("I can't see that voice channel.");
    }
    if (!permissions.has("Connect")) {
      return message.reply("I don't have permission to join that voice channel.");
    }
    if (!permissions.has("Speak")) {
      return message.reply("I don't have permission to speak in that voice channel.");
    }

    const streamUrl = FMs[content].url;
    await joinAndPlay(voiceChannel, streamUrl, connections, message.guild.id);
    message.reply(`Playing ${FMs[content].message}`);
    client.user.setPresence({
      activities: [
        {
          name: FMs[content].message,
          type: ActivityType.Listening, // Can be PLAYING, STREAMING, LISTENING, WATCHING, etc.
        },
      ],
    });
  }
  if (message.content === "!stop") {
    const connInfo = connections.get(message.guild.id);
    if (connInfo) {
      connInfo.player.stop();
      connInfo.connection.destroy();
      connections.delete(message.guild.id);
      message.channel.send("Stopped streaming and disconnected!");
    } else {
      message.channel.send("Not currently connected.");
    }
  }
});

client.login(TOKEN);
