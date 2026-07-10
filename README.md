# 落球法 AI 视觉测量链路原型

对应立项报告《基于AI视觉的落球法液体粘滞系数智能测量系统》。

当前版本按比赛视角收敛为一个最小有效闭环：导入真实轨迹 CSV，提取速度曲线，识别匀速段，拟合终端速度，计算粘滞系数，并给出误差诊断。系统不替代真实实验，只辅助计算、展示证据曲线和复盘误差。

## 当前保留的比赛核心

- 轨迹 CSV 输入：`t,y` 或 `time,position`。
- 实验视频入口：读取视频预览、时长、分辨率和文件大小，并可调用 OpenCV 后端提取小球轨迹，再复用速度曲线、匀速段和粘滞系数计算链路。
- OpenCV 实时追踪入口：连接手机/摄像头实时画面，录制一次落球过程后提交 OpenCV 追踪；后续可扩展为逐帧实时推理。
- 速度曲线提取与匀速段自动识别。
- 终端速度稳健带权拟合，降低反光坏点、漏检点和低置信度轨迹点影响。
- Stokes 公式粘滞系数计算，保留壁效应修正。
- R²、Re、球径/管径比、轨迹坏点数量、匀速段离散度等条件检查。
- 人工测量值对比和质量评分。未填写人工测量值时不生成评分。
- 真实 CSV 分析记录保存与报告导出。

## 边界

- 软件输出只作为辅助参考，不作为最终实验结论。
- 学生仍需完成释放小球、观察现象、记录原始数据、推导计算和误差分析。

## 启动

在 `/Users/shi/Desktop/物创` 下运行：

```bash
python3 falling_ball_ai_platform/run.py
```

打开：

```text
http://127.0.0.1:8877
```

## 接入云数据库

默认情况下，实验历史记录保存在本机 `data/measurements.sqlite3`，录像保存在 `data/videos/`。这些运行数据不会进入 GitHub。若要在不同电脑之间共享实验历史，请接入 Supabase：

1. 新建 Supabase 项目，在 SQL Editor 中执行 `supabase_schema.sql`。
2. 复制 `.env.example` 为 `.env`，填写：

```bash
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
SUPABASE_RUNS_TABLE=runs
SUPABASE_VIDEO_BUCKET=falling-ball-videos
SUPABASE_VIDEO_PREFIX=videos
```

3. 重启平台。访问 `/api/health`，若返回 `storage.backend` 为 `supabase`，说明实验记录已写入云数据库。
4. 迁移本机已有历史记录：

```bash
.venv/bin/python tools/sync_local_data_to_supabase.py
```

如果不配置 `SUPABASE_VIDEO_BUCKET`，迁移脚本只迁移实验记录，并默认移除本机录像链接，避免换电脑后点到不存在的视频。配置 Storage bucket 后，脚本会把本机录像一起上传，历史回顾中的“载入录像”仍可使用。

## 后续真实实验要验证

- 固定机位拍摄是否能稳定提取小球轨迹。
- 标定板或标定球能否建立可靠像素-长度映射。
- 透明容器中的折射和反光是否会破坏追踪。
- 重复测量下粘滞系数结果是否稳定。
- 人工计时/人工匀速段选择与系统识别结果的偏差来源。

## OpenCV 视频分析路线

- 参考 Tracker 的物理教学流程：视频导入、标定、追踪、导出轨迹。
- 第一版后端使用 OpenCV：视频解码、ROI 裁剪、阈值/轮廓/圆心检测。
- 如果圆心检测在反光或遮挡下不稳定，可用 `use_norfair=true` 启用 Norfair 跨帧跟踪。
- 视频追踪结果最终应导出为 `t,y` 轨迹，再复用当前稳健预处理、匀速段搜索、粘度计算与误差诊断链路。
- `/api/measurements/preview` 可用于算法调参预览，不保存实验记录。
- 实时展示推荐采用“手机画面接入 + 一次落球录制 + OpenCV 自动追踪”的准实时方案；逐帧边拍边算需要把手机画面接成 WebRTC/RTSP 流并持续送入 OpenCV 服务。
- 标定推荐使用直径 3 mm、长度 400 mm 的中心标定棒：先放在量筒中心轴线，建立像素-长度比例、中心轴线方向、透视比例和折射修正参考，再释放小球。
- 非线性修正参数已接入 OpenCV 轨迹换算：量筒内径、液体深度、液体折射率、玻璃壁厚、相机距离、标定棒刻度间距和修正强度会作为轴向三次修正模型的输入。输出轨迹同时保留 `measured_y`、`corrected_y` 和 `nonlinear_delta`。

## 可选视频追踪模块

当前已新增轻量 OpenCV 视频轨迹提取骨架。核心视频追踪依赖已放在 `requirements-vision.txt`：

```bash
falling_ball_ai_platform/.venv/bin/python -m pip install -r falling_ball_ai_platform/requirements-vision.txt
```

Norfair 跟踪层是额外依赖，在 Python 3.14 上可能需要等待其依赖适配；如需尝试：

```bash
python3 -m pip install -r falling_ball_ai_platform/requirements-tracking-extra.txt
```

检查运行环境：

```bash
curl http://127.0.0.1:8877/api/vision/runtime
```

上传视频提取轨迹预览：

```bash
curl -X POST 'http://127.0.0.1:8877/api/video/track?scale_m_per_px=0.001&min_radius_px=4&max_radius_px=80' \
  -H 'Content-Type: video/mp4' \
  --data-binary @your-video.mp4
```

启用 Norfair 跟踪层：

```bash
curl -X POST 'http://127.0.0.1:8877/api/video/track?scale_m_per_px=0.001&use_norfair=true' \
  -H 'Content-Type: video/mp4' \
  --data-binary @your-video.mp4
```

开源参考与取舍见 `OPEN_SOURCE_NOTES.md`。
