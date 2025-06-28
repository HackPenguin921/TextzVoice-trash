import os
import time
import whisper
import discord
import asyncio

DISCORD_TOKEN = os.getenv('DISCORD_TOKEN')
CHANNEL_ID = int(os.getenv('CHANNEL_ID', '0'))
AUDIO_DIR = "../node-bot/audio"

model = whisper.load_model("base")

intents = discord.Intents.default()
client = discord.Client(intents=intents)

async def send_text(text):
    await client.wait_until_ready()
    channel = client.get_channel(CHANNEL_ID)
    if channel:
        await channel.send(text)
    else:
        print("指定チャンネルが見つかりません。CHANNEL_IDを確認してください。")

def pcm_to_wav(pcm_path, wav_path):
    os.system(f'ffmpeg -f s16le -ar 48000 -ac 2 -i "{pcm_path}" "{wav_path}" -y -loglevel quiet')

async def main_loop():
    processed = set()
    print("PCMフォルダ監視開始...")

    while True:
        for f in os.listdir(AUDIO_DIR):
            if not f.endswith(".pcm") or f in processed:
                continue

            pcm_path = os.path.join(AUDIO_DIR, f)
            wav_path = pcm_path.replace(".pcm", ".wav")

            pcm_to_wav(pcm_path, wav_path)

            print(f"文字起こし中: {f}")
            result = model.transcribe(wav_path, language="ja")
            print(f"認識結果: {result['text']}")

            await send_text(result['text'])
            processed.add(f)

        await asyncio.sleep(3)

@client.event
async def on_ready():
    print(f"Discordログイン完了: {client.user}")
    await main_loop()

if __name__ == "__main__":
    if not DISCORD_TOKEN or CHANNEL_ID == 0:
        print("ERROR: .envにDISCORD_TOKENとCHANNEL_IDを正しく設定してください。")
    else:
        client.run(DISCORD_TOKEN)
