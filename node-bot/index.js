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

const player = createAudioPlayer();

// VCのユーザー音声録音用ストリーム作成関数
function createListeningStream(userId, connection) {
  const receiver = connection.receiver;
  const opusStream = receiver.subscribe(userId, { end: { behavior: 'silence', duration: 1000 } });

  const filename = `audio/${userId}-${Date.now()}.pcm`;
  const outputStream = fs.createWriteStream(filename);

  const decoder = new prism.opus.Decoder({ rate: 48000, channels: 2, frameSize: 960 });
  opusStream.pipe(decoder).pipe(outputStream);

  outputStream.on('finish', () => {
    console.log(`✅ 音声録音完了: ${filename}`);
  });
}

client.once('ready', () => {
  console.log(`Bot logged in as ${client.user.tag}`);

  // Bot起動時に既にVCにいるユーザーの録音開始（任意）
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

  // ユーザーがVCに入ったとき
  if (joinedChannel && !leftChannel) {
    let connection = getVoiceConnection(joinedChannel.guild.id);
    if (!connection) {
      connection = joinVoiceChannel({
        channelId: joinedChannel.id,
        guildId: joinedChannel.guild.id,
        adapterCreator: joinedChannel.guild.voiceAdapterCreator,
      });
      console.log(`[接続] ${user.username} がVC「${joinedChannel.name}」に入室。Botも参加！`);

      const textChannel = joinedChannel.guild.channels.cache.find(
        c => c.isTextBased() && c.id === process.env.CHANNEL_ID
      );
      if (textChannel) {
        textChannel.send(`🔊 Botが VC「${joinedChannel.name}」 に入りました`);
      }
    }

    // VC内の全ユーザーを録音開始
    joinedChannel.members.forEach(member => {
      if (!member.user.bot) {
        createListeningStream(member.id, connection);
      }
    });
  }

  // VCが無人になったらBotも退出
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

// メッセージ受信時にTTS再生
client.on('messageCreate', async message => {
  if (message.author.bot) return;

  const text = message.content.trim();
  if (!text) return;

  const voiceChannel = message.member?.voice?.channel;
  if (!voiceChannel) {
    message.reply('VCに入ってから話してください！');
    return;
  }

  const filename = `audio/tts-${Date.now()}.mp3`;
  const tts = new gTTS(text, 'ja');
  await new Promise((resolve, reject) =>
    tts.save(filename, err => err ? reject(err) : resolve())
  );

  let connection = getVoiceConnection(message.guild.id);
  if (!connection) {
    connection = joinVoiceChannel({
      channelId: voiceChannel.id,
      guildId: message.guild.id,
      adapterCreator: message.guild.voiceAdapterCreator,
    });
  }

  const resource = createAudioResource(path.resolve(filename));
  player.play(resource);
  connection.subscribe(player);

  player.once(AudioPlayerStatus.Idle, () => {
    try { fs.unlinkSync(filename); } catch {}
  });
});

client.login(process.env.DISCORD_TOKEN);
