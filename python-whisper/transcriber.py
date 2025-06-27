import os
import time
import numpy as np
import soundfile as sf
import whisper

AUDIO_DIR = "../node-bot/audio"
OUTPUT_DIR = "./transcripts"
os.makedirs(OUTPUT_DIR, exist_ok=True)
os.makedirs(AUDIO_DIR,exist_ok=True)

model = whisper.load_model("tiny")  # "base", "small", "medium" にすると精度アップ

def convert_pcm_to_wav(pcm_path, wav_path, rate=48000):
    with open(pcm_path, 'rb') as pcmfile:
        pcm_data = np.frombuffer(pcmfile.read(), dtype=np.int16)
    sf.write(wav_path, pcm_data, rate)
    print(f"✅ PCM → WAV 変換成功: {wav_path}")

def transcribe_new_files():
    for filename in os.listdir(AUDIO_DIR):
        if filename.endswith(".pcm"):
            pcm_path = os.path.join(AUDIO_DIR, filename)
            base_name = os.path.splitext(filename)[0]
            wav_path = os.path.join(AUDIO_DIR, base_name + ".wav")
            txt_path = os.path.join(OUTPUT_DIR, base_name + ".txt")

            # すでに変換済みならスキップ
            if os.path.exists(txt_path):
                continue

            try:
                convert_pcm_to_wav(pcm_path, wav_path)
                result = model.transcribe(wav_path)
                with open(txt_path, "w", encoding="utf-8") as f:
                    f.write(result["text"])
                print(f"📝 文字起こし完了: {txt_path}")
            except Exception as e:
                print(f"❌ エラー: {filename} - {e}")

# 無限ループで監視（1ファイルごとに処理）
if __name__ == "__main__":
    print("🔁 PCMフォルダ監視開始...")
    while True:
        transcribe_new_files()
        time.sleep(5)  # 5秒ごとにチェック
