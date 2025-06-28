require('dotenv').config();
const { Client, GatewayIntentBits } = require('discord.js');
const {
  joinVoiceChannel, getVoiceConnection,
  createAudioPlayer, createAudioResource, AudioPlayerStatus,
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
  if (newState.member.user.bot) return;
  const joinedChannel = newState.channel;
  const leftChannel = oldState.channel;

  if (joinedChannel && !leftChannel) {
    const connection = joinVoiceChannel({
      channelId: joinedChannel.id,
      guildId: joinedChannel.guild.id,
      adapterCreator: joinedChannel.guild.voiceAdapterCreator,
    });

    // VC参加通知（任意）
    const textChannel = joinedChannel.guild.channels.cache.find(
      c => c.isTextBased() && c.id === process.env.CHANNEL_ID
    );
    if (textChannel) {
      textChannel.send(`🎧 VC「${joinedChannel.name}」に入りました`);
    }

    const receiver = connection.receiver;

    receiver.speaking.on('start', userId => {
      if (audioStreams.has(userId)) return;

      const user = joinedChannel.guild.members.cache.get(userId);
      if (!user || user.user.bot) return;

      const opusStream = receiver.subscribe(userId, { end: { behavior: 'manual' }});
      const decoder = new prism.opus.Decoder({ rate: 48000, channels: 2, frameSize: 960 });
      const filename = `audio/${user.user.username}-${Date.now()}.pcm`;
      const writeStream = fs.createWriteStream(filename);

      opusStream.pipe(decoder).pipe(writeStream);

      audioStreams.set(userId, { opusStream, decoder, writeStream });
      console.log(`録音開始: ${filename}`);
    });

    receiver.speaking.on('end', userId => {
      const streams = audioStreams.get(userId);
      if (!streams) return;

      streams.writeStream.end();
      streams.opusStream.destroy();
      streams.decoder.destroy();
      audioStreams.delete(userId);
      console.log(`録音終了: ${userId}`);
    });
  }

  if (leftChannel) {
    const humanCount = leftChannel.members.filter(m => !m.user.bot).size;
    if (humanCount === 0) {
      const conn = getVoiceConnection(leftChannel.guild.id);
      if (conn) {
        conn.destroy();
        console.log(`VC退出: ${leftChannel.name}`);
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
      adapterCreator: voiceChannel.guild.voiceAdapterCreator,
    });

  const resource = createAudioResource(path.resolve(filename));
  player.play(resource);
  connection.subscribe(player);

  player.once(AudioPlayerStatus.Idle, () => {
    try { fs.unlinkSync(filename); } catch {}
  });
});

client.login(process.env.DISCORD_TOKEN);
