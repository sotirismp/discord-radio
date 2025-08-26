import {
  createAudioPlayer,
  createAudioResource,
  joinVoiceChannel,
  entersState,
  VoiceConnectionStatus,
} from "@discordjs/voice";
import { spawn, execSync } from "child_process";
import ffmpegStatic from "ffmpeg-static";
import { existsSync } from "fs";

function getFfmpegPath() {
  try {
    execSync("ffmpeg -version", { stdio: "ignore" });
    return "ffmpeg";
  } catch {
    if (ffmpegStatic && existsSync(ffmpegStatic)) {
      return ffmpegStatic;
    }
    throw new Error("ffmpeg not found.");
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

    player.on("error", (error) => console.error("Player error:", error));

    connections.set(guildId, {
      connection,
      player,
      channelId: channel.id,
      ffmpegProcess: null,
    });

    connectionInfo = connections.get(guildId);
    await entersState(connection, VoiceConnectionStatus.Ready, 20_000);
  }

  // Kill previous ffmpeg process if any
  if (connectionInfo.ffmpegProcess) {
    connectionInfo.ffmpegProcess.kill("SIGKILL");
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

  ffmpegProcess.stderr.on("data", (data) => {
    console.error(`FFmpeg stderr: ${data}`);
  });

  ffmpegProcess.on("close", (code, signal) => {
    console.log(`FFmpeg closed: code=${code}, signal=${signal}`);
  });

  connectionInfo.ffmpegProcess = ffmpegProcess;

  const resource = createAudioResource(ffmpegProcess.stdout, { inputType: "raw" });
  connectionInfo.player.play(resource);

  connectionInfo.player.once("idle", () => {
    console.log("Stream idle. Restarting...");
    joinAndPlay(channel, url, connections, guildId); // Safe to recurse here since it's once
  });
}
