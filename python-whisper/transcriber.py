import os
import time
import whisper
import discord
import asyncio
from dotenv import load_dotenv

load_dotenv()
DISCORD_TOKEN = os.getenv('DISCORD_TOKEN')
CHANNEL_ID = int(os.getenv('CHANNEL_ID', '0'))
AUDIO_DIR = "../node-bot/audio"
PROCESSED_DIR = os.path.join(AUDIO_DIR, "processed")
os.makedirs(PROCESSED_DIR, exist_ok=True)

model = whisper.load_model("base")

intents = discord.Intents.default()
client = discord.Client(intents=intents)

async def send_text(text):
    await client.wait_until_ready()
    channel = client.get_channel(CHANNEL_ID)
    if channel:
        await channel.send(f"📝 {text}")
    else:
        print("❌ チャンネルが見つかりません")

def pcm_to_wav_clean(pcm_path, wav_path):
    tmp_wav = wav_path.replace(".wav", "-raw.wav")
    os.system(f'ffmpeg -f s16le -ar 48000 -ac 2 -i "{pcm_path}" "{tmp_wav}" -y -loglevel error')
    os.system(f'ffmpeg -i "{tmp_wav}" -af silenceremove=stop_periods=-1:stop_duration=0.5:stop_threshold=-40dB "{wav_path}" -y -loglevel error')
    os.remove(tmp_wav)

def move_to_processed(file_path):
    base = os.path.basename(file_path)
    os.rename(file_path, os.path.join(PROCESSED_DIR, base))

def clean_audio_dir():
    print("🧹 起動時に古い録音ファイル削除...")
    for f in os.listdir(AUDIO_DIR):
        if f.endswith(".pcm") or f.endswith(".wav"):
            try:
                os.remove(os.path.join(AUDIO_DIR, f))
            except Exception as e:
                print(f"⚠️ 削除失敗: {f}: {e}")

async def main_loop():
    clean_audio_dir()
    print("🎧 PCMフォルダ監視開始...")

    while True:
        for f in os.listdir(AUDIO_DIR):
            if not f.endswith(".pcm"):
                continue

            pcm_path = os.path.join(AUDIO_DIR, f)
            wav_path = pcm_path.replace(".pcm", ".wav")

            pcm_to_wav_clean(pcm_path, wav_path)

            print(f"文字起こし中: {f}")
            result = model.transcribe(wav_path, language="ja")
            print(f"認識結果: {result['text']}")

            await send_text(result['text'])

            move_to_processed(pcm_path)
            move_to_processed(wav_path)

        await asyncio.sleep(3)

@client.event
async def on_ready():
    print(f"🤖 Discordログイン完了: {client.user}")
    await main_loop()

if __name__ == "__main__":
    if not DISCORD_TOKEN or CHANNEL_ID == 0:
        print("❌ .envを確認してください")
    else:
        client.run(DISCORD_TOKEN)
