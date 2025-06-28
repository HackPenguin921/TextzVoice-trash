// node-bot/index.js
require('dotenv').config();
const { Client, GatewayIntentBits } = require('discord.js');
const {
  joinVoiceChannel,
  getVoiceConnection,
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
} = require('@discordjs/voice');
const prism = require('prism-media');
const fs = require('fs');
const path = require('path');
const gTTS = require('gtts');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates,
  ]
});

const audioStreams = new Map();
const player = createAudioPlayer();

client.once('ready', () => {
  console.log(`Bot logged in as ${client.user.tag}`);
});

client.on('voiceStateUpdate', (oldState, newState) => {
  const user = newState.member?.user || oldState.member?.user;
  if (!user || user.bot) return;

  const joinedChannel = newState.channel;
  const leftChannel = oldState.channel;

  // ユーザーがVCに入ったとき
  if (joinedChannel && !leftChannel) {
    const connection = getVoiceConnection(joinedChannel.guild.id);
    if (!connection) {
      joinVoiceChannel({
        channelId: joinedChannel.id,
        guildId: joinedChannel.guild.id,
        adapterCreator: joinedChannel.guild.voiceAdapterCreator,
      });
      console.log(`[接続] ${user.username} がVC「${joinedChannel.name}」に入室。Botも参加！`);

      // テキスト通知
      const textChannel = joinedChannel.guild.channels.cache.find(
        c => c.isTextBased() && c.id === process.env.CHANNEL_ID
      );
      if (textChannel) {
        textChannel.send(`🔊 Botが VC「${joinedChannel.name}」 に入りました`);
      }
    }
  }

  // VCが無人になったとき
  if (leftChannel) {
    const isBotLeftAlone = leftChannel.members.filter(m => !m.user.bot).size === 0;
    if (isBotLeftAlone) {
      const connection = getVoiceConnection(leftChannel.guild.id);
      if (connection) {
        connection.destroy();
        console.log(`[退出] VC「${leftChannel.name}」が無人。Botも退出しました。`);
      }
    }
  }
});

client.on('messageCreate', async message => {
  if (message.author.bot) return;

  const text = message.content.trim();
  if (!text) return;

  const voiceChannel = message.member?.voice?.channel;
  if (!voiceChannel) {
    message.reply('VCに入ってから話してください！');
    return;
  }

  // TTSで読み上げ
  const filename = `audio/tts-${Date.now()}.mp3`;
  const tts = new gTTS(text, 'ja');
  await new Promise((resolve, reject) =>
    tts.save(filename, err => err ? reject(err) : resolve())
  );

  const connection = getVoiceConnection(message.guild.id) ||
    joinVoiceChannel({
      channelId: voiceChannel.id,
      guildId: message.guild.id,
      adapterCreator: message.guild.voiceAdapterCreator,
    });

  const resource = createAudioResource(path.resolve(filename));
  player.play(resource);
  connection.subscribe(player);

  player.once(AudioPlayerStatus.Idle, () => {
    try { fs.unlinkSync(filename); } catch {}
  });
});

client.login(process.env.DISCORD_TOKEN);
