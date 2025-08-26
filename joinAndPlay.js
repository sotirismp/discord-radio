import { createAudioPlayer, joinVoiceChannel, createAudioResource, AudioPlayerStatus } from "@discordjs/voice";
import { spawn } from "child_process";
import ffmpeg from "ffmpeg-static";

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

  const ffmpegProcess = spawn(ffmpeg, [
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
