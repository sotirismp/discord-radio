import { createAudioPlayer, createAudioResource, joinVoiceChannel } from "@discordjs/voice";
import { spawn, execSync } from "child_process";
import ffmpegStatic from "ffmpeg-static";
import { existsSync } from "fs";

function getFfmpegPath() {
  try {
    // Try to get the path of system ffmpeg, throws if not found
    execSync("ffmpeg -version", { stdio: "ignore" });
    return "ffmpeg"; // system ffmpeg available, use it
  } catch {
    // fallback to ffmpeg-static binary
    if (ffmpegStatic && existsSync(ffmpegStatic)) {
      return ffmpegStatic;
    }
    throw new Error("ffmpeg not found: install system ffmpeg or add ffmpeg-static dependency.");
  }
}

const ffmpegPath = getFfmpegPath();

export async function joinAndPlay(channel, url, connections, guildId) {
  let connectionInfo = connections.get(guildId);

  if (!connectionInfo) {
    const connection = joinVoiceChannel({
      channelId: channel.id,
      guildId: channel.guild.id,
      adapterCreator: channel.guild.voiceAdapterCreator,
    });

    const player = createAudioPlayer();
    connection.subscribe(player);

    player.on("error", (error) => {
      console.error("Player error:", error);
    });

    connections.set(guildId, {
      connection,
      player,
      channelId: channel.id,
    });

    connectionInfo = { connection, player, channelId: channel.id };
  }

  const ffmpegProcess = spawn(ffmpegPath, [
    "-i",
    url,
    "-af",
    "volume=0.5",
    "-f",
    "s16le",
    "-ar",
    "48000",
    "-ac",
    "2",
    "pipe:1",
  ]);

  const resource = createAudioResource(ffmpegProcess.stdout, { inputType: "raw" });
  connectionInfo.player.play(resource);
}
