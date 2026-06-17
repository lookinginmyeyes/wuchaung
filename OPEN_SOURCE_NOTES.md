# 开源参考与取舍说明

当前项目没有把外部仓库源码整包放入工程。OpenCV 与 Norfair 适合作为可选依赖直接调用；Tracker 更适合作为物理实验视频分析流程参考。

## 参考项目

| 项目 | 地址 | 用途 | 当前处理 |
|---|---|---|---|
| OpenCV | https://github.com/opencv/opencv | 视频解码、ROI、Hough 圆检测、轮廓检测、棋盘格/Charuco 标定思路 | 作为可选依赖调用，已接入 `backend/vision.py` |
| Tracker | https://github.com/OpenSourcePhysics/tracker | 物理教学视频分析流程：导入、标定、追踪、导出轨迹 | 作为流程参考，不直接复制源码 |
| Norfair | https://github.com/tryolabs/norfair | 检测点不稳定时做跨帧跟踪 | 作为可选依赖调用，`use_norfair=true` 时启用 |

## 当前已落地

- `backend/vision.py`：OpenCV 可选模块，有依赖时可从视频中提取小球轨迹点；Norfair 安装后可做跨帧跟踪平滑。
- `/api/vision/runtime`：检查本机是否安装 OpenCV / numpy。
- `/api/video/track`：上传视频后进行轨迹提取预览，不写入实验记录。
- `requirements-vision.txt`：OpenCV / numpy 核心视频追踪依赖。
- `requirements-tracking-extra.txt`：Norfair 可选跟踪层依赖。

## 还没有落地

- 没有实时摄像头采集。
- 没有折射标定矩阵求解与补偿。
- Norfair 只是可选跟踪层；当前 Python 3.14 环境下其依赖 `filterpy` 没有直接可用的二进制 wheel，尚未安装成功。
- 没有将视频追踪结果自动保存为正式实验记录。

## 许可证

- OpenCV 使用 Apache-2.0 license，可作为依赖调用。
- Norfair 使用 BSD-3-Clause license，可作为依赖调用。
- Tracker 使用 GPL-3.0 license；直接复制其源码会影响本项目许可证边界，因此当前只参考流程。
- 当前项目未保留外部仓库源码。
