// node-bot/index.js
require('dotenv').config({ path: __dirname + '/.env' });

const { Client, GatewayIntentBits } = require('discord.js');
const { joinVoiceChannel, getVoiceConnection, createAudioResource, createAudioPlayer, VoiceReceiver } = require('@discordjs/voice');
const fs = require('fs');
const prism = require('prism-media');
const dotenv = require('dotenv');
dotenv.config();

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates] });

client.on('ready', () => {
  console.log(`✅ Bot logged in as ${client.user.tag}`);
});

client.on('voiceStateUpdate', async (oldState, newState) => {
  // ユーザーがVCに入ったとき
  if (newState.member.user.bot) return;

  const channel = newState.channel;
  if (channel && !oldState.channel) {
    const connection = joinVoiceChannel({
      channelId: channel.id,
      guildId: channel.guild.id,
      adapterCreator: channel.guild.voiceAdapterCreator,
    });

    const receiver = connection.receiver;

    receiver.speaking.on('start', (userId) => {
      const user = channel.guild.members.cache.get(userId);
      if (!user || user.user.bot) return;

      const opusStream = receiver.subscribe(userId);
      const oggStream = new prism.opus.Decoder({ rate: 48000, channels: 2, frameSize: 960 });

      const outputPath = `audio/${user.user.username}-${Date.now()}.pcm`;
      const writeStream = fs.createWriteStream(outputPath);
      opusStream.pipe(oggStream).pipe(writeStream);

      writeStream.on('finish', () => {
        console.log(`🎤 ${user.user.username} の音声保存完了: ${outputPath}`);
      });
    });
  }
});

client.login(process.env.DISCORD_TOKEN);
