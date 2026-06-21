const LIVE_FRAME_INTERVAL_MS = 24;
const LIVE_FRAME_MAX_WIDTH = 1280;
const LIVE_FRAME_JPEG_QUALITY = 0.86;
const LIVE_CHART_INTERVAL_MS = 120;
const LIVE_BACKEND_FAILURE_LIMIT = 5;
const LIVE_TRAJECTORY_LIMIT = 2400;
const LIVE_MAX_IN_FLIGHT_FRAMES = 2;
const FALL_OFFSET_MONITOR_ENABLED = true;
const LOCAL_API_BASE_URL = "http://127.0.0.1:8877";
const HOSTED_API_BASE_URL = "https://42.194.177.159";
const API_BASE_URL = (() => {
  const params = new URLSearchParams(window.location.search);
  const configured = params.get("api") || window.localStorage?.getItem("fallingBallApiBase") || "";
  if (configured) return configured.replace(/\/$/, "");
  const host = window.location.hostname;
  if (host.endsWith("github.io")) return HOSTED_API_BASE_URL;
  if (window.location.protocol === "file:") return LOCAL_API_BASE_URL;
  return "";
})();

const state = {
  latest: null,
  records: [],
  selectedRecordIds: new Set(),
  chartMode: "position",
  source: "trajectory",
  videoUrl: null,
  liveStream: null,
  liveRecorder: null,
  liveChunks: [],
  pendingLiveVideoBlob: null,
  liveTracking: false,
  liveTrackingAbort: null,
  liveTrackingFrame: 0,
  liveTrackingStart: null,
  liveTrackingMediaStart: null,
  liveFrameRequest: null,
  liveFrameTimer: null,
  liveFrameScheduled: false,
  liveFramesInFlight: 0,
  lastLiveFrameCaptureAt: 0,
  liveFrameScale: 1,
  liveTrajectory: [],
  liveMisses: 0,
  liveBackendFailures: 0,
  liveChartDrawTimer: null,
  lastLiveChartDrawAt: 0,
  liveFrameBusy: false,
  liveOffsetTerminated: false,
  lastFallOffset: null,
  roiSelecting: false,
  roiRect: null,       // { xPct, yPct, wPct, hPct } in % of video content
  roiDragStart: null,
  roiZoomStarted: false,
  cylinderEdgeMarking: false,
  cylinderEdgeZoomStarted: false,
  cylinderEdgePoints: [],
  calibrationMode: false,
  calibrationVisualsHidden: false,
  calibrationPoints: [],
  calibrationEditIndex: null,
  axisCalibrationPoints: [],
  correctionMode: "piecewise",
  manualScaleMPerPx: null,
  liveZoomMode: null,
  manualZoomActive: false,
  manualZoomScale: 1,
  manualZoomOrigin: { x: 50, y: 50 },
  accessGranted: false,
  examStarted: false,
  lectureStarted: false,
  lectureRead: false,
  simulation: null,
};

const el = {
  gateEntryPanel: document.getElementById("gateEntryPanel"),
  gateVisualPanel: document.getElementById("gateVisualPanel"),
  lecturePanel: document.getElementById("lecturePanel"),
  lectureReader: document.getElementById("lectureReader"),
  lectureProgress: document.getElementById("lectureProgress"),
  startQuizBtn: document.getElementById("startQuizBtn"),
  quizPanel: document.getElementById("quizPanel"),
  quizQuestionList: document.getElementById("quizQuestionList"),
  releaseBallBtn: document.getElementById("releaseBallBtn"),
  examProgress: document.getElementById("examProgress"),
  quizScore: document.getElementById("quizScore"),
  quizForm: document.getElementById("quizForm"),
  quizResult: document.getElementById("quizResult"),
  quizTutorPanel: document.getElementById("quizTutorPanel"),
  quizTutorSummary: document.getElementById("quizTutorSummary"),
  quizTutorChat: document.getElementById("quizTutorChat"),
  quizTutorForm: document.getElementById("quizTutorForm"),
  quizTutorInput: document.getElementById("quizTutorInput"),
  submitQuizBtn: document.getElementById("submitQuizBtn"),
  skipQuizBtn: document.getElementById("skipQuizBtn"),
  retryQuizBtn: document.getElementById("retryQuizBtn"),
  enterHallBtn: document.getElementById("enterHallBtn"),
  resetAccessBtn: document.getElementById("resetAccessBtn"),
  serverStatus: document.getElementById("serverStatus"),
  statusDot: document.querySelector(".status-dot"),
  topbar: document.querySelector(".topbar"),
  topActions: document.querySelector(".top-actions"),
  viewEyebrow: document.getElementById("viewEyebrow"),
  viewTitle: document.getElementById("viewTitle"),
  viewSubtitle: document.getElementById("viewSubtitle"),
  refreshBtn: document.getElementById("refreshBtn"),
  hallButton: document.querySelector(".hall-button"),
  presetBtn: document.getElementById("presetBtn"),
  liquid: document.getElementById("liquid"),
  temperatureC: document.getElementById("temperatureC"),
  rhoLiquid: document.getElementById("rhoLiquid"),
  etaReference: document.getElementById("etaReference"),
  radiusMm: document.getElementById("radiusMm"),
  rhoBall: document.getElementById("rhoBall"),
  tubeDiameterMm: document.getElementById("tubeDiameterMm"),
  liquidDepthMm: document.getElementById("liquidDepthMm"),
  studentV: document.getElementById("studentV"),
  studentEta: document.getElementById("studentEta"),
  trajectoryInput: document.getElementById("trajectoryInput"),
  uploadTrajectoryBtn: document.getElementById("uploadTrajectoryBtn"),
  sourceStatus: document.getElementById("sourceStatus"),
  activeSourceName: document.getElementById("activeSourceName"),
  activeSourceDetail: document.getElementById("activeSourceDetail"),
  selectedFileName: document.getElementById("selectedFileName"),
  videoImportPanel: document.getElementById("videoImportPanel"),
  videoPreview: document.getElementById("videoPreview"),
  videoPlaceholder: document.getElementById("videoPlaceholder"),
  videoFrame: document.querySelector(".video-frame"),
  videoDuration: document.getElementById("videoDuration"),
  videoResolution: document.getElementById("videoResolution"),
  videoSize: document.getElementById("videoSize"),
  videoFps: document.getElementById("videoFps"),
  videoReadinessLabel: document.getElementById("videoReadinessLabel"),
  videoReadinessDetail: document.getElementById("videoReadinessDetail"),
  realtimeImportPanel: document.getElementById("realtimeImportPanel"),
  livePreview: document.getElementById("livePreview"),
  livePlaceholder: document.getElementById("livePlaceholder"),
  liveCameraStatus: document.getElementById("liveCameraStatus"),
  liveModelStatus: document.getElementById("liveModelStatus"),
  liveCalibrationStatus: document.getElementById("liveCalibrationStatus"),
  liveReadinessLabel: document.getElementById("liveReadinessLabel"),
  liveReadinessDetail: document.getElementById("liveReadinessDetail"),
  liveCameraSelect: document.getElementById("liveCameraSelect"),
  refreshCameraListBtn: document.getElementById("refreshCameraListBtn"),
  startLiveCameraBtn: document.getElementById("startLiveCameraBtn"),
  stopLiveCameraBtn: document.getElementById("stopLiveCameraBtn"),
  startCalibrationBtn: document.getElementById("startCalibrationBtn"),
  resetCalibrationBtn: document.getElementById("resetCalibrationBtn"),
  calibrationClickLayer: document.getElementById("calibrationClickLayer"),
  calibrationPointsLayer: document.getElementById("calibrationPointsLayer"),
  calibrationSegment: document.getElementById("calibrationSegment"),
  exitCalibrationFullscreenBtn: document.getElementById("exitCalibrationFullscreenBtn"),
  finishCalibrationBtn: document.getElementById("finishCalibrationBtn"),
  toggleLiveZoomBtn: document.getElementById("toggleLiveZoomBtn"),
  calibrationPointStatus: document.getElementById("calibrationPointStatus"),
  calibrationPixelDistance: document.getElementById("calibrationPixelDistance"),
  calibrationScale: document.getElementById("calibrationScale"),
  startLiveRecordBtn: document.getElementById("startLiveRecordBtn"),
  stopLiveRecordBtn: document.getElementById("stopLiveRecordBtn"),
  fallOffsetCard: document.getElementById("fallOffsetCard"),
  fallOffsetStatus: document.getElementById("fallOffsetStatus"),
  fallOffsetDetail: document.getElementById("fallOffsetDetail"),
  ballOffsetMarker: document.getElementById("ballOffsetMarker"),
  roiSelectionLayer: document.getElementById("roiSelectionLayer"),
  roiBox: document.getElementById("roiBox"),
  liveZoomTargetLayer: document.getElementById("liveZoomTargetLayer"),
  liveManualZoomControls: document.getElementById("liveManualZoomControls"),
  toggleLiveMagnifyBtn: document.getElementById("toggleLiveMagnifyBtn"),
  resetLiveMagnifyBtn: document.getElementById("resetLiveMagnifyBtn"),
  startRoiSelectBtn: document.getElementById("startRoiSelectBtn"),
  clearRoiBtn: document.getElementById("clearRoiBtn"),
  cylinderEdgeClickLayer: document.getElementById("cylinderEdgeClickLayer"),
  cylinderEdgeMarks: document.getElementById("cylinderEdgeMarks"),
  startCylinderEdgeMarkBtn: document.getElementById("startCylinderEdgeMarkBtn"),
  resetCylinderEdgeMarkBtn: document.getElementById("resetCylinderEdgeMarkBtn"),
  cylinderCenterX: document.getElementById("cylinderCenterX"),
  cylinderWidthPct: document.getElementById("cylinderWidthPct"),
  fallOffsetThreshold: document.getElementById("fallOffsetThreshold"),
  calibrationRodDiameterMm: document.getElementById("calibrationRodDiameterMm"),
  calibrationRodLengthMm: document.getElementById("calibrationRodLengthMm"),
  calibrationRodSamples: document.getElementById("calibrationRodSamples"),
  nonlinearCorrectionEnabled: document.getElementById("nonlinearCorrectionEnabled"),
  correctionModeTitle: document.getElementById("correctionModeTitle"),
  correctionModeDetail: document.getElementById("correctionModeDetail"),
  rodTickSpacingMm: document.getElementById("rodTickSpacingMm"),
  nonlinearCorrectionModel: document.getElementById("nonlinearCorrectionModel"),
  nonlinearCorrectionSource: document.getElementById("nonlinearCorrectionSource"),
  sourceSchemaTitle: document.getElementById("sourceSchemaTitle"),
  sourceSchemaDetail: document.getElementById("sourceSchemaDetail"),
  fileQueue: document.getElementById("fileQueue"),
  filePicker: document.querySelector(".file-picker"),
  runBadge: document.getElementById("runBadge"),
  terminalVelocity: document.getElementById("terminalVelocity"),
  uniformSegmentLength: document.getElementById("uniformSegmentLength"),
  idealViscosity: document.getElementById("idealViscosity"),
  viscosity: document.getElementById("viscosity"),
  r2: document.getElementById("r2"),
  re: document.getElementById("re"),
  fitMethod: document.getElementById("fitMethod"),
  outlierCount: document.getElementById("outlierCount"),
  segmentCv: document.getElementById("segmentCv"),
  trackingConfidence: document.getElementById("trackingConfidence"),
  uncertaintyStatus: document.getElementById("uncertaintyStatus"),
  uncertaintyDiameterMm: document.getElementById("uncertaintyDiameterMm"),
  uncertaintyTimeS: document.getElementById("uncertaintyTimeS"),
  uncertaintyDistanceMm: document.getElementById("uncertaintyDistanceMm"),
  uncertaintyTubeDiameterMm: document.getElementById("uncertaintyTubeDiameterMm"),
  uncertaintyLiquidDepthMm: document.getElementById("uncertaintyLiquidDepthMm"),
  uncertaintyDiameterTerm: document.getElementById("uncertaintyDiameterTerm"),
  uncertaintyTimingTerm: document.getElementById("uncertaintyTimingTerm"),
  uncertaintyCombined: document.getElementById("uncertaintyCombined"),
  uncertaintyStandard: document.getElementById("uncertaintyStandard"),
  uncertaintyExpanded: document.getElementById("uncertaintyExpanded"),
  uncertaintyExpression: document.getElementById("uncertaintyExpression"),
  chart: document.getElementById("chart"),
  score: document.getElementById("score"),
  diagnostics: document.getElementById("diagnostics"),
  downloadReport: document.getElementById("downloadReport"),
  dashboardBackBtn: document.getElementById("dashboardBackBtn"),
  recordsBody: document.getElementById("recordsBody"),
  selectAllRecords: document.getElementById("selectAllRecords"),
  deleteSelectedRecordsBtn: document.getElementById("deleteSelectedRecordsBtn"),
  chatLog: document.getElementById("chatLog"),
  chatForm: document.getElementById("chatForm"),
  questionInput: document.getElementById("questionInput"),
  readinessStage: document.getElementById("readinessStage"),
  readinessPositioning: document.getElementById("readinessPositioning"),
  readinessCards: document.getElementById("readinessCards"),
  workflowList: document.getElementById("workflowList"),
  deviceChecklist: document.getElementById("deviceChecklist"),
  guardrailList: document.getElementById("guardrailList"),
  videoPipelineList: document.getElementById("videoPipelineList"),
  modulePositioning: document.getElementById("modulePositioning"),
  moduleGrid: document.getElementById("moduleGrid"),
  simScenario: document.getElementById("simScenario"),
  simLiquidNote: document.getElementById("simLiquidNote"),
  simRadiusMm: document.getElementById("simRadiusMm"),
  simTubeMm: document.getElementById("simTubeMm"),
  simDepthMm: document.getElementById("simDepthMm"),
  simRelease: document.getElementById("simRelease"),
  simRefraction: document.getElementById("simRefraction"),
  simLighting: document.getElementById("simLighting"),
  simReleaseValue: document.getElementById("simReleaseValue"),
  simRefractionValue: document.getElementById("simRefractionValue"),
  simLightingValue: document.getElementById("simLightingValue"),
  runSimulationBtn: document.getElementById("runSimulationBtn"),
  simulationStatus: document.getElementById("simulationStatus"),
  simulationCanvas: document.getElementById("simulationCanvas"),
  simVt: document.getElementById("simVt"),
  simEta: document.getElementById("simEta"),
  simScore: document.getElementById("simScore"),
  simRisk: document.getElementById("simRisk"),
  simRe: document.getElementById("simRe"),
  simWallCorrection: document.getElementById("simWallCorrection"),
  simReCorrection: document.getElementById("simReCorrection"),
  simCorrectionTotal: document.getElementById("simCorrectionTotal"),
  simFeedbackState: document.getElementById("simFeedbackState"),
  simFeedbackVt: document.getElementById("simFeedbackVt"),
  simulationRubric: document.getElementById("simulationRubric"),
  sendSimulationToWorkbenchBtn: document.getElementById("sendSimulationToWorkbenchBtn"),
  toast: document.getElementById("toast"),
};

const ctx = el.chart.getContext("2d");
const simCtx = el.simulationCanvas.getContext("2d");
const appViews = [...document.querySelectorAll(".app-view")];
let simulationAnimationFrame = null;
const simulationDrop = {
  active: false,
  completed: false,
  startTime: null,
  duration: 2300,
};

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const viewMeta = {
  gate: {
    eyebrow: "实验学习流程",
    title: "落球法测液体粘滞系数实验 AI 学习平台",
    subtitle: "阅读讲义 · 完成试题 · 通过测试 · 方可实验",
  },
  dashboard: {
    eyebrow: "大厅",
    title: "落球法 AI 实验大厅",
    subtitle: "通过准入后，从大厅进入 AI 实验测量、虚拟仿真、实验记录与结果复盘。",
  },
  workspace: {
    eyebrow: "AI实验测量",
    title: "摄像机测量待测液体粘滞系数",
    subtitle: "通过固定摄像机或已导出的真实轨迹，提取小球速度曲线，拟合终端速度并计算待测液体粘滞系数。",
  },
  simulation: {
    eyebrow: "虚拟仿真",
    title: "已知液体的小球速度输出",
    subtitle: "先选定液体和容器参数，仿真输出小球速度曲线，用来理解终端速度形成过程和对照真实实验。",
  },
  diagnosis: {
    eyebrow: "实验记录",
    title: "误差诊断与学生结果对比",
    subtitle: "把人工结果与系统参考放到同一证据链里，解释偏差来自哪里、实验该如何改进。",
  },
  validation: {
    eyebrow: "落地验证",
    title: "真实实验验证清单",
    subtitle: "明确后续需要采集什么、验证什么，避免把软件原型说成已完成的实验结论。",
  },
};

const dataSources = {
  trajectory: {
    status: "CSV可用",
    name: "轨迹 CSV",
    detail: "导入时间-位移轨迹，后端直接进行速度曲线、匀速段和粘滞系数分析。",
    schemaTitle: "t, y 为必填列",
    schemaDetail: "可选列：x、confidence、measured_y、corrected_y。单位默认 t/s、y/m。",
    accept: ".csv,text/csv",
    pickerLabel: "选择轨迹CSV",
    actionLabel: "分析已选CSV",
    enabled: true,
  },
  video: {
    status: "OpenCV可追踪",
    name: "摄像机视频",
    detail: "导入固定机位拍摄的落球视频，后端使用 OpenCV 提取小球中心轨迹，再进入速度曲线和粘度计算。",
    schemaTitle: "视频追踪输入",
    schemaDetail: "建议画面包含中心标定棒、量筒边界和完整落球过程；先完成标定再追踪小球。",
    accept: "video/mp4,video/quicktime,video/webm,video/x-m4v",
    pickerLabel: "选择实验视频",
    actionLabel: "OpenCV追踪视频",
    enabled: true,
  },
  realtime: {
    status: "OpenCV可接入",
    name: "OpenCV 实时追踪",
    detail: "连接手机或摄像头实时画面，使用中心标定棒建立像素比例，后端 OpenCV 逐帧返回小球轨迹。",
    schemaTitle: "实时输入：手机画面 + 中心标定棒",
    schemaDetail: "建议手机固定在量筒正前方；标定棒置于量筒中心轴线，先标定再释放小球。",
    accept: "video/*",
    pickerLabel: "选择备用视频",
    actionLabel: "实时追踪说明",
    enabled: true,
  },
};

const quizPassScore = 80;
const quizQuestions = [
  {
    key: "q1",
    module: "传统实验原理",
    type: "单项选择题",
    points: 5,
    title: "斯托克斯定律 F=6πηrv 成立的首要条件是（ ）",
    answer: "B",
    options: { A: "小球高速运动", B: "小球低速运动且液体无涡流", C: "液体产生强烈涡流", D: "大体积球体运动" },
    explanation: "斯托克斯定律适用于低速、低雷诺数、无明显涡流的黏性流动。小球速度过快或液体出现强烈涡流时，公式不再适用。",
  },
  {
    key: "q2",
    module: "传统实验原理",
    type: "单项选择题",
    points: 5,
    title: "在落球法实验中，若小球在量筒中始终未达到匀速下落，则测得的粘滞系数会（ ）",
    answer: "A",
    options: { A: "偏大", B: "偏小", C: "不变", D: "无法判断" },
    explanation: "未达到匀速时，所取速度通常小于终端速度。由粘滞系数与速度成反比可知，速度偏小会使计算出的粘滞系数偏大。",
  },
  {
    key: "q3",
    module: "传统实验原理",
    type: "判断题",
    points: 5,
    title: "落球法测量液体粘滞系数时，小球释放时应尽量从液面处静止释放，避免初速度。",
    answer: "true",
    options: { true: "正确", false: "错误" },
    explanation: "释放时应尽量静止释放，避免人为给小球初速度，否则会影响下落过程和终端速度判断。",
  },
  {
    key: "q4",
    module: "传统实验原理",
    type: "判断题",
    points: 5,
    title: "受圆筒容器限制，实测速度 v0 小于理想无限宽广液体条件下的理论速度。",
    answer: "true",
    options: { true: "正确", false: "错误" },
    explanation: "容器壁会限制小球周围液体流动，增大等效阻力，使实测速度小于理想无限宽广液体中的速度。",
  },
  {
    key: "q5",
    module: "传统实验步骤",
    type: "单项选择题",
    points: 5,
    title: "传统落球法测液体粘滞系数实验中，两条标记线 L1、L2 的标准设置位置为（ ）",
    answer: "C",
    options: {
      A: "L1 在油面下方 3~4 cm，L2 在筒底上方 3~4 cm",
      B: "L1 在油面下方 5~6 cm，L2 在筒底上方 5~6 cm",
      C: "L1 在油面下方 7~8 cm，L2 在筒底上方 7~8 cm",
      D: "可根据实验需求随意设置标记线位置",
    },
    explanation: "标记线应避开液面附近和筒底附近的非稳定区域，保证测量区间尽量落在稳定下落段。",
  },
  {
    key: "q6",
    module: "传统实验步骤",
    type: "单项选择题",
    points: 5,
    title: "释放钢球的正确操作位置与方式是（ ）",
    answer: "A",
    options: { A: "量筒中心轴线上方同一高度静止释放", B: "紧贴量筒侧壁位置释放", C: "液面上方任意高度随手释放", D: "先给小球施加初速度再释放" },
    explanation: "小球应在量筒中心轴线附近静止释放，避免贴壁、偏斜和初速度对结果造成影响。",
  },
  {
    key: "q7",
    module: "传统实验步骤",
    type: "判断题",
    points: 5,
    title: "实验结束后，可利用磁铁将钢球从量筒中取出。",
    answer: "true",
    options: { true: "正确", false: "错误" },
    explanation: "钢球可用磁铁取出，便于整理仪器并减少对液体和量筒的扰动。",
  },
  {
    key: "q8",
    module: "传统实验步骤",
    type: "判断题",
    points: 5,
    title: "传统实验必须借助铅锤，将圆筒调整至竖直方向。",
    answer: "true",
    options: { true: "正确", false: "错误" },
    explanation: "量筒应保持竖直，避免小球偏离中心轴线或靠近筒壁下落。",
  },
  {
    key: "q9",
    module: "创新实验原理",
    type: "单项选择题",
    points: 7,
    title: "对层流条件的要求为雷诺数 Re 满足（ ）",
    answer: "A",
    options: { A: "Re < 1", B: "Re < 10", C: "Re < 20", D: "Re < 50" },
    explanation: "落球法使用 Stokes 公式时通常要求 Re < 1。若 Re 偏高，惯性效应增强，结果可信度下降。",
  },
  {
    key: "q10",
    module: "创新实验原理",
    type: "单项选择题",
    points: 7,
    title: "为减小容器壁效应，实验优先选用哪种容器（ ）",
    answer: "B",
    options: { A: "细径方筒容器", B: "大直径圆形筒容器", C: "小型玻璃试管", D: "锥形瓶" },
    explanation: "容器直径越大，小球相对筒壁越远，壁效应越弱。圆形大直径容器更适合落球法实验。",
  },
  {
    key: "q11",
    module: "创新实验原理",
    type: "判断题",
    points: 6,
    title: "牛顿流体的粘滞系数会随剪切速率变化而发生明显改变。",
    answer: "false",
    options: { true: "正确", false: "错误" },
    explanation: "牛顿流体在一定温度下粘滞系数与剪切速率无关或近似无关；随剪切速率明显变化的是非牛顿流体。",
  },
  {
    key: "q12",
    module: "创新实验原理",
    type: "判断题",
    points: 5,
    title: "满足“无限广延液体”条件，要求实验容器的内径越小效果越好。",
    answer: "false",
    options: { true: "正确", false: "错误" },
    explanation: "容器内径越小，筒壁影响越明显；要接近无限广延液体，应优先使用更大直径容器。",
  },
  {
    key: "q13",
    module: "创新实验步骤",
    type: "单项选择题",
    points: 7,
    title: "AI 视觉实验布设硬件时，加装偏振片与遮光板的主要作用是（ ）",
    answer: "B",
    options: { A: "增强液体整体亮度", B: "消除液面、器壁反光，保证小球成像清晰", C: "升高实验环境温度", D: "加快小球下落速度" },
    explanation: "偏振片与遮光板主要用于降低反光和杂散光，让小球轮廓更清晰，提高视觉识别稳定性。",
  },
  {
    key: "q14",
    module: "创新实验步骤",
    type: "单项选择题",
    points: 7,
    title: "AI 系统判定小球进入匀速下落区间的依据是（ ）",
    answer: "B",
    options: { A: "下落速度方差高于设定阈值", B: "下落速度方差低于阈值且持续一段时间", C: "位移数值突然变大", D: "位移数值突然变小" },
    explanation: "匀速段应表现为速度波动较小并持续稳定，因此系统会寻找速度方差较低且持续一段时间的区间。",
  },
  {
    key: "q15",
    module: "创新实验步骤",
    type: "单项选择题",
    points: 7,
    title: "AI 前置参数校验结果不合格时，系统会做出何种响应（ ）",
    answer: "A",
    options: { A: "弹窗提示更换小球", B: "忽略校验结果直接继续实验", C: "自动修改实验参数", D: "自动修正粘滞系数计算结果" },
    explanation: "前置参数校验用于发现实验条件风险。若参数不合格，系统应提示调整实验条件，而不是忽略或自动篡改结果。",
  },
  {
    key: "q16",
    module: "创新实验步骤",
    type: "判断题",
    points: 7,
    title: "未知液体盲测实验中，系统会匹配内置数据库，并输出液体种类的匹配置信度。",
    answer: "true",
    options: { true: "正确", false: "错误" },
    explanation: "未知液体盲测可以将测得的粘滞系数、温度等信息与内置数据库对照，输出候选液体与置信度。",
  },
  {
    key: "q17",
    module: "创新实验步骤",
    type: "判断题",
    points: 7,
    title: "若实验参数不满足斯托克斯适用条件，AI 系统会添加修正项继续使用该组数据。",
    answer: "false",
    options: { true: "正确", false: "错误" },
    explanation: "若参数明显不满足适用条件，系统应提示该组数据风险或建议重测，不能简单添加修正项后继续无条件使用。",
  },
];

const experimentStrictKeywords = [
  "落球", "粘滞", "黏滞", "粘度", "黏度", "粘性", "斯托克斯", "stokes", "终端速度", "匀速段", "雷诺", "雷诺数", "壁效应",
  "壁面效应", "器壁效应", "边界效应", "壁面", "筒壁", "管壁", "容器壁", "边界影响", "小球", "量筒", "量管", "容器", "管径", "液体", "甘油", "硅油", "密度", "浮力", "阻力", "轨迹", "速度曲线", "位移",
  "拟合", "标定", "折射", "释放", "初速度", "贴壁", "偏斜", "帧率", "摄像", "相机", "镜头", "像素", "roi", "视频追踪",
  "视觉测量", "ai视觉", "ai实验", "虚拟仿真", "粘滞系数", "黏滞系数", "实验流程", "实验步骤", "测量流程", "操作流程", "ai实验流程", "仿真流程",
];

const experimentContextKeywords = [
  "讲义", "试题", "题目", "错题", "本题", "这题", "上题", "第1题", "第2题", "第3题", "第4题", "答案", "解析",
  "准入", "测试", "实验大厅", "公式", "器材", "步骤", "流程", "操作", "方法", "原理", "误差", "数据", "结果",
];

const unrelatedTopicKeywords = [
  "天气", "股票", "基金", "旅游", "美食", "电影", "游戏", "明星", "八卦", "小说", "作文", "历史", "地理", "政治",
  "英语", "数学", "语文", "编程", "代码", "作业", "购物", "恋爱",
];

const presets = {
  "纯甘油 25℃": { rhoLiquid: 1261, etaReference: 0.945, radiusMm: 1.5, rhoBall: 7850, tubeDiameterMm: 35, liquidDepthMm: 220 },
  "500 cSt 硅油 25℃": { rhoLiquid: 970, etaReference: 0.485, radiusMm: 1.5, rhoBall: 7850, tubeDiameterMm: 35, liquidDepthMm: 210 },
  "纯甘油 20℃": { rhoLiquid: 1263, etaReference: 1.412, radiusMm: 1.5, rhoBall: 7850, tubeDiameterMm: 35, liquidDepthMm: 220 },
};

// Standard table values at the listed temperature. Viscosity is strongly temperature-dependent.
const simulationPresets = {
  standard: {
    note: "ρ=1261 kg/m³，η=0.945 Pa·s，纯甘油 25℃表值。",
    radius: 1.5,
    tube: 35,
    depth: 220,
    release: 0,
    damping: 0,
    stability: 1,
  },
  wall: {
    note: "ρ=1263 kg/m³，η=1.412 Pa·s，纯甘油 20℃表值。",
    radius: 1.5,
    tube: 35,
    depth: 220,
    release: 0,
    damping: 0,
    stability: 1,
  },
  glare: {
    note: "ρ=970 kg/m³，η=0.485 Pa·s，由 500 cSt 硅油和 25℃密度换算。",
    radius: 1.5,
    tube: 35,
    depth: 210,
    release: 0,
    damping: 0,
    stability: 1,
  },
  propylene_glycol_25: {
    note: "ρ=1036 kg/m³，η=0.0486 Pa·s，丙二醇 25℃表值。",
    radius: 1.5,
    tube: 35,
    depth: 220,
    release: 0,
    damping: 0,
    stability: 1,
  },
  ethylene_glycol_20: {
    note: "ρ=1113 kg/m³，η=0.0198 Pa·s，乙二醇 20℃表值。",
    radius: 1.2,
    tube: 45,
    depth: 240,
    release: 0,
    damping: 0,
    stability: 1,
  },
  ethanol_20: {
    note: "ρ=789 kg/m³，η=0.00120 Pa·s，无水乙醇 20℃表值；低粘度会明显提高 Re。",
    radius: 0.8,
    tube: 60,
    depth: 260,
    release: 0,
    damping: 0,
    stability: 1,
  },
  methanol_25: {
    note: "ρ=787 kg/m³，η=0.000543 Pa·s，甲醇 25℃表值；低粘度主要用于超限对比。",
    radius: 0.8,
    tube: 60,
    depth: 260,
    release: 0,
    damping: 0,
    stability: 1,
  },
  water_20: {
    note: "ρ=998.2 kg/m³，η=0.0010016 Pa·s，纯水 20℃表值；通常会偏离低 Re 条件。",
    radius: 0.8,
    tube: 60,
    depth: 260,
    release: 0,
    damping: 0,
    stability: 1,
  },
};

const assetMap = {
  readiness: ["diagnostic", "run", "chat", "calibration"],
  buttons: {
    loadRecord: "./assets/generated/buttons/load-record.png",
    diagnostic: "./assets/generated/icons/diagnostic.png",
  },
  diagnostic: {
    ok: "./assets/generated/icons/calibration.png",
    warn: "./assets/generated/icons/diagnostic.png",
    danger: "./assets/generated/icons/diagnostic.png",
  },
};

function number(input, fallback = null) {
  const value = Number.parseFloat(input?.value);
  return Number.isFinite(value) ? value : fallback;
}

function finiteNumber(value, fallback = null) {
  if (value === null || value === undefined || value === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function fixed(value, digits = 3, fallback = "--") {
  const parsed = finiteNumber(value);
  return parsed === null ? fallback : parsed.toFixed(digits);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function ensureSimulationNumber(value, label) {
  const parsed = finiteNumber(value);
  if (parsed === null) {
    throw new Error(`仿真结果缺少${label}`);
  }
  return parsed;
}

function correctedViscosityFromInputs(params, terminalVelocity, iterations = 8) {
  const radiusM = params.radiusMm / 1000;
  const tubeRadiusM = params.tubeDiameterMm / 2000;
  const liquidDepthM = params.liquidDepthMm / 1000;
  if (
    !Number.isFinite(radiusM) ||
    !Number.isFinite(tubeRadiusM) ||
    !Number.isFinite(liquidDepthM) ||
    !Number.isFinite(params.rhoBall) ||
    !Number.isFinite(params.rhoLiquid) ||
    !Number.isFinite(terminalVelocity) ||
    radiusM <= 0 ||
    tubeRadiusM <= 0 ||
    liquidDepthM <= 0 ||
    terminalVelocity <= 0 ||
    params.rhoBall <= params.rhoLiquid
  ) {
    return null;
  }
  const base = (2 * radiusM * radiusM * (params.rhoBall - params.rhoLiquid) * 9.80665) / (9 * terminalVelocity);
  let viscosity = Math.max(base, 1e-12);
  let factors = null;
  for (let index = 0; index < iterations; index += 1) {
    factors = correctionFactors(radiusM, tubeRadiusM, liquidDepthM, params.rhoLiquid, terminalVelocity, viscosity);
    viscosity = Math.max(base / factors.correctionTotal, 1e-12);
  }
  return viscosity;
}

function correctionFactors(radiusM, tubeRadiusM, liquidDepthM, rhoLiquid, terminalVelocity, viscosity) {
  const safeTubeRadius = Math.max(tubeRadiusM, radiusM * 1.04, 1e-6);
  const safeDepth = Math.max(liquidDepthM, radiusM * 4, 1e-6);
  const safeViscosity = Math.max(viscosity, 1e-12);
  const reynolds = (rhoLiquid * terminalVelocity * 2 * radiusM) / safeViscosity;
  const wallCorrection = (1 + 2.4 * radiusM / safeTubeRadius) * (1 + 3.3 * radiusM / safeDepth);
  const reynoldsCorrection = Math.max(0.15, 1 + (3 * reynolds) / 16 - (19 * reynolds * reynolds) / 1080);
  return {
    reynolds,
    wallCorrection,
    reynoldsCorrection,
    correctionTotal: wallCorrection * reynoldsCorrection,
  };
}

function formatPercent(value) {
  const parsed = finiteNumber(value);
  if (parsed === null) return "--";
  const percent = parsed * 100;
  return `${percent < 0.1 ? percent.toFixed(3) : percent.toFixed(2)}%`;
}

function formatPaS(value) {
  const parsed = finiteNumber(value);
  if (parsed === null) return "--";
  const absolute = Math.abs(parsed);
  if (absolute >= 1) return parsed.toFixed(3);
  if (absolute >= 0.01) return parsed.toFixed(4);
  if (absolute >= 0.0001) return parsed.toFixed(6);
  return parsed.toExponential(2);
}

function idealViscosityFromRun(run) {
  const result = run?.result || {};
  const direct = finiteNumber(result.ideal_viscosity);
  if (direct !== null) return direct;
  const params = run?.params || {};
  const terminalVelocity = finiteNumber(result.terminal_velocity);
  const radiusMm = finiteNumber(params.radius_mm);
  const rhoBall = finiteNumber(params.rho_ball);
  const rhoLiquid = finiteNumber(params.rho_liquid);
  if (
    terminalVelocity === null ||
    radiusMm === null ||
    rhoBall === null ||
    rhoLiquid === null ||
    terminalVelocity <= 0 ||
    radiusMm <= 0 ||
    rhoBall <= rhoLiquid
  ) {
    return null;
  }
  const radiusM = radiusMm / 1000;
  return (2 * radiusM * radiusM * (rhoBall - rhoLiquid) * 9.80665) / (9 * terminalVelocity);
}

function estimateUniformSegmentSpan(run, terminalVelocity) {
  const velocityCurve = run?.curves?.velocity || [];
  const positionCurve = run?.curves?.position || [];
  const segment = run?.segment || {};
  if (!velocityCurve.length && !positionCurve.length) return null;
  const startIndex = Math.max(0, Math.min(Number(segment.start) || 0, Math.max(0, velocityCurve.length - 1)));
  const endIndex = Math.max(startIndex + 1, Math.min(Number(segment.end) || velocityCurve.length - 1, Math.max(0, velocityCurve.length - 1)));
  const startVelocityPoint = velocityCurve[startIndex];
  const endVelocityPoint = velocityCurve[endIndex] || velocityCurve[velocityCurve.length - 1];
  let timeS = finiteNumber(endVelocityPoint?.t) - finiteNumber(startVelocityPoint?.t);
  if (!Number.isFinite(timeS) || timeS <= 0) {
    const firstPosition = positionCurve[0];
    const lastPosition = positionCurve[positionCurve.length - 1];
    timeS = finiteNumber(lastPosition?.t) - finiteNumber(firstPosition?.t);
  }
  if (!Number.isFinite(timeS) || timeS <= 0) return null;
  const positionStart = positionCurve[Math.min(startIndex + 1, Math.max(0, positionCurve.length - 1))];
  const positionEnd = positionCurve[Math.min(endIndex + 1, Math.max(0, positionCurve.length - 1))];
  let distanceM = Math.abs(finiteNumber(positionEnd?.y) - finiteNumber(positionStart?.y));
  if (!Number.isFinite(distanceM) || distanceM <= 0) {
    distanceM = terminalVelocity * timeS;
  }
  if (!Number.isFinite(distanceM) || distanceM <= 0) return null;
  return { timeS, distanceM };
}

function formatUniformSegmentLength(span) {
  const distanceM = finiteNumber(span?.distanceM);
  if (distanceM === null || distanceM <= 0) return "--";
  const distanceMm = distanceM * 1000;
  if (distanceMm >= 100) return `${(distanceMm / 10).toFixed(1)} cm`;
  return `${distanceMm.toFixed(1)} mm`;
}

function payload() {
  return {
    params: {
      liquid: el.liquid.value,
      rho_liquid: number(el.rhoLiquid),
      eta_reference: number(el.etaReference),
      radius_mm: number(el.radiusMm),
      rho_ball: number(el.rhoBall),
      tube_diameter_mm: number(el.tubeDiameterMm),
      liquid_depth_mm: number(el.liquidDepthMm),
      noise_level: 0,
      refraction_level: 0,
      temperature_c: number(el.temperatureC),
    },
    student: {
      student_v: number(el.studentV),
      student_eta: number(el.studentEta),
    },
  };
}

function apiUrl(path) {
  if (/^https?:\/\//i.test(path)) return path;
  return `${API_BASE_URL}${path}`;
}

async function api(path, options = {}) {
  let response;
  try {
    response = await fetch(apiUrl(path), {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {}),
      },
    });
  } catch (error) {
    if (API_BASE_URL) {
      throw new Error(`无法连接后端 ${API_BASE_URL}。请确认服务器后端已经启动，或在网址参数 ?api= 中指定可用后端地址。`);
    }
    throw error;
  }
  if (!response.ok) {
    let detail = `${response.status} ${response.statusText}`;
    try {
      const errorPayload = await response.json();
      detail = errorPayload.error || detail;
    } catch {
      detail = `${response.status} ${response.statusText}`;
    }
    throw new Error(detail);
  }
  return response.json();
}

function visionRuntimeMessage(runtime) {
  if (!runtime) return "OpenCV运行环境未返回状态。";
  if (runtime.available) {
    return `OpenCV ${runtime.version || ""} 可用`.trim();
  }
  return runtime.error || runtime.install_hint || "OpenCV未安装或当前服务器未使用项目虚拟环境。";
}

async function ensureVisionRuntimeReady() {
  const runtime = await api("/api/vision/runtime");
  if (runtime.available) return runtime;
  const detail = visionRuntimeMessage(runtime);
  if (el.liveCameraStatus) el.liveCameraStatus.textContent = "实时预览中";
  if (el.liveModelStatus) el.liveModelStatus.textContent = "OpenCV不可用";
  if (el.liveReadinessLabel) el.liveReadinessLabel.textContent = "识别引擎未就绪";
  if (el.liveReadinessDetail) {
    el.liveReadinessDetail.textContent = `当前服务器没有加载 OpenCV，无法逐帧识别小球。请用项目 .venv 启动平台，或安装 opencv-python 后重启服务器。详情：${detail}`;
  }
  updateFileQueue("OpenCV运行环境", "失败", detail);
  throw new Error(detail);
}

async function uploadRunVideo(runId, blob) {
  if (!runId || !blob?.size) return null;
  const response = await fetch(apiUrl(`/api/runs/${runId}/video`), {
    method: "POST",
    headers: { "Content-Type": blob.type || "video/webm" },
    body: blob,
  });
  if (!response.ok) {
    let detail = `${response.status} ${response.statusText}`;
    try {
      const payload = await response.json();
      detail = payload.error || detail;
    } catch {
      detail = `${response.status} ${response.statusText}`;
    }
    throw new Error(detail);
  }
  return response.json();
}

async function checkHealth() {
  try {
    await api("/api/health");
    if (el.serverStatus) el.serverStatus.textContent = "后端在线";
    if (el.statusDot) el.statusDot.classList.add("online");
  } catch {
    if (el.serverStatus) el.serverStatus.textContent = "后端未连接";
    if (el.statusDot) el.statusDot.classList.remove("online");
  }
}

async function uploadTrajectory() {
  if (state.source === "realtime") {
    describeRealtimeTracking();
    return;
  }
  if (state.source === "video") {
    await inspectSelectedVideo();
    return;
  }
  if (state.source !== "trajectory") {
    showToast("当前数据源还没有接入分析接口。");
    return;
  }
  const file = el.trajectoryInput.files?.[0];
  if (!file) {
    showToast("请先选择CSV轨迹文件。");
    return;
  }
  setButtonLoading(el.uploadTrajectoryBtn, true, "分析中");
  updateFileQueue(file.name, "处理中", "正在解析CSV轨迹并提交后端分析。");
  try {
    const text = await file.text();
    const trajectory = parseTrajectoryCsv(text);
    const body = payload();
    body.trajectory = trajectory;
    const run = await api("/api/measurements/trajectory", {
      method: "POST",
      body: JSON.stringify(body),
    });
    state.latest = run;
    renderRun(run);
    await loadRecords();
    updateFileQueue(file.name, "已完成", `已保存记录 #${run.id}`);
    showToast(`轨迹CSV分析完成，已保存记录 #${run.id}`);
  } catch (error) {
    updateFileQueue(file.name, "失败", error.message);
    showToast(`CSV分析失败：${error.message}`);
  } finally {
    setButtonLoading(el.uploadTrajectoryBtn, false);
  }
}

function describeRealtimeTracking() {
  const rodLength = Number(el.calibrationRodLengthMm?.value || 300);
  const samples = getCalibrationTargetCount();
  const tickSpacing = Number(el.rodTickSpacingMm?.value || 50);
  const detail = `先完成标定：长度 ${rodLength || 300} mm，刻度间距 ${tickSpacing || 50} mm，点击 ${samples || 7} 个刻度点。随后释放小球，系统实时输出轨迹。`;
  updateFileQueue("实时视觉追踪方案", "已读取", detail);
  if (el.liveModelStatus) el.liveModelStatus.textContent = "OpenCV后端可用";
  if (el.liveCalibrationStatus) el.liveCalibrationStatus.textContent = "等待标定棒";
  if (el.liveReadinessLabel) el.liveReadinessLabel.textContent = "OpenCV方案可实现";
  if (el.liveReadinessDetail) el.liveReadinessDetail.textContent = "本机后端已有视频追踪接口。手机画面接入后，先点选标定棒刻度建立非线性映射，再录制一次落球视频送入 OpenCV 输出轨迹。";
  showToast("OpenCV实时追踪方案已写入操作区。");
}

function parseTrajectoryCsv(text) {
  const rows = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.split(",").map((cell) => cell.trim()));
  if (rows.length < 12) {
    throw new Error("CSV至少需要12行轨迹点");
  }

  const first = rows[0].map((cell) => cell.toLowerCase());
  const hasHeader = first.some((cell) => Number.isNaN(Number.parseFloat(cell)));
  const header = hasHeader ? first : ["t", "y"];
  const body = hasHeader ? rows.slice(1) : rows;
  const indexOf = (names, fallback) => {
    const index = header.findIndex((cell) => names.includes(cell));
    return index >= 0 ? index : fallback;
  };
  const tIndex = indexOf(["t", "time", "时间"], 0);
  const yIndex = indexOf(["y", "position", "corrected_y", "位移"], 1);
  const xIndex = indexOf(["x"], -1);

  const trajectory = body.map((row, index) => ({
    t: Number.parseFloat(row[tIndex] ?? index * 0.02),
    y: Number.parseFloat(row[yIndex]),
    x: xIndex >= 0 ? Number.parseFloat(row[xIndex]) : 0.5,
  }));
  if (trajectory.some((point) => !Number.isFinite(point.t) || !Number.isFinite(point.y))) {
    throw new Error("CSV需要包含可解析的时间和位移列");
  }
  return trajectory;
}

function setButtonLoading(button, loading, label) {
  if (!button) return;
  if (!button.dataset.defaultLabel) {
    button.dataset.defaultLabel = button.querySelector("span")?.textContent || button.textContent.trim();
  }
  button.disabled = loading;
  button.classList.toggle("is-loading", loading);
  const labelNode = button.querySelector("span");
  if (labelNode) labelNode.textContent = loading ? label : button.dataset.defaultLabel;
}

function setDataSource(sourceKey) {
  const source = dataSources[sourceKey] || dataSources.trajectory;
  state.source = dataSources[sourceKey] ? sourceKey : "trajectory";
  document.body.dataset.source = state.source;
  el.sourceStatus.textContent = source.status;
  el.activeSourceName.textContent = source.name;
  el.activeSourceDetail.textContent = source.detail;
  el.sourceSchemaTitle.textContent = source.schemaTitle;
  el.sourceSchemaDetail.textContent = source.schemaDetail;
  el.trajectoryInput.accept = source.accept;
  el.uploadTrajectoryBtn.disabled = !source.enabled;
  el.uploadTrajectoryBtn.classList.toggle("disabled", !source.enabled);
  el.uploadTrajectoryBtn.querySelector("span").textContent = source.actionLabel;
  el.uploadTrajectoryBtn.dataset.defaultLabel = source.actionLabel;
  el.trajectoryInput.value = "";
  el.selectedFileName.textContent = "尚未选择文件";
  el.selectedFileName.hidden = state.source === "realtime";
  if (el.filePicker) el.filePicker.hidden = state.source === "realtime";
  el.videoImportPanel.hidden = state.source !== "video";
  el.realtimeImportPanel.hidden = state.source !== "realtime";
  if (state.source !== "video") resetVideoPreview();
  if (state.source !== "realtime") {
    el.realtimeImportPanel?.classList.remove("calibration-focus");
  }
  if (state.source === "video") {
    updateFileQueue("等待实验视频", "待选择", "选择真实落球视频后，会先读取预览与元信息。");
  } else if (state.source === "realtime") {
    updateLiveCalibrationStatus();
    updateFileQueue("等待手机实时画面", "待选择", "连接手机摄像头或系统摄像头后，先用中心标定棒完成 OpenCV 标定。");
  } else if (state.source === "trajectory") {
    updateFileQueue("等待真实轨迹文件", "待选择", "选择 CSV 后会显示待分析文件和处理状态。");
  }
  const pickerText = document.querySelector(".file-picker span");
  if (pickerText) pickerText.textContent = source.pickerLabel;
  document.querySelectorAll("[data-source]").forEach((button) => {
    button.classList.toggle("active", button.dataset.source === sourceKey);
  });
}

function handleCalibrationConfigChange() {
  syncCalibrationTargetCount();
  if (state.calibrationPoints.length || state.axisCalibrationPoints.length || state.manualScaleMPerPx) {
    state.calibrationMode = false;
    state.calibrationVisualsHidden = false;
    state.calibrationPoints = [];
    state.axisCalibrationPoints = [];
    state.manualScaleMPerPx = null;
    if (el.calibrationClickLayer) {
      el.calibrationClickLayer.disabled = true;
      el.calibrationClickLayer.classList.remove("is-calibrating");
      delete el.calibrationClickLayer.dataset.hint;
    }
    renderCalibrationPoints();
  }
  updateLiveCalibrationStatus();
  updateNonlinearCorrectionStatus();
}

function syncCalibrationTargetCount() {
  if (el.calibrationRodSamples) {
    el.calibrationRodSamples.textContent = String(getCalibrationTargetCount());
  }
}

function updateSelectedFile() {
  const file = el.trajectoryInput.files?.[0];
  el.selectedFileName.hidden = state.source === "realtime";
  if (!file) {
    el.selectedFileName.textContent = "尚未选择文件";
    if (state.source === "video") resetVideoPreview();
    return;
  }
  el.selectedFileName.textContent = `${file.name} · ${formatFileSize(file.size)}`;
  if (state.source === "realtime") {
    updateFileQueue(file.name, "待预检", "已选择备用视频；可以切换到“摄像机视频”读取元信息，或保留实时模式连接手机画面。");
    return;
  }
  if (state.source === "video") {
    prepareVideoPreview(file);
    return;
  }
  if (state.source === "trajectory") {
    updateFileQueue(file.name, "待分析", "文件已选择，等待提交分析。");
  }
}

function refreshLiveOverlayGeometry() {
  updateCylinderOverlay();
  renderCalibrationPoints();
  if (FALL_OFFSET_MONITOR_ENABLED && state.liveTrajectory.length) {
    updateFallOffsetStatus(state.liveTrajectory[state.liveTrajectory.length - 1]);
  }
}

function updateFileQueue(name, status, detail) {
  const statusClass = {
    待选择: "queued",
    待分析: "queued",
    待预检: "queued",
    未启用: "queued",
    处理中: "running",
    预检中: "running",
    已读取: "done",
    已完成: "done",
    失败: "failed",
  }[status] || "queued";
  el.fileQueue.innerHTML = `
    <article class="${statusClass}">
      <span>${status}</span>
      <strong>${name}</strong>
      <p>${detail}</p>
    </article>
  `;
}

function resetVideoPreview() {
  if (state.videoUrl) {
    URL.revokeObjectURL(state.videoUrl);
    state.videoUrl = null;
  }
  delete el.videoPreview.dataset.archiveRun;
  el.videoPreview.removeAttribute("src");
  el.videoPreview.load();
  el.videoFrame?.classList.remove("has-archived-video");
  el.videoPlaceholder.hidden = false;
  el.videoDuration.textContent = "--";
  el.videoResolution.textContent = "--";
  el.videoSize.textContent = "--";
  el.videoFps.textContent = "需后端解码";
  el.videoReadinessLabel.textContent = "等待视频";
  el.videoReadinessDetail.textContent = "当前只读取视频元信息，不生成轨迹点或粘度结果。";
}

function showRecordedVideo(run) {
  const video = run?.video;
  if (!video?.url || !el.videoPreview) {
    if (state.source === "video") {
      el.videoReadinessLabel.textContent = "无历史录像";
      el.videoReadinessDetail.textContent = "这条记录没有保存摄像机视频，只能回看速度曲线、粘度结果和不确定度。";
    }
    return;
  }
  setDataSource("video");
  delete el.videoPreview.dataset.archiveRun;
  el.videoPreview.dataset.archiveRun = String(run.id || "");
  el.videoPreview.src = video.url;
  el.videoPreview.load();
  el.videoPlaceholder.hidden = true;
  el.videoFrame?.classList.add("has-archived-video");
  el.selectedFileName.hidden = false;
  el.selectedFileName.textContent = `历史录像 #${run.id} · ${formatFileSize(video.size || 0)}`;
  el.videoDuration.textContent = "读取中";
  el.videoResolution.textContent = "读取中";
  el.videoSize.textContent = formatFileSize(video.size || 0);
  el.videoFps.textContent = "历史录像";
  el.videoReadinessLabel.textContent = "历史录像已载入";
  el.videoReadinessDetail.textContent = "可在此回放本次实验录像，并与右侧速度曲线、粘度结果和不确定度对照。";
}

function updateLiveCalibrationStatus() {
  if (!el.liveCalibrationStatus) return;
  const rodLength = Number(el.calibrationRodLengthMm?.value || 300);
  const rodDiameter = Number(el.calibrationRodDiameterMm?.value || 3);
  const tickSpacing = Number(el.rodTickSpacingMm?.value || 50);
  const targetCount = getCalibrationTargetCount();
  const paramsValid = rodLength >= 50 && rodDiameter > 0 && tickSpacing > 0 && targetCount >= 3;
  const pointsReady = state.axisCalibrationPoints.length >= 2 && Number.isFinite(state.manualScaleMPerPx);
  const selectedReady = state.calibrationMode && calibrationPointsReady();
  if (!paramsValid) {
    el.liveCalibrationStatus.textContent = "参数需补齐";
    if (el.liveReadinessDetail) el.liveReadinessDetail.textContent = "请补齐标定棒直径、长度、刻度间距和点击点数。";
    return;
  }
  if (selectedReady) {
    el.liveCalibrationStatus.textContent = "等待确认标定";
    if (el.liveReadinessDetail) {
      el.liveReadinessDetail.textContent = "标定点已点齐。若有点位错误，可以直接点击该点删除并重新点选；确认无误后点击完成标定。";
    }
    return;
  }
  if (pointsReady) {
    el.liveCalibrationStatus.textContent = "多点标定完成";
    if (el.liveReadinessDetail) {
      el.liveReadinessDetail.textContent = `已建立 ${state.axisCalibrationPoints.length} 点非线性映射，平均比例 ${formatMetersPerPixel(state.manualScaleMPerPx)}。现在可以取出标定棒，点击开始实时追踪后释放小球。`;
    }
    return;
  }
  el.liveCalibrationStatus.textContent = "等待点选刻度";
  if (el.liveReadinessDetail) {
    el.liveReadinessDetail.textContent = `参数已就绪：直径 ${rodDiameter} mm，长度 ${rodLength} mm，刻度间距 ${tickSpacing} mm。请点击“开始标定”，从上到下点 ${targetCount} 个刻度。`;
  }
}

function startManualCalibration() {
  if (!el.calibrationClickLayer) return;
  if (!state.liveStream && !el.videoPreview?.src) {
    showToast("请先连接实时画面，或选择实验视频作为标定画面。");
  }
  state.calibrationMode = true;
  state.calibrationVisualsHidden = false;
  state.calibrationPoints = [];
  state.calibrationEditIndex = null;
  state.axisCalibrationPoints = [];
  state.manualScaleMPerPx = null;
  el.calibrationClickLayer.disabled = false;
  el.calibrationClickLayer.classList.add("is-calibrating");
  el.calibrationClickLayer.dataset.hint = calibrationClickHint(0);
  if (el.finishCalibrationBtn) el.finishCalibrationBtn.hidden = true;
  el.realtimeImportPanel?.classList.add("calibration-focus");
  enterLiveFullscreen("calibration");
  renderCalibrationPoints();
  updateLiveCalibrationStatus();
  if (el.calibrationPointStatus) el.calibrationPointStatus.textContent = `0/${getCalibrationTargetCount()}`;
  showToast(`请从标定棒上端开始，按顺序点击 ${getCalibrationTargetCount()} 个刻度点。`);
}

function resetManualCalibration() {
  resetManualCalibrationState();
  showToast("已重置手动标定点。");
}

function resetManualCalibrationState() {
  state.calibrationMode = false;
  state.calibrationVisualsHidden = false;
  state.calibrationPoints = [];
  state.calibrationEditIndex = null;
  state.axisCalibrationPoints = [];
  state.manualScaleMPerPx = null;
  if (el.calibrationClickLayer) {
    el.calibrationClickLayer.disabled = true;
    el.calibrationClickLayer.classList.remove("is-calibrating");
    delete el.calibrationClickLayer.dataset.hint;
  }
  if (el.finishCalibrationBtn) el.finishCalibrationBtn.hidden = true;
  hideLiveMagnifier();
  exitCalibrationFullscreen();
  renderCalibrationPoints();
  updateLiveCalibrationStatus();
  updateNonlinearCorrectionStatus();
}

function handleCalibrationClick(event) {
  if (!state.calibrationMode || !el.calibrationClickLayer) return;
  const clickedPoint = event.target.closest?.(".calibration-point");
  if (clickedPoint && el.calibrationClickLayer.contains(clickedPoint)) {
    deleteCalibrationPoint(Number(clickedPoint.dataset.index));
    return;
  }
  if (calibrationPointsReady()) {
    showToast("标定点已点齐。点错的标定点可先删除，确认无误后点击“完成标定”。");
    return;
  }
  const rect = el.calibrationClickLayer.getBoundingClientRect();
  const mediaPoint = calibrationMediaPoint(event, rect);
  const displayPoint = mediaNormToLayerPoint(mediaPoint.xNorm, mediaPoint.yNorm, rect);
  const point = {
    x: displayPoint.xPct / 100,
    y: displayPoint.yPct / 100,
    xNorm: mediaPoint.xNorm,
    yNorm: mediaPoint.yNorm,
  };
  const targetCount = getCalibrationTargetCount();
  const missingIndex = firstMissingCalibrationIndex();
  const targetIndex = Number.isInteger(state.calibrationEditIndex) ? state.calibrationEditIndex : missingIndex;
  const writeIndex = targetIndex >= 0 ? targetIndex : Math.min(state.calibrationPoints.length, targetCount - 1);
  state.calibrationPoints[writeIndex] = point;
  state.calibrationEditIndex = null;
  if (calibrationPointsReady()) {
    el.calibrationClickLayer.dataset.hint = "标定点已齐 · 点错可点击删除 · 确认后点完成标定";
    if (el.finishCalibrationBtn) el.finishCalibrationBtn.hidden = false;
  } else if (el.calibrationClickLayer) {
    el.calibrationClickLayer.dataset.hint = calibrationClickHint(firstMissingCalibrationIndex());
  }
  renderCalibrationPoints();
  updateLiveCalibrationStatus();
}

function deleteCalibrationPoint(index) {
  const targetCount = getCalibrationTargetCount();
  if (!Number.isInteger(index) || index < 0 || index >= targetCount || !state.calibrationPoints[index]) return;
  state.calibrationPoints[index] = null;
  state.calibrationEditIndex = index;
  state.axisCalibrationPoints = [];
  state.manualScaleMPerPx = null;
  state.calibrationMode = true;
  if (el.calibrationClickLayer) {
    el.calibrationClickLayer.disabled = false;
    el.calibrationClickLayer.classList.add("is-calibrating");
    el.calibrationClickLayer.dataset.hint = calibrationClickHint(index).replace("点击", "重新点击");
  }
  if (el.finishCalibrationBtn) el.finishCalibrationBtn.hidden = true;
  renderCalibrationPoints();
  updateLiveCalibrationStatus();
  updateNonlinearCorrectionStatus();
  showToast(`已删除 ${Math.round(calibrationDistanceMmAt(index) || 0)} mm 标定点，请重新点这个刻度。`);
}

function finishManualCalibration() {
  if (!calibrationPointsReady()) {
    const nextIndex = firstMissingCalibrationIndex();
    if (el.calibrationClickLayer && nextIndex >= 0) {
      el.calibrationClickLayer.dataset.hint = calibrationClickHint(nextIndex);
    }
    showToast("还有标定点未补齐，请先点完缺失刻度。");
    return;
  }
  const distancePx = calibrationPixelDistance();
  const rodSpanM = calibrationMappedSpanMeters();
  if (!distancePx || !Number.isFinite(rodSpanM) || rodSpanM <= 0) {
    showToast("标定点距离无效，请重新点选。");
    resetManualCalibration();
    return;
  }
  state.axisCalibrationPoints = buildAxisCalibrationPoints();
  state.manualScaleMPerPx = rodSpanM / distancePx;
  state.calibrationMode = false;
  state.calibrationVisualsHidden = false;
  state.calibrationEditIndex = null;
  hideLiveMagnifier();
  exitCalibrationFullscreen();
  if (el.calibrationClickLayer) {
    el.calibrationClickLayer.disabled = true;
    el.calibrationClickLayer.classList.remove("is-calibrating");
    delete el.calibrationClickLayer.dataset.hint;
  }
  if (el.finishCalibrationBtn) el.finishCalibrationBtn.hidden = true;
  renderCalibrationPoints();
  updateLiveCalibrationStatus();
  updateNonlinearCorrectionStatus();
  showToast("多点标定完成，已生成非线性映射。");
}

function livePreviewFrame() {
  return el.livePreview?.closest(".live-preview-frame") || el.calibrationClickLayer?.closest(".live-preview-frame");
}

function isLiveFullscreenActive() {
  const frame = livePreviewFrame();
  return Boolean(frame && (frame.classList.contains("calibration-fullscreen-fallback") || document.fullscreenElement === frame));
}

function updateLiveZoomControls(activeOverride = null) {
  const active = typeof activeOverride === "boolean" ? activeOverride : isLiveFullscreenActive();
  const frame = livePreviewFrame();
  frame?.classList.toggle("is-live-zoomed", active);
  if (el.toggleLiveZoomBtn) {
    const label = el.toggleLiveZoomBtn.querySelector("span");
    if (label) label.textContent = active ? "缩小画面" : "放大画面";
    el.toggleLiveZoomBtn.setAttribute("aria-pressed", active ? "true" : "false");
  }
  if (el.exitCalibrationFullscreenBtn) {
    el.exitCalibrationFullscreenBtn.hidden = !active;
  }
  if (el.liveManualZoomControls) {
    el.liveManualZoomControls.hidden = !active;
  }
  if (!active) {
    setManualZoomTargeting(false);
  }
  updateManualZoomControls();
}

async function enterLiveFullscreen(mode = "zoom") {
  const frame = livePreviewFrame();
  if (!frame) return;
  state.liveZoomMode = mode;
  frame.classList.add("calibration-fullscreen-fallback");
  frame.dataset.zoomMode = mode;
  document.body.classList.add("calibration-fullscreen-active");
  updateLiveZoomControls();
  try {
    if (!document.fullscreenElement && frame.requestFullscreen) {
      await frame.requestFullscreen();
    }
  } catch {
    // If native fullscreen is blocked, the fixed-position fallback still gives a fullscreen canvas.
  } finally {
    updateLiveZoomControls();
  }
}

function enterCalibrationFullscreen() {
  return enterLiveFullscreen("calibration");
}

function exitCalibrationFullscreen() {
  hideLiveMagnifier();
  resetManualVideoZoom();
  el.realtimeImportPanel?.classList.remove("calibration-focus");
  const frame = livePreviewFrame();
  const shouldExitNative = document.fullscreenElement === frame && document.exitFullscreen;
  frame?.classList.remove("calibration-fullscreen-fallback");
  frame?.classList.remove("is-live-zoomed");
  if (frame?.dataset) delete frame.dataset.zoomMode;
  document.body.classList.remove("calibration-fullscreen-active");
  state.liveZoomMode = null;
  state.cylinderEdgeZoomStarted = false;
  state.roiZoomStarted = false;
  if (shouldExitNative) {
    document.exitFullscreen().catch(() => {});
  }
  updateLiveZoomControls(false);
  window.requestAnimationFrame(() => {
    refreshLiveOverlayGeometry();
    renderCalibrationPoints();
    renderCylinderEdgeMarks();
    renderRoiPersistent();
  });
  window.setTimeout(() => {
    refreshLiveOverlayGeometry();
    renderCalibrationPoints();
    renderCylinderEdgeMarks();
    renderRoiPersistent();
  }, 80);
}

function handleFullscreenChange() {
  const frame = livePreviewFrame();
  if (!document.fullscreenElement) {
    frame?.classList.remove("calibration-fullscreen-fallback");
    frame?.classList.remove("is-live-zoomed");
    if (frame?.dataset) delete frame.dataset.zoomMode;
    document.body.classList.remove("calibration-fullscreen-active");
    el.realtimeImportPanel?.classList.remove("calibration-focus");
    state.liveZoomMode = null;
    state.cylinderEdgeZoomStarted = false;
    state.roiZoomStarted = false;
    hideLiveMagnifier();
    resetManualVideoZoom();
    updateLiveZoomControls(false);
  } else {
    updateLiveZoomControls();
  }
  window.requestAnimationFrame(() => {
    refreshLiveOverlayGeometry();
    renderCalibrationPoints();
    renderCylinderEdgeMarks();
    renderRoiPersistent();
  });
  window.setTimeout(() => {
    refreshLiveOverlayGeometry();
    renderCalibrationPoints();
    renderCylinderEdgeMarks();
    renderRoiPersistent();
  }, 80);
}

function toggleLiveZoom() {
  if (isLiveFullscreenActive()) {
    exitCalibrationFullscreen();
    return;
  }
  enterLiveFullscreen(state.liveTracking ? "tracking" : "zoom");
}

function applyManualVideoZoom() {
  const frame = livePreviewFrame();
  if (!frame) return;
  const scale = Number.isFinite(state.manualZoomScale) ? clamp(state.manualZoomScale, 1, 5) : 1;
  const originX = Number.isFinite(state.manualZoomOrigin?.x) ? clamp(state.manualZoomOrigin.x, 0, 100) : 50;
  const originY = Number.isFinite(state.manualZoomOrigin?.y) ? clamp(state.manualZoomOrigin.y, 0, 100) : 50;
  frame.style.setProperty("--manual-zoom", scale.toFixed(3));
  frame.style.setProperty("--manual-origin-x", `${originX.toFixed(2)}%`);
  frame.style.setProperty("--manual-origin-y", `${originY.toFixed(2)}%`);
  frame.classList.toggle("is-manual-zoomed", scale > 1.001);
  updateManualZoomControls();
  window.requestAnimationFrame(() => {
    refreshLiveOverlayGeometry();
    renderCalibrationPoints();
    renderCylinderEdgeMarks();
    renderRoiPersistent();
  });
}

function resetManualVideoZoom() {
  state.manualZoomScale = 1;
  state.manualZoomOrigin = { x: 50, y: 50 };
  state.manualZoomActive = false;
  const frame = livePreviewFrame();
  frame?.style.setProperty("--manual-zoom", "1");
  frame?.style.setProperty("--manual-origin-x", "50%");
  frame?.style.setProperty("--manual-origin-y", "50%");
  frame?.classList.remove("is-manual-zoomed");
  setManualZoomTargeting(false);
  updateManualZoomControls();
  window.requestAnimationFrame(() => {
    refreshLiveOverlayGeometry();
    renderCalibrationPoints();
    renderCylinderEdgeMarks();
    renderRoiPersistent();
  });
}

function setManualZoomTargeting(active) {
  state.manualZoomActive = Boolean(active && isLiveFullscreenActive());
  if (el.liveZoomTargetLayer) el.liveZoomTargetLayer.hidden = !state.manualZoomActive;
  updateManualZoomControls();
}

function toggleManualZoomTargeting() {
  if (!isLiveFullscreenActive()) {
    enterLiveFullscreen(state.liveTracking ? "tracking" : "zoom");
    window.setTimeout(() => setManualZoomTargeting(true), 120);
    return;
  }
  setManualZoomTargeting(!state.manualZoomActive);
}

function updateManualZoomControls() {
  const active = isLiveFullscreenActive();
  if (el.liveManualZoomControls) el.liveManualZoomControls.hidden = !active;
  if (el.toggleLiveMagnifyBtn) {
    el.toggleLiveMagnifyBtn.setAttribute("aria-pressed", state.manualZoomActive ? "true" : "false");
    const label = el.toggleLiveMagnifyBtn.querySelector("span");
    if (label) label.textContent = state.manualZoomActive ? `选点放大 ${state.manualZoomScale.toFixed(1)}x` : `放大镜 ${state.manualZoomScale.toFixed(1)}x`;
  }
}

function handleManualZoomTargetClick(event) {
  if (!state.manualZoomActive) return;
  event.preventDefault();
  event.stopPropagation();
  const frame = livePreviewFrame();
  const rect = frame?.getBoundingClientRect();
  if (!rect?.width || !rect?.height) return;
  state.manualZoomOrigin = {
    x: clamp(((event.clientX - rect.left) / rect.width) * 100, 0, 100),
    y: clamp(((event.clientY - rect.top) / rect.height) * 100, 0, 100),
  };
  const nextScale = state.manualZoomScale < 1.05 ? 1.8 : state.manualZoomScale * 1.35;
  state.manualZoomScale = clamp(nextScale, 1, 5);
  applyManualVideoZoom();
}

function calibrationPixelDistance() {
  if (!calibrationPointsReady() || !el.calibrationClickLayer) return null;
  const rect = el.calibrationClickLayer.getBoundingClientRect();
  const a = state.calibrationPoints[0];
  const b = state.calibrationPoints[getCalibrationTargetCount() - 1];
  const video = calibrationVideoElement();
  if (
    video?.videoWidth &&
    video?.videoHeight &&
    Number.isFinite(a.xNorm) &&
    Number.isFinite(a.yNorm) &&
    Number.isFinite(b.xNorm) &&
    Number.isFinite(b.yNorm)
  ) {
    const dx = (b.xNorm - a.xNorm) * video.videoWidth;
    const dy = (b.yNorm - a.yNorm) * video.videoHeight;
    return Math.sqrt(dx * dx + dy * dy);
  }
  const dx = (b.x - a.x) * rect.width;
  const dy = (b.y - a.y) * rect.height;
  return Math.sqrt(dx * dx + dy * dy);
}

function videoContentRect(layerRect, video = calibrationVideoElement()) {
  if (!layerRect) return null;
  if (!video?.videoWidth || !video?.videoHeight) {
    return {
      left: layerRect.left,
      top: layerRect.top,
      width: layerRect.width,
      height: layerRect.height,
      offsetX: 0,
      offsetY: 0,
    };
  }

  const mediaAspect = video.videoWidth / video.videoHeight;
  const layerAspect = layerRect.width / layerRect.height;
  let width = layerRect.width;
  let height = layerRect.height;
  let offsetX = 0;
  let offsetY = 0;
  if (layerAspect > mediaAspect) {
    height = layerRect.height;
    width = height * mediaAspect;
    offsetX = (layerRect.width - width) / 2;
  } else {
    width = layerRect.width;
    height = width / mediaAspect;
    offsetY = (layerRect.height - height) / 2;
  }
  return {
    left: layerRect.left + offsetX,
    top: layerRect.top + offsetY,
    width,
    height,
    offsetX,
    offsetY,
  };
}

function mediaNormToLayerPoint(xNorm, yNorm, layerRect) {
  const mediaRect = videoContentRect(layerRect);
  if (!mediaRect || !layerRect?.width || !layerRect?.height) {
    return {
      xPct: clamp((xNorm || 0) * 100, 0, 100),
      yPct: clamp((yNorm || 0) * 100, 0, 100),
    };
  }
  const x = mediaRect.offsetX + clamp(xNorm, 0, 1) * mediaRect.width;
  const y = mediaRect.offsetY + clamp(yNorm, 0, 1) * mediaRect.height;
  return {
    xPct: clamp((x / layerRect.width) * 100, 0, 100),
    yPct: clamp((y / layerRect.height) * 100, 0, 100),
  };
}

function layerPointToMediaNorm(event, layerRect) {
  const mediaRect = videoContentRect(layerRect);
  if (!mediaRect?.width || !mediaRect?.height) {
    return {
      xNorm: clamp((event.clientX - layerRect.left) / Math.max(layerRect.width, 1), 0, 1),
      yNorm: clamp((event.clientY - layerRect.top) / Math.max(layerRect.height, 1), 0, 1),
    };
  }
  return {
    xNorm: clamp((event.clientX - mediaRect.left) / mediaRect.width, 0, 1),
    yNorm: clamp((event.clientY - mediaRect.top) / mediaRect.height, 0, 1),
  };
}

function hideLiveMagnifier() {
  setManualZoomTargeting(false);
}

function calibrationPointDisplay(point, layerRect) {
  if (Number.isFinite(point?.xNorm) && Number.isFinite(point?.yNorm)) {
    return mediaNormToLayerPoint(point.xNorm, point.yNorm, layerRect);
  }
  return {
    xPct: clamp((point?.x || 0) * 100, 0, 100),
    yPct: clamp((point?.y || 0) * 100, 0, 100),
  };
}

function calibrationPointsReady() {
  const targetCount = getCalibrationTargetCount();
  if (state.calibrationPoints.length < targetCount) return false;
  return state.calibrationPoints.slice(0, targetCount).every(Boolean);
}

function firstMissingCalibrationIndex() {
  const targetCount = getCalibrationTargetCount();
  for (let index = 0; index < targetCount; index += 1) {
    if (!state.calibrationPoints[index]) return index;
  }
  return -1;
}

function renderCalibrationPoints() {
  const points = state.calibrationPoints;
  const hideVisuals = state.calibrationVisualsHidden && !state.calibrationMode;
  const rect = el.calibrationClickLayer?.getBoundingClientRect();
  if (el.calibrationPointsLayer) {
    el.calibrationPointsLayer.innerHTML = hideVisuals ? "" : points
      .map((point, index) => {
        if (!point) return "";
        const labelMm = calibrationDistanceMmAt(index);
        const label = Number.isFinite(labelMm) ? `${Math.round(labelMm)}mm` : `${index + 1}`;
        const display = calibrationPointDisplay(point, rect);
        return `<span class="calibration-point" style="left:${display.xPct}%;top:${display.yPct}%;" data-index="${index}" data-label="${label}" title="删除并重新标定 ${label}" aria-label="删除并重新标定 ${label}"></span>`;
      })
      .join("");
  }
  if (el.calibrationSegment) {
    const visiblePoints = points.filter(Boolean);
    if (!hideVisuals && visiblePoints.length >= 2 && el.calibrationClickLayer) {
      const layerRect = rect || el.calibrationClickLayer.getBoundingClientRect();
      const a = visiblePoints[0];
      const b = visiblePoints[visiblePoints.length - 1];
      const aDisplay = calibrationPointDisplay(a, layerRect);
      const bDisplay = calibrationPointDisplay(b, layerRect);
      const ax = (aDisplay.xPct / 100) * layerRect.width;
      const ay = (aDisplay.yPct / 100) * layerRect.height;
      const bx = (bDisplay.xPct / 100) * layerRect.width;
      const by = (bDisplay.yPct / 100) * layerRect.height;
      const dx = bx - ax;
      const dy = by - ay;
      el.calibrationSegment.hidden = false;
      el.calibrationSegment.style.width = `${Math.sqrt(dx * dx + dy * dy)}px`;
      el.calibrationSegment.style.transform = `translate(${ax}px, ${ay}px) rotate(${Math.atan2(dy, dx)}rad)`;
    } else {
      el.calibrationSegment.hidden = true;
    }
  }
  const distancePx = calibrationPixelDistance();
  const targetCount = getCalibrationTargetCount();
  const selectedCount = points.slice(0, targetCount).filter(Boolean).length;
  if (el.calibrationPointStatus) {
    el.calibrationPointStatus.textContent = selectedCount ? `${selectedCount}/${targetCount}` : "未选择";
  }
  if (el.calibrationPixelDistance) {
    el.calibrationPixelDistance.textContent = distancePx ? `${distancePx.toFixed(1)} px` : "--";
  }
  if (el.calibrationScale) {
    el.calibrationScale.textContent = state.manualScaleMPerPx ? formatMetersPerPixel(state.manualScaleMPerPx) : "--";
  }
}

function getCalibrationTargetCount() {
  const rodLength = Number(el.calibrationRodLengthMm?.value || 300);
  const tickSpacing = Number(el.rodTickSpacingMm?.value || 50);
  const fullSteps = tickSpacing > 0 ? Math.floor(rodLength / tickSpacing) : 6;
  const remainder = tickSpacing > 0 ? rodLength - fullSteps * tickSpacing : 0;
  const derived = tickSpacing > 0 ? fullSteps + 1 + (remainder > 1e-6 ? 1 : 0) : 7;
  return Math.max(3, Math.min(31, Math.round(derived)));
}

function calibrationDistanceMmAt(index) {
  const rodLength = Number(el.calibrationRodLengthMm?.value || 300);
  const tickSpacing = Number(el.rodTickSpacingMm?.value || 50);
  const targetCount = getCalibrationTargetCount();
  if (!Number.isFinite(rodLength) || rodLength <= 0) return null;
  if (!Number.isFinite(tickSpacing) || tickSpacing <= 0) return index;
  if (index >= targetCount - 1) return rodLength;
  return Math.min(rodLength, index * tickSpacing);
}

function calibrationMappedSpanMeters() {
  const points = state.calibrationPoints;
  if (!calibrationPointsReady()) return null;
  const spanM = (calibrationDistanceMmAt(getCalibrationTargetCount() - 1) || 0) / 1000;
  return Number.isFinite(spanM) && spanM > 0 ? spanM : null;
}

function buildAxisCalibrationPoints() {
  return state.calibrationPoints.slice(0, getCalibrationTargetCount()).map((point, index) => ({
    y_norm: Number((Number.isFinite(point.yNorm) ? point.yNorm : point.y).toFixed(8)),
    real_m: Number(((calibrationDistanceMmAt(index) || 0) / 1000).toFixed(8)),
  }));
}

function calibrationClickHint(index) {
  const targetCount = getCalibrationTargetCount();
  const safeIndex = clamp(index, 0, targetCount - 1);
  const nextMm = Math.round(calibrationDistanceMmAt(safeIndex) || 0);
  return `点击 ${nextMm} mm 刻度 · ${safeIndex + 1}/${targetCount}`;
}

function calibrationVideoElement() {
  return el.livePreview?.videoWidth ? el.livePreview : el.videoPreview?.videoWidth ? el.videoPreview : null;
}

function calibrationMediaPoint(event, layerRect) {
  return layerPointToMediaNorm(event, layerRect);
}

function formatMetersPerPixel(value) {
  if (!Number.isFinite(value) || value <= 0) return "--";
  return `${value.toExponential(3)} m/px`;
}

async function refreshCameraDevices(options = {}) {
  if (!navigator.mediaDevices?.enumerateDevices) {
    if (el.liveReadinessDetail) el.liveReadinessDetail.textContent = "当前浏览器无法列出摄像头设备，请检查浏览器摄像头权限。";
    return;
  }
  const previous = el.liveCameraSelect?.value || "";
  setButtonLoading(el.refreshCameraListBtn, true, "刷新中");
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const cameras = devices.filter((device) => device.kind === "videoinput");
    if (el.liveCameraSelect) {
      el.liveCameraSelect.innerHTML = `<option value="">默认摄像头</option>`;
      cameras.forEach((camera, index) => {
        const option = document.createElement("option");
        option.value = camera.deviceId;
        option.textContent = camera.label || `摄像头 ${index + 1}`;
        el.liveCameraSelect.appendChild(option);
      });
      if ([...el.liveCameraSelect.options].some((option) => option.value === previous)) {
        el.liveCameraSelect.value = previous;
      }
    }
    if (el.liveReadinessDetail) {
      const hasLabels = cameras.some((camera) => camera.label);
      el.liveReadinessDetail.textContent = cameras.length
        ? hasLabels
          ? `已发现 ${cameras.length} 个摄像头设备。若手机已作为系统摄像头接入，请在下拉框中选择 iPhone Camera、DroidCam、Camo、Iriun 或采集卡名称。`
          : `已发现 ${cameras.length} 个摄像头，但浏览器尚未开放设备名称；先点击“连接实时画面”授权，再刷新设备列表。`
        : "没有发现可用摄像头。请确认手机摄像头软件已启动，或在浏览器/系统设置中允许摄像头权限。";
    }
    if (!options.silent) showToast(cameras.length ? `已发现 ${cameras.length} 个摄像头设备。` : "没有发现摄像头设备。");
  } catch (error) {
    if (el.liveReadinessDetail) el.liveReadinessDetail.textContent = `摄像头列表读取失败：${error.message}`;
    if (!options.silent) showToast(`摄像头列表读取失败：${error.message}`);
  } finally {
    setButtonLoading(el.refreshCameraListBtn, false);
  }
}

async function startLiveCamera() {
  if (!navigator.mediaDevices?.getUserMedia) {
    if (el.liveCameraStatus) el.liveCameraStatus.textContent = "浏览器不支持";
    if (el.liveReadinessDetail) el.liveReadinessDetail.textContent = "当前浏览器无法直接读取摄像头。可以使用手机推流软件输出 RTSP/WebRTC，再由后端或浏览器插件接入。";
    showToast("当前浏览器不支持摄像头读取。");
    return;
  }
  stopLiveCamera({ silent: true });
  setButtonLoading(el.startLiveCameraBtn, true, "连接中");
  try {
    const selectedDeviceId = el.liveCameraSelect?.value || "";
    const videoConstraints = selectedDeviceId
      ? {
          deviceId: { exact: selectedDeviceId },
          width: { ideal: 1920, max: 1920 },
          height: { ideal: 1080, max: 1080 },
          frameRate: { ideal: 60, max: 60 },
        }
      : {
          facingMode: "environment",
          width: { ideal: 1920, max: 1920 },
          height: { ideal: 1080, max: 1080 },
          frameRate: { ideal: 60, max: 60 },
        };
    const stream = await navigator.mediaDevices.getUserMedia({
      video: videoConstraints,
      audio: false,
    });
    state.liveStream = stream;
    el.livePreview.srcObject = stream;
    el.livePlaceholder.hidden = true;
    el.startLiveCameraBtn.disabled = true;
    el.stopLiveCameraBtn.disabled = false;
    if (el.startCalibrationBtn) el.startCalibrationBtn.disabled = false;
    if (el.startLiveRecordBtn) el.startLiveRecordBtn.disabled = false;
    if (el.startRoiSelectBtn) el.startRoiSelectBtn.disabled = false;
    if (el.clearRoiBtn) el.clearRoiBtn.disabled = false;
    if (el.stopLiveRecordBtn) el.stopLiveRecordBtn.disabled = true;
    if (el.liveCameraStatus) el.liveCameraStatus.textContent = "实时预览中";
    if (el.liveModelStatus) el.liveModelStatus.textContent = "OpenCV待取帧";
    if (el.liveReadinessLabel) el.liveReadinessLabel.textContent = "画面已接入";
    if (el.liveReadinessDetail) el.liveReadinessDetail.textContent = "画面已接入。完整分析流程为：先点选中心标定棒建立修正，再开始实时追踪并逐帧提交给 OpenCV 识别小球中心。";
    const trackLabel = stream.getVideoTracks()[0]?.label || el.liveCameraSelect?.selectedOptions?.[0]?.textContent || "当前摄像头";
    updateFileQueue("实时画面已接入", "已读取", `摄像头预览已开启：${trackLabel}。若仍是 Mac 自带摄像头，请在设备下拉框中切换手机摄像头后重新连接。`);
    showToast("实时画面已连接。");
    await refreshCameraDevices({ silent: true });
  } catch (error) {
    if (el.liveCameraStatus) el.liveCameraStatus.textContent = "连接失败";
    if (el.liveReadinessDetail) el.liveReadinessDetail.textContent = "未能读取摄像头。手机可通过 USB 摄像头、采集卡、同屏软件虚拟摄像头，或 RTSP/WebRTC 推流方式接入。";
    updateFileQueue("实时画面连接失败", "失败", error.message);
    showToast(`实时画面连接失败：${error.message}`);
  } finally {
    setButtonLoading(el.startLiveCameraBtn, false);
  }
}

function stopLiveCamera(options = {}) {
  if (state.liveTracking) {
    stopLiveRecording({ calculate: false, silent: true });
  }
  stopLiveVideoCapture({ keep: false });
  if (state.liveStream) {
    state.liveStream.getTracks().forEach((track) => track.stop());
    state.liveStream = null;
  }
  if (el.livePreview) {
    el.livePreview.srcObject = null;
  }
  if (el.livePlaceholder) el.livePlaceholder.hidden = false;
  if (el.startLiveCameraBtn) el.startLiveCameraBtn.disabled = false;
  if (el.stopLiveCameraBtn) el.stopLiveCameraBtn.disabled = true;
  if (el.startCalibrationBtn) el.startCalibrationBtn.disabled = true;
  if (el.startLiveRecordBtn) el.startLiveRecordBtn.disabled = true;
  if (el.stopLiveRecordBtn) el.stopLiveRecordBtn.disabled = true;
  if (el.liveCameraStatus) el.liveCameraStatus.textContent = "未连接";
  if (el.liveModelStatus) el.liveModelStatus.textContent = "OpenCV待运行";
  state.cylinderEdgeMarking = false;
  if (el.cylinderEdgeClickLayer) {
    el.cylinderEdgeClickLayer.disabled = true;
    el.cylinderEdgeClickLayer.classList.remove("is-marking");
    delete el.cylinderEdgeClickLayer.dataset.hint;
  }
  resetFallOffsetStatus();
  if (!options.silent) resetManualCalibrationState();
  if (!options.silent) {
    updateFileQueue("实时画面已断开", "待选择", "重新连接手机或摄像头后，可继续进行标定与追踪。");
    showToast("实时画面已断开。");
  }
}

async function startLiveRecording() {
  if (!state.liveStream) {
    showToast("请先连接实时画面。");
    return;
  }
  if (!el.livePreview?.videoWidth || !el.livePreview?.videoHeight) {
    showToast("实时画面还没有准备好，请稍等一秒再开始。");
    return;
  }
  if (state.liveTracking) {
    showToast("正在实时追踪中。");
    return;
  }
  setButtonLoading(el.startLiveRecordBtn, true, "检查中");
  try {
    await ensureVisionRuntimeReady();
  } catch (error) {
    setButtonLoading(el.startLiveRecordBtn, false);
    showToast(`实时识别不可用：${error.message}`);
    return;
  }
  setButtonLoading(el.startLiveRecordBtn, false);
  state.liveTracking = true;
  state.liveTrackingAbort = new AbortController();
  state.liveTrackingFrame = 0;
  state.liveTrackingStart = performance.now();
  state.liveTrackingMediaStart = null;
  state.liveTrajectory = [];
  state.liveMisses = 0;
  state.liveBackendFailures = 0;
  state.liveFrameBusy = false;
  state.liveFramesInFlight = 0;
  state.lastLiveFrameCaptureAt = 0;
  state.liveFrameScheduled = false;
  if (state.liveFrameTimer) {
    window.clearTimeout(state.liveFrameTimer);
    state.liveFrameTimer = null;
  }
  state.liveOffsetTerminated = false;
  state.calibrationVisualsHidden = true;
  resetFallOffsetStatus();
  renderCalibrationPoints();
  state.latest = buildLivePreviewRun([]);
  state.chartMode = "position";
  document.querySelectorAll(".chart-tabs button").forEach((button) => {
    button.classList.toggle("active", button.dataset.chart === "position");
  });
  renderLiveTrackingPreview();
  if (el.startLiveRecordBtn) el.startLiveRecordBtn.disabled = true;
  if (el.stopLiveRecordBtn) el.stopLiveRecordBtn.disabled = false;
  if (el.liveCameraStatus) el.liveCameraStatus.textContent = "实时追踪中";
  if (el.liveModelStatus) el.liveModelStatus.textContent = "逐帧识别中";
  if (el.liveReadinessLabel) el.liveReadinessLabel.textContent = "实时追踪中";
  if (el.liveReadinessDetail) el.liveReadinessDetail.textContent = "后端正在逐帧识别小球中心，曲线会随轨迹点实时刷新。停止后将把轨迹送入粘度计算。";
  updateFileQueue("正在实时追踪小球", "处理中", "浏览器逐帧抓取手机画面，后端 OpenCV 返回球心坐标，曲线会即时更新。");
  startLiveVideoCapture();
  scheduleLiveFrame();
  showToast("开始实时追踪，释放小球后观察曲线变化。");
}

async function stopLiveRecording(options = {}) {
  if (!state.liveTracking) {
    if (!options.silent) showToast("当前没有正在实时追踪。");
    return;
  }
  state.liveTracking = false;
  if (state.liveChartDrawTimer) {
    window.clearTimeout(state.liveChartDrawTimer);
    state.liveChartDrawTimer = null;
  }
  if (state.liveTrackingAbort) {
    state.liveTrackingAbort.abort();
    state.liveTrackingAbort = null;
  }
  cancelLiveFrameSchedule();
  if (el.stopLiveRecordBtn) el.stopLiveRecordBtn.disabled = true;
  if (el.startLiveRecordBtn && state.liveStream) el.startLiveRecordBtn.disabled = false;
  if (el.liveCameraStatus) el.liveCameraStatus.textContent = "实时预览中";
  if (options.calculate === false) {
    stopLiveVideoCapture({ keep: false });
    if (el.liveModelStatus) el.liveModelStatus.textContent = "OpenCV待取帧";
    return;
  }
  if (el.liveModelStatus) el.liveModelStatus.textContent = "计算粘度中";
  await finalizeLiveTracking();
}

function preferredRecordingMimeType() {
  if (!window.MediaRecorder) return "";
  const candidates = [
    "video/webm;codecs=vp9",
    "video/webm;codecs=vp8",
    "video/webm",
    "video/mp4",
  ];
  return candidates.find((type) => MediaRecorder.isTypeSupported(type)) || "";
}

function startLiveVideoCapture() {
  state.liveChunks = [];
  state.pendingLiveVideoBlob = null;
  if (!state.liveStream || !window.MediaRecorder) {
    if (el.liveReadinessDetail) el.liveReadinessDetail.textContent += " 当前浏览器不支持 MediaRecorder，历史记录将只保存轨迹数据。";
    return;
  }
  try {
    const mimeType = preferredRecordingMimeType();
    const options = {
      ...(mimeType ? { mimeType } : {}),
      videoBitsPerSecond: 8_000_000,
    };
    state.liveRecorder = new MediaRecorder(state.liveStream, options);
    state.liveRecorder.addEventListener("dataavailable", (event) => {
      if (event.data?.size) state.liveChunks.push(event.data);
    });
    state.liveRecorder.addEventListener("stop", () => {
      if (state.liveChunks.length) {
        state.pendingLiveVideoBlob = new Blob(state.liveChunks, { type: state.liveRecorder?.mimeType || mimeType || "video/webm" });
      }
    });
    state.liveRecorder.start(1000);
  } catch (error) {
    state.liveRecorder = null;
    state.liveChunks = [];
    if (el.liveReadinessDetail) el.liveReadinessDetail.textContent += ` 录像启动失败：${error.message}`;
  }
}

function stopLiveVideoCapture(options = {}) {
  const keep = options.keep !== false;
  return new Promise((resolve) => {
    const recorder = state.liveRecorder;
    if (!recorder || recorder.state === "inactive") {
      const blob = keep ? state.pendingLiveVideoBlob : null;
      if (!keep) {
        state.liveChunks = [];
        state.pendingLiveVideoBlob = null;
      }
      resolve(blob);
      return;
    }
    const finish = () => {
      const blob = keep ? state.pendingLiveVideoBlob : null;
      if (!keep) {
        state.liveChunks = [];
        state.pendingLiveVideoBlob = null;
      }
      state.liveRecorder = null;
      resolve(blob);
    };
    recorder.addEventListener("stop", finish, { once: true });
    try {
      recorder.stop();
    } catch {
      finish();
    }
  });
}

function scheduleLiveFrame() {
  if (!state.liveTracking || state.liveFrameScheduled) return;
  const video = el.livePreview;
  state.liveFrameScheduled = true;
  if (video?.requestVideoFrameCallback) {
    state.liveFrameRequest = video.requestVideoFrameCallback((now, metadata) => {
      state.liveFrameScheduled = false;
      state.liveFrameRequest = null;
      captureLiveFrame(metadata);
    });
    return;
  }
  state.liveFrameTimer = window.setTimeout(() => {
    state.liveFrameScheduled = false;
    state.liveFrameTimer = null;
    captureLiveFrame(null);
  }, LIVE_FRAME_INTERVAL_MS);
}

function cancelLiveFrameSchedule() {
  const video = el.livePreview;
  if (state.liveFrameRequest !== null && video?.cancelVideoFrameCallback) {
    video.cancelVideoFrameCallback(state.liveFrameRequest);
  }
  if (state.liveFrameTimer) {
    window.clearTimeout(state.liveFrameTimer);
  }
  state.liveFrameRequest = null;
  state.liveFrameTimer = null;
  state.liveFrameScheduled = false;
}

async function captureLiveFrame(metadata = null) {
  if (!state.liveTracking) return;
  const now = performance.now();
  if (now - state.lastLiveFrameCaptureAt < LIVE_FRAME_INTERVAL_MS) {
    scheduleLiveFrame();
    return;
  }
  if (state.liveFramesInFlight >= LIVE_MAX_IN_FLIGHT_FRAMES) {
    scheduleLiveFrame();
    return;
  }
  state.lastLiveFrameCaptureAt = now;
  const mediaTime = Number(metadata?.mediaTime);
  if (Number.isFinite(mediaTime) && state.liveTrackingMediaStart === null) {
    state.liveTrackingMediaStart = mediaTime;
  }
  const frameTimestamp = Number.isFinite(mediaTime) && state.liveTrackingMediaStart !== null
    ? mediaTime - state.liveTrackingMediaStart
    : ((performance.now() - state.liveTrackingStart) / 1000);
  const frameBlob = await liveFrameBlob();
  if (!frameBlob) {
    scheduleLiveFrame();
    return;
  }
  const frameIndex = state.liveTrackingFrame;
  state.liveTrackingFrame += 1;
  state.liveFramesInFlight += 1;
  scheduleLiveFrame();
  try {
    const result = await postLiveFrame(frameBlob, frameTimestamp, frameIndex);
    state.liveBackendFailures = 0;
    if (result.detected) {
      const point = liveDetectionToTrajectoryPoint(result);
      const isHighConfidence = point.confidence >= 0.50;
      if (isHighConfidence) {
        insertLiveTrajectoryPoint(point);
        if (state.liveTrajectory.length > LIVE_TRAJECTORY_LIMIT) state.liveTrajectory.shift();
        if (el.liveModelStatus) el.liveModelStatus.textContent = `已追踪 ${state.liveTrajectory.length} 点 · 处理中 ${state.liveFramesInFlight}`;
        if (FALL_OFFSET_MONITOR_ENABLED) updateFallOffsetStatus(point);
        renderLiveTrackingPreview();
      } else {
        state.liveMisses += 1;
        if (el.liveModelStatus) el.liveModelStatus.textContent = `低置信度跳过 · 处理中 ${state.liveFramesInFlight}`;
      }
    } else {
      state.liveMisses += 1;
      if (el.liveModelStatus) el.liveModelStatus.textContent = `未识别 ${state.liveMisses} 帧`;
      if (FALL_OFFSET_MONITOR_ENABLED && state.liveMisses % 4 === 1) updateFallOffsetStatus(null);
    }
  } catch (error) {
    if (error.name !== "AbortError") {
      state.liveMisses += 1;
      state.liveBackendFailures += 1;
      if (el.liveModelStatus) el.liveModelStatus.textContent = "单帧识别失败";
      if (state.liveBackendFailures >= LIVE_BACKEND_FAILURE_LIMIT) {
        await stopLiveRecording({ calculate: false, silent: true });
        if (el.liveCameraStatus) el.liveCameraStatus.textContent = "实时预览中";
        if (el.liveModelStatus) el.liveModelStatus.textContent = "识别接口已暂停";
        if (el.liveReadinessLabel) el.liveReadinessLabel.textContent = "实时追踪已暂停";
        if (el.liveReadinessDetail) {
          el.liveReadinessDetail.textContent = `连续 ${LIVE_BACKEND_FAILURE_LIMIT} 次单帧识别失败，系统已停止本次追踪以避免页面卡顿。请检查 OpenCV 环境、摄像头画面和小球可见性后重新开始。`;
        }
        updateFileQueue("实时单帧识别", "失败", `${error.message}；已自动暂停追踪，避免持续重试导致页面卡顿。`);
        showToast("单帧识别连续失败，已暂停追踪。");
      } else if (state.liveMisses % 4 === 1) {
        updateFileQueue("实时单帧识别", "失败", `${error.message}；连续失败 ${state.liveBackendFailures}/${LIVE_BACKEND_FAILURE_LIMIT}`);
      }
    }
  } finally {
    state.liveFramesInFlight = Math.max(0, state.liveFramesInFlight - 1);
  }
}

function insertLiveTrajectoryPoint(point) {
  if (!state.liveTrajectory.length || point.t >= state.liveTrajectory[state.liveTrajectory.length - 1].t) {
    state.liveTrajectory.push(point);
    return;
  }
  const insertAt = state.liveTrajectory.findIndex((item) => item.t > point.t);
  if (insertAt === -1) state.liveTrajectory.push(point);
  else state.liveTrajectory.splice(insertAt, 0, point);
}

function liveFrameBlob() {
  const video = el.livePreview;
  if (!video?.videoWidth || !video?.videoHeight) return Promise.resolve(null);
  const canvas = liveFrameBlob.canvas || document.createElement("canvas");
  liveFrameBlob.canvas = canvas;
  const scale = Math.min(1, LIVE_FRAME_MAX_WIDTH / video.videoWidth);
  state.liveFrameScale = scale;

  const roi = state.roiRect;
  if (roi) {
    // Crop: only send the ROI region to the backend
    const sx = Math.round(roi.xPct / 100 * video.videoWidth);
    const sy = Math.round(roi.yPct / 100 * video.videoHeight);
    const sw = Math.round(roi.wPct / 100 * video.videoWidth);
    const sh = Math.round(roi.hPct / 100 * video.videoHeight);
    const cw = Math.max(1, Math.round(sw * scale));
    const ch = Math.max(1, Math.round(sh * scale));
    canvas.width = cw;
    canvas.height = ch;
    const frameCtx = canvas.getContext("2d", { willReadFrequently: true });
    frameCtx.drawImage(video, sx, sy, sw, sh, 0, 0, cw, ch);
  } else {
    canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
    canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
    const frameCtx = canvas.getContext("2d", { willReadFrequently: true });
    frameCtx.drawImage(video, 0, 0, canvas.width, canvas.height);
  }
  return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", LIVE_FRAME_JPEG_QUALITY));
}

async function postLiveFrame(blob, frameTimestamp, frameIndex) {
  const params = new URLSearchParams({
    frame: String(frameIndex),
    t: String(frameTimestamp.toFixed(4)),
    min_radius_px: "2",
  });
  const scale = estimateScaleMetersPerPixel();
  if (scale) params.set("scale_m_per_px", String(scale / Math.max(state.liveFrameScale || 1, 1e-6)));
  // ROI cropping is now done in liveFrameBlob() before sending,
  // so no need to pass roi params to backend.
  appendNonlinearCorrectionParams(params);
  const response = await fetch(apiUrl(`/api/video/frame?${params.toString()}`), {
    method: "POST",
    headers: { "Content-Type": blob.type || "image/jpeg" },
    body: blob,
    signal: state.liveTrackingAbort?.signal,
  });
  if (!response.ok) {
    let detail = "实时单帧追踪失败";
    let runtime = null;
    try {
      const payload = await response.json();
      detail = payload.error || detail;
      runtime = payload.runtime || null;
    } catch {
      detail = `${response.status} ${response.statusText}`;
    }
    const error = new Error(runtime && !runtime.available ? `${detail}（${visionRuntimeMessage(runtime)}）` : detail);
    error.runtime = runtime;
    throw error;
  }
  return response.json();
}

function liveDetectionToTrajectoryPoint(result) {
  // When ROI is active, the backend sees a cropped frame.
  // Map x back from ROI-local normalised coords to full-frame normalised coords
  // so the red-dot marker renders at the correct screen position.
  let xNorm = Number(result.x ?? 0.5);
  const roi = state.roiRect;
  if (roi) {
    // result.x is 0-1 within the cropped ROI image
    // Convert to full-frame 0-1: roiLeft% + result.x * roiWidth%
    xNorm = (roi.xPct + xNorm * roi.wPct) / 100;
  }
  return {
    frame: result.frame ?? state.liveTrackingFrame,
    t: Number(result.t ?? ((performance.now() - state.liveTrackingStart) / 1000)),
    x: xNorm,
    y: Number(result.y),
    measured_y: Number(result.measured_y ?? result.y),
    corrected_y: Number(result.corrected_y ?? result.y),
    confidence: Number(result.confidence ?? 0.5),
    x_px: result.x_px,
    y_px: result.y_px,
    frame_width: result.metadata?.width,
    frame_height: result.metadata?.height,
    radius_px: result.radius_px,
    method: result.method || "live_frame",
  };
}

function fallOffsetConfig() {
  const centerPct = Math.max(0, Math.min(100, Number(el.cylinderCenterX?.value || 50)));
  const widthPct = Math.max(10, Math.min(100, Number(el.cylinderWidthPct?.value || 72)));
  const thresholdPct = Math.max(2, Math.min(45, Number(el.fallOffsetThreshold?.value || 18)));
  return { centerPct, widthPct, thresholdPct };
}

function updateCylinderOverlay() {
  const { centerPct, widthPct } = fallOffsetConfig();
  const leftPct = Math.max(0, Math.min(100, centerPct - widthPct / 2));
  const rightPct = Math.max(0, Math.min(100, centerPct + widthPct / 2));
  const frame = livePreviewFrame();
  const frameRect = frame?.getBoundingClientRect();
  const centerDisplay = mediaNormToLayerPoint(centerPct / 100, 0.5, frameRect);
  const leftDisplay = mediaNormToLayerPoint(leftPct / 100, 0.5, frameRect);
  const rightDisplay = mediaNormToLayerPoint(rightPct / 100, 0.5, frameRect);
  frame?.style.setProperty("--cylinder-center-x", `${centerDisplay.xPct}%`);
  frame?.style.setProperty("--cylinder-left-x", `${leftDisplay.xPct}%`);
  frame?.style.setProperty("--cylinder-right-x", `${rightDisplay.xPct}%`);
  renderCylinderEdgeMarks();
}

function resetFallOffsetStatus() {
  state.lastFallOffset = null;
  updateCylinderOverlay();
  if (el.fallOffsetCard) el.fallOffsetCard.dataset.state = "idle";
  if (el.fallOffsetStatus) el.fallOffsetStatus.textContent = FALL_OFFSET_MONITOR_ENABLED ? "等待追踪" : "功能保留";
  if (el.fallOffsetDetail) {
    el.fallOffsetDetail.textContent = FALL_OFFSET_MONITOR_ENABLED
      ? "点击“标注量筒边缘”后，依次点量筒左边缘和右边缘，系统自动计算中心线。"
      : "中心偏移检测已暂时关闭，相关标注按钮和参数保留，后续可重新启用。";
  }
  if (el.ballOffsetMarker) {
    el.ballOffsetMarker.hidden = true;
    el.ballOffsetMarker.style.left = "50%";
  }
}

function startCylinderEdgeMarking() {
  if (!el.cylinderEdgeClickLayer) return;
  state.cylinderEdgeMarking = true;
  state.cylinderEdgeZoomStarted = !isLiveFullscreenActive();
  state.cylinderEdgePoints = [];
  el.cylinderEdgeClickLayer.disabled = false;
  el.cylinderEdgeClickLayer.classList.add("is-marking");
  el.cylinderEdgeClickLayer.dataset.hint = "点击量筒左边缘";
  if (state.cylinderEdgeZoomStarted) enterLiveFullscreen("edge");
  if (el.fallOffsetCard) el.fallOffsetCard.dataset.state = "idle";
  if (el.fallOffsetStatus) el.fallOffsetStatus.textContent = "标注左边缘";
  if (el.fallOffsetDetail) el.fallOffsetDetail.textContent = "已放大实时画面，请先点击量筒左边缘，再点击右边缘。";
  renderCylinderEdgeMarks();
}

function resetCylinderEdgeMarking() {
  state.cylinderEdgeMarking = false;
  state.cylinderEdgeZoomStarted = false;
  state.cylinderEdgePoints = [];
  hideLiveMagnifier();
  if (el.cylinderCenterX) el.cylinderCenterX.value = "50";
  if (el.cylinderWidthPct) el.cylinderWidthPct.value = "72";
  if (el.cylinderEdgeClickLayer) {
    el.cylinderEdgeClickLayer.disabled = true;
    el.cylinderEdgeClickLayer.classList.remove("is-marking");
    delete el.cylinderEdgeClickLayer.dataset.hint;
  }
  renderCylinderEdgeMarks();
  resetFallOffsetStatus();
}

function handleCylinderEdgeClick(event) {
  if (!state.cylinderEdgeMarking || !el.cylinderEdgeClickLayer) return;
  const rect = el.cylinderEdgeClickLayer.getBoundingClientRect();
  const mediaPoint = layerPointToMediaNorm(event, rect);
  const xPct = clamp(mediaPoint.xNorm * 100, 0, 100);
  state.cylinderEdgePoints.push(xPct);
  state.cylinderEdgePoints = state.cylinderEdgePoints.slice(0, 2);
  if (state.cylinderEdgePoints.length === 1) {
    el.cylinderEdgeClickLayer.dataset.hint = "点击量筒右边缘";
    if (el.fallOffsetStatus) el.fallOffsetStatus.textContent = "标注右边缘";
    if (el.fallOffsetDetail) el.fallOffsetDetail.textContent = `左边缘已记录 ${xPct.toFixed(1)}%，请点击右边缘。`;
    renderCylinderEdgeMarks();
    return;
  }

  const [a, b] = state.cylinderEdgePoints;
  const left = Math.min(a, b);
  const right = Math.max(a, b);
  const width = Math.max(10, right - left);
  const center = Math.max(0, Math.min(100, (left + right) / 2));
  if (el.cylinderCenterX) el.cylinderCenterX.value = center.toFixed(1);
  if (el.cylinderWidthPct) el.cylinderWidthPct.value = width.toFixed(1);
  state.cylinderEdgeMarking = false;
  el.cylinderEdgeClickLayer.disabled = true;
  el.cylinderEdgeClickLayer.classList.remove("is-marking");
  delete el.cylinderEdgeClickLayer.dataset.hint;
  updateCylinderOverlay();
  if (state.cylinderEdgeZoomStarted) exitCalibrationFullscreen();
  state.cylinderEdgeZoomStarted = false;
  hideLiveMagnifier();
  if (el.fallOffsetStatus) el.fallOffsetStatus.textContent = "量筒边缘已标注";
  if (el.fallOffsetDetail) el.fallOffsetDetail.textContent = `左边缘 ${left.toFixed(1)}%，右边缘 ${right.toFixed(1)}%，中心线 ${center.toFixed(1)}%。`;
  if (FALL_OFFSET_MONITOR_ENABLED && state.liveTrajectory.length) {
    updateFallOffsetStatus(state.liveTrajectory[state.liveTrajectory.length - 1]);
  }
}

/* ── ROI selection ── */
function roiMediaRectFromPoints(start, current) {
  const left = clamp(Math.min(start.x, current.x), 0, 100);
  const top = clamp(Math.min(start.y, current.y), 0, 100);
  const right = clamp(Math.max(start.x, current.x), 0, 100);
  const bottom = clamp(Math.max(start.y, current.y), 0, 100);
  return {
    xPct: left,
    yPct: top,
    wPct: Math.max(0, right - left),
    hPct: Math.max(0, bottom - top),
  };
}

function applyRoiBoxMediaRect(box, roiRect, layerRect) {
  if (!box || !roiRect || !layerRect) return;
  const a = mediaNormToLayerPoint(roiRect.xPct / 100, roiRect.yPct / 100, layerRect);
  const b = mediaNormToLayerPoint((roiRect.xPct + roiRect.wPct) / 100, (roiRect.yPct + roiRect.hPct) / 100, layerRect);
  const left = Math.min(a.xPct, b.xPct);
  const top = Math.min(a.yPct, b.yPct);
  const width = Math.abs(b.xPct - a.xPct);
  const height = Math.abs(b.yPct - a.yPct);
  box.style.left = `${left}%`;
  box.style.top = `${top}%`;
  box.style.width = `${width}%`;
  box.style.height = `${height}%`;
}

function endRoiZoomIfNeeded() {
  const shouldExit = state.roiZoomStarted;
  state.roiZoomStarted = false;
  hideLiveMagnifier();
  if (shouldExit) exitCalibrationFullscreen();
}

function startRoiSelection() {
  if (!state.liveStream) { showToast("请先连接摄像头画面。"); return; }
  state.roiSelecting = true;
  state.roiZoomStarted = !isLiveFullscreenActive();
  if (state.roiZoomStarted) enterLiveFullscreen("roi");
  if (el.roiSelectionLayer) el.roiSelectionLayer.hidden = false;
  if (el.roiBox) { el.roiBox.style.display = "none"; }
  showToast("在画面上拖拽框选小球下落区域，松开确认。");

  const layer = el.roiSelectionLayer;
  if (!layer) return;
  const onDown = (e) => {
    e.preventDefault();
    const rect = layer.getBoundingClientRect();
    const mediaPoint = layerPointToMediaNorm(e, rect);
    const x = mediaPoint.xNorm * 100;
    const y = mediaPoint.yNorm * 100;
    state.roiDragStart = { x, y };
    layer.setPointerCapture?.(e.pointerId);
    if (el.roiBox) {
      el.roiBox.style.display = "block";
      applyRoiBoxMediaRect(el.roiBox, { xPct: x, yPct: y, wPct: 0, hPct: 0 }, rect);
    }
  };
  const onMove = (e) => {
    if (!state.roiDragStart) return;
    e.preventDefault();
    const rect = layer.getBoundingClientRect();
    const mediaPoint = layerPointToMediaNorm(e, rect);
    const curX = mediaPoint.xNorm * 100;
    const curY = mediaPoint.yNorm * 100;
    applyRoiBoxMediaRect(el.roiBox, roiMediaRectFromPoints(state.roiDragStart, { x: curX, y: curY }), rect);
  };
  const onUp = (e) => {
    if (!state.roiDragStart) return;
    const rect = layer.getBoundingClientRect();
    const mediaPoint = layerPointToMediaNorm(e, rect);
    const curX = mediaPoint.xNorm * 100;
    const curY = mediaPoint.yNorm * 100;
    const roiRect = roiMediaRectFromPoints(state.roiDragStart, { x: curX, y: curY });
    state.roiDragStart = null;
    layer.releasePointerCapture?.(e.pointerId);
    layer.removeEventListener("pointerdown", onDown);
    layer.removeEventListener("pointermove", onMove);
    layer.removeEventListener("pointerup", onUp);
    layer.removeEventListener("pointercancel", onCancel);
    layer.removeEventListener("pointerleave", onLeave);
    if (el.roiSelectionLayer) el.roiSelectionLayer.hidden = true;
    if (roiRect.wPct < 3 || roiRect.hPct < 3) {
      showToast("选区太小，请重新框选。");
      state.roiRect = null;
      state.roiSelecting = false;
      renderRoiPersistent();
      endRoiZoomIfNeeded();
      return;
    }
    state.roiRect = roiRect;
    state.roiSelecting = false;
    renderRoiPersistent();
    endRoiZoomIfNeeded();
    showToast(`检测区域已设定：${roiRect.wPct.toFixed(0)}% × ${roiRect.hPct.toFixed(0)}%，AI 将只在此区域内寻找小球。`);
  };
  const onCancel = (e) => {
    state.roiDragStart = null;
    state.roiSelecting = false;
    layer.releasePointerCapture?.(e.pointerId);
    layer.removeEventListener("pointerdown", onDown);
    layer.removeEventListener("pointermove", onMove);
    layer.removeEventListener("pointerup", onUp);
    layer.removeEventListener("pointercancel", onCancel);
    layer.removeEventListener("pointerleave", onLeave);
    if (el.roiSelectionLayer) el.roiSelectionLayer.hidden = true;
    endRoiZoomIfNeeded();
  };
  const onLeave = () => {
    if (!state.roiDragStart) hideLiveMagnifier();
  };
  layer.addEventListener("pointerdown", onDown);
  layer.addEventListener("pointermove", onMove);
  layer.addEventListener("pointerup", onUp);
  layer.addEventListener("pointercancel", onCancel);
  layer.addEventListener("pointerleave", onLeave);
}

function clearRoiSelection() {
  state.roiRect = null;
  state.roiSelecting = false;
  state.roiDragStart = null;
  if (el.roiSelectionLayer) el.roiSelectionLayer.hidden = true;
  endRoiZoomIfNeeded();
  renderRoiPersistent();
  showToast("检测区域已清除，将使用全画面检测。");
}

function renderRoiPersistent() {
  let box = document.querySelector(".roi-box-persistent");
  if (!state.roiRect) { if (box) box.remove(); return; }
  const frame = livePreviewFrame();
  if (!frame) return;
  if (!box) { box = document.createElement("div"); box.className = "roi-box-persistent"; frame.appendChild(box); }
  applyRoiBoxMediaRect(box, state.roiRect, frame.getBoundingClientRect());
}

function getRoiPixels() {
  if (!state.roiRect) return null;
  const video = el.livePreview;
  if (!video?.videoWidth || !video?.videoHeight) return null;
  const scale = state.liveFrameScale || 1;
  const fw = Math.round(video.videoWidth * scale);
  const fh = Math.round(video.videoHeight * scale);
  return {
    x: Math.round(state.roiRect.xPct / 100 * fw),
    y: Math.round(state.roiRect.yPct / 100 * fh),
    width: Math.round(state.roiRect.wPct / 100 * fw),
    height: Math.round(state.roiRect.hPct / 100 * fh),
  };
}

function renderCylinderEdgeMarks() {
  if (!el.cylinderEdgeMarks) return;
  const points = [...state.cylinderEdgePoints].sort((a, b) => a - b);
  const frameRect = livePreviewFrame()?.getBoundingClientRect();
  el.cylinderEdgeMarks.innerHTML = points
    .map((xPct, index) => {
      const display = mediaNormToLayerPoint(xPct / 100, 0.5, frameRect);
      return `<span class="cylinder-edge-mark" style="left:${display.xPct}%;" data-label="${index === 0 ? "左边缘" : "右边缘"}"></span>`;
    })
    .join("");
}

function updateFallOffsetStatus(point) {
  if (!FALL_OFFSET_MONITOR_ENABLED) {
    resetFallOffsetStatus();
    return;
  }
  updateCylinderOverlay();
  if (!point || !Number.isFinite(point.x)) {
    if (!state.liveTrajectory.length) resetFallOffsetStatus();
    else {
      if (el.fallOffsetCard) el.fallOffsetCard.dataset.state = "missing";
      if (el.fallOffsetStatus) el.fallOffsetStatus.textContent = "等待下一帧";
      if (el.fallOffsetDetail) el.fallOffsetDetail.textContent = "当前帧未识别到小球，继续观察后续帧。";
    }
    return;
  }

  // Require at least 3 consistent trajectory points before showing marker / judging offset.
  // This prevents single-frame false positives from triggering the red dot.
  const MIN_FRAMES_BEFORE_OFFSET = 3;
  if (state.liveTrajectory.length < MIN_FRAMES_BEFORE_OFFSET) {
    if (el.fallOffsetCard) el.fallOffsetCard.dataset.state = "idle";
    if (el.fallOffsetStatus) el.fallOffsetStatus.textContent = `检测中 (${state.liveTrajectory.length}/${MIN_FRAMES_BEFORE_OFFSET})`;
    if (el.fallOffsetDetail) el.fallOffsetDetail.textContent = "正在积累连续检测帧，确认是真实小球后再判定偏移。";
    if (el.ballOffsetMarker) el.ballOffsetMarker.hidden = true;
    return;
  }

  const { centerPct, widthPct, thresholdPct } = fallOffsetConfig();
  const ballPct = Math.max(0, Math.min(100, point.x * 100));
  const offsetPctOfCylinder = ((ballPct - centerPct) / Math.max(widthPct / 2, 1)) * 100;
  const absOffset = Math.abs(offsetPctOfCylinder);
  const direction = offsetPctOfCylinder >= 0 ? "右" : "左";
  const stateName = absOffset > thresholdPct ? "warning" : "ok";
  state.lastFallOffset = { ballPct, centerPct, widthPct, thresholdPct, offsetPctOfCylinder, state: stateName };

  if (el.ballOffsetMarker) {
    let yNorm = Number.isFinite(point.y_px) && Number.isFinite(point.frame_height)
      ? point.y_px / Math.max(point.frame_height, 1)
      : 0.5;
    // When ROI is active, map y back to full-frame normalised coords
    const roi = state.roiRect;
    if (roi) {
      yNorm = (roi.yPct + yNorm * roi.hPct) / 100;
    }
    const display = mediaNormToLayerPoint(point.x, yNorm, livePreviewFrame()?.getBoundingClientRect());
    el.ballOffsetMarker.hidden = false;
    el.ballOffsetMarker.style.left = `${display.xPct}%`;
    el.ballOffsetMarker.style.top = `${display.yPct}%`;
  }
  if (el.fallOffsetCard) el.fallOffsetCard.dataset.state = stateName;
  if (el.fallOffsetStatus) {
    el.fallOffsetStatus.textContent = stateName === "ok" ? "下落接近中心" : `小球向${direction}偏离`;
  }
  if (el.fallOffsetDetail) {
    const offsetText = `${absOffset.toFixed(1)}%`;
    el.fallOffsetDetail.textContent = stateName === "ok"
      ? `小球横向偏移约为量筒半宽的 ${offsetText}，处于阈值 ${thresholdPct}% 内。`
      : `小球横向偏移约为量筒半宽的 ${offsetText}，已超过阈值 ${thresholdPct}%，本次追踪将终止，请重新释放。`;
  }
  if (stateName === "warning") terminateLiveTrackingForOffset(state.lastFallOffset);
}

function terminateLiveTrackingForOffset(offset) {
  if (!state.liveTracking || state.liveOffsetTerminated) return;
  state.liveOffsetTerminated = true;
  const direction = offset.offsetPctOfCylinder >= 0 ? "右" : "左";
  const absOffset = Math.abs(offset.offsetPctOfCylinder);
  const offsetText = `${absOffset.toFixed(1)}%`;
  const thresholdText = `${offset.thresholdPct.toFixed(0)}%`;
  void stopLiveRecording({ calculate: false, silent: true });
  if (el.fallOffsetCard) el.fallOffsetCard.dataset.state = "danger";
  if (el.fallOffsetStatus) el.fallOffsetStatus.textContent = "偏移超限，已终止";
  if (el.fallOffsetDetail) {
    el.fallOffsetDetail.textContent = `小球向${direction}偏离 ${offsetText}，超过阈值 ${thresholdText}。本次实验无效，请重新调整释放位置后重新开始。`;
  }
  if (el.liveCameraStatus) el.liveCameraStatus.textContent = "实时预览中";
  if (el.liveModelStatus) el.liveModelStatus.textContent = "偏移超限，已终止";
  if (el.liveReadinessLabel) el.liveReadinessLabel.textContent = "本次实验已终止";
  if (el.liveReadinessDetail) {
    el.liveReadinessDetail.textContent = "检测到小球偏离量筒中心线超过阈值，系统已停止本次采样且不会计算粘度。请重新标注量筒边缘、调整磁吸释放位置后重新开始追踪。";
  }
  updateFileQueue("本次实时追踪已终止", "失败", `小球横向偏移 ${offsetText}，超过中心线阈值 ${thresholdText}，请重新释放并重新开始。`);
  showToast("小球偏离中心线超过阈值，已终止本次实验。");
}

function renderLiveTrackingPreview() {
  const run = buildLivePreviewRun(state.liveTrajectory);
  state.latest = run;
  el.terminalVelocity.textContent = "--";
  el.uniformSegmentLength.textContent = "--";
  el.idealViscosity.textContent = "--";
  el.viscosity.textContent = "--";
  el.r2.textContent = "--";
  el.re.textContent = "--";
  el.fitMethod.textContent = "实时预览";
  el.outlierCount.textContent = "0";
  el.segmentCv.textContent = "--";
  el.trackingConfidence.textContent = state.liveTrajectory.length
    ? `${Math.round((state.liveTrajectory.reduce((sum, point) => sum + point.confidence, 0) / state.liveTrajectory.length) * 100)}%`
    : "--";
  el.score.textContent = "--";
  el.runBadge.textContent = `实时追踪 ${state.liveTrajectory.length} 点`;
  el.downloadReport.href = "#";
  el.downloadReport.classList.add("disabled");
  scheduleLiveChartDraw();
}

function scheduleLiveChartDraw(options = {}) {
  const immediate = options.immediate === true;
  if (!state.liveTracking || immediate) {
    if (state.liveChartDrawTimer) {
      window.clearTimeout(state.liveChartDrawTimer);
      state.liveChartDrawTimer = null;
    }
    state.lastLiveChartDrawAt = performance.now();
    drawChart();
    return;
  }
  const now = performance.now();
  const elapsed = now - state.lastLiveChartDrawAt;
  if (elapsed >= LIVE_CHART_INTERVAL_MS) {
    state.lastLiveChartDrawAt = now;
    drawChart();
    return;
  }
  if (state.liveChartDrawTimer) return;
  state.liveChartDrawTimer = window.setTimeout(() => {
    state.liveChartDrawTimer = null;
    state.lastLiveChartDrawAt = performance.now();
    drawChart();
  }, LIVE_CHART_INTERVAL_MS - elapsed);
}

function buildLivePreviewRun(trajectory) {
  const position = trajectory.map((point) => ({ t: point.t, y: point.corrected_y ?? point.y }));
  const velocity = [];
  for (let index = 1; index < trajectory.length; index += 1) {
    const current = trajectory[index];
    const previous = trajectory[index - 1];
    const dt = current.t - previous.t;
    if (dt > 0) {
      velocity.push({
        t: current.t,
        v: Math.abs(((current.corrected_y ?? current.y) - (previous.corrected_y ?? previous.y)) / dt),
      });
    }
  }
  return {
    id: null,
    params: payload().params,
    result: {},
    curves: { position, velocity },
    segment: null,
    quality: { fit_method: "live_frame_preview", preprocessing: {} },
    student: {},
    diagnostics: [],
  };
}

async function finalizeLiveTracking() {
  const trajectory = state.liveTrajectory.slice();
  const videoBlob = await stopLiveVideoCapture({ keep: true });
  if (trajectory.length < 12) {
    state.pendingLiveVideoBlob = null;
    state.liveChunks = [];
    updateFileQueue("实时追踪结果", "失败", `有效轨迹点只有 ${trajectory.length} 个，至少需要 12 个点才能计算粘度。`);
    if (el.liveModelStatus) el.liveModelStatus.textContent = "点数不足";
    showToast("实时轨迹点不足，请重新追踪。");
    return;
  }
  setButtonLoading(el.uploadTrajectoryBtn, true, "计算中");
  updateFileQueue("实时追踪结果", "处理中", `已实时获得 ${trajectory.length} 个轨迹点，正在计算终端速度和粘度。`);
  try {
    const body = payload();
    body.trajectory = trajectory;
    body.source = "realtime";
    const run = await api("/api/measurements/trajectory", {
      method: "POST",
      body: JSON.stringify(body),
    });
    let videoArchiveError = "";
    if (videoBlob?.size) {
      try {
        const saved = await uploadRunVideo(run.id, videoBlob);
        if (saved?.video) run.video = saved.video;
      } catch (videoError) {
        videoArchiveError = videoError.message;
      }
    }
    state.latest = run;
    renderRun(run);
    await loadRecords();
    if (el.liveModelStatus) el.liveModelStatus.textContent = "实时追踪完成";
    if (el.liveReadinessLabel) el.liveReadinessLabel.textContent = "实时结果已生成";
    if (el.liveReadinessDetail) el.liveReadinessDetail.textContent = `已实时追踪 ${trajectory.length} 个点，并完成终端速度、理想η、修正η和不确定度计算。`;
    const archiveText = run.video?.url ? "，录像已归档" : videoArchiveError ? `，录像归档失败：${videoArchiveError}` : "";
    updateFileQueue("实时追踪结果", "已完成", `已保存记录 #${run.id}，实时轨迹点 ${trajectory.length} 个${archiveText}。`);
    showToast(`实时追踪完成，已保存记录 #${run.id}`);
  } catch (error) {
    updateFileQueue("实时追踪结果", "失败", error.message);
    if (el.liveModelStatus) el.liveModelStatus.textContent = "计算失败";
    showToast(`实时结果计算失败：${error.message}`);
  } finally {
    state.pendingLiveVideoBlob = null;
    state.liveChunks = [];
    setButtonLoading(el.uploadTrajectoryBtn, false);
    if (el.stopLiveRecordBtn) el.stopLiveRecordBtn.disabled = true;
  }
}

function prepareVideoPreview(file) {
  resetVideoPreview();
  if (!file.type.startsWith("video/")) {
    updateFileQueue(file.name, "失败", "请选择 mp4、mov 或 webm 等视频文件。");
    showToast("请选择实验视频文件。");
    return;
  }
  state.videoUrl = URL.createObjectURL(file);
  el.videoPreview.src = state.videoUrl;
  el.videoPlaceholder.hidden = true;
  el.videoSize.textContent = formatFileSize(file.size);
  el.videoDuration.textContent = "读取中";
  el.videoResolution.textContent = "读取中";
  el.videoReadinessLabel.textContent = "元信息读取中";
  el.videoReadinessDetail.textContent = "正在读取浏览器可识别的视频时长和分辨率。";
  updateFileQueue(file.name, "待预检", "视频已选择，读取元信息后可进行预检。");
}

async function inspectSelectedVideo() {
  const file = el.trajectoryInput.files?.[0];
  if (!file) {
    showToast("请先选择实验视频。");
    return;
  }
  if (!file.type.startsWith("video/")) {
    showToast("请选择 mp4、mov 或 webm 等视频文件。");
    return;
  }
  await waitForVideoMetadata();
  const metadata = {
    name: file.name,
    type: file.type,
    size: file.size,
    duration: Number.isFinite(el.videoPreview.duration) ? el.videoPreview.duration : null,
    width: el.videoPreview.videoWidth,
    height: el.videoPreview.videoHeight,
    fps: null,
  };
  setButtonLoading(el.uploadTrajectoryBtn, true, "读取中");
  updateFileQueue(file.name, "预检中", "正在读取视频元信息，并准备调用 OpenCV 追踪小球轨迹。");
  try {
    const result = await api("/api/video/inspect", {
      method: "POST",
      body: JSON.stringify(metadata),
    });
    renderVideoInspection(result);
    const issueText = result.warnings.length ? `；${result.warnings[0]}` : "";
    updateFileQueue(file.name, "处理中", `元信息已读取，OpenCV 正在尝试提取小球轨迹${issueText}`);
    await trackSelectedVideo(file);
  } catch (error) {
    updateFileQueue(file.name, "失败", error.message);
    showToast(`视频追踪失败：${error.message}`);
  } finally {
    setButtonLoading(el.uploadTrajectoryBtn, false);
  }
}

async function trackSelectedVideo(file) {
  const scale = estimateScaleMetersPerPixel();
  const params = new URLSearchParams({
    frame_step: "1",
    max_frames: "1200",
    min_radius_px: "2",
    use_norfair: "false",
  });
  if (scale) params.set("scale_m_per_px", String(scale));
  appendNonlinearCorrectionParams(params);
  const response = await fetch(apiUrl(`/api/video/track?${params.toString()}`), {
    method: "POST",
    headers: { "Content-Type": file.type || "video/mp4" },
    body: file,
  });
  if (!response.ok) {
    let detail = "OpenCV追踪失败";
    try {
      const payload = await response.json();
      detail = payload.error || detail;
    } catch {
      detail = `${response.status} ${response.statusText}`;
    }
    throw new Error(detail);
  }
  const tracked = await response.json();
  const trajectory = tracked.trajectory || [];
  if (trajectory.length < 12) {
    throw new Error("OpenCV识别到的有效轨迹点不足，请提高对比度、缩小ROI或重新拍摄。");
  }
  const body = payload();
  body.trajectory = trajectory;
  body.source = "video";
  const run = await api("/api/measurements/trajectory", {
    method: "POST",
    body: JSON.stringify(body),
  });
  let videoArchiveError = "";
  try {
    const saved = await uploadRunVideo(run.id, file);
    if (saved?.video) run.video = saved.video;
  } catch (videoError) {
    videoArchiveError = videoError.message;
  }
  state.latest = run;
  renderRun(run);
  await loadRecords();
  const meta = tracked.metadata || {};
  const archiveText = run.video?.url ? "，视频已归档" : videoArchiveError ? `，视频归档失败：${videoArchiveError}` : "";
  updateFileQueue(file.name, "已完成", `OpenCV提取 ${trajectory.length} 个轨迹点，检测帧 ${meta.detected_frames ?? "--"}/${meta.processed_frames ?? "--"}，已保存记录 #${run.id}${archiveText}`);
  showToast(`视频追踪完成，已保存记录 #${run.id}`);
}

function appendNonlinearCorrectionParams(params) {
  const enabled = Boolean(el.nonlinearCorrectionEnabled?.checked);
  params.set("nonlinear_correction", enabled ? "true" : "false");
  if (!enabled) return;
  params.set("axis_correction_mode", state.correctionMode);

  const axisPoints = state.axisCalibrationPoints.length >= 2
    ? state.axisCalibrationPoints
    : buildAxisCalibrationPoints();
  if (axisPoints.length >= 2) {
    params.set("axis_calibration_points", JSON.stringify(axisPoints));
  }
}

function updateNonlinearCorrectionStatus() {
  const enabled = Boolean(el.nonlinearCorrectionEnabled?.checked);
  const pointCount = state.axisCalibrationPoints.length || state.calibrationPoints.length;
  const modeLabel = correctionModeLabel(state.correctionMode);
  const polynomialReady = state.correctionMode !== "polynomial" || pointCount >= 4;
  if (el.nonlinearCorrectionModel) {
    el.nonlinearCorrectionModel.textContent = enabled ? modeLabel.status : "线性比例换算";
  }
  if (el.correctionModeTitle) {
    el.correctionModeTitle.textContent = modeLabel.title;
  }
  if (el.correctionModeDetail) {
    el.correctionModeDetail.textContent = modeLabel.detail;
  }
  if (el.nonlinearCorrectionSource) {
    const source = pointCount >= 2
      ? `${pointCount} 个实测刻度点${polynomialReady ? "" : "，多项式建议至少 4 点"}`
      : "等待刻度点";
    el.nonlinearCorrectionSource.textContent = enabled ? source : "未启用";
  }
}

function setCorrectionMode(mode) {
  state.correctionMode = mode === "polynomial" ? "polynomial" : "piecewise";
  document.querySelectorAll("[data-correction-mode]").forEach((button) => {
    const active = button.dataset.correctionMode === state.correctionMode;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", active ? "true" : "false");
  });
  updateNonlinearCorrectionStatus();
}

function correctionModeLabel(mode) {
  if (mode === "polynomial") {
    return {
      title: "多项式全局修正",
      status: "多项式标定映射",
      detail: "优先使用三次多项式；标定点不足时自动降为二次或一次，适合观察整体非线性趋势。",
    };
  }
  return {
    title: "分段非线性插值",
    status: "分段插值映射",
    detail: "相邻刻度之间线性插值，局部误差不会扩散到整条标定棒。",
  };
}

function estimateScaleMetersPerPixel() {
  if (Number.isFinite(state.manualScaleMPerPx) && state.manualScaleMPerPx > 0) {
    return state.manualScaleMPerPx;
  }
  const rodLengthM = Number(el.calibrationRodLengthMm?.value || 300) / 1000;
  const frameHeight = el.videoPreview?.videoHeight || el.livePreview?.videoHeight || 0;
  if (!Number.isFinite(rodLengthM) || rodLengthM <= 0 || !frameHeight) return null;
  return rodLengthM / (frameHeight * 0.78);
}

function waitForVideoMetadata() {
  if (Number.isFinite(el.videoPreview.duration) && el.videoPreview.videoWidth > 0) {
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error("视频元信息读取超时")), 4000);
    el.videoPreview.addEventListener(
      "loadedmetadata",
      () => {
        window.clearTimeout(timer);
        resolve();
      },
      { once: true },
    );
    el.videoPreview.addEventListener(
      "error",
      () => {
        window.clearTimeout(timer);
        reject(new Error("浏览器无法读取该视频文件"));
      },
      { once: true },
    );
  });
}

function renderVideoInspection(result) {
  const duration = Number.isFinite(Number(result.duration)) ? Number(result.duration) : null;
  const width = result.resolution?.width || 0;
  const height = result.resolution?.height || 0;
  el.videoDuration.textContent = duration ? formatDuration(duration) : "--";
  el.videoResolution.textContent = width && height ? `${width} x ${height}` : "--";
  el.videoSize.textContent = formatFileSize(result.size || 0);
  el.videoFps.textContent = result.fps ? `${Number(result.fps).toFixed(1)} fps` : "需后端解码";
  el.videoReadinessLabel.textContent = result.accepted ? "可进入标定" : "需补齐信息";
  const warnings = result.warnings?.length ? result.warnings.join(" ") : "视频已具备预览和元信息，后续仍需标定、ROI和追踪验证。";
  el.videoReadinessDetail.textContent = `${warnings} ${result.next_step}`;
}

function handleVideoMetadataLoaded() {
  const duration = Number.isFinite(el.videoPreview.duration) ? el.videoPreview.duration : null;
  const width = el.videoPreview.videoWidth;
  const height = el.videoPreview.videoHeight;
  el.videoDuration.textContent = duration ? formatDuration(duration) : "--";
  el.videoResolution.textContent = width && height ? `${width} x ${height}` : "--";
  if (el.videoPreview.dataset.archiveRun) {
    el.videoReadinessLabel.textContent = "历史录像可回放";
    el.videoReadinessDetail.textContent = `已载入记录 #${el.videoPreview.dataset.archiveRun} 的实验录像，可直接播放回看。`;
  } else {
    el.videoReadinessLabel.textContent = "元信息已读取";
    el.videoReadinessDetail.textContent = "可以进行视频预检；预检只确认输入条件，不提取轨迹。";
  }
}

function formatDuration(seconds) {
  const safe = Math.max(0, Number(seconds) || 0);
  const minutes = Math.floor(safe / 60);
  const rest = safe - minutes * 60;
  return minutes > 0 ? `${minutes}分${rest.toFixed(1)}秒` : `${rest.toFixed(2)}秒`;
}

function formatFileSize(bytes) {
  const size = Number(bytes) || 0;
  if (size >= 1024 * 1024) return `${(size / 1024 / 1024).toFixed(2)} MB`;
  return `${(size / 1024).toFixed(1)} KB`;
}

function renderEmptyState() {
  el.terminalVelocity.textContent = "--";
  el.uniformSegmentLength.textContent = "--";
  el.idealViscosity.textContent = "--";
  el.viscosity.textContent = "--";
  el.r2.textContent = "--";
  el.re.textContent = "--";
  el.fitMethod.textContent = "--";
  el.outlierCount.textContent = "--";
  el.segmentCv.textContent = "--";
  el.trackingConfidence.textContent = "--";
  el.score.textContent = "--";
  el.runBadge.textContent = "等待数据";
  el.downloadReport.href = "#";
  el.downloadReport.classList.add("disabled");
  el.diagnostics.innerHTML = `
    <article class="diagnostic empty">
      <img src="${assetMap.diagnostic.ok}" alt="" />
      <div>
        <strong>尚未导入真实轨迹</strong>
        <p>导入 CSV 后，这里会显示匀速段、Re 条件、壁效应和偏差来源诊断。</p>
      </div>
    </article>
  `;
  renderUncertainty();
  drawChart();
}

function renderUncertainty(run = state.latest) {
  if (!el.uncertaintyStatus) return;
  if (!run?.result || !run?.params) {
    el.uncertaintyStatus.textContent = "待导入";
    el.uncertaintyDiameterTerm.textContent = "--";
    el.uncertaintyTimingTerm.textContent = "--";
    el.uncertaintyCombined.textContent = "--";
    el.uncertaintyStandard.textContent = "--";
    el.uncertaintyExpanded.textContent = "--";
    el.uncertaintyExpression.textContent = "导入轨迹后生成 η ± U 的结果表达。";
    return;
  }

  const result = run.result;
  const params = run.params;
  const terminalVelocity = finiteNumber(result.terminal_velocity);
  const eta = finiteNumber(result.viscosity);
  const measurementParams = {
    radiusMm: finiteNumber(params.radius_mm),
    tubeDiameterMm: finiteNumber(params.tube_diameter_mm),
    liquidDepthMm: finiteNumber(params.liquid_depth_mm),
  };
  const segmentSpan = estimateUniformSegmentSpan(run, terminalVelocity);
  if (
    terminalVelocity === null ||
    eta === null ||
    Object.values(measurementParams).some((value) => value === null) ||
    !segmentSpan
  ) {
    el.uncertaintyStatus.textContent = "缺少参数";
    el.uncertaintyDiameterTerm.textContent = "--";
    el.uncertaintyTimingTerm.textContent = "--";
    el.uncertaintyCombined.textContent = "--";
    el.uncertaintyStandard.textContent = "--";
    el.uncertaintyExpanded.textContent = "--";
    el.uncertaintyExpression.textContent = "本次记录缺少 d、D、H、l 或 t，暂不能传播不确定度。";
    return;
  }

  const d = measurementParams.radiusMm * 2;
  const D = measurementParams.tubeDiameterMm;
  const H = measurementParams.liquidDepthMm;
  const l = segmentSpan.distanceM * 1000;
  const t = segmentSpan.timeS;
  const deltaD = Math.max(0, number(el.uncertaintyDiameterMm, 0));
  const deltaT = Math.max(0, number(el.uncertaintyTimeS, 0));
  const deltaL = Math.max(0, number(el.uncertaintyDistanceMm, 0));
  const deltaTube = Math.max(0, number(el.uncertaintyTubeDiameterMm, 0));
  const deltaH = Math.max(0, number(el.uncertaintyLiquidDepthMm, 0));
  const wallD = 1 + (2.4 * d) / D;
  const depthH = 1 + (1.6 * d) / H;
  const diameterCoefficient = (2 / d) - (2.4 / (wallD * D)) - (1.6 / (depthH * H));
  const diameterTerm = Math.abs(diameterCoefficient * deltaD);
  const timeTerm = deltaT / Math.max(t, 1e-12);
  const distanceTerm = deltaL / Math.max(l, 1e-12);
  const tubeTerm = Math.abs(((2.4 * d) / (wallD * D * D)) * deltaTube);
  const depthTerm = Math.abs(((1.6 * d) / (depthH * H * H)) * deltaH);
  const timingTerm = Math.hypot(timeTerm, distanceTerm);
  const combinedRel = Math.hypot(diameterTerm, timeTerm, distanceTerm, tubeTerm, depthTerm);
  const standardU = eta * combinedRel;
  const expandedU = standardU * 2;
  el.uncertaintyStatus.textContent = run.source === "simulation" ? "仿真对照" : "已计算";
  el.uncertaintyDiameterTerm.textContent = formatPercent(Math.hypot(diameterTerm, tubeTerm, depthTerm));
  el.uncertaintyTimingTerm.textContent = formatPercent(timingTerm);
  el.uncertaintyCombined.textContent = formatPercent(combinedRel);
  el.uncertaintyStandard.textContent = `${formatPaS(standardU)} Pa·s`;
  el.uncertaintyExpanded.textContent = `${formatPaS(expandedU)} Pa·s`;
  el.uncertaintyExpression.textContent = `d=${d.toFixed(3)} mm，D=${D.toFixed(1)} mm，H=${H.toFixed(1)} mm，l≈${l.toFixed(1)} mm，t≈${t.toFixed(3)} s；η = ${formatPaS(eta)} ± ${formatPaS(expandedU)} Pa·s，k=2`;
}

function updateAccessState() {
  document.body.classList.toggle("access-granted", state.accessGranted);
}

function updateLectureProgress() {
  if (!el.lectureReader) return;
  const maxScroll = el.lectureReader.scrollHeight - el.lectureReader.clientHeight;
  const progress = maxScroll <= 0 ? 100 : Math.min(100, Math.round((el.lectureReader.scrollTop / maxScroll) * 100));
  el.lectureProgress.textContent = `阅读进度 ${progress}%`;
  if (progress >= 98 && !state.lectureRead) {
    state.lectureRead = true;
    el.startQuizBtn.disabled = false;
    el.lectureProgress.textContent = "讲义已读完";
    showToast("讲义阅读完成，可以开始答题。");
  }
}

function startLecture() {
  state.lectureStarted = true;
  state.examStarted = false;
  document.querySelector(".system-main")?.classList.remove("gate-mode");
  el.gateVisualPanel.classList.add("released");
  el.gateEntryPanel.hidden = true;
  el.gateVisualPanel.hidden = true;
  el.lecturePanel.hidden = false;
  el.quizPanel.hidden = true;
  window.scrollTo({ top: 0, behavior: "smooth" });
  if (!state.lectureRead) {
    el.startQuizBtn.disabled = true;
    el.lectureReader.scrollTop = 0;
    updateLectureProgress();
  }
  showToast("请先阅读实验讲义。");
}

function startQuiz() {
  if (!state.lectureRead) {
    updateLectureProgress();
    showToast("请先阅读完讲义，再开始答题。");
    return;
  }
  state.examStarted = true;
  state.lectureStarted = false;
  document.querySelector(".system-main")?.classList.remove("gate-mode");
  el.lecturePanel.hidden = true;
  el.quizPanel.hidden = false;
  resetQuiz();
  updateExamProgress();
  window.scrollTo({ top: 0, behavior: "smooth" });
  showToast("已进入准入考试。");
}

function setupReleaseBall() {
  if (!el.releaseBallBtn) return;
  const maxPull = 148;
  const triggerPull = 108;
  let active = false;
  let startY = 0;
  let pull = 0;

  const setPull = (value) => {
    pull = Math.max(0, Math.min(maxPull, value));
    el.releaseBallBtn.style.setProperty("--pull", `${pull}px`);
    el.gateVisualPanel.style.setProperty("--pull-progress", (pull / maxPull).toFixed(3));
  };

  const finishPull = () => {
    if (!active) return;
    active = false;
    el.releaseBallBtn.classList.remove("dragging");
    if (pull >= triggerPull) {
      el.gateVisualPanel.classList.add("released");
      window.setTimeout(startLecture, 260);
      return;
    }
    setPull(0);
  };

  el.releaseBallBtn.addEventListener("pointerdown", (event) => {
    if (state.examStarted || state.lectureStarted) return;
    active = true;
    startY = event.clientY;
    el.releaseBallBtn.setPointerCapture(event.pointerId);
    el.releaseBallBtn.classList.add("dragging");
    setPull(0);
  });
  el.releaseBallBtn.addEventListener("pointermove", (event) => {
    if (!active) return;
    setPull(event.clientY - startY);
  });
  el.releaseBallBtn.addEventListener("pointerup", finishPull);
  el.releaseBallBtn.addEventListener("pointercancel", finishPull);
  el.releaseBallBtn.addEventListener("click", () => {
    if (!active && pull === 0) startLecture();
  });
}

function updateExamProgress() {
  const data = new FormData(el.quizForm);
  const answered = quizQuestions.filter((item) => data.has(item.key)).length;
  el.examProgress.textContent = `已作答 ${answered}/${quizQuestions.length}`;
}

function renderQuizQuestions() {
  if (!el.quizQuestionList) return;
  el.quizQuestionList.innerHTML = "";
  let currentModule = "";
  quizQuestions.forEach((question, index) => {
    if (question.module !== currentModule) {
      currentModule = question.module;
      const divider = document.createElement("div");
      divider.className = "quiz-module-divider";
      const moduleQuestions = quizQuestions.filter((item) => item.module === currentModule);
      const modulePoints = moduleQuestions.reduce((sum, item) => sum + item.points, 0);
      divider.innerHTML = `<span>${currentModule}</span><strong>${modulePoints} 分</strong>`;
      el.quizQuestionList.appendChild(divider);
    }

    const fieldset = document.createElement("fieldset");
    const legend = document.createElement("legend");
    legend.innerHTML = `<span>第 ${index + 1} 题 · ${question.type} · ${question.points} 分</span>${question.title}`;
    fieldset.appendChild(legend);

    Object.entries(question.options).forEach(([value, label]) => {
      const option = document.createElement("label");
      const input = document.createElement("input");
      input.type = "radio";
      input.name = question.key;
      input.value = value;
      option.append(input, document.createTextNode(label));
      fieldset.appendChild(option);
    });

    el.quizQuestionList.appendChild(fieldset);
  });
  updateExamProgress();
}

function isExperimentRelatedQuestion(question) {
  const text = question.trim().toLowerCase();
  if (!text) return false;
  if (experimentStrictKeywords.some((keyword) => text.includes(keyword.toLowerCase()))) return true;
  if (/(^|[^a-z])re([^a-z]|$)/.test(text)) return true;
  if (experimentContextKeywords.some((keyword) => text.includes(keyword.toLowerCase()))) {
    return !unrelatedTopicKeywords.some((keyword) => text.includes(keyword.toLowerCase()));
  }
  return false;
}

function addQuizTutorMessage(type, text) {
  const message = document.createElement("div");
  message.className = `message ${type}`;
  message.textContent = text;
  el.quizTutorChat.appendChild(message);
  el.quizTutorChat.scrollTop = el.quizTutorChat.scrollHeight;
  return message;
}

function renderAssistantAnswer(message, data) {
  message.textContent = data.answer || "";
  if (!data.sources?.length) return;
  const sources = document.createElement("div");
  sources.className = "message-sources";
  sources.append("参考来源：");
  data.sources.forEach((source, index) => {
    const link = document.createElement("a");
    link.href = source.url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = source.title || `来源 ${index + 1}`;
    sources.append(link);
  });
  message.appendChild(sources);
}

function renderQuizTutorFeedback(formData, score) {
  const wrongItems = quizQuestions
    .map((item, index) => {
      const selected = formData.get(item.key);
      const correct = selected === item.answer;
      return { item, index: index + 1, selected, correct };
    })
    .filter((item) => !item.correct);

  el.quizTutorPanel.hidden = false;
  el.quizTutorChat.innerHTML = "";
  if (!wrongItems.length) {
    el.quizTutorSummary.innerHTML = `
      <strong>本次 ${score}/100，全部正确。</strong>
      <p>你已经掌握了传统实验原理、传统实验步骤、创新实验原理和创新实验步骤，可以进入实验大厅继续操作。</p>
    `;
    addQuizTutorMessage("ai", "全部答对。后面如果对公式、雷诺数、壁效应或 AI 视觉测量流程还有疑问，可以继续问我。");
    return;
  }

  el.quizTutorSummary.innerHTML = `
    <strong>本次 ${score}/100，发现 ${wrongItems.length} 道错题。</strong>
    <p>下面列出错题、你的选择、正确答案和解析。你也可以继续追问相关实验原理。</p>
    <div class="quiz-review-list">
      ${wrongItems
        .map(({ item, index, selected }) => `
          <article>
            <span>第 ${index} 题</span>
            <h3>${item.title}</h3>
            <p><b>你的选择：</b>${item.options[selected] || "未选择"}</p>
            <p><b>正确答案：</b>${item.options[item.answer]}</p>
            <p><b>本题分值：</b>${item.points} 分</p>
            <p>${item.explanation}</p>
          </article>
        `)
        .join("")}
    </div>
  `;
  addQuizTutorMessage("ai", "我已经把错题和解析列出来了。你可以继续问和这些题、讲义或落球法实验有关的问题。");
}

async function askQuizTutor(question, sourceButton = null) {
  if (!question.trim()) return;
  addQuizTutorMessage("user", question);
  if (!isExperimentRelatedQuestion(question)) {
    addQuizTutorMessage("ai", "这个问题与落球法测粘、AI视觉测量、讲义或试题解析无关，我不能在本实验答疑中回答。");
    return;
  }
  const pending = addQuizTutorMessage("ai pending", "正在根据讲义与本次试题生成答复...");
  setButtonLoading(sourceButton, true, "生成中");
  try {
    const data = await api("/api/assistant/ask", {
      method: "POST",
      body: JSON.stringify({ question }),
    });
    pending.className = "message ai";
    renderAssistantAnswer(pending, data);
  } catch (error) {
    pending.className = "message ai";
    pending.textContent = `问答失败：${error.message}`;
  } finally {
    setButtonLoading(sourceButton, false);
  }
}

function evaluateQuiz(event) {
  event.preventDefault();
  const data = new FormData(el.quizForm);
  const answered = quizQuestions.filter((item) => data.has(item.key)).length;
  if (answered < quizQuestions.length) {
    el.quizResult.textContent = "还有题目没有作答。完成全部题目后再提交。";
    el.quizResult.className = "quiz-result warn";
    showToast("请先完成全部准入题目。");
    return;
  }
  const score = quizQuestions.reduce((sum, item) => sum + (data.get(item.key) === item.answer ? item.points : 0), 0);
  el.quizScore.textContent = `${score}/100`;
  renderQuizTutorFeedback(data, score);
  if (score >= quizPassScore) {
    state.accessGranted = true;
    state.examStarted = true;
    state.lectureStarted = false;
    el.quizResult.textContent = `准入通过。本次得分 ${score}/100，已达到 ${quizPassScore} 分合格线。请先查看下方 AI 反馈，随后进入大厅选择实验模块。`;
    el.quizResult.className = "quiz-result ok";
    el.retryQuizBtn.hidden = true;
    el.enterHallBtn.hidden = false;
    updateAccessState();
    showToast("准入通过，可继续答疑或手动进入大厅。");
  } else {
    state.accessGranted = false;
    el.quizResult.textContent = `本次未通过。本次得分 ${score}/100，未达到 ${quizPassScore} 分合格线，请回到讲义要点再做一次。`;
    el.quizResult.className = "quiz-result danger";
    el.retryQuizBtn.hidden = false;
    el.enterHallBtn.hidden = true;
    updateAccessState();
    showToast("未通过，请再做一次准入测验。");
  }
}

function skipQuiz() {
  state.accessGranted = true;
  state.examStarted = false;
  state.lectureStarted = false;
  state.lectureRead = true;
  el.quizResult.textContent = "已跳过准入测试，当前仅用于页面调试。";
  el.quizResult.className = "quiz-result ok";
  el.retryQuizBtn.hidden = true;
  el.enterHallBtn.hidden = true;
  updateAccessState();
  switchView("dashboard");
  showToast("已跳过测试，进入实验大厅。");
}

function resetQuiz() {
  el.quizForm.reset();
  el.quizScore.textContent = "--";
  el.quizResult.textContent = "完成测验后，系统会判断是否允许进入大厅。";
  el.quizResult.className = "quiz-result";
  el.quizTutorPanel.hidden = true;
  el.quizTutorSummary.textContent = "提交测验后，系统会在这里给出错题、正确答案和解析。";
  el.quizTutorChat.innerHTML = "";
  el.quizTutorInput.value = "";
  el.retryQuizBtn.hidden = true;
  el.enterHallBtn.hidden = true;
  updateExamProgress();
}

function switchView(viewName) {
  const nextView = viewMeta[viewName] ? viewName : "workspace";
  if (nextView !== "gate" && !state.accessGranted) {
    showToast("请先完成讲义 + 试题准入。");
    return switchView("gate");
  }
  const meta = viewMeta[nextView];
  el.viewEyebrow.textContent = meta.eyebrow;
  el.viewTitle.textContent = meta.title;
  el.viewSubtitle.textContent = meta.subtitle;
  const showRefresh = nextView === "diagnosis";
  const showHallButton = state.accessGranted && nextView !== "gate" && nextView !== "dashboard";
  el.refreshBtn.hidden = !showRefresh;
  el.hallButton.hidden = !showHallButton;
  el.topActions.hidden = !showRefresh && !showHallButton;
  el.topbar.classList.toggle("is-single", !showRefresh && !showHallButton);
  document.querySelector(".system-main")?.classList.toggle("gate-mode", nextView === "gate" && !state.examStarted && !state.lectureStarted);

  appViews.forEach((view) => {
    const active = view.dataset.view === nextView;
    view.classList.toggle("active", active);
    view.hidden = !active;
  });

  window.history.replaceState(null, "", `#${nextView}`);
  window.scrollTo({ top: 0, behavior: "smooth" });
  if (nextView === "gate") {
    el.gateEntryPanel.hidden = state.examStarted || state.lectureStarted;
    el.gateVisualPanel.hidden = state.examStarted || state.lectureStarted;
    el.lecturePanel.hidden = !state.lectureStarted;
    el.quizPanel.hidden = !state.examStarted;
    if (!state.examStarted && !state.lectureStarted) {
      el.gateVisualPanel.classList.remove("released");
      el.releaseBallBtn?.style.setProperty("--pull", "0px");
      el.gateVisualPanel.style.setProperty("--pull-progress", "0");
    }
    if (state.lectureStarted) updateLectureProgress();
  }
  if (nextView === "workspace") drawChart();
  if (nextView === "simulation") {
    drawSimulationCanvas();
  } else {
    stopSimulationAnimation();
  }
}

function renderRun(run) {
  const result = run.result;
  const student = run.student;
  const quality = run.quality || {};
  const preprocessing = quality.preprocessing || {};
  const idealEta = idealViscosityFromRun(run);
  el.terminalVelocity.textContent = `${result.terminal_velocity.toFixed(4)} m/s`;
  el.uniformSegmentLength.textContent = formatUniformSegmentLength(estimateUniformSegmentSpan(run, result.terminal_velocity));
  el.idealViscosity.textContent = idealEta === null ? "--" : `${formatPaS(idealEta)} Pa·s`;
  el.viscosity.textContent = `${formatPaS(result.viscosity)} Pa·s`;
  el.r2.textContent = result.r2.toFixed(3);
  el.re.textContent = result.re.toFixed(3);
  el.fitMethod.textContent = formatFitMethod(quality.fit_method);
  el.outlierCount.textContent = `${preprocessing.outlier_points ?? 0}`;
  el.segmentCv.textContent = Number.isFinite(Number(quality.uniform_segment_cv))
    ? Number(quality.uniform_segment_cv).toFixed(3)
    : "--";
  el.trackingConfidence.textContent = Number.isFinite(Number(result.tracking_confidence))
    ? `${Math.round(Number(result.tracking_confidence) * 100)}%`
    : "--";
  el.score.textContent = formatScore(student.score);
  el.runBadge.textContent = run.id ? `记录 #${run.id}` : "仿真对照";
  if (run.id) {
    el.downloadReport.href = apiUrl(`/api/runs/${run.id}/report`);
    el.downloadReport.classList.remove("disabled");
  } else {
    el.downloadReport.href = "#";
    el.downloadReport.classList.add("disabled");
  }
  renderDiagnostics(run.diagnostics);
  renderUncertainty(run);
  drawChart();
}

function simulationPayload() {
  return {
    scenario: el.simScenario.value,
    radius_mm: number(el.simRadiusMm, 1.5),
    tube_diameter_mm: number(el.simTubeMm, 35),
    liquid_depth_mm: number(el.simDepthMm, 220),
    release_bias: number(el.simRelease, 0),
    refraction: number(el.simRefraction, 0),
    lighting: number(el.simLighting, 1),
  };
}

function resetSimulationDrop() {
  simulationDrop.active = false;
  simulationDrop.completed = false;
  simulationDrop.startTime = null;
  stopSimulationAnimation();
  drawSimulationCanvas();
}

function updateSimulationLabels() {
  el.simReleaseValue.textContent = `${Math.round(number(el.simRelease, 0) * 100)}%`;
  el.simRefractionValue.textContent = `${Math.round(number(el.simRefraction, 0) * 100)}%`;
  el.simLightingValue.textContent = `${Math.round(number(el.simLighting, 1) * 100)}%`;
  resetSimulationDrop();
}

function applySimulationPreset() {
  const preset = simulationPresets[el.simScenario.value] || simulationPresets.standard;
  el.simRadiusMm.value = preset.radius;
  el.simTubeMm.value = preset.tube;
  el.simDepthMm.value = preset.depth;
  el.simRelease.value = preset.release;
  el.simRefraction.value = preset.damping;
  el.simLighting.value = preset.stability;
  if (el.simLiquidNote) el.simLiquidNote.textContent = preset.note;
  updateSimulationLabels();
}

async function runSimulation() {
  setButtonLoading(el.runSimulationBtn, true, "仿真中");
  if (el.simulationStatus) el.simulationStatus.textContent = "计算中";
  el.simFeedbackState.textContent = "计算中";
  el.simFeedbackVt.textContent = "vt 生成中";
  try {
    const result = await api("/api/simulation/run", {
      method: "POST",
      body: JSON.stringify(simulationPayload()),
    });
    state.simulation = result;
    renderSimulation(result);
    playSimulationDropOnce();
    showToast("仿真完成，已输出小球速度曲线。");
  } catch (error) {
    console.error("simulation failed", error);
    renderSimulationError(error.message || "前端渲染异常");
    showToast(`仿真失败：${error.message || "前端渲染异常"}`);
  } finally {
    setButtonLoading(el.runSimulationBtn, false);
  }
}

function renderSimulationError(message) {
  if (el.simulationStatus) el.simulationStatus.textContent = "无法模拟";
  el.simFeedbackState.textContent = "无法模拟";
  el.simFeedbackVt.textContent = "vt --";
  el.simVt.textContent = "--";
  el.simScore.textContent = "--";
  el.simRisk.textContent = "参数无效";
  el.simRe.textContent = "--";
  el.simWallCorrection.textContent = "--";
  el.simReCorrection.textContent = "--";
  el.simCorrectionTotal.textContent = "--";
  el.simulationRubric.innerHTML = `
    <article class="simulation-advice-row danger">
      <span class="advice-index">!</span>
      <div>
        <div class="advice-row-head">
          <strong>容器边界无法成立</strong>
          <span class="advice-level">无法模拟</span>
        </div>
        <p>${escapeHtml(message)}</p>
      </div>
    </article>
  `;
  resetSimulationDrop();
}

function renderSimulation(result) {
  const run = result?.run;
  const sim = result?.simulation;
  if (!run?.result || !sim) {
    throw new Error("仿真结果缺少 run.result 或 simulation 字段");
  }
  const terminalVelocity = ensureSimulationNumber(run.result.terminal_velocity, "终端速度");
  const knownEta = ensureSimulationNumber(sim.known_eta, "液体粘滞系数");
  const riskScore = finiteNumber(sim.risk_score, 0);
  const re = finiteNumber(sim.re);
  const wallCorrection = finiteNumber(sim.wall_correction);
  const reynoldsCorrection = finiteNumber(sim.reynolds_correction);
  const correctionTotal = finiteNumber(sim.correction_total);
  const rubric = Array.isArray(sim.rubric) ? sim.rubric : [];

  if (el.simulationStatus) el.simulationStatus.textContent = "已输出速度";
  const terminalVelocityText = `${terminalVelocity.toFixed(4)} m/s`;
  el.simVt.textContent = terminalVelocityText;
  el.simEta.textContent = `${knownEta < 0.01 ? knownEta.toFixed(6) : knownEta.toFixed(3)} Pa·s`;
  el.simScore.textContent = `${Math.round(riskScore)}`;
  el.simRisk.textContent = sim.risk_label || "已完成";
  el.simRe.textContent = fixed(re, re !== null && re >= 100 ? 1 : 3);
  el.simWallCorrection.textContent = fixed(wallCorrection, 3);
  el.simReCorrection.textContent = fixed(reynoldsCorrection, 3);
  el.simCorrectionTotal.textContent = fixed(correctionTotal, 3);
  el.simFeedbackState.textContent = sim.risk_label || "已完成";
  el.simFeedbackVt.textContent = `vt ${terminalVelocityText}`;
  el.simulationRubric.innerHTML = rubric.length
    ? rubric
    .map(
      (item, index) => `
        <article class="simulation-advice-row ${item.level || "ok"}" style="animation-delay:${index * 60}ms">
          <span class="advice-index">${String(index + 1).padStart(2, "0")}</span>
          <div>
            <div class="advice-row-head">
              <strong>${item.title || "仿真建议"}</strong>
              <span class="advice-level">${item.level === "ok" ? "通过" : item.level === "warn" ? "注意" : "风险"}</span>
            </div>
            <p>${item.message || "仿真已完成，请结合速度曲线观察终端速度平台。"}</p>
          </div>
        </article>
      `,
    )
    .join("")
    : `
        <article class="simulation-advice-row ok">
          <span class="advice-index">01</span>
          <div>
            <div class="advice-row-head">
              <strong>仿真已完成</strong>
              <span class="advice-level">通过</span>
            </div>
            <p>已输出终端速度和修正因子，请结合速度曲线观察平台段。</p>
          </div>
        </article>
      `;
  el.sendSimulationToWorkbenchBtn.disabled = false;
  drawSimulationCanvas();
}

function sendSimulationToWorkbench() {
  if (!state.simulation?.run) {
    showToast("请先运行一次虚拟仿真。");
    return;
  }
  state.latest = state.simulation.run;
  state.chartMode = "velocity";
  document.querySelectorAll(".chart-tabs button").forEach((button) => {
    button.classList.toggle("active", button.dataset.chart === "velocity");
  });
  renderRun(state.latest);
  switchView("workspace");
  showToast("已载入仿真速度曲线作为对照样例。");
}

function startSimulationAnimation() {
  if (simulationAnimationFrame !== null) return;
  const tick = (timestamp) => {
    drawSimulationCanvas(timestamp);
    if (simulationDrop.active && simulationDrop.startTime !== null && timestamp - simulationDrop.startTime >= simulationDrop.duration) {
      simulationDrop.active = false;
      simulationDrop.completed = true;
      simulationAnimationFrame = null;
      drawSimulationCanvas(timestamp);
      return;
    }
    if (document.querySelector("#view-simulation")?.hidden) {
      simulationAnimationFrame = null;
      return;
    }
    simulationAnimationFrame = window.requestAnimationFrame(tick);
  };
  simulationAnimationFrame = window.requestAnimationFrame(tick);
}

function stopSimulationAnimation() {
  if (simulationAnimationFrame === null) return;
  window.cancelAnimationFrame(simulationAnimationFrame);
  simulationAnimationFrame = null;
}

function playSimulationDropOnce() {
  simulationDrop.active = true;
  simulationDrop.completed = false;
  simulationDrop.startTime = null;
  stopSimulationAnimation();
  startSimulationAnimation();
}

function drawSimulationCanvas(timestamp = performance.now()) {
  const canvas = el.simulationCanvas;
  const width = canvas.width;
  const height = canvas.height;
  simCtx.clearRect(0, 0, width, height);
  simCtx.fillStyle = "#fbfcfa";
  simCtx.fillRect(0, 0, width, height);

  const run = state.simulation?.run;
  const points = (run?.curves?.velocity || []).filter((point) => finiteNumber(point?.t) !== null && finiteNumber(point?.v) !== null);
  if (simulationDrop.active && simulationDrop.startTime === null) simulationDrop.startTime = timestamp;
  const elapsed = simulationDrop.startTime === null ? 0 : Math.max(0, timestamp - simulationDrop.startTime);
  const dropProgress = Math.min(1, elapsed / simulationDrop.duration);
  const easedDropProgress = 1 - Math.pow(1 - dropProgress, 3);
  const tube = { x: 72, y: 46, w: 212, h: 458 };
  const progress = simulationDrop.active ? easedDropProgress : simulationDrop.completed ? 1 : 0;
  const drift = points.length
    ? Math.min(0.1, finiteNumber(state.simulation?.simulation?.release_bias, 0) * 0.08)
    : number(el.simRelease, 0) * 0.08;
  drawSimulationCylinder(tube, progress, drift, timestamp);

  const plot = { x: 340, y: 76, w: 500, h: 360 };
  simCtx.save();
  simCtx.strokeStyle = "rgba(32, 35, 31, 0.09)";
  simCtx.lineWidth = 1;
  for (let x = plot.x; x <= plot.x + plot.w; x += 62) {
    simCtx.beginPath();
    simCtx.moveTo(x, plot.y);
    simCtx.lineTo(x, plot.y + plot.h);
    simCtx.stroke();
  }
  for (let y = plot.y; y <= plot.y + plot.h; y += 52) {
    simCtx.beginPath();
    simCtx.moveTo(plot.x, y);
    simCtx.lineTo(plot.x + plot.w, y);
    simCtx.stroke();
  }
  simCtx.fillStyle = "#20231f";
  simCtx.font = "900 26px Avenir Next, sans-serif";
  simCtx.fillText("v(t)", plot.x, 42);
  simCtx.fillStyle = "rgba(106, 114, 109, 0.92)";
  simCtx.font = "800 15px Avenir Next, sans-serif";
  simCtx.fillText(points.length ? "后端已输出小球速度曲线" : "调节液体和容器参数后运行仿真", plot.x + 78, 42);

  const drawPoints = points.length ? points : samplePreviewVelocity();
  const maxT = Math.max(...drawPoints.map((p) => finiteNumber(p.t, 0)), 1);
  const maxV = Math.max(...drawPoints.map((p) => finiteNumber(p.v, 0)), 0.001);
  const xFor = (t) => plot.x + (t / maxT) * plot.w;
  const yFor = (v) => plot.y + plot.h - (v / maxV) * plot.h * 0.88;
  simCtx.strokeStyle = points.length ? "#a26025" : "rgba(162, 96, 37, 0.48)";
  simCtx.lineWidth = 5;
  simCtx.lineCap = "round";
  simCtx.lineJoin = "round";
  simCtx.beginPath();
  drawPoints.forEach((point, index) => {
    const pointT = finiteNumber(point.t, 0);
    const pointV = finiteNumber(point.v, 0);
    if (index === 0) simCtx.moveTo(xFor(pointT), yFor(pointV));
    else simCtx.lineTo(xFor(pointT), yFor(pointV));
  });
  simCtx.stroke();

  if (points.length) {
    const terminalVelocity = finiteNumber(state.simulation?.run?.result?.terminal_velocity);
    if (terminalVelocity === null) {
      simCtx.restore();
      return;
    }
    simCtx.strokeStyle = "rgba(50, 122, 102, 0.44)";
    simCtx.setLineDash([8, 8]);
    const vtY = yFor(terminalVelocity);
    simCtx.beginPath();
    simCtx.moveTo(plot.x, vtY);
    simCtx.lineTo(plot.x + plot.w, vtY);
    simCtx.stroke();
    simCtx.setLineDash([]);
    simCtx.fillStyle = "#235b4c";
    simCtx.font = "900 14px ui-monospace, monospace";
    simCtx.fillText(`vt=${terminalVelocity.toFixed(4)} m/s`, plot.x + plot.w - 156, vtY - 12);
  }
  simCtx.restore();
}

function samplePreviewVelocity() {
  const release = number(el.simRelease);
  const damping = number(el.simRefraction);
  const stability = number(el.simLighting);
  const terminal = 0.075 + (1 - damping) * 0.035;
  const tau = 0.22 + release * 0.12;
  return Array.from({ length: 70 }, (_, index) => {
    const t = index * 0.045;
    const v = terminal * (1 - Math.exp(-t / tau)) + Math.sin(index * 0.55) * (1 - stability) * 0.004;
    return { t, v: Math.max(0, v) };
  });
}

function drawSimulationCylinder(tube, progress, drift, timestamp) {
  const glass = {
    left: tube.x + 36,
    right: tube.x + tube.w - 36,
    top: tube.y + 30,
    bottom: tube.y + tube.h - 42,
  };
  const centerX = (glass.left + glass.right) / 2;
  const liquidTop = glass.top + 46;
  const liquidBottom = glass.bottom - 10;
  const innerWidth = glass.right - glass.left;

  simCtx.save();
  simCtx.fillStyle = "rgba(32, 35, 31, 0.06)";
  roundRect(simCtx, tube.x + 28, tube.y + tube.h - 26, tube.w - 56, 22, 12);
  simCtx.fill();

  simCtx.strokeStyle = "rgba(39, 64, 58, 0.3)";
  simCtx.lineWidth = 3;
  simCtx.beginPath();
  simCtx.ellipse(centerX, glass.top, innerWidth / 2, 14, 0, Math.PI, Math.PI * 2);
  simCtx.moveTo(glass.left, glass.top);
  simCtx.lineTo(glass.left, glass.bottom);
  simCtx.ellipse(centerX, glass.bottom, innerWidth / 2, 16, 0, Math.PI, 0, true);
  simCtx.lineTo(glass.right, glass.top);
  simCtx.stroke();

  const liquidGradient = simCtx.createLinearGradient(glass.left, liquidTop, glass.right, liquidBottom);
  liquidGradient.addColorStop(0, "rgba(183, 222, 214, 0.2)");
  liquidGradient.addColorStop(0.55, "rgba(75, 142, 126, 0.18)");
  liquidGradient.addColorStop(1, "rgba(35, 91, 76, 0.1)");
  simCtx.fillStyle = liquidGradient;
  simCtx.beginPath();
  simCtx.moveTo(glass.left + 2, liquidTop);
  simCtx.lineTo(glass.left + 2, glass.bottom - 2);
  simCtx.ellipse(centerX, glass.bottom - 2, innerWidth / 2 - 2, 14, 0, Math.PI, 0, true);
  simCtx.lineTo(glass.right - 2, liquidTop);
  simCtx.ellipse(centerX, liquidTop, innerWidth / 2 - 2, 10, 0, 0, Math.PI, true);
  simCtx.fill();

  simCtx.strokeStyle = "rgba(50, 122, 102, 0.24)";
  simCtx.lineWidth = 2;
  simCtx.beginPath();
  simCtx.ellipse(centerX, liquidTop, innerWidth / 2 - 3, 10, 0, 0, Math.PI * 2);
  simCtx.stroke();

  simCtx.strokeStyle = "rgba(32, 35, 31, 0.24)";
  simCtx.lineWidth = 1.4;
  simCtx.font = "800 12px ui-monospace, monospace";
  simCtx.fillStyle = "rgba(32, 35, 31, 0.52)";
  for (let index = 0; index <= 9; index += 1) {
    const y = glass.top + 32 + index * ((glass.bottom - glass.top - 58) / 9);
    const longTick = index % 3 === 0;
    simCtx.beginPath();
    simCtx.moveTo(glass.right + 10, y);
    simCtx.lineTo(glass.right + (longTick ? 36 : 24), y);
    simCtx.stroke();
    if (longTick) simCtx.fillText(`${index * 20}`, glass.right + 42, y + 4);
  }

  simCtx.strokeStyle = "rgba(35, 91, 76, 0.18)";
  simCtx.setLineDash([7, 9]);
  simCtx.beginPath();
  simCtx.moveTo(centerX, glass.top + 8);
  simCtx.lineTo(centerX, glass.bottom - 8);
  simCtx.stroke();
  simCtx.setLineDash([]);

  const fallStart = liquidTop - 28;
  const fallEnd = liquidBottom - 26;
  const eased = Math.min(1, Math.max(0, progress));
  const ballY = fallStart + (fallEnd - fallStart) * eased;
  const ballX = centerX + Math.sin(timestamp / 420) * drift * innerWidth;

  const trail = simCtx.createLinearGradient(ballX, Math.max(fallStart, ballY - 92), ballX, ballY + 8);
  trail.addColorStop(0, "rgba(185, 121, 61, 0)");
  trail.addColorStop(1, "rgba(185, 121, 61, 0.24)");
  simCtx.strokeStyle = trail;
  simCtx.lineWidth = 5;
  simCtx.beginPath();
  simCtx.moveTo(ballX, Math.max(fallStart, ballY - 92));
  simCtx.lineTo(ballX, ballY - 16);
  simCtx.stroke();

  const ballGradient = simCtx.createRadialGradient(ballX - 7, ballY - 8, 3, ballX, ballY, 18);
  ballGradient.addColorStop(0, "#f0c877");
  ballGradient.addColorStop(0.48, "#c89148");
  ballGradient.addColorStop(1, "#805329");
  simCtx.fillStyle = ballGradient;
  simCtx.beginPath();
  simCtx.arc(ballX, ballY, 15, 0, Math.PI * 2);
  simCtx.fill();
  simCtx.strokeStyle = "rgba(32, 35, 31, 0.28)";
  simCtx.lineWidth = 1.2;
  simCtx.stroke();

  simCtx.strokeStyle = "rgba(255, 255, 255, 0.76)";
  simCtx.lineWidth = 5;
  simCtx.beginPath();
  simCtx.moveTo(glass.left + 18, glass.top + 16);
  simCtx.lineTo(glass.left + 18, glass.bottom - 30);
  simCtx.stroke();
  simCtx.strokeStyle = "rgba(255, 255, 255, 0.52)";
  simCtx.lineWidth = 2;
  simCtx.beginPath();
  simCtx.moveTo(glass.right - 18, glass.top + 20);
  simCtx.lineTo(glass.right - 18, glass.bottom - 32);
  simCtx.stroke();

  simCtx.fillStyle = "#20231f";
  simCtx.font = "900 18px Avenir Next, sans-serif";
  simCtx.fillText("平面量筒", tube.x + 16, 34);
  simCtx.fillStyle = "rgba(106, 114, 109, 0.9)";
  simCtx.font = "800 11px Avenir Next, sans-serif";
  simCtx.fillText("小球沿中心轴下落", tube.x + 14, tube.y + tube.h - 12);
  simCtx.restore();
}

function roundRect(context, x, y, width, height, radius) {
  context.beginPath();
  context.moveTo(x + radius, y);
  context.arcTo(x + width, y, x + width, y + height, radius);
  context.arcTo(x + width, y + height, x, y + height, radius);
  context.arcTo(x, y + height, x, y, radius);
  context.arcTo(x, y, x + width, y, radius);
  context.closePath();
}

function renderDiagnostics(items) {
  el.diagnostics.innerHTML = items
    .map(
      (item, index) => `
        <article class="diagnostic ${item.level}" style="animation-delay:${index * 60}ms">
          <img src="${assetMap.diagnostic[item.level] || assetMap.diagnostic.ok}" alt="" />
          <div>
            <strong>${item.title}</strong>
            <p>${item.message}</p>
          </div>
        </article>
      `,
    )
    .join("");
}

async function loadRecords() {
  setButtonLoading(el.refreshBtn, true, "刷新中");
  try {
    const data = await api("/api/runs?limit=20");
    state.records = data.runs || [];
    const availableIds = new Set(state.records.map((row) => String(row.id)));
    state.selectedRecordIds = new Set([...state.selectedRecordIds].filter((id) => availableIds.has(String(id))));
    renderRecordsTable();
    if (el.refreshBtn.dataset.userTriggered === "true") {
      showToast("实验记录已刷新。");
    }
  } catch (error) {
    el.recordsBody.innerHTML = `<tr><td colspan="8">记录读取失败：${error.message}</td></tr>`;
  } finally {
    syncRecordSelectionControls();
    setButtonLoading(el.refreshBtn, false);
    el.refreshBtn.dataset.userTriggered = "false";
  }
}

function renderRecordsTable() {
  const rows = state.records;
  el.recordsBody.innerHTML = rows.length
    ? rows.map(renderRecordRow).join("")
    : `<tr><td colspan="8">暂无真实轨迹分析记录</td></tr>`;
  syncRecordSelectionControls();
}

function renderRecordRow(row) {
  const rowId = String(row.id);
  const checked = state.selectedRecordIds.has(rowId) ? "checked" : "";
  return `
    <tr>
      <td class="select-cell">
        <input class="record-select" type="checkbox" data-record-select="${row.id}" aria-label="选择记录 ${row.id}" ${checked} />
      </td>
      <td>${row.id}</td>
      <td>${escapeHtml(row.created_at.replace("T", " "))}</td>
      <td>${escapeHtml(row.liquid)}</td>
      <td>${row.terminal_velocity.toFixed(4)}</td>
      <td>${row.viscosity.toFixed(3)}</td>
      <td><span class="record-video-badge ${row.has_video ? "is-ready" : ""}">${row.has_video ? "可回放" : "无录像"}</span></td>
      <td class="record-row-actions">
        <button class="table-action" type="button" data-load-run="${row.id}">
          <img src="${assetMap.buttons.loadRecord}" alt="" />
          <span>载入</span>
        </button>
        <button class="table-action danger" type="button" data-delete-run="${row.id}">
          <img src="${assetMap.buttons.diagnostic}" alt="" />
          <span>删除</span>
        </button>
      </td>
    </tr>
  `;
}

function syncRecordSelectionControls() {
  const total = state.records.length;
  const selected = state.records.filter((row) => state.selectedRecordIds.has(String(row.id))).length;
  if (el.selectAllRecords) {
    el.selectAllRecords.checked = total > 0 && selected === total;
    el.selectAllRecords.indeterminate = selected > 0 && selected < total;
    el.selectAllRecords.disabled = total === 0;
  }
  if (el.deleteSelectedRecordsBtn) {
    el.deleteSelectedRecordsBtn.disabled = selected === 0;
    const label = el.deleteSelectedRecordsBtn.querySelector("span");
    if (label) label.textContent = selected > 0 ? `删除所选 ${selected}` : "删除所选";
  }
}

function toggleRecordSelection(id, checked) {
  const key = String(id);
  if (checked) {
    state.selectedRecordIds.add(key);
  } else {
    state.selectedRecordIds.delete(key);
  }
  syncRecordSelectionControls();
}

function toggleAllRecords(checked) {
  state.selectedRecordIds = checked
    ? new Set(state.records.map((row) => String(row.id)))
    : new Set();
  renderRecordsTable();
}

function formatScore(score) {
  if (score === null || score === undefined || score === "") return "未填写";
  return Number.isFinite(Number(score)) ? Math.round(Number(score)) : "未填写";
}

function formatFitMethod(method) {
  const label = {
    weighted_huber_linear_fit: "稳健带权拟合",
    linear_fit: "线性拟合",
  }[method];
  return label || "--";
}

async function loadRun(id) {
  const activeButton = el.recordsBody.querySelector(`[data-load-run="${id}"]`);
  setButtonLoading(activeButton, true, "载入中");
  try {
    const run = await api(`/api/runs/${id}`);
    state.latest = run;
    renderRun(run);
    if (run.video?.url) {
      showRecordedVideo(run);
    } else if (state.source === "video") {
      resetVideoPreview();
      el.videoReadinessLabel.textContent = "无历史录像";
      el.videoReadinessDetail.textContent = "这条记录没有保存摄像机视频，只能回看速度曲线、粘度结果和不确定度。";
    }
    switchView("workspace");
    showToast(`已载入记录 #${id}`);
  } catch (error) {
    showToast(`载入失败：${error.message}`);
  } finally {
    setButtonLoading(activeButton, false);
  }
}

function clearLatestRecordIfDeleted(ids) {
  if (!state.latest?.id) return;
  const deleted = ids.map((id) => String(id));
  if (!deleted.includes(String(state.latest.id))) return;
  state.latest.id = null;
  el.runBadge.textContent = "当前记录已删除";
  el.downloadReport.href = "#";
  el.downloadReport.classList.add("disabled");
}

async function deleteRecord(id) {
  const activeButton = el.recordsBody.querySelector(`[data-delete-run="${id}"]`);
  if (!window.confirm(`确认删除记录 #${id}？删除后将不再出现在实验记录中。`)) return;
  setButtonLoading(activeButton, true, "删除中");
  try {
    await api(`/api/runs/${id}`, { method: "DELETE" });
    state.selectedRecordIds.delete(String(id));
    clearLatestRecordIfDeleted([id]);
    await loadRecords();
    showToast(`已删除记录 #${id}`);
  } catch (error) {
    showToast(`删除失败：${error.message}`);
  } finally {
    setButtonLoading(activeButton, false);
  }
}

async function deleteSelectedRecords() {
  const ids = state.records
    .map((row) => String(row.id))
    .filter((id) => state.selectedRecordIds.has(id));
  if (!ids.length) {
    showToast("请先勾选要删除的实验记录。");
    return;
  }
  if (!window.confirm(`确认删除选中的 ${ids.length} 条实验记录？`)) return;
  setButtonLoading(el.deleteSelectedRecordsBtn, true, "删除中");
  try {
    const data = await api("/api/runs/delete", {
      method: "POST",
      body: JSON.stringify({ ids }),
    });
    clearLatestRecordIfDeleted(ids);
    state.selectedRecordIds = new Set();
    await loadRecords();
    showToast(`已删除 ${data.deleted || ids.length} 条实验记录`);
  } catch (error) {
    showToast(`批量删除失败：${error.message}`);
  } finally {
    setButtonLoading(el.deleteSelectedRecordsBtn, false);
    syncRecordSelectionControls();
  }
}

function drawChart() {
  const canvas = el.chart;
  const width = canvas.width;
  const height = canvas.height;
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#fbfcfa";
  ctx.fillRect(0, 0, width, height);
  drawGrid(width, height);

  if (!state.latest) {
    ctx.fillStyle = "rgba(106, 114, 109, 0.9)";
    ctx.font = "800 22px system-ui";
    ctx.textAlign = "center";
    ctx.fillText("导入真实 CSV 后显示曲线", width / 2, height / 2);
    return;
  }

  const data = state.latest.curves?.[state.chartMode] || [];
  const pad = { left: 70, right: 36, top: 34, bottom: 52 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;
  if (!Array.isArray(data) || !data.length) {
    ctx.save();
    ctx.fillStyle = "rgba(106, 114, 109, 0.88)";
    ctx.font = "800 18px system-ui";
    ctx.textAlign = "center";
    const waitingText = state.latest.quality?.fit_method === "live_frame_preview"
      ? "等待实时轨迹点"
      : "暂无可绘制曲线";
    ctx.fillText(waitingText, pad.left + plotW / 2, pad.top + plotH / 2);
    ctx.font = "700 13px system-ui";
    ctx.fillStyle = "rgba(106, 114, 109, 0.66)";
    ctx.fillText("连接实时画面并释放小球后，曲线会随识别点更新", pad.left + plotW / 2, pad.top + plotH / 2 + 28);
    ctx.restore();
    return;
  }
  const maxT = Math.max(0.001, ...data.map((p) => Number(p.t) || 0));
  const values = data.map((p) => (state.chartMode === "position" ? p.y : p.v));
  const minValue = Math.min(0, ...values);
  const maxValue = Math.max(...values);
  const range = Math.max(0.0001, maxValue - minValue);
  const x = (t) => pad.left + (t / maxT) * plotW;
  const y = (value) => pad.top + plotH - ((value - minValue) / range) * plotH;

  if (state.latest.segment && state.chartMode === "velocity") {
    const segment = state.latest.segment;
    const startT = data[segment.start]?.t ?? 0;
    const endT = data[segment.end]?.t ?? maxT;
    ctx.fillStyle = "rgba(50, 122, 102, 0.10)";
    ctx.fillRect(x(startT), pad.top, x(endT) - x(startT), plotH);
  }

  ctx.save();
  ctx.strokeStyle = state.chartMode === "position" ? "#327a66" : "#a26025";
  ctx.lineWidth = 4;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.beginPath();
  data.forEach((point, index) => {
    const value = state.chartMode === "position" ? point.y : point.v;
    if (index === 0) ctx.moveTo(x(point.t), y(value));
    else ctx.lineTo(x(point.t), y(value));
  });
  ctx.stroke();
  ctx.restore();

  ctx.save();
  ctx.fillStyle = "rgba(32, 35, 31, 0.76)";
  ctx.font = "800 16px system-ui";
  ctx.fillText(state.chartMode === "position" ? "位移 y(t) / m" : "速度 v(t) / m·s⁻¹", pad.left, 24);
  ctx.font = "700 13px ui-monospace, monospace";
  ctx.fillStyle = "rgba(106, 114, 109, 0.92)";
  ctx.fillText(`max ${maxValue.toFixed(4)}`, 16, pad.top + 10);
  ctx.fillText("time / s", width - 98, height - 18);
  ctx.restore();
}

function drawGrid(width, height) {
  ctx.save();
  ctx.strokeStyle = "rgba(32, 35, 31, 0.075)";
  ctx.lineWidth = 1;
  for (let x = 70; x < width - 36; x += 82) {
    ctx.beginPath();
    ctx.moveTo(x, 34);
    ctx.lineTo(x, height - 52);
    ctx.stroke();
  }
  for (let y = 34; y < height - 52; y += 50) {
    ctx.beginPath();
    ctx.moveTo(70, y);
    ctx.lineTo(width - 36, y);
    ctx.stroke();
  }
  ctx.restore();
}

function addMessage(type, text) {
  const message = document.createElement("div");
  message.className = `message ${type}`;
  message.textContent = text;
  el.chatLog.appendChild(message);
  el.chatLog.scrollTop = el.chatLog.scrollHeight;
  return message;
}

async function ask(question, sourceButton = null) {
  if (!question.trim()) return;
  addMessage("user", question);
  if (!isExperimentRelatedQuestion(question)) {
    addMessage("ai", "这个问题与落球法测粘、AI视觉测量、虚拟仿真、讲义或实验误差分析无关，我不能在本系统中回答。");
    return;
  }
  const pending = addMessage("ai pending", "正在根据实验讲义与测量规则生成答复...");
  setButtonLoading(sourceButton, true, "生成中");
  try {
    const data = await api("/api/assistant/ask", {
      method: "POST",
      body: JSON.stringify({ question }),
    });
    pending.className = "message ai";
    renderAssistantAnswer(pending, data);
  } catch (error) {
    pending.className = "message ai";
    pending.textContent = `问答失败：${error.message}`;
  } finally {
    setButtonLoading(sourceButton, false);
  }
}

async function loadModules() {
  try {
    const data = await api("/api/modules");
    el.modulePositioning.textContent = data.positioning;
    el.moduleGrid.innerHTML = data.modules.map(renderModuleCard).join("");
  } catch (error) {
    el.modulePositioning.textContent = `功能模块读取失败：${error.message}`;
  }
}

async function loadReadiness() {
  try {
    const data = await api("/api/readiness");
    el.readinessStage.textContent = data.stage;
    el.readinessPositioning.textContent = data.positioning;
    el.readinessCards.innerHTML = data.cards
      .map(
        (card, index) => `
          <article class="readiness-card" style="--i:${index}">
            <img src="./assets/generated/icons/${assetMap.readiness[index]}.png" alt="" />
            <span>${card.label}</span>
            <strong>${card.value}</strong>
            <p>${card.detail}</p>
          </article>
        `,
      )
      .join("");
    el.workflowList.innerHTML = data.workflow.map((item, index) => `<li style="--i:${index}">${item}</li>`).join("");
    el.deviceChecklist.innerHTML = data.device_checklist.map((item) => `<li>${item}</li>`).join("");
    el.guardrailList.innerHTML = data.guardrails.map((item) => `<li>${item}</li>`).join("");
    el.videoPipelineList.innerHTML = data.video_pipeline.map(renderVideoPipelineItem).join("");
  } catch (error) {
    el.readinessStage.textContent = "平台状态读取失败";
    el.readinessPositioning.textContent = error.message;
  }
}

function renderVideoPipelineItem(item, index) {
  return `
    <article style="--i:${index}">
      <span>${item.status}</span>
      <strong>${item.title}</strong>
      <p>${item.detail}</p>
    </article>
  `;
}

function renderModuleCard(module) {
  const statusText = {
    active: "已接入",
    planned: "待验证",
  }[module.status] || module.status;
  return `
    <article class="${module.status}" style="--i:${moduleIndex(module.tier, module.title)}">
      <div class="module-header">
        <span>${module.tier}<em class="module-status">${statusText}</em></span>
        <i>${String(moduleIndex(module.tier, module.title) + 1).padStart(2, "0")}</i>
      </div>
      <h3>${module.title}</h3>
      <p>${module.summary}</p>
      <p class="module-scope">${module.scope}</p>
      <p class="module-scope">${module.experiment_role}</p>
      <div class="module-items">${module.items.map((item) => `<b>${item}</b>`).join("")}</div>
    </article>
  `;
}

function moduleIndex(tier, title) {
  const key = `${tier}:${title}`;
  const order = [
    "主链路:摄像机数据到待测粘度闭环",
    "反馈:人工结果对比与误差诊断",
    "仿真:已知液体的小球速度输出",
    "验证:固定机位与折射标定验证",
  ];
  return Math.max(0, order.indexOf(key));
}

function applyPreset(name) {
  const preset = presets[name];
  if (!preset) return;
  el.rhoLiquid.value = preset.rhoLiquid;
  el.etaReference.value = preset.etaReference;
  el.radiusMm.value = preset.radiusMm;
  el.rhoBall.value = preset.rhoBall;
  el.tubeDiameterMm.value = preset.tubeDiameterMm;
  el.liquidDepthMm.value = preset.liquidDepthMm;
}

function showToast(text) {
  el.toast.textContent = text;
  el.toast.classList.add("show");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => el.toast.classList.remove("show"), 2600);
}

function bind() {
  el.startQuizBtn.addEventListener("click", startQuiz);
  el.lectureReader.addEventListener("scroll", updateLectureProgress);
  setupReleaseBall();
  el.quizForm.addEventListener("submit", evaluateQuiz);
  el.quizForm.addEventListener("change", updateExamProgress);
  el.enterHallBtn.addEventListener("click", () => switchView("dashboard"));
  el.skipQuizBtn.addEventListener("click", skipQuiz);
  el.quizTutorForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const question = el.quizTutorInput.value.trim();
    el.quizTutorInput.value = "";
    askQuizTutor(question, el.quizTutorForm.querySelector("button[type='submit']"));
  });
  el.retryQuizBtn.addEventListener("click", resetQuiz);
  el.dashboardBackBtn?.addEventListener("click", () => switchView("gate"));
  el.resetAccessBtn?.addEventListener("click", () => {
    state.accessGranted = false;
    state.examStarted = false;
    state.lectureStarted = false;
    state.lectureRead = false;
    updateAccessState();
    resetQuiz();
    el.gateEntryPanel.hidden = false;
    el.gateVisualPanel.hidden = false;
    el.gateVisualPanel.classList.remove("released");
    el.releaseBallBtn?.style.setProperty("--pull", "0px");
    el.gateVisualPanel.style.setProperty("--pull-progress", "0");
    el.lecturePanel.hidden = true;
    el.lectureReader.scrollTop = 0;
    el.startQuizBtn.disabled = true;
    updateLectureProgress();
    el.quizPanel.hidden = true;
    switchView("gate");
    showToast("已重置准入状态。");
  });
  el.uploadTrajectoryBtn.addEventListener("click", uploadTrajectory);
  el.refreshBtn.addEventListener("click", () => {
    el.refreshBtn.dataset.userTriggered = "true";
    loadRecords();
  });
  el.selectAllRecords?.addEventListener("change", () => {
    toggleAllRecords(el.selectAllRecords.checked);
  });
  el.deleteSelectedRecordsBtn?.addEventListener("click", deleteSelectedRecords);
  el.presetBtn.addEventListener("click", () => {
    el.liquid.value = "纯甘油 25℃";
    applyPreset("纯甘油 25℃");
    showToast("已恢复默认样本与仪器参数。");
  });
  el.liquid.addEventListener("change", () => applyPreset(el.liquid.value));
  el.trajectoryInput.addEventListener("change", updateSelectedFile);
  el.videoPreview.addEventListener("loadedmetadata", handleVideoMetadataLoaded);
  el.videoPreview.addEventListener("error", () => {
    el.videoReadinessLabel.textContent = "读取失败";
    el.videoReadinessDetail.textContent = "浏览器无法读取该视频，请更换 mp4、mov 或 webm。";
    const file = el.trajectoryInput.files?.[0];
    if (file) updateFileQueue(file.name, "失败", "浏览器无法读取该视频文件。");
  });
  el.refreshCameraListBtn?.addEventListener("click", () => refreshCameraDevices());
  el.liveCameraSelect?.addEventListener("change", () => {
    if (state.liveStream) startLiveCamera();
  });
  el.startLiveCameraBtn?.addEventListener("click", startLiveCamera);
  el.stopLiveCameraBtn?.addEventListener("click", () => stopLiveCamera());
  el.startCalibrationBtn?.addEventListener("click", startManualCalibration);
  el.resetCalibrationBtn?.addEventListener("click", resetManualCalibration);
  el.finishCalibrationBtn?.addEventListener("click", finishManualCalibration);
  el.exitCalibrationFullscreenBtn?.addEventListener("click", exitCalibrationFullscreen);
  el.toggleLiveZoomBtn?.addEventListener("click", toggleLiveZoom);
  el.toggleLiveMagnifyBtn?.addEventListener("click", toggleManualZoomTargeting);
  el.resetLiveMagnifyBtn?.addEventListener("click", resetManualVideoZoom);
  el.liveZoomTargetLayer?.addEventListener("click", handleManualZoomTargetClick);
  document.addEventListener("fullscreenchange", handleFullscreenChange);
  el.calibrationClickLayer?.addEventListener("click", handleCalibrationClick);
  el.calibrationClickLayer?.addEventListener("pointermove", (event) => {
    const rect = el.calibrationClickLayer.getBoundingClientRect();
    const mediaPoint = layerPointToMediaNorm(event, rect);
    const displayPoint = mediaNormToLayerPoint(mediaPoint.xNorm, mediaPoint.yNorm, rect);
    el.calibrationClickLayer.style.setProperty("--cursor-x", `${displayPoint.xPct}%`);
    el.calibrationClickLayer.style.setProperty("--cursor-y", `${displayPoint.yPct}%`);
  });
  el.startLiveRecordBtn?.addEventListener("click", startLiveRecording);
  el.stopLiveRecordBtn?.addEventListener("click", stopLiveRecording);
  el.startRoiSelectBtn?.addEventListener("click", startRoiSelection);
  el.clearRoiBtn?.addEventListener("click", clearRoiSelection);
  el.startCylinderEdgeMarkBtn?.addEventListener("click", startCylinderEdgeMarking);
  el.resetCylinderEdgeMarkBtn?.addEventListener("click", resetCylinderEdgeMarking);
  el.cylinderEdgeClickLayer?.addEventListener("click", handleCylinderEdgeClick);
  [el.calibrationRodDiameterMm, el.calibrationRodLengthMm, el.rodTickSpacingMm].forEach((input) => {
    input?.addEventListener("input", handleCalibrationConfigChange);
  });
  [el.cylinderCenterX, el.cylinderWidthPct, el.fallOffsetThreshold].forEach((input) => {
    input?.addEventListener("input", () => {
      updateCylinderOverlay();
      if (FALL_OFFSET_MONITOR_ENABLED && state.liveTrajectory.length) {
        updateFallOffsetStatus(state.liveTrajectory[state.liveTrajectory.length - 1]);
      }
      else resetFallOffsetStatus();
    });
  });
  [
    el.nonlinearCorrectionEnabled,
  ].forEach((input) => {
    input?.addEventListener("input", updateNonlinearCorrectionStatus);
    input?.addEventListener("change", updateNonlinearCorrectionStatus);
  });
  document.querySelectorAll("[data-correction-mode]").forEach((button) => {
    button.addEventListener("click", () => setCorrectionMode(button.dataset.correctionMode));
  });
  document.querySelectorAll("[data-source]").forEach((button) => {
    button.addEventListener("click", () => setDataSource(button.dataset.source));
  });
  window.addEventListener("resize", () => {
    window.requestAnimationFrame(refreshLiveOverlayGeometry);
  });
  document.querySelectorAll(".chart-tabs button").forEach((button) => {
    button.addEventListener("click", () => {
      document.querySelectorAll(".chart-tabs button").forEach((item) => item.classList.remove("active"));
      button.classList.add("active");
      state.chartMode = button.dataset.chart;
      drawChart();
    });
  });
  document.querySelectorAll("[data-uncertainty-input]").forEach((input) => {
    input.addEventListener("input", () => renderUncertainty());
  });
  el.recordsBody.addEventListener("click", (event) => {
    const loadButton = event.target.closest("[data-load-run]");
    if (loadButton) {
      loadRun(loadButton.dataset.loadRun);
      return;
    }
    const deleteButton = event.target.closest("[data-delete-run]");
    if (deleteButton) {
      deleteRecord(deleteButton.dataset.deleteRun);
    }
  });
  el.recordsBody.addEventListener("change", (event) => {
    const checkbox = event.target.closest("[data-record-select]");
    if (checkbox) {
      toggleRecordSelection(checkbox.dataset.recordSelect, checkbox.checked);
    }
  });
  el.chatForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const question = el.questionInput.value.trim();
    el.questionInput.value = "";
    ask(question, el.chatForm.querySelector("button[type='submit']"));
  });
  document.querySelectorAll("[data-question]").forEach((button) => {
    button.addEventListener("click", () => ask(button.dataset.question, button));
  });
  document.querySelectorAll("[data-go-view]").forEach((button) => {
    button.addEventListener("click", () => switchView(button.dataset.goView));
  });
  [el.simRelease, el.simRefraction, el.simLighting, el.simRadiusMm, el.simTubeMm, el.simDepthMm].forEach((input) => {
    input.addEventListener("input", updateSimulationLabels);
  });
  el.simScenario.addEventListener("change", applySimulationPreset);
  el.runSimulationBtn.addEventListener("click", runSimulation);
  el.sendSimulationToWorkbenchBtn.addEventListener("click", sendSimulationToWorkbench);
}

async function init() {
  bind();
  renderQuizQuestions();
  updateAccessState();
  updateSimulationLabels();
  syncCalibrationTargetCount();
  updateLiveCalibrationStatus();
  const initialView = window.location.hash.replace("#", "");
  switchView(initialView === "gate" ? "gate" : "gate");
  setDataSource("realtime");
  renderEmptyState();
  refreshCameraDevices({ silent: true });
  await checkHealth();
  await loadReadiness();
  await loadModules();
  await loadRecords();
  addMessage("ai", "平台已连接后端算法服务。AI实验模块用于摄像机/真实轨迹测量待测液体粘滞系数；虚拟仿真模块用于已知液体条件下输出小球速度曲线。系统不替代学生实验操作和误差分析。");
}

init();
