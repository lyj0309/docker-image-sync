import subprocess
import re
import time
import threading
import requests
import os

# 配置部分
CF_API_TOKEN = os.getenv('CF_API_TOKEN')
CF_ACCOUNT_ID = os.getenv('CF_ACCOUNT_ID')
KV_NAMESPACE_ID = os.getenv('CF_KV_NAMESPACE_ID')
KV_KEY = os.getenv('DIGEST') if os.getenv('DIGEST') else 'skopeo_copy_progress'

# Skopeo 复制命令
SOURCE_REGISTRY = os.getenv('SOURCE_REGISTRY')
DESTINATION_REGISTRY = os.getenv('DESTINATION_REGISTRY')
SOURCE_REPO = os.getenv('SOURCE_REPO')
DESTINATION_REPO = os.getenv('DESTINATION_REPO')

SOURCE_IMAGE = f"docker://{SOURCE_REGISTRY}/{SOURCE_REPO}"
DESTINATION_IMAGE = f"docker://{DESTINATION_REGISTRY}/{DESTINATION_REPO}"

# 正则表达式用于解析进度
PROGRESS_REGEX = re.compile(r'Copying blob sha256:[a-f0-9]+ ([\d.]+ [KMGT]iB) / ([\d.]+ [KMGT]iB)')

# 全局变量存储当前进度
current_progress = "开始复制"

# 锁用于线程安全
progress_lock = threading.Lock()

def update_kv(progress):
    """将进度更新到 Cloudflare KV"""
    url = f'https://api.cloudflare.com/client/v4/accounts/{CF_ACCOUNT_ID}/storage/kv/namespaces/{KV_NAMESPACE_ID}/values/{KV_KEY}'
    headers = {
        'Authorization': f'Bearer {CF_API_TOKEN}',
        'Content-Type': 'text/plain',
    }
    response = requests.put(url, headers=headers, data=progress)
    if response.status_code == 200:
        print(f"进度已更新到 KV: {progress}")
    else:
        print(f"更新 KV 失败: {response.status_code} {response.text}")

def periodic_update():
    """每隔10秒更新一次进度到 KV"""
    while True:
        with progress_lock:
            progress = current_progress
        update_kv(progress)
        time.sleep(10)

def run_skopeo_copy():
    """运行 Skopeo 复制命令并解析进度"""
    global current_progress
    command = ['skopeo', 'copy', '--log-level', 'info', SOURCE_IMAGE, DESTINATION_IMAGE]
    process = subprocess.Popen(command, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, bufsize=1)

    for line in process.stderr:
        line = line.strip()
        print(line)  # 打印 Skopeo 输出
        match = PROGRESS_REGEX.search(line)
        if match:
            copied = match.group(1)
            total = match.group(2)
            with progress_lock:
                current_progress = f"正在复制: {copied} / {total}"

    process.wait()
    if process.returncode == 0:
        with progress_lock:
            current_progress = "复制完成"
        print("Skopeo 复制完成")
    else:
        with progress_lock:
            current_progress = f"复制失败: 退出代码 {process.returncode}"
        print(f"Skopeo 复制失败，退出代码 {process.returncode}")

if __name__ == "__main__":
    # 启动定时更新线程
    updater_thread = threading.Thread(target=periodic_update, daemon=True)
    updater_thread.start()

    # 启动 Skopeo 复制
    run_skopeo_copy()

    # 最后一次更新
    with progress_lock:
        final_progress = current_progress
    update_kv(final_progress)
