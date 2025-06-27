// node-bot/index.js
require('dotenv').config({ path: __dirname + '/.env' });

const { Client, GatewayIntentBits } = require('discord.js');
const { joinVoiceChannel } = require('@discordjs/voice');
const fs = require('fs');
const prism = require('prism-media');

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates],
});

// 録音中のユーザーごとのストリーム管理用Map
const audioStreams = new Map();

client.on('ready', () => {
  console.log(`✅ Bot logged in as ${client.user.tag}`);
});

client.on('voiceStateUpdate', async (oldState, newState) => {
  // Botの発話は無視
  if (newState.member.user.bot) return;

  const channel = newState.channel;
  if (channel && !oldState.channel) {
    // VCに接続
    const connection = joinVoiceChannel({
      channelId: channel.id,
      guildId: channel.guild.id,
      adapterCreator: channel.guild.voiceAdapterCreator,
    });

    const receiver = connection.receiver;

    receiver.speaking.on('start', (userId) => {
      if (audioStreams.has(userId)) return; // 既に録音中

      const user = channel.guild.members.cache.get(userId);
      if (!user || user.user.bot) return;

      const opusStream = receiver.subscribe(userId, {
        end: {
          behavior: 'manual',
        },
      });
      const decoder = new prism.opus.Decoder({
        rate: 48000,
        channels: 2,
        frameSize: 960,
      });

      const filename = `audio/${user.user.username}-${Date.now()}.pcm`;
      const writeStream = fs.createWriteStream(filename);

      opusStream.pipe(decoder).pipe(writeStream);

      audioStreams.set(userId, { opusStream, decoder, writeStream });

      console.log(`🎤 ${user.user.username} の録音開始: ${filename}`);

      writeStream.on('finish', () => {
        console.log(`🎤 ${user.user.username} の録音ファイル書き込み完了: ${filename}`);
      });
    });

    receiver.speaking.on('end', (userId) => {
      const streams = audioStreams.get(userId);
      if (!streams) return;

      streams.writeStream.end();   // ファイル閉じる
      streams.opusStream.destroy();
      streams.decoder.destroy();

      audioStreams.delete(userId);

      const user = channel.guild.members.cache.get(userId);
      const username = user ? user.user.username : userId;
      console.log(`🎤 ${username} の録音終了`);
    });
  }
});

client.login(process.env.DISCORD_TOKEN);
