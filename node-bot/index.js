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

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates,
  ]
});

const player = createAudioPlayer();
const recordingUsers = new Map();

function createListeningStream(userId, connection) {
  if (recordingUsers.get(userId)) return;
  recordingUsers.set(userId, true);

  const receiver = connection.receiver;
  const opusStream = receiver.subscribe(userId, { end: { behavior: 'silence', duration: 5000 } });

  const filename = `audio/${userId}-${Date.now()}.pcm`;
  const outputStream = fs.createWriteStream(filename);
  const decoder = new prism.opus.Decoder({ rate: 48000, channels: 2, frameSize: 960 });

  opusStream.on('error', e => console.error('OpusStream error:', e));
  decoder.on('error', e => console.error('Decoder error:', e));
  outputStream.on('error', e => console.error('OutputStream error:', e));

  outputStream.on('finish', () => {
    console.log(`✅ 録音完了: ${filename}`);
    recordingUsers.set(userId, false);
    createListeningStream(userId, connection);  // 🔁 録音ループ再開
  });

  opusStream.pipe(decoder).pipe(outputStream);
}

client.once('ready', () => {
  console.log(`Bot logged in as ${client.user.tag}`);
  client.guilds.cache.forEach(guild => {
    const connection = getVoiceConnection(guild.id);
    if (!connection) return;
    guild.voiceStates.cache.forEach(state => {
      if (state.channel && !state.member.user.bot) {
        createListeningStream(state.member.id, connection);
      }
    });
  });
});

client.on('voiceStateUpdate', (oldState, newState) => {
  const user = newState.member?.user || oldState.member?.user;
  if (!user || user.bot) return;

  const joinedChannel = newState.channel;
  const leftChannel = oldState.channel;

  if (joinedChannel && !leftChannel) {
    let connection = getVoiceConnection(joinedChannel.guild.id);
    if (!connection) {
      connection = joinVoiceChannel({
        channelId: joinedChannel.id,
        guildId: joinedChannel.guild.id,
        adapterCreator: joinedChannel.guild.voiceAdapterCreator,
      });
      console.log(`[接続] ${user.username} がVC「${joinedChannel.name}」に入室。Botも参加！`);
    }

    joinedChannel.members.forEach(member => {
      if (!member.user.bot) {
        createListeningStream(member.id, connection);
      }
    });
  }

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

client.login(process.env.DISCORD_TOKEN);
