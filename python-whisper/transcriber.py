import whisper
import os
import time

AUDIO_DIR = "../node-bot/audio"
model = whisper.load_model("base")

def transcribe_new_files():
    processed = set()
    while True:
        for filename in os.listdir(AUDIO_DIR):
            if filename in processed or not filename.endswith(".pcm"):
                continue

            filepath = os.path.join(AUDIO_DIR, filename)
            wav_path = filepath.replace(".pcm", ".wav")

            # PCM → WAVに変換
            os.system(f"ffmpeg -f s16le -ar 48k -ac 2 -i \"{filepath}\" \"{wav_path}\" -y -loglevel quiet")

            print(f"📝 {filename} を文字起こし中...")
            result = model.transcribe(wav_path, language="ja")
            print(f"📄 内容: {result['text']}")
            processed.add(filename)

        time.sleep(3)

if __name__ == "__main__":
    transcribe_new_files()
