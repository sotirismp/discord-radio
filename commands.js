// commands.js
import { SlashCommandBuilder } from "@discordjs/builders";

export const FMs = {
  sok: {
    url: "https://n0d.radiojar.com/zeqcyyvu48hvv?rj-ttl=5&rj-tok=AAABmOWrowwAeCPyrZw7_C750g",
    message: "Χαλκίδα SOK 104.8",
  },
  dpg: { url: "https://stream.7000fm.gr/radio/8000/radio.mp3", message: "DPG 7000" },
  athens: { url: "https://netradio.live24.gr/athensdeejay", message: "Athens Radio DJ 95.2" },
  music: { url: "https://netradio.live24.gr/music892", message: "Music 89.2" },
  pepper: { url: "https://netradio.live24.gr/pepper9660?1756205793", message: "Pepper 96.6" },
  galaxy: { url: "https://galaxy.live24.gr/galaxy9292", message: "Galaxy 92" },
  kiss: { url: "https://antares.dribbcast.com/proxy/kiss961?mp=/stream", message: "Kiss 96.1" },
  red: {
    url: "https://n36a-eu.rcs.revma.com/e4d84zez1duvv?rj-ttl=5&rj-tok=AAABmOfGhRMA3piuBRvfsIIF6A",
    message: "Red 96.3",
  },
  best: { url: "https://best.live24.gr/best1222", message: "Best 92.6" },
  diesi: {
    url: "https://n29a-eu.rcs.revma.com/gkfwrhqxbfhvv?rj-ttl=5&rj-tok=AAABmOcf1BgACUzkalktK3CFTQ&5562=",
    message: "Diesi 101.3",
  },
  dromos: {
    url: "https://n43a-eu.rcs.revma.com/10q3enqxbfhvv?rj-ttl=5&rj-tok=AAABmOcrfkMA3tmu1YiuTtbF9g",
    message: "Dromos 89.8",
  },
};

export const commands = [
  new SlashCommandBuilder()
    .setName("play")
    .setDescription("Play a radio station")
    .addStringOption((option) =>
      option
        .setName("station")
        .setDescription("The radio station to play")
        .setRequired(true)
        .addChoices(
          ...Object.entries(FMs).map(([key, value]) => ({
            value: key,
            name: value.message,
          }))
        )
    ),
  new SlashCommandBuilder().setName("stop").setDescription("Stop the radio stream and disconnect the bot"),
].map((command) => command.toJSON());
