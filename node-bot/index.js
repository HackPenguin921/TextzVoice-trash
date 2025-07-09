require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Client, GatewayIntentBits } = require('discord.js');
const { joinVoiceChannel, getVoiceConnection, createAudioPlayer, createAudioResource } = require('@discordjs/voice');
const prism = require('prism-media');
const gTTS = require('gtts');

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

  opusStream.pipe(decoder).pipe(outputStream);

  outputStream.on('finish', () => {
    console.log(`✅ 録音完了: ${filename}`);
    recordingUsers.set(userId, false);
    createListeningStream(userId, connection); // ループ再開
  });
}

client.once('ready', () => {
  console.log(`🤖 Botログイン: ${client.user.tag}`);
});

client.on('voiceStateUpdate', (oldState, newState) => {
  const user = newState.member?.user || oldState.member?.user;
  if (!user || user.bot) return;

  const joined = newState.channel;
  const left = oldState.channel;

  if (joined && !left) {
    let connection = getVoiceConnection(joined.guild.id);
    if (!connection) {
      connection = joinVoiceChannel({
        channelId: joined.id,
        guildId: joined.guild.id,
        adapterCreator: joined.guild.voiceAdapterCreator,
      });
      console.log(`🎤 VC参加: ${user.username} in ${joined.name}`);
    }

    joined.members.forEach(member => {
      if (!member.user.bot) {
        createListeningStream(member.id, connection);
      }
    });
  }

  if (left) {
    const noHumans = left.members.filter(m => !m.user.bot).size === 0;
    if (noHumans) {
      const connection = getVoiceConnection(left.guild.id);
      if (connection) {
        connection.destroy();
        console.log(`👋 VC退出: ${left.name} 無人`);
      }
    }
  }
});

client.on('messageCreate', async (message) => {
  if (message.author.bot || !message.guild) return;
  if (!message.content.startsWith('!say ')) return;

  const connection = getVoiceConnection(message.guild.id);
  if (!connection) return;

  const text = message.content.slice(5).trim();
  const gtts = new gTTS(text, 'ja');
  const filepath = `audio/tts-${Date.now()}.mp3`;

  gtts.save(filepath, () => {
    const resource = createAudioResource(filepath);
    player.play(resource);
    connection.subscribe(player);
  });
});

client.login(process.env.DISCORD_TOKEN);
