const LIVE_FRAME_TARGET_FPS = 60;
const LIVE_FRAME_INTERVAL_MS = Math.round(1000 / LIVE_FRAME_TARGET_FPS);
const LIVE_FRAME_MAX_WIDTH = 1920;
const LIVE_FRAME_JPEG_QUALITY = 0.9;
const LIVE_MIN_TRACK_CONFIDENCE = 0.38;
const LIVE_STATIC_POINT_LIMIT = 5;
const LIVE_STATIC_POINT_MATCH_NORM = 0.006;
const LIVE_STATIC_POINT_RADIUS_NORM = 0.018;
const LIVE_STATIC_POINT_MAX_ZONES = 8;
const LIVE_CHART_INTERVAL_MS = 120;
const LIVE_BACKEND_FAILURE_LIMIT = 5;
const LIVE_TRAJECTORY_LIMIT = 2400;
const LIVE_MAX_IN_FLIGHT_FRAMES = 3;
const LIVE_SAMPLE_FPS_WINDOW_MS = 1000;
const FALL_OFFSET_MONITOR_ENABLED = true;
const LOCAL_API_BASE_URL = "http://127.0.0.1:8877";
const HOSTED_API_BASE_URL = "https://42.194.177.159";
const apiQueryBaseUrl = new URLSearchParams(window.location.search).get("api") || "";
const storedApiBaseUrl = window.localStorage?.getItem("fallingBallApiBase") || "";
const isLocalPageHost = ["127.0.0.1", "localhost"].includes(window.location.hostname);
const configuredApiBaseUrl = apiQueryBaseUrl || (isLocalPageHost ? "" : storedApiBaseUrl);
const API_BASE_URL = (() => {
  const configured = configuredApiBaseUrl;
  if (configured) return configured.replace(/\/$/, "");
  const host = window.location.hostname;
  if (host.endsWith("github.io")) return HOSTED_API_BASE_URL;
  if (window.location.protocol === "file:") return HOSTED_API_BASE_URL;
  return "";
})();
const API_BASE_EXPLICIT = Boolean(apiQueryBaseUrl || (!isLocalPageHost && storedApiBaseUrl));

const state = {
  latest: null,
  records: [],
  selectedRecordIds: new Set(),
  summaryReportMarkdown: "",
  summaryReportIds: [],
  chartMode: "position",
  source: "realtime",
  videoUrl: null,
  archivedVideoLoadTimer: null,
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
  liveStaticCandidate: null,
  liveIgnoreZones: [],
  liveMisses: 0,
  liveBackendFailures: 0,
  liveSampleWindowStart: 0,
  liveSampleWindowFrames: 0,
  liveMeasuredSampleFps: 0,
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
  manualScaleMPerPx: null,
  liveZoomMode: null,
  manualZoomActive: false,
  manualZoomScale: 1,
  manualZoomOrigin: { x: 50, y: 50 },
  simulationChartMode: "position",
  accessGranted: false,
  examStarted: false,
  lectureStarted: false,
  lectureRead: false,
  simulation: null,
  quizSubmitted: false,
  quizAnswers: {},
  quizTutorContext: null,
  quizDialogQuestion: null,
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
  quizQuestionDialog: document.getElementById("quizQuestionDialog"),
  quizDialogMeta: document.getElementById("quizDialogMeta"),
  quizDialogTitle: document.getElementById("quizDialogTitle"),
  quizDialogContext: document.getElementById("quizDialogContext"),
  quizDialogChat: document.getElementById("quizDialogChat"),
  quizDialogForm: document.getElementById("quizDialogForm"),
  quizDialogInput: document.getElementById("quizDialogInput"),
  closeQuizDialogBtn: document.getElementById("closeQuizDialogBtn"),
  submitQuizBtn: document.getElementById("submitQuizBtn"),
  retryQuizBtn: document.getElementById("retryQuizBtn"),
  enterHallBtn: document.getElementById("enterHallBtn"),
  directHallBtn: document.getElementById("directHallBtn"),
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
  scoreReportBtn: document.getElementById("scoreReportBtn"),
  studentScorePanel: document.getElementById("studentScorePanel"),
  studentScoreValue: document.getElementById("studentScoreValue"),
  studentScoreRows: document.getElementById("studentScoreRows"),
  reportPreviewPanel: document.getElementById("reportPreviewPanel"),
  reportPreview: document.getElementById("reportPreview"),
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
  rodTickSpacingMm: document.getElementById("rodTickSpacingMm"),
  nonlinearCorrectionModel: document.getElementById("nonlinearCorrectionModel"),
  nonlinearCorrectionSource: document.getElementById("nonlinearCorrectionSource"),
  fileQueue: document.getElementById("fileQueue"),
  filePicker: document.querySelector(".file-picker"),
  runBadge: document.getElementById("runBadge"),
  terminalVelocity: document.getElementById("terminalVelocity"),
  uniformSegmentLength: document.getElementById("uniformSegmentLength"),
  idealViscosity: document.getElementById("idealViscosity"),
  standardViscosityRange: document.getElementById("standardViscosityRange"),
  standardViscosityNote: document.getElementById("standardViscosityNote"),
  viscosity: document.getElementById("viscosity"),
  r2: document.getElementById("r2"),
  re: document.getElementById("re"),
  fitMethod: document.getElementById("fitMethod"),
  fitMethodDetail: document.getElementById("fitMethodDetail"),
  outlierCount: document.getElementById("outlierCount"),
  outlierDetail: document.getElementById("outlierDetail"),
  segmentCv: document.getElementById("segmentCv"),
  segmentCvDetail: document.getElementById("segmentCvDetail"),
  trackingConfidence: document.getElementById("trackingConfidence"),
  trackingConfidenceDetail: document.getElementById("trackingConfidenceDetail"),
  segmentSensitivity: document.getElementById("segmentSensitivity"),
  segmentSensitivityDetail: document.getElementById("segmentSensitivityDetail"),
  accelerationSpanHint: document.getElementById("accelerationSpanHint"),
  motionPhaseStatus: document.getElementById("motionPhaseStatus"),
  motionEntryLabel: document.getElementById("motionEntryLabel"),
  motionEntryDetail: document.getElementById("motionEntryDetail"),
  motionUniformLabel: document.getElementById("motionUniformLabel"),
  motionUniformDetail: document.getElementById("motionUniformDetail"),
  motionTerminalLabel: document.getElementById("motionTerminalLabel"),
  motionTerminalDetail: document.getElementById("motionTerminalDetail"),
  motionAccelLength: document.getElementById("motionAccelLength"),
  motionUniformLength: document.getElementById("motionUniformLength"),
  motionDecelLength: document.getElementById("motionDecelLength"),
  uncertaintyStatus: document.getElementById("uncertaintyStatus"),
  uncertaintyDiameterMm: document.getElementById("uncertaintyDiameterMm"),
  uncertaintyTimeS: document.getElementById("uncertaintyTimeS"),
  uncertaintyDistanceMm: document.getElementById("uncertaintyDistanceMm"),
  uncertaintyTubeDiameterMm: document.getElementById("uncertaintyTubeDiameterMm"),
  uncertaintyLiquidDepthMm: document.getElementById("uncertaintyLiquidDepthMm"),
  uncertaintyCalibrationMm: document.getElementById("uncertaintyCalibrationMm"),
  uncertaintyDiameterTerm: document.getElementById("uncertaintyDiameterTerm"),
  uncertaintyTimingTerm: document.getElementById("uncertaintyTimingTerm"),
  uncertaintyVisualTerm: document.getElementById("uncertaintyVisualTerm"),
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
  recordsSummary: document.getElementById("recordsSummary"),
  selectAllRecords: document.getElementById("selectAllRecords"),
  summarySelectedRecordsBtn: document.getElementById("summarySelectedRecordsBtn"),
  deleteSelectedRecordsBtn: document.getElementById("deleteSelectedRecordsBtn"),
  summaryReportMeta: document.getElementById("summaryReportMeta"),
  summaryReportBody: document.getElementById("summaryReportBody"),
  downloadSummaryReportBtn: document.getElementById("downloadSummaryReportBtn"),
  backToDiagnosisFromSummaryBtn: document.getElementById("backToDiagnosisFromSummaryBtn"),
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
  simTemperatureC: document.getElementById("simTemperatureC"),
  simEtaReference: document.getElementById("simEtaReference"),
  simRhoLiquid: document.getElementById("simRhoLiquid"),
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
  simRisk: document.getElementById("simRisk"),
  simRe: document.getElementById("simRe"),
  simWallCorrection: document.getElementById("simWallCorrection"),
  simReCorrection: document.getElementById("simReCorrection"),
  simFeedbackState: document.getElementById("simFeedbackState"),
  simFeedbackVt: document.getElementById("simFeedbackVt"),
  simulationRubric: document.getElementById("simulationRubric"),
  sendSimulationToWorkbenchBtn: document.getElementById("sendSimulationToWorkbenchBtn"),
  blindTemperatureC: document.getElementById("blindTemperatureC"),
  blindViscosity: document.getElementById("blindViscosity"),
  blindDensity: document.getElementById("blindDensity"),
  blindColor: document.getElementById("blindColor"),
  blindClarity: document.getElementById("blindClarity"),
  blindFlow: document.getElementById("blindFlow"),
  runBlindTestBtn: document.getElementById("runBlindTestBtn"),
  resetBlindTestBtn: document.getElementById("resetBlindTestBtn"),
  fillBlindFromRunBtn: document.getElementById("fillBlindFromRunBtn"),
  blindResultTitle: document.getElementById("blindResultTitle"),
  blindConfidenceBadge: document.getElementById("blindConfidenceBadge"),
  blindSummary: document.getElementById("blindSummary"),
  blindTopMatch: document.getElementById("blindTopMatch"),
  blindResultRows: document.getElementById("blindResultRows"),
  blindAdvice: document.getElementById("blindAdvice"),
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
    subtitle: "通过准入后，从大厅进入 AI 实验测量、虚拟仿真、液体盲测、实验记录与结果复盘。",
  },
  blind: {
    eyebrow: "液体盲测",
    title: "未知液体物性匹配",
    subtitle: "输入温度、测得粘度、密度和外观特征，按候选液体物性库给出最可能液体和匹配证据。",
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
  "summary-report": {
    eyebrow: "多次实验汇总",
    title: "实验汇总报告",
    subtitle: "汇总多条真实轨迹记录，比较重复性、模型适用性、AI 不确定度和人工偏差。",
  },
  validation: {
    eyebrow: "落地验证",
    title: "真实实验验证清单",
    subtitle: "明确后续需要采集什么、验证什么，避免把软件原型说成已完成的实验结论。",
  },
};

const dataSources = {
  video: {
    status: "OpenCV可追踪",
    name: "摄像机视频",
    detail: "导入固定机位拍摄的落球视频，后端使用 OpenCV 提取小球中心轨迹，再进入速度曲线和粘度计算。",
    accept: "video/mp4,video/quicktime,video/webm,video/x-m4v",
    pickerLabel: "选择实验视频",
    actionLabel: "OpenCV追踪视频",
    enabled: true,
  },
  realtime: {
    status: "OpenCV可接入",
    name: "OpenCV 实时追踪",
    detail: "连接摄像头后进行标定与追踪。",
    accept: "video/*",
    pickerLabel: "选择备用视频",
    actionLabel: "开始实时追踪",
    enabled: true,
  },
};

const quizPassScore = 80;
const quizQuestions = [
  {
    key: "q1",
    module: "实验流程与物理依据",
    type: "单项选择题",
    points: 8,
    title: "本平台完整实验流程的合理顺序是（ ）",
    answer: "B",
    options: {
      A: "先测量，再读讲义，最后标定",
      B: "阅读讲义与答题准入后，填写参数、连接画面、标定、背光测量、录入人工值并生成报告",
      C: "只要连接摄像头即可直接生成报告",
      D: "先关闭背光，再进行标定和读题",
    },
    explanation: "讲义明确要求先完成预习准入，再进入 AI 实验，按参数填写、画面接入、标定、背光测量、人工结果录入和报告生成的顺序进行。",
  },
  {
    key: "q2",
    module: "实验流程与物理依据",
    type: "单项选择题",
    points: 8,
    title: "落球法计算液体粘滞系数最关键的速度量是（ ）",
    answer: "A",
    options: { A: "小球进入稳定匀速阶段后的终端速度 vt", B: "刚释放瞬间的速度", C: "液面附近的最大加速度", D: "任意一帧画面中的瞬时速度" },
    explanation: "小球达到受力平衡后进入终端匀速阶段，终端速度 vt 是 Stokes 公式计算粘滞系数的核心量。",
  },
  {
    key: "q3",
    module: "实验流程与物理依据",
    type: "单项选择题",
    points: 8,
    title: "斯托克斯定律 F=6πηrv 主要适用于（ ）",
    answer: "B",
    options: { A: "小球高速运动", B: "小球低速运动且液体无涡流", C: "液体产生强烈涡流", D: "大体积球体运动" },
    explanation: "斯托克斯定律适用于低速、低雷诺数、无明显涡流的黏性流动。小球速度过快或液体出现强烈涡流时，公式不再适用。",
  },
  {
    key: "q4",
    module: "实验流程与物理依据",
    type: "判断题",
    points: 8,
    title: "若小球尚未进入匀速段就取速度，通常会使终端速度偏小，并可能使计算出的粘滞系数偏大。",
    answer: "true",
    options: { true: "正确", false: "错误" },
    explanation: "未进入匀速段时速度通常低于终端速度，而粘滞系数与速度成反比，因此结果容易偏大。",
  },
  {
    key: "q5",
    module: "实验条件与修正",
    type: "判断题",
    points: 8,
    title: "教学实验中通常要求雷诺数 Re < 1；若希望更接近蠕动流条件，可采用 Re < 0.1 作为更保守判据。",
    answer: "true",
    options: { true: "正确", false: "错误" },
    explanation: "讲义中明确将 Re 作为 Stokes 条件的重要判据，Re 偏高说明惯性效应增强，结果可信度下降。",
  },
  {
    key: "q6",
    module: "实验条件与修正",
    type: "单项选择题",
    points: 8,
    title: "下列哪种做法最有助于减小壁效应（ ）",
    answer: "A",
    options: {
      A: "选用更大内径的量筒或更小的小球，使 2r/D 变小",
      B: "让小球贴近筒壁下落",
      C: "提高环境光亮度使画面更白",
      D: "不记录量筒内径",
    },
    explanation: "球筒径比 2r/D 越小，筒壁对液体流动的限制越弱，壁效应越小。",
  },
  {
    key: "q7",
    module: "标定与成像",
    type: "单项选择题",
    points: 8,
    title: "开始标定前，平台先标注量筒左右边缘并生成中心虚线，主要目的是（ ）",
    answer: "B",
    options: { A: "让画面更好看", B: "确定量筒中心轴线，使标定点和落球路径尽量沿中心线", C: "自动改变液体密度", D: "替代小球半径测量" },
    explanation: "中心虚线用于约束标定和释放位置，帮助减少贴壁、偏斜和透视误差。",
  },
  {
    key: "q8",
    module: "标定与成像",
    type: "判断题",
    points: 8,
    title: "标定完成后可以随意移动摄像头或量筒，因为平台会自动保持原来的像素-长度关系。",
    answer: "false",
    options: { true: "正确", false: "错误" },
    explanation: "标定建立的是当前相机、量筒和画面位置下的像素-真实长度映射；移动设备会使标定失效。",
  },
  {
    key: "q9",
    module: "标定与成像",
    type: "判断题",
    points: 8,
    title: "背光测量时，摄像头曝光越高越好，过曝不会影响小球边缘识别。",
    answer: "false",
    options: { true: "正确", false: "错误" },
    explanation: "曝光过高会使小球边缘发白，气泡、划痕和阴影也更容易被误识别；应让小球轮廓清楚且不过曝。",
  },
  {
    key: "q10",
    module: "AI 测量与复核",
    type: "单项选择题",
    points: 7,
    title: "平台判定终端速度时，最应关注的图像和曲线特征是（ ）",
    answer: "B",
    options: { A: "小球颜色是否最深", B: "v-t 图中是否出现持续稳定的平台段", C: "画面是否越亮越好", D: "第一帧速度是否最大" },
    explanation: "终端速度对应稳定匀速阶段，速度曲线应表现为一段持续、波动较小的平台。",
  },
  {
    key: "q11",
    module: "AI 测量与复核",
    type: "单项选择题",
    points: 7,
    title: "若 AI 测量结果和人工测量结果差异较大，最合理的处理是（ ）",
    answer: "D",
    options: { A: "直接删除人工测量值", B: "只相信 AI 结果，不再复核", C: "只相信人工结果，不看曲线", D: "检查人工计时、标定点、释放中心性、背光曝光和追踪质量" },
    explanation: "平台报告的目的之一就是引导学生比较 AI 与人工测量，定位误差来源，而不是无条件相信某一方。",
  },
  {
    key: "q12",
    module: "AI 测量与复核",
    type: "判断题",
    points: 7,
    title: "如果画面中气泡或量筒划痕被反复误识别，应调整检测区域、背光和曝光，必要时重测。",
    answer: "true",
    options: { true: "正确", false: "错误" },
    explanation: "讲义要求根据追踪置信度、误识别和曲线质量复核结果；静态干扰点反复出现时应优化画面或重测。",
  },
  {
    key: "q13",
    module: "AI 测量与复核",
    type: "判断题",
    points: 7,
    title: "修正结果可以替代实验条件判断；只要平台给出 K壁 和 KRe，就不需要关注 Re、壁效应和轨迹质量。",
    answer: "false",
    options: { true: "正确", false: "错误" },
    explanation: "修正项只能处理已知系统偏差，不能替代实验条件判断；Re、壁效应、释放质量和追踪质量仍需复核。",
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

const standardViscosityReferences = [
  {
    label: "纯水",
    aliases: ["纯水", "水"],
    tolerance: 0.04,
    source: "NIST/CRC水物性表",
    table: [
      { temperatureC: 0, viscosityPaS: 0.001792, densityKgM3: 999.84 },
      { temperatureC: 5, viscosityPaS: 0.001519, densityKgM3: 999.97 },
      { temperatureC: 10, viscosityPaS: 0.001307, densityKgM3: 999.7 },
      { temperatureC: 15, viscosityPaS: 0.001139, densityKgM3: 999.1 },
      { temperatureC: 20, viscosityPaS: 0.0010016, densityKgM3: 998.21 },
      { temperatureC: 25, viscosityPaS: 0.000890, densityKgM3: 997.05 },
      { temperatureC: 30, viscosityPaS: 0.000798, densityKgM3: 995.65 },
      { temperatureC: 35, viscosityPaS: 0.000720, densityKgM3: 994.03 },
      { temperatureC: 40, viscosityPaS: 0.000653, densityKgM3: 992.22 },
      { temperatureC: 50, viscosityPaS: 0.000547, densityKgM3: 988.05 },
    ],
  },
  {
    label: "无水乙醇",
    aliases: ["乙醇", "酒精"],
    tolerance: 0.06,
    source: "CRC/工程物性表",
    table: [
      { temperatureC: 0, viscosityPaS: 0.001773, densityKgM3: 806.0 },
      { temperatureC: 10, viscosityPaS: 0.001466, densityKgM3: 797.9 },
      { temperatureC: 20, viscosityPaS: 0.001200, densityKgM3: 789.3 },
      { temperatureC: 25, viscosityPaS: 0.001074, densityKgM3: 785.0 },
      { temperatureC: 30, viscosityPaS: 0.000983, densityKgM3: 780.8 },
      { temperatureC: 40, viscosityPaS: 0.000834, densityKgM3: 772.3 },
    ],
  },
  {
    label: "甲醇",
    aliases: ["甲醇", "methanol"],
    tolerance: 0.07,
    source: "CRC/工程物性表",
    table: [
      { temperatureC: 0, viscosityPaS: 0.000817, densityKgM3: 810.0 },
      { temperatureC: 10, viscosityPaS: 0.000690, densityKgM3: 800.4 },
      { temperatureC: 20, viscosityPaS: 0.000594, densityKgM3: 791.8 },
      { temperatureC: 25, viscosityPaS: 0.000543, densityKgM3: 786.6 },
      { temperatureC: 30, viscosityPaS: 0.000507, densityKgM3: 782.0 },
      { temperatureC: 40, viscosityPaS: 0.000446, densityKgM3: 772.5 },
    ],
  },
  {
    label: "乙二醇",
    aliases: ["乙二醇"],
    tolerance: 0.1,
    source: "CRC/工程物性表",
    table: [
      { temperatureC: 10, viscosityPaS: 0.0302, densityKgM3: 1120 },
      { temperatureC: 20, viscosityPaS: 0.0198, densityKgM3: 1113 },
      { temperatureC: 25, viscosityPaS: 0.0161, densityKgM3: 1110 },
      { temperatureC: 30, viscosityPaS: 0.0135, densityKgM3: 1107 },
      { temperatureC: 40, viscosityPaS: 0.0089, densityKgM3: 1100 },
      { temperatureC: 50, viscosityPaS: 0.0062, densityKgM3: 1093 },
    ],
  },
  {
    label: "丙二醇",
    aliases: ["丙二醇"],
    tolerance: 0.12,
    source: "厂家/工程物性表",
    table: [
      { temperatureC: 10, viscosityPaS: 0.0850, densityKgM3: 1045 },
      { temperatureC: 20, viscosityPaS: 0.0581, densityKgM3: 1038 },
      { temperatureC: 25, viscosityPaS: 0.0486, densityKgM3: 1036 },
      { temperatureC: 30, viscosityPaS: 0.0404, densityKgM3: 1032 },
      { temperatureC: 40, viscosityPaS: 0.0266, densityKgM3: 1023 },
      { temperatureC: 50, viscosityPaS: 0.0180, densityKgM3: 1015 },
    ],
  },
  {
    label: "500 cSt 硅油",
    aliases: ["500 cst", "500cst", "硅油"],
    tolerance: 0.16,
    source: "500 cSt牌号换算",
    table: [
      { temperatureC: 20, viscosityPaS: 0.570, densityKgM3: 972 },
      { temperatureC: 25, viscosityPaS: 0.485, densityKgM3: 970 },
      { temperatureC: 30, viscosityPaS: 0.414, densityKgM3: 967 },
      { temperatureC: 40, viscosityPaS: 0.305, densityKgM3: 962 },
      { temperatureC: 50, viscosityPaS: 0.232, densityKgM3: 957 },
    ],
  },
  {
    label: "蓖麻油",
    aliases: ["蓖麻油"],
    tolerance: 0.35,
    source: "天然油表值",
    table: [
      { temperatureC: 20, viscosityPaS: 0.986, densityKgM3: 961 },
      { temperatureC: 25, viscosityPaS: 0.650, densityKgM3: 957 },
      { temperatureC: 30, viscosityPaS: 0.451, densityKgM3: 954 },
      { temperatureC: 35, viscosityPaS: 0.325, densityKgM3: 950 },
      { temperatureC: 40, viscosityPaS: 0.242, densityKgM3: 946 },
      { temperatureC: 50, viscosityPaS: 0.128, densityKgM3: 938 },
    ],
  },
  {
    label: "纯甘油",
    aliases: ["纯甘油", "甘油", "glycerol"],
    tolerance: 0.09,
    source: "甘油表值",
    table: [
      { temperatureC: 0, viscosityPaS: 12.100, densityKgM3: 1272 },
      { temperatureC: 10, viscosityPaS: 3.950, densityKgM3: 1268 },
      { temperatureC: 15, viscosityPaS: 2.330, densityKgM3: 1265 },
      { temperatureC: 20, viscosityPaS: 1.412, densityKgM3: 1263 },
      { temperatureC: 25, viscosityPaS: 0.945, densityKgM3: 1261 },
      { temperatureC: 30, viscosityPaS: 0.612, densityKgM3: 1258 },
      { temperatureC: 35, viscosityPaS: 0.412, densityKgM3: 1256 },
      { temperatureC: 40, viscosityPaS: 0.284, densityKgM3: 1253 },
      { temperatureC: 45, viscosityPaS: 0.201, densityKgM3: 1250 },
      { temperatureC: 50, viscosityPaS: 0.141, densityKgM3: 1248 },
    ],
  },
  {
    label: "食用植物油",
    aliases: ["食用植物油", "植物油", "食用油"],
    tolerance: 0.35,
    source: "品类范围",
    table: [
      { temperatureC: 20, viscosityPaS: 0.078, densityKgM3: 920 },
      { temperatureC: 25, viscosityPaS: 0.065, densityKgM3: 918 },
      { temperatureC: 30, viscosityPaS: 0.053, densityKgM3: 915 },
      { temperatureC: 40, viscosityPaS: 0.035, densityKgM3: 910 },
    ],
  },
];

const presets = Object.fromEntries(
  standardViscosityReferences.map((reference) => [reference.label, { liquid: reference.label }])
);

const blindLiquidCandidates = [
  {
    name: "纯水",
    refTempC: 20,
    viscosityPaS: 0.0010016,
    densityKgM3: 998.2,
    beta: 1850,
    expansion: 0.00021,
    colors: ["clear"],
    clarity: ["transparent"],
    flow: "thin",
    note: "低粘度液体，落球法中容易使 Re 偏高，盲测时需特别看雷诺数条件。",
  },
  {
    name: "无水乙醇",
    refTempC: 20,
    viscosityPaS: 0.00120,
    densityKgM3: 789,
    beta: 1500,
    expansion: 0.0011,
    colors: ["clear"],
    clarity: ["transparent"],
    flow: "thin",
    note: "密度明显低于水和多元醇，挥发性强；仅靠粘度容易与低粘度液体混淆。",
  },
  {
    name: "甲醇",
    refTempC: 25,
    viscosityPaS: 0.000543,
    densityKgM3: 787,
    beta: 1350,
    expansion: 0.0012,
    colors: ["clear"],
    clarity: ["transparent"],
    flow: "thin",
    note: "粘度很低且有毒，不建议作为学生盲测实物样品。",
  },
  {
    name: "乙二醇",
    refTempC: 20,
    viscosityPaS: 0.0198,
    densityKgM3: 1113,
    beta: 3300,
    expansion: 0.00065,
    colors: ["clear", "pale-yellow"],
    clarity: ["transparent"],
    flow: "medium",
    note: "密度高于水，粘度处于中等区间，温度变化会明显影响匹配。",
  },
  {
    name: "丙二醇",
    refTempC: 25,
    viscosityPaS: 0.0486,
    densityKgM3: 1036,
    beta: 4100,
    expansion: 0.00075,
    colors: ["clear", "pale-yellow"],
    clarity: ["transparent"],
    flow: "medium",
    note: "常见安全性较好的中等粘度候选，需结合密度与温度区分。",
  },
  {
    name: "500 cSt 硅油",
    refTempC: 25,
    viscosityPaS: 0.485,
    densityKgM3: 970,
    beta: 2600,
    expansion: 0.00095,
    colors: ["clear", "pale-yellow"],
    clarity: ["transparent"],
    flow: "thick",
    note: "粘度高、密度接近 0.97 g/cm³，外观多为无色或浅色透明。",
  },
  {
    name: "蓖麻油",
    refTempC: 25,
    viscosityPaS: 0.65,
    densityKgM3: 961,
    beta: 5200,
    expansion: 0.00072,
    colors: ["pale-yellow", "yellow", "brown"],
    clarity: ["transparent", "translucent"],
    flow: "thick",
    note: "浅黄到黄色、粘度较高；与高粘硅油需要依靠颜色和温度修正区分。",
  },
  {
    name: "纯甘油",
    refTempC: 25,
    viscosityPaS: 0.945,
    densityKgM3: 1261,
    beta: 6200,
    expansion: 0.0005,
    colors: ["clear", "pale-yellow"],
    clarity: ["transparent"],
    flow: "thick",
    note: "密度和粘度都很高，温度敏感；是落球法教学中辨识度较强的候选。",
  },
  {
    name: "食用植物油",
    refTempC: 25,
    viscosityPaS: 0.065,
    densityKgM3: 920,
    beta: 4300,
    expansion: 0.00075,
    colors: ["pale-yellow", "yellow"],
    clarity: ["transparent", "translucent"],
    flow: "medium",
    note: "不同品类差异很大，只能作为泛化候选，不能给出精确种类。",
  },
];

// Standard table values at the listed temperature. Viscosity is strongly temperature-dependent.
const simulationPresets = {
  "纯甘油": {
    radius: 1.5,
    tube: 35,
    depth: 220,
    release: 0,
    damping: 0,
    stability: 1,
  },
  "500 cSt 硅油": {
    radius: 1.5,
    tube: 35,
    depth: 210,
    release: 0,
    damping: 0,
    stability: 1,
  },
  "蓖麻油": {
    radius: 1.5,
    tube: 35,
    depth: 220,
    release: 0,
    damping: 0,
    stability: 1,
  },
  "乙二醇": {
    radius: 1.2,
    tube: 45,
    depth: 240,
    release: 0,
    damping: 0,
    stability: 1,
  },
  "丙二醇": {
    radius: 1.5,
    tube: 35,
    depth: 220,
    release: 0,
    damping: 0,
    stability: 1,
  },
  "纯水": {
    radius: 0.8,
    tube: 60,
    depth: 260,
    release: 0,
    damping: 0,
    stability: 1,
  },
  "无水乙醇": {
    radius: 0.8,
    tube: 60,
    depth: 260,
    release: 0,
    damping: 0,
    stability: 1,
  },
  "甲醇": {
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
    velocityCurve: "./assets/generated/buttons/velocity-curve.png",
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
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatBlindViscosity(value) {
  const parsed = finiteNumber(value);
  if (parsed === null) return "--";
  if (parsed < 0.01) return `${(parsed * 1000).toFixed(3)} mPa·s`;
  return `${parsed.toFixed(parsed >= 0.1 ? 3 : 4)} Pa·s`;
}

function correctedBlindViscosity(candidate, temperatureC) {
  const refK = candidate.refTempC + 273.15;
  const tempK = temperatureC + 273.15;
  return candidate.viscosityPaS * Math.exp(candidate.beta * ((1 / tempK) - (1 / refK)));
}

function correctedBlindDensity(candidate, temperatureC) {
  return candidate.densityKgM3 * (1 - candidate.expansion * (temperatureC - candidate.refTempC));
}

function blindColorScore(candidate, color) {
  if (!color || color === "unknown") return 0.72;
  return candidate.colors.includes(color) ? 1 : 0.42;
}

function blindClarityScore(candidate, clarity) {
  if (!clarity || clarity === "unknown") return 0.78;
  return candidate.clarity.includes(clarity) ? 1 : 0.48;
}

function blindFlowScore(candidate, flow, measuredViscosity) {
  if (!flow || flow === "unknown") return 0.76;
  const measuredFlow = measuredViscosity < 0.006 ? "thin" : measuredViscosity < 0.15 ? "medium" : "thick";
  return candidate.flow === flow || measuredFlow === flow ? 1 : 0.46;
}

function computeBlindMatches(input) {
  return blindLiquidCandidates
    .map((candidate) => {
      const etaAtTemp = correctedBlindViscosity(candidate, input.temperatureC);
      const densityAtTemp = correctedBlindDensity(candidate, input.temperatureC);
      const viscosityLogError = Math.abs(Math.log(input.viscosityPaS / etaAtTemp));
      const densityRelError = Math.abs(input.densityKgM3 - densityAtTemp) / Math.max(1, densityAtTemp);
      const viscosityScore = Math.exp(-Math.pow(viscosityLogError / 0.55, 2));
      const densityScore = Math.exp(-Math.pow(densityRelError / 0.055, 2));
      const colorScore = blindColorScore(candidate, input.color);
      const clarityScore = blindClarityScore(candidate, input.clarity);
      const flowScore = blindFlowScore(candidate, input.flow, input.viscosityPaS);
      const score = (viscosityScore * 0.48) + (densityScore * 0.32) + (colorScore * 0.09) + (clarityScore * 0.05) + (flowScore * 0.06);
      return {
        ...candidate,
        etaAtTemp,
        densityAtTemp,
        viscosityLogError,
        densityRelError,
        viscosityScore,
        densityScore,
        colorScore,
        clarityScore,
        flowScore,
        score: Math.max(0, Math.min(1, score)),
      };
    })
    .sort((a, b) => b.score - a.score);
}

function renderBlindResults(matches, input) {
  const top = matches[0];
  const second = matches[1];
  const confidence = Math.round(top.score * 100);
  const gap = top.score - (second?.score || 0);
  const certainty = top.score >= 0.78 && gap >= 0.12 ? "高可信" : top.score >= 0.58 ? "需复核" : "低可信";
  el.blindResultTitle.textContent = `${top.name} · ${certainty}`;
  el.blindConfidenceBadge.textContent = `${confidence}%`;
  el.blindConfidenceBadge.dataset.level = top.score >= 0.78 ? "ok" : top.score >= 0.58 ? "warn" : "danger";
  el.blindSummary.textContent = `本次以 ${input.temperatureC.toFixed(1)}℃ 下的粘度和密度为主证据，颜色与透明度作为辅助证据。若前两名匹配度接近，应补做重复测量或提高密度测量精度。`;
  el.blindTopMatch.innerHTML = `
    <span>最可能液体</span>
    <strong>${escapeHtml(top.name)}</strong>
    <p>${escapeHtml(top.note)}</p>
  `;
  el.blindResultRows.innerHTML = matches.slice(0, 6).map((item) => {
    const evidence = [
      `η误差 ${Math.abs(Math.exp(item.viscosityLogError) - 1) * 100 < 999 ? `${Math.round(Math.abs(Math.exp(item.viscosityLogError) - 1) * 100)}%` : "很大"}`,
      `ρ误差 ${(item.densityRelError * 100).toFixed(1)}%`,
      `外观 ${Math.round(((item.colorScore + item.clarityScore) / 2) * 100)}%`,
    ].join(" · ");
    return `
      <tr>
        <td><strong>${escapeHtml(item.name)}</strong><small>${escapeHtml(item.note)}</small></td>
        <td>${formatBlindViscosity(item.etaAtTemp)}</td>
        <td>${item.densityAtTemp.toFixed(0)} kg/m³</td>
        <td><span class="blind-score-pill">${Math.round(item.score * 100)}%</span></td>
        <td>${escapeHtml(evidence)}</td>
      </tr>
    `;
  }).join("");
  const advice = [];
  if (top.score < 0.58) {
    advice.push(["匹配度偏低", "当前数据没有明显落入候选库。优先检查单位：粘度应为 Pa·s，密度应为 kg/m³。"]);
  }
  if (gap < 0.12) {
    advice.push(["前两名接近", `最接近的是 ${top.name} 和 ${second?.name || "另一候选"}，建议增加一次重复落球测量，并提高温度记录精度。`]);
  }
  if (input.temperatureC < 10 || input.temperatureC > 40) {
    advice.push(["温度外推较多", "候选库主要按 20-25℃附近物性修正，温度太低或太高时不确定性会增大。"]);
  }
  if (!advice.length) {
    advice.push(["结果可用", "本次粘度、密度和外观证据较一致。报告中仍应说明候选库范围和温度修正的不确定性。"]);
  }
  el.blindAdvice.innerHTML = advice.map(([title, body]) => `
    <article>
      <strong>${escapeHtml(title)}</strong>
      <p>${escapeHtml(body)}</p>
    </article>
  `).join("");
}

function runBlindTest() {
  const input = {
    temperatureC: number(el.blindTemperatureC),
    viscosityPaS: number(el.blindViscosity),
    densityKgM3: number(el.blindDensity),
    color: el.blindColor?.value || "unknown",
    clarity: el.blindClarity?.value || "unknown",
    flow: el.blindFlow?.value || "unknown",
  };
  const missing = [];
  if (!Number.isFinite(input.temperatureC)) missing.push("液体温度");
  if (!Number.isFinite(input.viscosityPaS) || input.viscosityPaS <= 0) missing.push("测得粘度");
  if (!Number.isFinite(input.densityKgM3) || input.densityKgM3 <= 0) missing.push("液体密度");
  if (missing.length) {
    showToast(`请先填写：${missing.join("、")}`);
    return;
  }
  renderBlindResults(computeBlindMatches(input), input);
  showToast("液体盲测匹配完成。");
}

function resetBlindTest() {
  if (el.blindTemperatureC) el.blindTemperatureC.value = "25";
  if (el.blindViscosity) el.blindViscosity.value = "";
  if (el.blindDensity) el.blindDensity.value = "";
  if (el.blindColor) el.blindColor.value = "clear";
  if (el.blindClarity) el.blindClarity.value = "transparent";
  if (el.blindFlow) el.blindFlow.value = "unknown";
  if (el.blindResultTitle) el.blindResultTitle.textContent = "等待输入";
  if (el.blindConfidenceBadge) {
    el.blindConfidenceBadge.textContent = "--";
    delete el.blindConfidenceBadge.dataset.level;
  }
  if (el.blindSummary) el.blindSummary.textContent = "输入测得数据后，平台会按粘度、密度、颜色和透明度给出候选液体排序。";
  if (el.blindTopMatch) {
    el.blindTopMatch.innerHTML = "<span>最可能液体</span><strong>--</strong><p>暂无匹配结果。</p>";
  }
  if (el.blindResultRows) el.blindResultRows.innerHTML = '<tr><td colspan="5">暂无数据</td></tr>';
  if (el.blindAdvice) {
    el.blindAdvice.innerHTML = `
      <article>
        <strong>测量建议</strong>
        <p>盲测前建议至少重复 3 次落球测量，并记录温度；若温度波动超过 1℃，粘度匹配会明显变差。</p>
      </article>
    `;
  }
}

function fillBlindFromLatestRun() {
  const run = state.latest;
  if (!run?.result || !run?.params) {
    showToast("请先完成或载入一条实验记录。");
    return;
  }
  if (el.blindTemperatureC) el.blindTemperatureC.value = finiteNumber(run.params.temperature_c, 25);
  if (el.blindViscosity) el.blindViscosity.value = finiteNumber(run.result.viscosity, "") ?? "";
  if (el.blindDensity) el.blindDensity.value = finiteNumber(run.params.rho_liquid, "") ?? "";
  showToast("已填入当前实验结果，可补充颜色后匹配。");
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

function formatViscosityRange(lower, upper) {
  const safeLower = finiteNumber(lower);
  const safeUpper = finiteNumber(upper);
  if (safeLower === null || safeUpper === null || safeLower <= 0 || safeUpper <= 0) return "--";
  if (safeUpper < 0.01) return `${(safeLower * 1000).toFixed(2)}–${(safeUpper * 1000).toFixed(2)} mPa·s`;
  if (safeUpper < 0.1) return `${safeLower.toFixed(4)}–${safeUpper.toFixed(4)} Pa·s`;
  return `${safeLower.toFixed(3)}–${safeUpper.toFixed(3)} Pa·s`;
}

function formatMeasurement(value, unit, digits = 6) {
  const parsed = finiteNumber(value);
  if (parsed === null) return "未填写";
  return `${parsed.toFixed(digits)} ${unit}`;
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

function findStandardViscosityReference(liquidName) {
  const normalized = String(liquidName || "").trim().toLowerCase();
  if (!normalized) return null;
  return standardViscosityReferences.find((reference) =>
    reference.aliases.some((alias) => normalized.includes(alias.toLowerCase()))
  ) || null;
}

function canonicalLiquidName(liquidName) {
  return findStandardViscosityReference(liquidName)?.label || String(liquidName || "").trim();
}

function nearestStandardViscosityPoint(reference, temperatureC) {
  const table = Array.isArray(reference?.table) ? reference.table : [];
  if (!table.length) return null;
  return table.reduce((best, point) => {
    if (!best) return point;
    const currentDistance = Math.abs(Number(point.temperatureC) - temperatureC);
    const bestDistance = Math.abs(Number(best.temperatureC) - temperatureC);
    return currentDistance < bestDistance ? point : best;
  }, null);
}

function standardViscosityIntervalFromRun(run) {
  const params = run?.params || {};
  const liquidName = params.liquid || el.liquid?.value || "";
  const reference = findStandardViscosityReference(liquidName);
  if (!reference) return null;
  const temperature = finiteNumber(params.temperature_c)
    ?? finiteNumber(el.temperatureC?.value)
    ?? null;
  if (temperature === null) return { label: reference.label, missingTemperature: true };
  const matched = nearestStandardViscosityPoint(reference, temperature);
  if (!matched) return null;
  const center = finiteNumber(matched.viscosityPaS);
  if (!Number.isFinite(center) || center <= 0) return null;
  const lower = center * (1 - reference.tolerance);
  const upper = center * (1 + reference.tolerance);
  return {
    label: reference.label,
    inputTemperature: temperature,
    matchedTemperature: Number(matched.temperatureC),
    center,
    densityKgM3: finiteNumber(matched.densityKgM3),
    lower,
    upper,
    source: reference.source,
  };
}

function standardViscosityNoteText(interval) {
  if (!interval || interval.missingTemperature) return "请先填写温度，系统会匹配最近表值";
  const input = interval.inputTemperature;
  const matched = interval.matchedTemperature;
  const exact = Math.abs(input - matched) < 0.05;
  const temperatureText = exact
    ? `${matched.toFixed(1)}℃表值`
    : `输入 ${input.toFixed(1)}℃，匹配 ${matched.toFixed(1)}℃表值`;
  return `${interval.label} · ${temperatureText} · ${interval.source}`;
}

function renderStandardViscosityRange(run, status = "normal") {
  if (!el.standardViscosityRange || !el.standardViscosityNote) return;
  if (status === "empty") {
    el.standardViscosityRange.textContent = "--";
    el.standardViscosityNote.textContent = "按样本温度估算";
    return;
  }
  if (status === "locked") {
    el.standardViscosityRange.textContent = "待人工测量";
    el.standardViscosityNote.textContent = "提交人工值后显示";
    return;
  }
  const interval = standardViscosityIntervalFromRun(run);
  if (!interval) {
    el.standardViscosityRange.textContent = "--";
    el.standardViscosityNote.textContent = "未匹配到样本表值";
    return;
  }
  if (interval.missingTemperature) {
    el.standardViscosityRange.textContent = "待填写温度";
    el.standardViscosityNote.textContent = standardViscosityNoteText(interval);
    return;
  }
  el.standardViscosityRange.textContent = formatViscosityRange(interval.lower, interval.upper);
  el.standardViscosityNote.textContent = standardViscosityNoteText(interval);
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

function clampIndex(value, min, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return min;
  return Math.max(min, Math.min(max, Math.round(parsed)));
}

function interpolatePositionAtTime(positionCurve, targetTime) {
  if (!Array.isArray(positionCurve) || !positionCurve.length || !Number.isFinite(targetTime)) return null;
  const points = positionCurve
    .map((point) => ({ t: finiteNumber(point.t), y: finiteNumber(point.y) }))
    .filter((point) => point.t !== null && point.y !== null)
    .sort((a, b) => a.t - b.t);
  if (!points.length) return null;
  if (targetTime <= points[0].t) return points[0].y;
  const last = points[points.length - 1];
  if (targetTime >= last.t) return last.y;
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const current = points[index];
    if (targetTime <= current.t) {
      const ratio = (targetTime - previous.t) / Math.max(1e-9, current.t - previous.t);
      return previous.y + (current.y - previous.y) * ratio;
    }
  }
  return last.y;
}

function estimateMotionPhases(run) {
  const velocityCurve = Array.isArray(run?.curves?.velocity) ? run.curves.velocity : [];
  const positionCurve = Array.isArray(run?.curves?.position) ? run.curves.position : [];
  const backendPhases = Array.isArray(run?.motion_phases) ? run.motion_phases : [];
  if (backendPhases.length) {
    const phases = backendPhases.map((phase) => {
      const startTime = finiteNumber(phase.start_time) ?? finiteNumber(phase.startTime) ?? 0;
      const endTime = finiteNumber(phase.end_time) ?? finiteNumber(phase.endTime) ?? startTime;
      const startY = interpolatePositionAtTime(positionCurve, startTime);
      const endY = interpolatePositionAtTime(positionCurve, endTime);
      const backendDistance = finiteNumber(phase.distance_m) ?? finiteNumber(phase.distanceM);
      const distanceM = backendDistance !== null
        ? backendDistance
        : startY === null || endY === null
          ? null
          : Math.abs(endY - startY);
      return {
        key: phase.key || "phase",
        label: phase.label || "运动阶段",
        trend: phase.trend || "transition",
        description: phase.description || "",
        startTime,
        endTime,
        timeS: Math.max(0, endTime - startTime),
        distanceM,
      };
    });
    return {
      phases,
      acceleration: phases[0],
      uniform: phases[1],
      deceleration: phases[2],
      totalDistanceM: phases.reduce((sum, phase) => sum + (finiteNumber(phase.distanceM) || 0), 0),
    };
  }
  const segment = run?.segment || {};
  if (velocityCurve.length < 4 || !positionCurve.length || segment.start === undefined || segment.end === undefined) return null;
  const maxVelocityIndex = velocityCurve.length - 1;
  const uniformStartIndex = clampIndex(segment.start, 0, maxVelocityIndex);
  const uniformEndIndex = clampIndex(segment.end, uniformStartIndex, maxVelocityIndex);
  const firstTime = finiteNumber(positionCurve[0]?.t) ?? 0;
  const finalTime = finiteNumber(positionCurve[positionCurve.length - 1]?.t)
    ?? finiteNumber(velocityCurve[maxVelocityIndex]?.t)
    ?? 0;
  const uniformStartTime = finiteNumber(velocityCurve[uniformStartIndex]?.t) ?? firstTime;
  const uniformEndTime = finiteNumber(velocityCurve[uniformEndIndex]?.t) ?? finalTime;
  const phaseSpecs = [
    { key: "acceleration", label: "加速段", startTime: firstTime, endTime: Math.max(firstTime, uniformStartTime) },
    { key: "uniform", label: "匀速段", startTime: Math.max(firstTime, uniformStartTime), endTime: Math.max(uniformStartTime, uniformEndTime) },
    { key: "deceleration", label: "减速段", startTime: Math.max(uniformEndTime, firstTime), endTime: Math.max(finalTime, uniformEndTime) },
  ];
  const phases = phaseSpecs.map((phase) => {
    const startY = interpolatePositionAtTime(positionCurve, phase.startTime);
    const endY = interpolatePositionAtTime(positionCurve, phase.endTime);
    const timeS = Math.max(0, phase.endTime - phase.startTime);
    const distanceM = startY === null || endY === null ? null : Math.abs(endY - startY);
    return { ...phase, timeS, distanceM };
  });
  const totalDistanceM = phases.reduce((sum, phase) => sum + (finiteNumber(phase.distanceM) || 0), 0);
  return {
    phases,
    acceleration: phases[0],
    uniform: phases[1],
    deceleration: phases[2],
    totalDistanceM,
  };
}

function formatPhaseLength(phase) {
  const distanceM = finiteNumber(phase?.distanceM);
  if (distanceM === null) return "--";
  if (distanceM <= 0.00005) return "<0.1 mm";
  const distanceMm = distanceM * 1000;
  if (distanceMm >= 100) return `${(distanceMm / 10).toFixed(1)} cm`;
  return `${distanceMm.toFixed(1)} mm`;
}

function resetMotionPhaseLabels() {
  if (el.motionEntryLabel) el.motionEntryLabel.textContent = "入液阶段";
  if (el.motionEntryDetail) el.motionEntryDetail.textContent = "自动识别加速或减速";
  if (el.motionUniformLabel) el.motionUniformLabel.textContent = "稳定平台段";
  if (el.motionUniformDetail) el.motionUniformDetail.textContent = "平台用于拟合终端速度";
  if (el.motionTerminalLabel) el.motionTerminalLabel.textContent = "末端阶段";
  if (el.motionTerminalDetail) el.motionTerminalDetail.textContent = "自动判断是否仍稳定";
}

function setMotionPhaseLabels(summary) {
  const phases = summary?.phases || [];
  const [entry, uniform, terminal] = phases;
  if (el.motionEntryLabel) el.motionEntryLabel.textContent = entry?.label || "入液阶段";
  if (el.motionEntryDetail) el.motionEntryDetail.textContent = entry?.description || "自动识别加速或减速";
  if (el.motionUniformLabel) el.motionUniformLabel.textContent = uniform?.label || "稳定平台段";
  if (el.motionUniformDetail) el.motionUniformDetail.textContent = uniform?.description || "平台用于拟合终端速度";
  if (el.motionTerminalLabel) el.motionTerminalLabel.textContent = terminal?.label || "末端阶段";
  if (el.motionTerminalDetail) el.motionTerminalDetail.textContent = terminal?.description || "自动判断是否仍稳定";
}

function renderMotionPhaseCard(run, mode = "normal") {
  if (!el.motionPhaseStatus) return;
  if (!run || mode === "empty") {
    resetMotionPhaseLabels();
    el.motionPhaseStatus.textContent = "等待完整轨迹";
    el.motionAccelLength.textContent = "--";
    el.motionUniformLength.textContent = "--";
    el.motionDecelLength.textContent = "--";
    return;
  }
  if (mode === "locked" || shouldLockRunResults(run)) {
    resetMotionPhaseLabels();
    el.motionPhaseStatus.textContent = "待人工测量后显示";
    el.motionAccelLength.textContent = "--";
    el.motionUniformLength.textContent = "--";
    el.motionDecelLength.textContent = "--";
    return;
  }
  const summary = estimateMotionPhases(run);
  if (!summary) {
    resetMotionPhaseLabels();
    el.motionPhaseStatus.textContent = "等待自动判段";
    el.motionAccelLength.textContent = "--";
    el.motionUniformLength.textContent = "--";
    el.motionDecelLength.textContent = "--";
    return;
  }
  setMotionPhaseLabels(summary);
  el.motionPhaseStatus.textContent = "已完成自动判段";
  el.motionAccelLength.textContent = formatPhaseLength(summary.acceleration);
  el.motionUniformLength.textContent = formatPhaseLength(summary.uniform);
  el.motionDecelLength.textContent = formatPhaseLength(summary.deceleration);
}

function estimateSegmentSensitivity(run, terminalVelocity) {
  const parsedVt = finiteNumber(terminalVelocity ?? run?.result?.terminal_velocity);
  const velocityCurve = Array.isArray(run?.curves?.velocity) ? run.curves.velocity : [];
  if (parsedVt === null || parsedVt <= 0 || velocityCurve.length < 9) return null;
  const segment = run?.segment || {};
  const start = Math.max(0, Math.min(Number(segment.start) || 0, velocityCurve.length - 1));
  const end = Math.max(start + 1, Math.min(Number(segment.end) || velocityCurve.length - 1, velocityCurve.length - 1));
  const values = velocityCurve
    .slice(start, end + 1)
    .map((point) => finiteNumber(point.v))
    .filter((value) => value !== null && value > 0);
  if (values.length < 9) return null;
  const chunkSize = Math.max(3, Math.floor(values.length / 3));
  const means = [];
  for (let index = 0; index < 3; index += 1) {
    const chunk = values.slice(index * chunkSize, index === 2 ? values.length : (index + 1) * chunkSize);
    if (chunk.length >= 3) means.push(chunk.reduce((sum, value) => sum + value, 0) / chunk.length);
  }
  if (means.length < 2) return null;
  return {
    relative: (Math.max(...means) - Math.min(...means)) / parsedVt,
    min: Math.min(...means),
    max: Math.max(...means),
  };
}

function formatSegmentSensitivity(run, terminalVelocity) {
  const sensitivity = estimateSegmentSensitivity(run, terminalVelocity);
  return sensitivity ? formatPercent(sensitivity.relative) : "--";
}

function setQualityMetric(valueEl, detailEl, value, detail, level = "neutral") {
  if (valueEl) {
    valueEl.textContent = value;
    valueEl.closest("article")?.setAttribute("data-quality-level", level);
    valueEl.closest("article")?.setAttribute("title", detail || value);
  }
  if (detailEl) detailEl.textContent = detail || "";
}

function resetQualityMetrics() {
  setQualityMetric(el.fitMethod, el.fitMethodDetail, "--", "等待速度拟合");
  setQualityMetric(el.outlierCount, el.outlierDetail, "--", "等待轨迹预处理");
  setQualityMetric(el.segmentCv, el.segmentCvDetail, "--", "越低越接近匀速");
  setQualityMetric(el.trackingConfidence, el.trackingConfidenceDetail, "--", "小球识别越稳越高");
  setQualityMetric(el.segmentSensitivity, el.segmentSensitivityDetail, "--", "换相邻平台段后 vt 的变化");
}

function formatFitQuality(method) {
  const formatted = formatFitMethod(method);
  if (!method) return { value: "--", detail: "等待速度拟合", level: "neutral" };
  if (String(method).includes("huber")) {
    return { value: "稳健直线", detail: "用 s-t 直线拟合终端速度，异常点影响较小", level: "ok" };
  }
  if (String(method).includes("linear")) {
    return { value: "直线拟合", detail: "用位移-时间斜率得到终端速度", level: "ok" };
  }
  if (String(method).includes("preview")) {
    return { value: "实时预览", detail: "正在采样，最终结果需停止后重新拟合", level: "neutral" };
  }
  return { value: formatted, detail: "当前速度来源", level: "neutral" };
}

function formatOutlierQuality(count, total) {
  const safeCount = Math.max(0, Number(count) || 0);
  const safeTotal = Math.max(0, Number(total) || 0);
  const ratio = safeTotal ? safeCount / safeTotal : 0;
  if (!safeCount) {
    return { value: "0 个 干净", detail: "没有发现明显跳点或误识别点", level: "ok" };
  }
  const level = ratio > 0.08 || safeCount >= 6 ? "danger" : ratio > 0.03 || safeCount >= 3 ? "warn" : "ok";
  const label = level === "danger" ? "需复核" : level === "warn" ? "已降权" : "影响小";
  return {
    value: `${safeCount} 个 ${label}`,
    detail: `疑似误识别点已降低权重，占轨迹约 ${formatPercent(ratio)}`,
    level,
  };
}

function formatPlatformQuality(cv) {
  const parsed = finiteNumber(cv);
  if (parsed === null) return { value: "--", detail: "越低越接近匀速", level: "neutral" };
  const level = parsed > 0.12 ? "danger" : parsed > 0.06 ? "warn" : "ok";
  const label = level === "danger" ? "波动大" : level === "warn" ? "略抖" : "很平";
  return {
    value: `${formatPercent(parsed)} ${label}`,
    detail: "选中平台段内速度的相对波动，越低越像匀速",
    level,
  };
}

function formatTrackingQuality(confidence) {
  const parsed = finiteNumber(confidence);
  if (parsed === null) return { value: "--", detail: "小球识别越稳越高", level: "neutral" };
  const level = parsed < 0.68 ? "danger" : parsed < 0.78 ? "warn" : "ok";
  const label = level === "danger" ? "需重测" : level === "warn" ? "可用" : "稳定";
  return {
    value: `${Math.round(parsed * 100)}% ${label}`,
    detail: "综合小球轮廓清晰度、误检和轨迹连续性",
    level,
  };
}

function formatSegmentSensitivityQuality(run, terminalVelocity) {
  const sensitivity = estimateSegmentSensitivity(run, terminalVelocity);
  if (!sensitivity) return { value: "--", detail: "换相邻平台段后 vt 的变化", level: "neutral" };
  const relative = finiteNumber(sensitivity.relative);
  if (relative === null) return { value: "--", detail: "换相邻平台段后 vt 的变化", level: "neutral" };
  const level = relative > 0.08 ? "danger" : relative > 0.04 ? "warn" : "ok";
  const label = level === "danger" ? "偏高" : level === "warn" ? "中等" : "很低";
  return {
    value: `${formatPercent(relative)} ${label}`,
    detail: "把平台段前/中/后分开估算，差得越小选段越可靠",
    level,
  };
}

function renderQualityMetrics(run, mode = "empty") {
  if (!run || mode === "empty" || mode === "locked") {
    resetQualityMetrics();
    return;
  }
  const result = run.result || {};
  const quality = run.quality || {};
  const preprocessing = quality.preprocessing || {};
  const fit = formatFitQuality(quality.fit_method);
  const outliers = formatOutlierQuality(preprocessing.outlier_points, run.frames?.length);
  const platform = formatPlatformQuality(quality.uniform_segment_cv);
  const tracking = formatTrackingQuality(result.tracking_confidence);
  const sensitivity = formatSegmentSensitivityQuality(run, result.terminal_velocity);
  setQualityMetric(el.fitMethod, el.fitMethodDetail, fit.value, fit.detail, fit.level);
  setQualityMetric(el.outlierCount, el.outlierDetail, outliers.value, outliers.detail, outliers.level);
  setQualityMetric(el.segmentCv, el.segmentCvDetail, platform.value, platform.detail, platform.level);
  setQualityMetric(el.trackingConfidence, el.trackingConfidenceDetail, tracking.value, tracking.detail, tracking.level);
  setQualityMetric(el.segmentSensitivity, el.segmentSensitivityDetail, sensitivity.value, sensitivity.detail, sensitivity.level);
}

function formatUniformSegmentLength(span) {
  const distanceM = finiteNumber(span?.distanceM);
  if (distanceM === null || distanceM <= 0) return "--";
  const distanceMm = distanceM * 1000;
  if (distanceMm >= 100) return `${(distanceMm / 10).toFixed(1)} cm`;
  return `${distanceMm.toFixed(1)} mm`;
}

function setInputValue(input, value) {
  if (!input) return;
  const parsed = finiteNumber(value);
  input.value = parsed === null ? "" : String(parsed);
}

function ensureLiquidOption(value) {
  if (!value || !el.liquid) return;
  const exists = [...el.liquid.options].some((option) => option.value === value);
  if (!exists) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = value;
    el.liquid.appendChild(option);
  }
}

function fillExperimentInputsFromRun(run) {
  const params = run?.params || {};
  const displayLiquid = canonicalLiquidName(params.liquid);
  ensureLiquidOption(displayLiquid);
  if (el.liquid) el.liquid.value = displayLiquid || "";
  setInputValue(el.temperatureC, params.temperature_c);
  setInputValue(el.rhoLiquid, params.rho_liquid);
  setInputValue(el.etaReference, params.eta_reference);
  setInputValue(el.radiusMm, params.radius_mm);
  setInputValue(el.rhoBall, params.rho_ball);
  setInputValue(el.tubeDiameterMm, params.tube_diameter_mm);
  setInputValue(el.liquidDepthMm, params.liquid_depth_mm);
}

function hasStudentMeasurement(run) {
  const student = run?.student || {};
  const studentV = finiteNumber(student.student_v);
  const studentEta = finiteNumber(student.student_eta);
  return studentV !== null && studentV > 0 && studentEta !== null && studentEta > 0;
}

function shouldLockRunResults(run) {
  return Boolean(run?.id) && !hasStudentMeasurement(run);
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

function validateExperimentInputs({ requireReference = false } = {}) {
  const liquidName = el.liquid.value.trim();
  if (!liquidName) {
    showToast("请先填写：样本液体");
    return false;
  }
  const checks = [
    [number(el.rhoLiquid), "液体密度"],
    [number(el.radiusMm), "小球半径"],
    [number(el.tubeDiameterMm), "量筒内径"],
    [number(el.liquidDepthMm), "液体深度"],
    [number(el.rhoBall), "小球密度"],
    [number(el.temperatureC), "温度"],
  ];
  if (requireReference) checks.push([number(el.etaReference), "参考粘度"]);
  const missing = checks
    .filter(([value]) => value === "" || value === null || !Number.isFinite(Number(value)) || Number(value) <= 0)
    .map(([, label]) => label);
  if (missing.length) {
    showToast(`请先填写：${missing.join("、")}`);
    return false;
  }
  if (number(el.rhoBall) <= number(el.rhoLiquid)) {
    showToast("小球密度必须大于液体密度，否则不能做落球法计算。");
    return false;
  }
  return true;
}

function apiUrl(path, base = API_BASE_URL) {
  if (/^https?:\/\//i.test(path)) return path;
  return `${base}${path}`;
}

async function apiResponse(path, options = {}) {
  const bases = [API_BASE_URL];
  const canFallbackToHosted = !API_BASE_EXPLICIT && !/^https?:\/\//i.test(path) && API_BASE_URL !== HOSTED_API_BASE_URL;
  if (canFallbackToHosted) bases.push(HOSTED_API_BASE_URL);
  let response = null;
  let lastConnectionError = null;
  for (const base of bases) {
    try {
      response = await fetch(apiUrl(path, base), {
        ...options,
        headers: {
          "Content-Type": "application/json",
          ...(options.headers || {}),
        },
      });
      if (response && [404, 405, 501].includes(response.status) && bases.indexOf(base) < bases.length - 1) {
        continue;
      }
      break;
    } catch (error) {
      lastConnectionError = error;
    }
  }
  if (!response) {
    if (bases.some(Boolean)) {
      throw new Error(`无法连接后端 ${bases.filter(Boolean).join(" 或 ")}。请确认云端后端已启动，或在网址参数 ?api= 中指定可用后端地址。`);
    }
    if (lastConnectionError) throw lastConnectionError;
    throw new Error("无法连接后端。");
  }
  return response;
}

async function api(path, options = {}) {
  const response = await apiResponse(path, options);
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
    const data = await api("/api/health");
    const storage = data.storage || {};
    const storageLabel = storage.backend === "supabase"
      ? `Supabase云库 · ${storage.video_backend === "supabase_storage" ? "云录像" : "本机录像"}`
      : "本机SQLite";
    if (el.serverStatus) el.serverStatus.textContent = `后端在线 · ${storageLabel}`;
    if (el.statusDot) el.statusDot.classList.add("online");
  } catch {
    if (el.serverStatus) el.serverStatus.textContent = "后端未连接";
    if (el.statusDot) el.statusDot.classList.remove("online");
  }
}

async function uploadTrajectory() {
  if (!validateExperimentInputs()) return;
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
    if (el.studentV) el.studentV.value = "";
    if (el.studentEta) el.studentEta.value = "";
    const body = payload();
    body.trajectory = trajectory;
    const run = await api("/api/measurements/trajectory", {
      method: "POST",
      body: JSON.stringify(body),
    });
    state.latest = run;
    renderRun(run);
    await loadRecords();
    updateFileQueue(file.name, "待人工测量", `已保存记录 #${run.id}。请先输入人工测量值后查看 AI 结果。`);
    showToast("轨迹分析完成。请先填写人工测量值，再查看 AI 结果。");
  } catch (error) {
    updateFileQueue(file.name, "失败", error.message);
    showToast(`CSV分析失败：${error.message}`);
  } finally {
    setButtonLoading(el.uploadTrajectoryBtn, false);
  }
}

function describeRealtimeTracking() {
  const { rodLength, tickSpacing } = calibrationRodConfig();
  const samples = getCalibrationTargetCount();
  const detail = samples
    ? `先完成标定：长度 ${rodLength} mm，刻度间距 ${tickSpacing} mm，点击 ${samples} 个刻度点。随后释放小球，系统实时输出轨迹。`
    : "先填写标定棒半径、长度和刻度间距，再连接画面完成标定。";
  updateFileQueue("实时视觉追踪方案", "已读取", detail);
  if (el.liveModelStatus) el.liveModelStatus.textContent = "OpenCV后端可用";
  if (el.liveCalibrationStatus) el.liveCalibrationStatus.textContent = "等待标定棒";
  if (el.liveReadinessLabel) el.liveReadinessLabel.textContent = "实时追踪";
  if (el.liveReadinessDetail) el.liveReadinessDetail.textContent = "先完成标定，再开始追踪。";
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
  const source = dataSources[sourceKey] || dataSources.realtime;
  state.source = dataSources[sourceKey] ? sourceKey : "realtime";
  document.body.dataset.source = state.source;
  el.sourceStatus.textContent = source.status;
  el.activeSourceName.textContent = source.name;
  el.activeSourceDetail.textContent = source.detail;
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
    updateFileQueue("等待画面", "待连接", "连接摄像头后先标定，再开始追踪。");
  }
  const pickerText = document.querySelector(".file-picker span");
  if (pickerText) pickerText.textContent = source.pickerLabel;
  document.querySelectorAll("[data-source]").forEach((button) => {
    button.classList.toggle("active", button.dataset.source === state.source);
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
    const targetCount = getCalibrationTargetCount();
    el.calibrationRodSamples.textContent = targetCount ? String(targetCount) : "--";
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
  if (!el.fileQueue) return;
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
  clearArchivedVideoLoadTimer();
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
  clearArchivedVideoLoadTimer();
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
  el.videoPreview.crossOrigin = "anonymous";
  el.videoPreview.src = apiUrl(video.url);
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
  state.archivedVideoLoadTimer = window.setTimeout(() => {
    if (!el.videoPreview?.dataset.archiveRun) return;
    if (el.videoPreview.readyState >= 1 || el.videoPreview.videoWidth) {
      handleVideoMetadataLoaded();
      return;
    }
    el.videoDuration.textContent = "--";
    el.videoResolution.textContent = "--";
    el.videoReadinessLabel.textContent = "录像读取超时";
    el.videoReadinessDetail.textContent = "未能连接到历史录像文件。请确认服务器录像地址可访问，或重新载入这条记录。";
  }, 8000);
}

function clearArchivedVideoLoadTimer() {
  if (!state.archivedVideoLoadTimer) return;
  window.clearTimeout(state.archivedVideoLoadTimer);
  state.archivedVideoLoadTimer = null;
}

function updateLiveCalibrationStatus() {
  if (!el.liveCalibrationStatus) return;
  const { rodLength, rodDiameter, tickSpacing, valid } = calibrationRodConfig();
  const targetCount = getCalibrationTargetCount();
  const paramsValid = valid && targetCount >= 3;
  const pointsReady = state.axisCalibrationPoints.length >= 2 && Number.isFinite(state.manualScaleMPerPx);
  const selectedReady = state.calibrationMode && calibrationPointsReady();
  if (!paramsValid) {
    el.liveCalibrationStatus.textContent = "参数需补齐";
    if (el.liveReadinessDetail) el.liveReadinessDetail.textContent = "请补齐标定棒半径、长度、刻度间距和点击点数。";
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
    el.liveReadinessDetail.textContent = `参数已就绪：半径 ${rodDiameter} mm，长度 ${rodLength} mm，刻度间距 ${tickSpacing} mm。请点击“开始标定”，从上到下点 ${targetCount} 个刻度。`;
  }
}

function startManualCalibration() {
  if (!el.calibrationClickLayer) return;
  const targetCount = getCalibrationTargetCount();
  if (!targetCount) {
    updateLiveCalibrationStatus();
    syncCalibrationTargetCount();
    showToast("请先填写标定棒半径、长度和刻度间距。");
    return;
  }
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
  livePreviewFrame()?.classList.add("is-axis-calibrating");
  if (el.finishCalibrationBtn) el.finishCalibrationBtn.hidden = true;
  el.realtimeImportPanel?.classList.add("calibration-focus");
  enterLiveFullscreen("calibration");
  renderCalibrationPoints();
  updateLiveCalibrationStatus();
  if (el.calibrationPointStatus) el.calibrationPointStatus.textContent = `0/${targetCount}`;
  showToast(`请沿量筒中心虚线，从标定棒上端开始按顺序点击 ${targetCount} 个刻度点。`);
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
  livePreviewFrame()?.classList.remove("is-axis-calibrating");
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
  mediaPoint.xNorm = fallOffsetConfig().centerPct / 100;
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
  livePreviewFrame()?.classList.remove("is-axis-calibrating");
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
    if (label) label.textContent = state.manualZoomActive ? `选点放大 ${state.manualZoomScale.toFixed(1)}x` : `滚动查看 ${state.manualZoomScale.toFixed(1)}x`;
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

function handleLiveZoomWheel(event) {
  if (!isLiveFullscreenActive() || state.manualZoomScale <= 1.001) return;
  event.preventDefault();
  const scale = clamp(state.manualZoomScale, 1, 5);
  const sensitivity = 0.018 / Math.max(1, scale - 0.6);
  state.manualZoomOrigin = {
    x: clamp((state.manualZoomOrigin?.x ?? 50) + event.deltaX * sensitivity, 0, 100),
    y: clamp((state.manualZoomOrigin?.y ?? 50) + event.deltaY * sensitivity, 0, 100),
  };
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
  if (!targetCount) return false;
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
  if (el.calibrationClickLayer) {
    el.calibrationClickLayer.classList.toggle("is-axis-locked", !hideVisuals && state.calibrationMode);
  }
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
    el.calibrationPointStatus.textContent = targetCount && selectedCount ? `${selectedCount}/${targetCount}` : "未选择";
  }
  if (el.calibrationPixelDistance) {
    el.calibrationPixelDistance.textContent = distancePx ? `${distancePx.toFixed(1)} px` : "--";
  }
  if (el.calibrationScale) {
    el.calibrationScale.textContent = state.manualScaleMPerPx ? formatMetersPerPixel(state.manualScaleMPerPx) : "--";
  }
}

function calibrationRodConfig() {
  const rodDiameter = finiteNumber(el.calibrationRodDiameterMm?.value);
  const rodLength = finiteNumber(el.calibrationRodLengthMm?.value);
  const tickSpacing = finiteNumber(el.rodTickSpacingMm?.value);
  const valid = rodDiameter !== null && rodLength !== null && tickSpacing !== null && rodDiameter > 0 && rodLength >= 50 && tickSpacing > 0;
  return { rodDiameter, rodLength, tickSpacing, valid };
}

function getCalibrationTargetCount() {
  const { rodLength, tickSpacing, valid } = calibrationRodConfig();
  if (!valid) return 0;
  const fullSteps = Math.floor(rodLength / tickSpacing);
  const remainder = rodLength - fullSteps * tickSpacing;
  const derived = fullSteps + 1 + (remainder > 1e-6 ? 1 : 0);
  return Math.max(3, Math.min(31, Math.round(derived)));
}

function calibrationDistanceMmAt(index) {
  const { rodLength, tickSpacing, valid } = calibrationRodConfig();
  const targetCount = getCalibrationTargetCount();
  if (!valid || !targetCount) return null;
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
  if (!targetCount) return "请先填写标定棒参数";
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
  if (!validateExperimentInputs()) return;
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
  state.liveStaticCandidate = null;
  state.liveIgnoreZones = [];
  state.liveMisses = 0;
  state.liveBackendFailures = 0;
  state.liveFrameBusy = false;
  state.liveFramesInFlight = 0;
  state.lastLiveFrameCaptureAt = 0;
  state.liveSampleWindowStart = performance.now();
  state.liveSampleWindowFrames = 0;
  state.liveMeasuredSampleFps = 0;
  state.liveFrameScheduled = false;
  if (state.liveFrameTimer) {
    window.clearTimeout(state.liveFrameTimer);
    state.liveFrameTimer = null;
  }
  if (el.studentV) el.studentV.value = "";
  if (el.studentEta) el.studentEta.value = "";
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
  if (el.liveModelStatus) el.liveModelStatus.textContent = `高频采样中 · 目标 ${LIVE_FRAME_TARGET_FPS} fps`;
  if (el.liveReadinessLabel) el.liveReadinessLabel.textContent = "实时追踪中";
  if (el.liveReadinessDetail) el.liveReadinessDetail.textContent = "后端正在逐帧识别小球中心，曲线会随轨迹点实时刷新。停止后将把轨迹送入粘度计算。";
  updateFileQueue("正在实时追踪小球", "处理中", `浏览器以最高 ${LIVE_FRAME_TARGET_FPS} fps 抓取手机画面，后端 OpenCV 返回球心坐标，曲线会即时更新。`);
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

function updateLiveSampleRate(now) {
  if (!state.liveSampleWindowStart) {
    state.liveSampleWindowStart = now;
    state.liveSampleWindowFrames = 0;
  }
  state.liveSampleWindowFrames += 1;
  const elapsed = now - state.liveSampleWindowStart;
  if (elapsed >= LIVE_SAMPLE_FPS_WINDOW_MS) {
    state.liveMeasuredSampleFps = (state.liveSampleWindowFrames * 1000) / Math.max(1, elapsed);
    state.liveSampleWindowStart = now;
    state.liveSampleWindowFrames = 0;
  }
}

function liveSampleRateText() {
  if (!Number.isFinite(state.liveMeasuredSampleFps) || state.liveMeasuredSampleFps <= 0) {
    return `目标 ${LIVE_FRAME_TARGET_FPS} fps`;
  }
  return `采样 ${state.liveMeasuredSampleFps.toFixed(1)} fps`;
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
  updateLiveSampleRate(now);
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
      if (updateLiveStaticIgnoreZones(result)) {
        state.liveMisses += 1;
        if (el.liveModelStatus) el.liveModelStatus.textContent = `已屏蔽静态误判点 ${state.liveIgnoreZones.length} 个`;
        return;
      }
      const point = liveDetectionToTrajectoryPoint(result);
      const isHighConfidence = point.confidence >= LIVE_MIN_TRACK_CONFIDENCE;
      if (isHighConfidence) {
        insertLiveTrajectoryPoint(point);
        if (state.liveTrajectory.length > LIVE_TRAJECTORY_LIMIT) state.liveTrajectory.shift();
        if (el.liveModelStatus) el.liveModelStatus.textContent = `已追踪 ${state.liveTrajectory.length} 点 · ${liveSampleRateText()} · 处理中 ${state.liveFramesInFlight}`;
        if (FALL_OFFSET_MONITOR_ENABLED) updateFallOffsetStatus(point);
        renderLiveTrackingPreview();
      } else {
        state.liveMisses += 1;
        if (el.liveModelStatus) el.liveModelStatus.textContent = `低置信度跳过 · ${liveSampleRateText()} · 处理中 ${state.liveFramesInFlight}`;
      }
    } else {
      state.liveMisses += 1;
      if (el.liveModelStatus) el.liveModelStatus.textContent = `未识别 ${state.liveMisses} 帧 · ${liveSampleRateText()}`;
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
    min_radius_px: "3",
  });
  if (state.liveIgnoreZones.length) {
    params.set("ignore_zones", JSON.stringify(state.liveIgnoreZones));
  }
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

function liveDetectionBackendPoint(result) {
  const x = finiteNumber(result?.x);
  const yPx = finiteNumber(result?.y_px);
  const width = finiteNumber(result?.metadata?.width);
  const height = finiteNumber(result?.metadata?.height);
  if (x === null || yPx === null || height === null || height <= 0) return null;
  const y = Math.max(0, Math.min(1, yPx / height));
  const radiusPx = finiteNumber(result?.radius_px);
  const radiusNorm = radiusPx !== null && width !== null && width > 0
    ? Math.max(LIVE_STATIC_POINT_RADIUS_NORM, (radiusPx / Math.max(1, Math.min(width, height))) * 2.6)
    : LIVE_STATIC_POINT_RADIUS_NORM;
  return {
    x: Math.max(0, Math.min(1, x)),
    y,
    r: Math.max(LIVE_STATIC_POINT_RADIUS_NORM, Math.min(0.06, radiusNorm)),
    t: finiteNumber(result?.t) ?? ((performance.now() - state.liveTrackingStart) / 1000),
  };
}

function distanceNorm(a, b) {
  return Math.hypot(Number(a.x) - Number(b.x), Number(a.y) - Number(b.y));
}

function pointInLiveIgnoreZone(point) {
  return state.liveIgnoreZones.some((zone) => distanceNorm(point, zone) <= Number(zone.r || LIVE_STATIC_POINT_RADIUS_NORM));
}

function updateLiveStaticIgnoreZones(result) {
  const point = liveDetectionBackendPoint(result);
  if (!point) return false;
  if (pointInLiveIgnoreZone(point)) return true;

  const candidate = state.liveStaticCandidate;
  if (!candidate || distanceNorm(point, candidate) > LIVE_STATIC_POINT_MATCH_NORM) {
    state.liveStaticCandidate = {
      x: point.x,
      y: point.y,
      r: point.r,
      firstT: point.t,
      lastT: point.t,
      count: 1,
      minY: point.y,
      maxY: point.y,
    };
    return false;
  }

  candidate.x = (candidate.x * candidate.count + point.x) / (candidate.count + 1);
  candidate.y = (candidate.y * candidate.count + point.y) / (candidate.count + 1);
  candidate.r = Math.max(candidate.r, point.r);
  candidate.count += 1;
  candidate.lastT = point.t;
  candidate.minY = Math.min(candidate.minY, point.y);
  candidate.maxY = Math.max(candidate.maxY, point.y);

  const ySpan = candidate.maxY - candidate.minY;
  if (candidate.count >= LIVE_STATIC_POINT_LIMIT && ySpan <= LIVE_STATIC_POINT_MATCH_NORM) {
    state.liveIgnoreZones.push({
      x: Number(candidate.x.toFixed(5)),
      y: Number(candidate.y.toFixed(5)),
      r: Number(Math.max(candidate.r, LIVE_STATIC_POINT_RADIUS_NORM).toFixed(5)),
    });
    state.liveIgnoreZones = state.liveIgnoreZones.slice(-LIVE_STATIC_POINT_MAX_ZONES);
    state.liveStaticCandidate = null;
    return true;
  }
  return false;
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
  renderStandardViscosityRange(run, "empty");
  el.viscosity.textContent = "--";
  el.r2.textContent = "--";
  el.re.textContent = "--";
  const liveConfidence = state.liveTrajectory.length
    ? state.liveTrajectory.reduce((sum, point) => sum + point.confidence, 0) / state.liveTrajectory.length
    : null;
  const tracking = formatTrackingQuality(liveConfidence);
  setQualityMetric(el.fitMethod, el.fitMethodDetail, "实时预览", "正在采样，停止后才会生成最终拟合", "neutral");
  setQualityMetric(el.outlierCount, el.outlierDetail, "0 个", "实时阶段暂不做完整预处理", "neutral");
  setQualityMetric(el.segmentCv, el.segmentCvDetail, "--", "停止并计算后判断平台是否够平", "neutral");
  setQualityMetric(el.trackingConfidence, el.trackingConfidenceDetail, tracking.value, tracking.detail, tracking.level);
  setQualityMetric(el.segmentSensitivity, el.segmentSensitivityDetail, "--", "停止并计算后判断换段影响", "neutral");
  renderMotionPhaseCard(run, "empty");
  el.score.textContent = "--";
  if (el.scoreReportBtn) el.scoreReportBtn.disabled = true;
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
    if (el.liveReadinessLabel) el.liveReadinessLabel.textContent = "等待人工测量";
    if (el.liveReadinessDetail) el.liveReadinessDetail.textContent = `已实时追踪 ${trajectory.length} 个点并保存记录。请先输入人工终端速度 vt 和人工粘滞系数 η，再点击评分并生成报告查看 AI 结果。`;
    const archiveText = run.video?.url ? "，录像已归档" : videoArchiveError ? `，录像归档失败：${videoArchiveError}` : "";
    updateFileQueue("实时追踪结果", "待人工测量", `已保存记录 #${run.id}，实时轨迹点 ${trajectory.length} 个${archiveText}。请输入人工测量值后查看 AI 结果。`);
    showToast("实时追踪完成。请先填写人工测量值，再查看 AI 结果。");
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
  if (el.studentV) el.studentV.value = "";
  if (el.studentEta) el.studentEta.value = "";
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
  updateFileQueue(file.name, "待人工测量", `OpenCV提取 ${trajectory.length} 个轨迹点，检测帧 ${meta.detected_frames ?? "--"}/${meta.processed_frames ?? "--"}，已保存记录 #${run.id}${archiveText}。请输入人工测量值后查看 AI 结果。`);
  showToast("视频追踪完成。请先填写人工测量值，再查看 AI 结果。");
}

function appendNonlinearCorrectionParams(params) {
  const enabled = Boolean(el.nonlinearCorrectionEnabled?.checked);
  params.set("nonlinear_correction", enabled ? "true" : "false");
  if (!enabled) return;

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
  if (el.nonlinearCorrectionModel) {
    el.nonlinearCorrectionModel.textContent = enabled ? "分段插值" : "线性换算";
  }
  if (el.nonlinearCorrectionSource) {
    const source = pointCount >= 2 ? `${pointCount} 个标定点` : "等待标定点";
    el.nonlinearCorrectionSource.textContent = enabled ? source : "未启用";
  }
}

function estimateScaleMetersPerPixel() {
  if (Number.isFinite(state.manualScaleMPerPx) && state.manualScaleMPerPx > 0) {
    return state.manualScaleMPerPx;
  }
  const { rodLength } = calibrationRodConfig();
  const rodLengthM = (rodLength || 0) / 1000;
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
  clearArchivedVideoLoadTimer();
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
  renderStandardViscosityRange(null, "empty");
  el.viscosity.textContent = "--";
  el.r2.textContent = "--";
  el.re.textContent = "--";
  resetQualityMetrics();
  el.score.textContent = "--";
  if (el.scoreReportBtn) el.scoreReportBtn.disabled = true;
  el.runBadge.textContent = "等待数据";
  el.downloadReport.href = "#";
  el.downloadReport.classList.add("disabled");
  clearReportPreview();
  renderStudentScoreTable(null);
  renderMotionPhaseCard(null, "empty");
  el.diagnostics.innerHTML = `
    <article class="diagnostic empty">
      <img src="${assetMap.diagnostic.ok}" alt="" />
      <div>
        <strong>尚未完成视觉追踪</strong>
        <p>连接实时画面或载入实验视频后，这里会显示匀速段、Re 条件、壁效应和偏差来源诊断。</p>
      </div>
    </article>
  `;
  renderUncertainty(null);
  drawChart();
}

function resetWorkspaceSession({ keepInputs = false } = {}) {
  state.latest = null;
  state.chartMode = "position";
  state.liveTrajectory = [];
  state.liveMisses = 0;
  state.liveBackendFailures = 0;
  state.liveOffsetTerminated = false;
  state.lastFallOffset = null;
  if (state.liveChartDrawTimer) {
    window.clearTimeout(state.liveChartDrawTimer);
    state.liveChartDrawTimer = null;
  }
  if (!keepInputs) {
    clearExperimentInputs();
    if (el.studentV) el.studentV.value = "";
    if (el.studentEta) el.studentEta.value = "";
  }
  resetVideoPreview();
  resetFallOffsetStatus();
  if (el.liveReadinessLabel) el.liveReadinessLabel.textContent = "实时待连接";
  if (el.liveReadinessDetail) el.liveReadinessDetail.textContent = "连接摄像头后完成标定，再开始实时追踪。";
  if (el.liveModelStatus) el.liveModelStatus.textContent = "待追踪";
  updateFileQueue("等待数据", "待导入", "连接实时画面或导入视频后开始追踪。");
  renderEmptyState();
}

function renderUncertainty(run = state.latest) {
  if (!el.uncertaintyStatus) return;
  if (shouldLockRunResults(run)) {
    el.uncertaintyStatus.textContent = "待人工测量";
    el.uncertaintyDiameterTerm.textContent = "--";
    el.uncertaintyTimingTerm.textContent = "--";
    if (el.uncertaintyVisualTerm) el.uncertaintyVisualTerm.textContent = "--";
    el.uncertaintyCombined.textContent = "--";
    el.uncertaintyStandard.textContent = "--";
    el.uncertaintyExpanded.textContent = "--";
    el.uncertaintyExpression.textContent = "请先输入人工终端速度和人工粘滞系数，评分后再显示 AI 结果与不确定度。";
    return;
  }
  if (!run?.result || !run?.params) {
    el.uncertaintyStatus.textContent = "待导入";
    el.uncertaintyDiameterTerm.textContent = "--";
    el.uncertaintyTimingTerm.textContent = "--";
    if (el.uncertaintyVisualTerm) el.uncertaintyVisualTerm.textContent = "--";
    el.uncertaintyCombined.textContent = "--";
    el.uncertaintyStandard.textContent = "--";
    el.uncertaintyExpanded.textContent = "--";
    el.uncertaintyExpression.textContent = "完成追踪后生成 η ± U 的结果表达。";
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
    if (el.uncertaintyVisualTerm) el.uncertaintyVisualTerm.textContent = "--";
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
  const deltaCalibration = Math.max(0, number(el.uncertaintyCalibrationMm, 0));
  const wallD = 1 + (2.4 * d) / D;
  const depthH = 1 + (1.6 * d) / H;
  const diameterCoefficient = (2 / d) - (2.4 / (wallD * D)) - (1.6 / (depthH * H));
  const diameterTerm = Math.abs(diameterCoefficient * deltaD);
  const timeTerm = deltaT / Math.max(t, 1e-12);
  const distanceTerm = deltaL / Math.max(l, 1e-12);
  const tubeTerm = Math.abs(((2.4 * d) / (wallD * D * D)) * deltaTube);
  const depthTerm = Math.abs(((1.6 * d) / (depthH * H * H)) * deltaH);
  const timingTerm = Math.hypot(timeTerm, distanceTerm);
  const calibrationTerm = deltaCalibration / Math.max(l, 1e-12);
  const combinedRel = Math.hypot(diameterTerm, timeTerm, distanceTerm, tubeTerm, depthTerm, calibrationTerm);
  const standardU = eta * combinedRel;
  const expandedU = standardU * 2;
  el.uncertaintyStatus.textContent = run.source === "simulation" ? "仿真对照" : "已计算";
  el.uncertaintyDiameterTerm.textContent = formatPercent(Math.hypot(diameterTerm, tubeTerm, depthTerm));
  el.uncertaintyTimingTerm.textContent = formatPercent(timingTerm);
  if (el.uncertaintyVisualTerm) el.uncertaintyVisualTerm.textContent = formatPercent(calibrationTerm);
  el.uncertaintyCombined.textContent = formatPercent(combinedRel);
  el.uncertaintyStandard.textContent = `${formatPaS(standardU)} Pa·s`;
  el.uncertaintyExpanded.textContent = `${formatPaS(expandedU)} Pa·s`;
  el.uncertaintyExpression.textContent = `d=${d.toFixed(3)} mm，D=${D.toFixed(1)} mm，H=${H.toFixed(1)} mm，l≈${l.toFixed(1)} mm，t≈${t.toFixed(3)} s；鼠标标定点误差 Δl标定=${deltaCalibration.toFixed(2)} mm；η = ${formatPaS(eta)} ± ${formatPaS(expandedU)} Pa·s，k=2`;
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

function enterDashboardByTemporaryPass() {
  state.accessGranted = true;
  state.examStarted = false;
  state.lectureStarted = false;
  updateAccessState();
  switchView("dashboard");
  showToast("已通过临时入口进入实验大厅。");
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
    fieldset.dataset.quizKey = question.key;
    const legend = document.createElement("legend");
    legend.innerHTML = `
      <span>第 ${index + 1} 题 · ${question.type} · ${question.points} 分</span>
      <button class="quiz-question-help" type="button" data-quiz-help="${question.key}" disabled>问这题</button>
      ${question.title}
    `;
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
  updateQuizTutorAvailability();
}

function updateQuizTutorAvailability() {
  const enabled = Boolean(state.quizSubmitted && state.quizTutorContext);
  document.querySelectorAll("[data-quiz-help]").forEach((button) => {
    button.disabled = !enabled;
    button.title = enabled ? "围绕这道题继续提问" : "提交测验后开放单题问答";
  });
  if (el.quizTutorInput) {
    el.quizTutorInput.disabled = !enabled;
    el.quizTutorInput.placeholder = enabled
      ? "继续提问：例如为什么要拟合终端速度？"
      : "提交测验后可继续提问";
  }
  const tutorSubmit = el.quizTutorForm?.querySelector("button[type='submit']");
  if (tutorSubmit) tutorSubmit.disabled = !enabled;
}

function isExperimentRelatedQuestion(question) {
  return Boolean(question.trim());
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

function quizOptionText(item, value) {
  return item?.options?.[value] || (value ? `选项 ${value}` : "未作答");
}

function quizQuestionContext(questionKey) {
  const index = quizQuestions.findIndex((item) => item.key === questionKey);
  const item = quizQuestions[index];
  if (!item) return null;
  const selected = state.quizAnswers[item.key] || new FormData(el.quizForm).get(item.key);
  return {
    key: item.key,
    index: index + 1,
    module: item.module,
    type: item.type,
    points: item.points,
    title: item.title,
    options: item.options,
    selected,
    selectedText: quizOptionText(item, selected),
    answer: item.answer,
    answerText: quizOptionText(item, item.answer),
    correct: selected === item.answer,
    explanation: item.explanation,
  };
}

function quizSubmissionContext(formData, score) {
  const items = quizQuestions.map((item) => {
    const selected = formData.get(item.key);
    return {
      ...quizQuestionContext(item.key),
      selected,
      selectedText: quizOptionText(item, selected),
      correct: selected === item.answer,
    };
  });
  return {
    score,
    total: 100,
    passScore: quizPassScore,
    answered: items.length,
    wrongCount: items.filter((item) => !item.correct).length,
    items,
  };
}

function buildOpenQuizTutorContext() {
  const formData = new FormData(el.quizForm);
  const items = quizQuestions.map((item) => {
    const selected = formData.get(item.key);
    return {
      ...quizQuestionContext(item.key),
      selected,
      selectedText: quizOptionText(item, selected),
      correct: selected ? selected === item.answer : null,
    };
  });
  return {
    stage: "pre_submit_or_general_question",
    total: 100,
    passScore: quizPassScore,
    answered: items.filter((item) => item.selected).length,
    questionCount: items.length,
    items,
  };
}

function quizTutorPrompt(question, context) {
  return [
    "你是落球法 AI 实验平台的预习作业问答 agent。",
    "教学方式：采用苏格拉底式引导，不直接展开长篇标准答案；先指出学生当前理解卡点，再用 2-4 个短问题引导学生自己修正。",
    "回答策略：优先结合本实验讲义、落球法、Stokes 条件、终端速度、Re、壁效应、标定、背光成像、AI 视觉测量、误差分析和试题本身；如果学生问题表达不清，先追问澄清，不要用固定拒答话术。",
    "输出要求：中文；短段落；不要使用展开式长清单；如果是错题，必须结合学生实际选择说明为什么这个选择暴露了什么误解；最后给一个可操作的复习动作。",
    `学生问题：${question}`,
    `上下文：${JSON.stringify(context || {}, null, 2)}`,
  ].join("\n");
}

function renderQuizQuestionContext(context) {
  if (!context) return "";
  return `
    <article class="${context.correct ? "is-correct" : "is-wrong"}">
      <span>第 ${context.index} 题 · ${context.module}</span>
      <strong>${escapeHtml(context.title)}</strong>
      <p><b>学生选择：</b>${escapeHtml(context.selectedText)}</p>
      <p><b>标准答案：</b>${escapeHtml(context.answerText)}</p>
    </article>
  `;
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
  state.quizTutorContext = quizSubmissionContext(formData, score);
  if (!wrongItems.length) {
    el.quizTutorSummary.innerHTML = `
      <strong>本次 ${score}/100，全部正确。</strong>
      <p id="quizAiSummary">AI 正在根据你的作答生成简短学习建议...</p>
    `;
    updateQuizTutorAvailability();
    requestQuizGradingSummary();
    return;
  }

  el.quizTutorSummary.innerHTML = `
    <strong>本次 ${score}/100，发现 ${wrongItems.length} 道错题。</strong>
    <p id="quizAiSummary">AI 正在根据你的作答生成总评。错题分析先收起，点击对应题目查看。</p>
    <div class="quiz-review-list">
      ${wrongItems
        .map(({ item, index, selected }) => `
          <details>
            <summary>
              <span>第 ${index} 题</span>
              <strong>${escapeHtml(item.title)}</strong>
              <button class="quiz-question-help inline" type="button" data-quiz-help="${item.key}">问这题</button>
            </summary>
            <p><b>你的选择：</b>${escapeHtml(item.options[selected] || "未选择")}</p>
            <p><b>正确答案：</b>${escapeHtml(item.options[item.answer])}</p>
            <p><b>针对分析：</b>${escapeHtml(item.explanation)}</p>
          </details>
        `)
        .join("")}
    </div>
  `;
  updateQuizTutorAvailability();
  requestQuizGradingSummary();
}

async function requestQuizGradingSummary() {
  const summary = document.getElementById("quizAiSummary");
  if (!summary || !state.quizTutorContext) return;
  try {
    const data = await api("/api/assistant/ask", {
      method: "POST",
      body: JSON.stringify({
        question: quizTutorPrompt("请根据本次预习作业给学生一个简短总评，只总结能力表现和下一步复习重点，不展开每道题解析。", state.quizTutorContext),
        context: { kind: "quiz_grading", quiz: state.quizTutorContext },
      }),
    });
    summary.textContent = data.answer || "已完成批改，请点击错题查看针对分析。";
  } catch (error) {
    summary.textContent = "AI 总评暂时生成失败，但错题诊断仍可查看。";
  }
}

async function askQuizTutor(question, sourceButton = null, context = null, target = "panel") {
  if (!question.trim()) return;
  if (!state.quizSubmitted || !state.quizTutorContext) {
    showToast("请先提交测验，再和 AI 助教提问。");
    return;
  }
  const addMessage = target === "dialog" ? addQuizDialogMessage : addQuizTutorMessage;
  addMessage("user", question);
  const pending = addMessage("ai pending", "正在根据讲义、题目和你的选择生成引导...");
  setButtonLoading(sourceButton, true, "生成中");
  try {
    const tutorContext = context || state.quizTutorContext || buildOpenQuizTutorContext();
    const data = await api("/api/assistant/ask", {
      method: "POST",
      body: JSON.stringify({
        question: quizTutorPrompt(question, tutorContext),
        context: { kind: target === "dialog" ? "quiz_question" : "quiz_panel", quiz: tutorContext },
      }),
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

function addQuizDialogMessage(type, text) {
  const message = document.createElement("div");
  message.className = `message ${type}`;
  message.textContent = text;
  el.quizDialogChat.appendChild(message);
  el.quizDialogChat.scrollTop = el.quizDialogChat.scrollHeight;
  return message;
}

function openQuizQuestionDialog(questionKey) {
  if (!state.quizSubmitted || !state.quizTutorContext) {
    showToast("请先提交测验，再打开单题问答。");
    return;
  }
  const context = quizQuestionContext(questionKey);
  if (!context) return;
  state.quizDialogQuestion = context;
  el.quizDialogMeta.textContent = `第 ${context.index} 题 · ${context.type}`;
  el.quizDialogTitle.textContent = context.correct ? "这题已答对，可继续追问" : "错题针对辅导";
  el.quizDialogContext.innerHTML = renderQuizQuestionContext(context);
  el.quizDialogChat.innerHTML = "";
  el.quizQuestionDialog.hidden = false;
  addQuizDialogMessage(
    "ai",
    context.selected
      ? `我会围绕你选的“${context.selectedText}”来引导。先想一想：这道题真正考的是哪个实验条件或操作步骤？`
      : "你还没有选择这道题。我可以先帮你判断题目考点，但会尽量不直接给答案。",
  );
  el.quizDialogInput.focus();
}

function closeQuizQuestionDialog() {
  el.quizQuestionDialog.hidden = true;
  state.quizDialogQuestion = null;
  if (el.quizDialogInput) el.quizDialogInput.value = "";
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
  state.quizAnswers = Object.fromEntries(quizQuestions.map((item) => [item.key, data.get(item.key)]));
  state.quizSubmitted = true;
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

function resetQuiz() {
  el.quizForm.reset();
  el.quizScore.textContent = "--";
  el.quizResult.textContent = "完成测验后，系统会判断是否允许进入大厅。";
  el.quizResult.className = "quiz-result";
  el.quizTutorPanel.hidden = false;
  el.quizTutorSummary.textContent = "提交测验后，系统会根据你的作答开放问答，并给出错题总结和针对分析。";
  el.quizTutorChat.innerHTML = "";
  el.quizTutorInput.value = "";
  state.quizSubmitted = false;
  state.quizAnswers = {};
  state.quizTutorContext = null;
  closeQuizQuestionDialog();
  el.retryQuizBtn.hidden = true;
  el.enterHallBtn.hidden = true;
  updateExamProgress();
  updateQuizTutorAvailability();
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
  if (nextView === "summary-report") renderSummaryReportPage();
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
  const locked = shouldLockRunResults(run);
  fillExperimentInputsFromRun(run);
  updateAccelerationSpanHint();
  if (el.studentV) el.studentV.value = finiteNumber(student.student_v) === null ? "" : String(student.student_v);
  if (el.studentEta) el.studentEta.value = finiteNumber(student.student_eta) === null ? "" : String(student.student_eta);
  el.runBadge.textContent = run.id ? `记录 #${run.id}` : "仿真对照";
  if (el.scoreReportBtn) el.scoreReportBtn.disabled = !run.id;
  if (locked) {
    renderLockedRunResults(run);
    drawChart();
    return;
  }
  el.terminalVelocity.textContent = `${result.terminal_velocity.toFixed(4)} m/s`;
  el.uniformSegmentLength.textContent = formatUniformSegmentLength(estimateUniformSegmentSpan(run, result.terminal_velocity));
  el.idealViscosity.textContent = idealEta === null ? "--" : `${formatPaS(idealEta)} Pa·s`;
  renderStandardViscosityRange(run);
  el.viscosity.textContent = `${formatPaS(result.viscosity)} Pa·s`;
  el.r2.textContent = result.r2.toFixed(3);
  el.re.textContent = result.re.toFixed(3);
  renderQualityMetrics(run);
  renderMotionPhaseCard(run);
  el.score.textContent = formatScore(student.score);
  if (run.id) {
    el.downloadReport.href = apiUrl(`/api/runs/${run.id}/report`);
    el.downloadReport.classList.remove("disabled");
    renderReportPreview(run.id);
  } else {
    el.downloadReport.href = "#";
    el.downloadReport.classList.add("disabled");
    clearReportPreview();
  }
  renderDiagnostics([...(run.diagnostics || []), ...buildVisionQualityDiagnostics(run)]);
  renderStudentScoreTable(run);
  renderUncertainty(run);
  drawChart();
}

function renderLockedRunResults(run) {
  el.terminalVelocity.textContent = "待人工测量";
  el.uniformSegmentLength.textContent = "--";
  el.idealViscosity.textContent = "待人工测量";
  renderStandardViscosityRange(run, "locked");
  el.viscosity.textContent = "待人工测量";
  el.r2.textContent = "--";
  el.re.textContent = "--";
  renderQualityMetrics(run);
  renderMotionPhaseCard(run, "locked");
  el.score.textContent = "待评分";
  el.downloadReport.href = "#";
  el.downloadReport.classList.add("disabled");
  clearReportPreview();
  renderDiagnostics([
    {
      level: "warn",
      title: "请先完成人工测量",
      message: `记录 #${run.id} 已完成 AI 追踪与后台计算。为保证学生先独立完成实验，请输入人工终端速度 vt 和人工粘滞系数 η，再点击“评分并生成报告”查看 AI 结果。`,
    },
  ]);
  renderStudentScoreTable(run);
  renderUncertainty(run);
}

function renderStudentScoreTable(run) {
  if (!el.studentScorePanel || !el.studentScoreRows) return;
  const student = run?.student || {};
  const result = run?.result || {};
  const hasStudentValues = finiteNumber(student.student_v) !== null || finiteNumber(student.student_eta) !== null;
  el.studentScorePanel.hidden = !hasStudentValues;
  if (!hasStudentValues) {
    el.studentScoreRows.innerHTML = "";
    if (el.studentScoreValue) el.studentScoreValue.textContent = "--";
    return;
  }
  if (el.studentScoreValue) el.studentScoreValue.textContent = `${formatScore(student.score)} 分`;
  const rows = [
    {
      label: "终端速度 vt",
      student: formatMeasurement(student.student_v, "m/s"),
      ai: formatMeasurement(result.terminal_velocity, "m/s"),
      error: formatPercent(student.v_error),
    },
    {
      label: "理想公式粘滞系数 η₀",
      student: formatMeasurement(student.student_eta, "Pa·s"),
      ai: formatMeasurement(idealViscosityFromRun(run), "Pa·s"),
      error: formatPercent(student.eta_error),
    },
  ];
  el.studentScoreRows.innerHTML = rows
    .map(
      (row) => `
        <tr>
          <th scope="row">${row.label}</th>
          <td>${row.student}</td>
          <td>${row.ai}</td>
          <td>${row.error}</td>
        </tr>
      `,
    )
    .join("");
}

function clearReportPreview() {
  if (el.reportPreviewPanel) el.reportPreviewPanel.hidden = true;
  if (el.reportPreview) {
    delete el.reportPreview.dataset.runId;
    el.reportPreview.innerHTML = "";
  }
}

async function renderReportPreview(runId) {
  if (!el.reportPreviewPanel || !el.reportPreview || !runId) return;
  el.reportPreviewPanel.hidden = false;
  el.reportPreview.dataset.runId = String(runId);
  el.reportPreview.innerHTML = `<p class="report-loading">正在载入完整报告...</p>`;
  try {
    const response = await fetch(apiUrl(`/api/runs/${runId}/report`));
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const markdown = await response.text();
    if (el.reportPreview.dataset.runId !== String(runId)) return;
    el.reportPreview.innerHTML = markdownReportToHtml(markdown);
  } catch (error) {
    el.reportPreview.innerHTML = `<p class="report-error">报告载入失败：${escapeHtml(error.message)}</p>`;
  }
}

function markdownReportToHtml(markdown) {
  const blocks = [];
  const lines = String(markdown || "").split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].trim();
    if (!line) continue;
    if (line.startsWith("# ")) {
      blocks.push(`<h3>${escapeHtml(line.slice(2))}</h3>`);
    } else if (line.startsWith("## ")) {
      blocks.push(`<h4>${escapeHtml(line.slice(3))}</h4>`);
    } else if (line.startsWith("|")) {
      const tableLines = [];
      while (index < lines.length && lines[index].trim().startsWith("|")) {
        tableLines.push(lines[index].trim());
        index += 1;
      }
      index -= 1;
      blocks.push(markdownTableToHtml(tableLines));
    } else {
      blocks.push(`<p>${escapeHtml(line)}</p>`);
    }
  }
  return blocks.join("");
}

function markdownTableToHtml(lines) {
  const rows = lines
    .filter((line) => !/^\|\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?$/.test(line))
    .map((line) => line.replace(/^\||\|$/g, "").split("|").map((cell) => cell.trim()));
  if (!rows.length) return "";
  const [head, ...body] = rows;
  const headHtml = head.map((cell) => `<th>${escapeHtml(cell)}</th>`).join("");
  const bodyHtml = body
    .map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`)
    .join("");
  return `<div class="report-table-wrap"><table><thead><tr>${headHtml}</tr></thead><tbody>${bodyHtml}</tbody></table></div>`;
}

function simulationPayload() {
  const reference = simulationReferenceFromInputs();
  return {
    scenario: el.simScenario.value,
    liquid: reference?.liquid || el.simScenario.value,
    rho_liquid: reference?.densityKgM3 ?? number(el.simRhoLiquid),
    eta_reference: reference?.viscosityPaS ?? number(el.simEtaReference),
    temperature_c: number(el.simTemperatureC),
    reference_temperature_c: reference?.matchedTemperature ?? null,
    radius_mm: number(el.simRadiusMm, 1.5),
    tube_diameter_mm: number(el.simTubeMm, 35),
    liquid_depth_mm: number(el.simDepthMm, 220),
    release_bias: number(el.simRelease, 0),
    refraction: number(el.simRefraction, 0),
    lighting: number(el.simLighting, 1),
  };
}

function simulationReferenceFromInputs() {
  const reference = findStandardViscosityReference(el.simScenario?.value);
  const temperature = finiteNumber(el.simTemperatureC?.value);
  if (!reference || temperature === null) return null;
  const matched = nearestStandardViscosityPoint(reference, temperature);
  if (!matched) return null;
  const viscosityPaS = finiteNumber(matched.viscosityPaS);
  const densityKgM3 = finiteNumber(matched.densityKgM3);
  if (viscosityPaS === null || densityKgM3 === null || viscosityPaS <= 0 || densityKgM3 <= 0) return null;
  return {
    liquid: reference.label,
    source: reference.source,
    inputTemperature: temperature,
    matchedTemperature: Number(matched.temperatureC),
    viscosityPaS,
    densityKgM3,
  };
}

function renderSimulationReferenceNote(reference) {
  if (!el.simLiquidNote) return;
  if (!reference) {
    el.simLiquidNote.textContent = "系统按输入温度匹配最接近的表值。";
    return;
  }
  const exact = Math.abs(reference.inputTemperature - reference.matchedTemperature) < 0.05;
  const temperatureText = exact
    ? `取 ${reference.matchedTemperature.toFixed(1)}℃最近表值`
    : `输入 ${reference.inputTemperature.toFixed(1)}℃，取最近的 ${reference.matchedTemperature.toFixed(1)}℃表值`;
  el.simLiquidNote.textContent = `${reference.liquid} · ${temperatureText} · η=${formatPaS(reference.viscosityPaS)} Pa·s，ρ=${reference.densityKgM3.toFixed(1)} kg/m³ · ${reference.source}`;
}

function updateSimulationReference({ resetDrop = true } = {}) {
  const reference = simulationReferenceFromInputs();
  if (reference) {
    setInputValue(el.simEtaReference, reference.viscosityPaS);
    setInputValue(el.simRhoLiquid, reference.densityKgM3);
  } else {
    if (el.simEtaReference) el.simEtaReference.value = "";
    if (el.simRhoLiquid) el.simRhoLiquid.value = "";
  }
  renderSimulationReferenceNote(reference);
  if (resetDrop) resetSimulationDrop();
  return reference;
}

function resetSimulationDrop() {
  simulationDrop.active = false;
  simulationDrop.completed = false;
  simulationDrop.startTime = null;
  stopSimulationAnimation();
  drawSimulationCanvas();
}

function updateSimulationLabels() {
  if (el.simReleaseValue) el.simReleaseValue.textContent = `${Math.round(number(el.simRelease, 0) * 100)}%`;
  if (el.simRefractionValue) el.simRefractionValue.textContent = `${Math.round(number(el.simRefraction, 0) * 100)}%`;
  if (el.simLightingValue) el.simLightingValue.textContent = `${Math.round(number(el.simLighting, 1) * 100)}%`;
  resetSimulationDrop();
}

function applySimulationPreset() {
  const preset = simulationPresets[el.simScenario.value] || simulationPresets["纯甘油"];
  el.simRadiusMm.value = preset.radius;
  el.simTubeMm.value = preset.tube;
  el.simDepthMm.value = preset.depth;
  if (el.simRelease) el.simRelease.value = preset.release;
  if (el.simRefraction) el.simRefraction.value = preset.damping;
  if (el.simLighting) el.simLighting.value = preset.stability;
  updateSimulationLabels();
  updateSimulationReference({ resetDrop: false });
}

async function runSimulation() {
  const reference = updateSimulationReference({ resetDrop: false });
  if (!reference) {
    showToast("请先选择液体并输入有效温度，系统匹配参考粘度后再开始仿真。");
    return;
  }
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
  showToast("仿真完成，已输出小球位移和速度曲线。");
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
  el.simRisk.textContent = "参数无效";
  el.simRe.textContent = "--";
  el.simWallCorrection.textContent = "--";
  el.simReCorrection.textContent = "--";
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
  const rubric = Array.isArray(sim.rubric) ? sim.rubric : [];

  if (el.simulationStatus) el.simulationStatus.textContent = "已输出曲线";
  const terminalVelocityText = `${terminalVelocity.toFixed(4)} m/s`;
  el.simVt.textContent = terminalVelocityText;
  el.simEta.textContent = `${knownEta < 0.01 ? knownEta.toFixed(6) : knownEta.toFixed(3)} Pa·s`;
  el.simRisk.textContent = sim.risk_label || "已完成";
  el.simRe.textContent = fixed(re, re !== null && re >= 100 ? 1 : 3);
  el.simWallCorrection.textContent = fixed(wallCorrection, 3);
  el.simReCorrection.textContent = fixed(reynoldsCorrection, 3);
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
  const velocityPoints = (run?.curves?.velocity || []).filter((point) => finiteNumber(point?.t) !== null && finiteNumber(point?.v) !== null);
  const positionPoints = (run?.curves?.position || []).filter((point) => finiteNumber(point?.t) !== null && finiteNumber(point?.y) !== null);
  const liquidDepthMm = number(el.simDepthMm, null) || finiteNumber(state.simulation?.simulation?.liquid_depth_mm) || 220;
  const liquidDepthM = Math.max(0.001, liquidDepthMm / 1000);
  if (simulationDrop.active && simulationDrop.startTime === null) simulationDrop.startTime = timestamp;
  const elapsed = simulationDrop.startTime === null ? 0 : Math.max(0, timestamp - simulationDrop.startTime);
  const dropProgress = Math.min(1, elapsed / simulationDrop.duration);
  const easedDropProgress = 1 - Math.pow(1 - dropProgress, 3);
  const tube = {
    x: Math.round(width * 0.055),
    y: Math.round(height * 0.12),
    w: Math.round(width * 0.17),
    h: Math.round(height * 0.72),
  };
  const progress = simulationDrop.active ? easedDropProgress : simulationDrop.completed ? 1 : 0;
  const drift = velocityPoints.length
    ? Math.min(0.1, finiteNumber(state.simulation?.simulation?.release_bias, 0) * 0.08)
    : number(el.simRelease, 0) * 0.08;
  drawSimulationCylinder(tube, progress, drift, timestamp, liquidDepthMm);

  const plotArea = {
    x: Math.round(width * 0.315),
    y: Math.round(height * 0.11),
    w: Math.round(width * 0.635),
    h: Math.round(height * 0.74),
  };
  const plot = { x: plotArea.x + 86, y: plotArea.y + 44, w: plotArea.w - 106, h: plotArea.h - 102 };
  simCtx.save();
  simCtx.fillStyle = "#20231f";
  simCtx.font = "900 20px Avenir Next, sans-serif";
  simCtx.textAlign = "left";
  const chartMode = state.simulationChartMode === "velocity" ? "velocity" : "position";
  simCtx.fillText(chartMode === "position" ? "s-t 图" : "v-t 图", plotArea.x, 42);

  const previewVelocity = samplePreviewVelocity();
  const drawVelocity = velocityPoints.length ? velocityPoints : previewVelocity;
  const drawPosition = positionPoints.length ? positionPoints : buildPreviewPositionFromVelocity(previewVelocity);
  const maxPositionValue = Math.max(...drawPosition.map((point) => finiteNumber(point.y, 0)), 0);
  const maxVelocityValue = Math.max(...drawVelocity.map((point) => finiteNumber(point.v, 0)), 0.001);
  const simulatedFallTime = finiteNumber(state.simulation?.simulation?.fall_time_s);
  const previewFallTime = estimatePreviewFallTime(liquidDepthM, maxVelocityValue);
  const maxT = Math.max(
    0.7,
    simulatedFallTime ?? previewFallTime,
    ...drawVelocity.map((p) => finiteNumber(p.t, 0)),
    ...drawPosition.map((p) => finiteNumber(p.t, 0)),
  );
  const scale = chartMode === "position"
    ? drawSimulationScientificPlot({
        plot,
        points: drawPosition,
        valueKey: "y",
        maxT,
        minValueOverride: 0,
        maxValueOverride: Math.max(liquidDepthM, maxPositionValue * 1.08),
        title: "s-t 图",
        xLabel: "时间 t / s",
        yLabel: "下落位移 s / m",
        color: positionPoints.length ? "#327a66" : "rgba(50, 122, 102, 0.48)",
      })
    : drawSimulationScientificPlot({
        plot,
        points: drawVelocity,
        valueKey: "v",
        maxT,
        minValueOverride: 0,
        maxValueOverride: maxVelocityValue * 1.18,
        title: "v-t 图",
        xLabel: "时间 t / s",
        yLabel: "瞬时速度 v / (m·s⁻¹)",
        color: velocityPoints.length ? "#a26025" : "rgba(162, 96, 37, 0.48)",
      });

  if (chartMode === "velocity" && velocityPoints.length) {
    const terminalVelocity = finiteNumber(state.simulation?.run?.result?.terminal_velocity);
    if (terminalVelocity === null) {
      simCtx.restore();
      return;
    }
    simCtx.strokeStyle = "rgba(50, 122, 102, 0.44)";
    simCtx.setLineDash([8, 8]);
    const vtY = scale.yFor(terminalVelocity);
    simCtx.beginPath();
    simCtx.moveTo(plot.x, vtY);
    simCtx.lineTo(plot.x + plot.w, vtY);
    simCtx.stroke();
    simCtx.setLineDash([]);
    simCtx.fillStyle = "#235b4c";
    simCtx.font = "900 12px ui-monospace, monospace";
    simCtx.textAlign = "right";
    simCtx.fillText(`v_t = ${terminalVelocity.toFixed(4)} m·s⁻¹`, plot.x + plot.w - 4, vtY - 8);
  }
  simCtx.restore();
}

function drawSimulationScientificPlot({ plot, points, valueKey, maxT, minValueOverride = null, maxValueOverride = null, title, xLabel, yLabel, color }) {
  const values = points.map((point) => finiteNumber(point?.[valueKey], 0));
  const minValue = minValueOverride ?? Math.min(0, ...values);
  const maxValue = Math.max(0.0001, maxValueOverride ?? Math.max(...values));
  const range = Math.max(0.0001, maxValue - minValue);
  const xFor = (t) => plot.x + (finiteNumber(t, 0) / maxT) * plot.w;
  const yFor = (value) => plot.y + plot.h - ((finiteNumber(value, 0) - minValue) / range) * plot.h * 0.9 - plot.h * 0.04;

  simCtx.save();
  simCtx.strokeStyle = "rgba(32, 35, 31, 0.18)";
  simCtx.lineWidth = 1.2;
  simCtx.beginPath();
  simCtx.moveTo(plot.x, plot.y);
  simCtx.lineTo(plot.x, plot.y + plot.h);
  simCtx.lineTo(plot.x + plot.w, plot.y + plot.h);
  simCtx.stroke();

  simCtx.strokeStyle = "rgba(32, 35, 31, 0.08)";
  simCtx.lineWidth = 1;
  simCtx.font = "700 10px ui-monospace, monospace";
  simCtx.fillStyle = "rgba(67, 78, 72, 0.82)";
  simCtx.textBaseline = "middle";
  for (let index = 0; index <= 4; index += 1) {
    const ratio = index / 4;
    const x = plot.x + ratio * plot.w;
    simCtx.beginPath();
    simCtx.moveTo(x, plot.y);
    simCtx.lineTo(x, plot.y + plot.h);
    simCtx.stroke();
    simCtx.textAlign = "center";
    simCtx.fillText(formatAxisNumber(maxT * ratio), x, plot.y + plot.h + 16);
  }
  for (let index = 0; index <= 4; index += 1) {
    const ratio = index / 4;
    const y = plot.y + plot.h - ratio * plot.h;
    const value = minValue + ratio * range;
    simCtx.beginPath();
    simCtx.moveTo(plot.x, y);
    simCtx.lineTo(plot.x + plot.w, y);
    simCtx.stroke();
    simCtx.textAlign = "right";
    simCtx.fillText(formatAxisNumber(value), plot.x - 8, y);
  }

  simCtx.strokeStyle = color;
  simCtx.lineWidth = 3.2;
  simCtx.lineCap = "round";
  simCtx.lineJoin = "round";
  simCtx.beginPath();
  points.forEach((point, index) => {
    const x = xFor(point.t);
    const y = yFor(point[valueKey]);
    if (index === 0) simCtx.moveTo(x, y);
    else simCtx.lineTo(x, y);
  });
  simCtx.stroke();

  simCtx.fillStyle = "rgba(32, 35, 31, 0.78)";
  simCtx.font = "900 14px system-ui";
  simCtx.textAlign = "left";
  simCtx.fillText(title, plot.x, plot.y - 18);
  simCtx.font = "800 12px system-ui";
  simCtx.textAlign = "center";
  simCtx.fillText(xLabel, plot.x + plot.w / 2, plot.y + plot.h + 42);
  simCtx.save();
  simCtx.translate(plot.x - 62, plot.y + plot.h / 2);
  simCtx.rotate(-Math.PI / 2);
  simCtx.fillText(yLabel, 0, 0);
  simCtx.restore();
  simCtx.restore();
  return { xFor, yFor, minValue, maxValue, range };
}

function buildPreviewPositionFromVelocity(points) {
  let position = 0;
  return points.map((point, index) => {
    if (index > 0) {
      const previous = points[index - 1];
      const dt = Math.max(0, finiteNumber(point.t, 0) - finiteNumber(previous.t, 0));
      position += ((finiteNumber(previous.v, 0) + finiteNumber(point.v, 0)) / 2) * dt;
    }
    return { t: point.t, y: position };
  });
}

function estimatePreviewFallTime(liquidDepthM, terminalVelocity) {
  const safeDepth = Math.max(0.001, finiteNumber(liquidDepthM, 0.22));
  const safeVelocity = Math.max(0.001, finiteNumber(terminalVelocity, 0.08));
  return Math.min(60, Math.max(0.7, safeDepth / safeVelocity + 0.35));
}

function samplePreviewVelocity() {
  const release = number(el.simRelease, 0);
  const damping = number(el.simRefraction, 0);
  const stability = number(el.simLighting, 1);
  const terminal = 0.075 + (1 - damping) * 0.035;
  const tau = 0.22 + release * 0.12;
  return Array.from({ length: 70 }, (_, index) => {
    const t = index * 0.045;
    const v = terminal * (1 - Math.exp(-t / tau)) + Math.sin(index * 0.55) * (1 - stability) * 0.004;
    return { t, v: Math.max(0, v) };
  });
}

function drawSimulationCylinder(tube, progress, drift, timestamp, liquidDepthMm = 220) {
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

  simCtx.strokeStyle = "rgba(32, 35, 31, 0.28)";
  simCtx.lineWidth = 1.4;
  simCtx.font = "800 11px ui-monospace, monospace";
  simCtx.fillStyle = "rgba(32, 35, 31, 0.58)";
  const safeDepthMm = Math.max(1, finiteNumber(liquidDepthMm, 220));
  for (let index = 0; index <= 8; index += 1) {
    const ratio = index / 8;
    const y = liquidTop + ratio * (liquidBottom - liquidTop);
    const longTick = index % 2 === 0;
    simCtx.beginPath();
    simCtx.moveTo(glass.right + 10, y);
    simCtx.lineTo(glass.right + (longTick ? 36 : 24), y);
    simCtx.stroke();
    if (longTick) {
      const depthLabel = Math.round(safeDepthMm * ratio);
      simCtx.fillText(`${depthLabel} mm`, glass.right + 42, y + 4);
    }
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
  simCtx.fillText(`量筒 H=${Math.round(safeDepthMm)} mm`, tube.x + 16, 34);
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

function buildVisionQualityDiagnostics(run) {
  const diagnostics = [];
  const sensitivity = estimateSegmentSensitivity(run, run?.result?.terminal_velocity);
  if (sensitivity?.relative > 0.05) {
    diagnostics.push({
      level: "warn",
      title: "匀速区间选择敏感",
      message: `当前选段内分段速度差约 ${formatPercent(sensitivity.relative)}。建议拍摄完整下落区间，并重新检查匀速段起止位置，避免随意截取一小段造成 vt 偏差。`,
    });
  } else if (sensitivity?.relative !== undefined) {
    diagnostics.push({
      level: "ok",
      title: "匀速区间复核通过",
      message: `当前选段内分段速度差约 ${formatPercent(sensitivity.relative)}，选段变化对 vt 的影响较小。`,
    });
  }

  const confidence = finiteNumber(run?.result?.tracking_confidence);
  if (confidence !== null && confidence < 0.72) {
    diagnostics.push({
      level: "warn",
      title: "追踪置信度偏低",
      message: "建议检查背光、快门速度、焦点锁定和小球平面位置。离焦或曝光漂移会让小球边缘变宽，直接引入中心定位误差。",
    });
  }

  const position = Array.isArray(run?.curves?.position) ? run.curves.position : [];
  const depthMm = finiteNumber(run?.params?.liquid_depth_mm);
  const ys = position.map((point) => finiteNumber(point.y)).filter((value) => value !== null);
  if (ys.length >= 2 && depthMm !== null && depthMm > 0) {
    const coveredMm = (Math.max(...ys) - Math.min(...ys)) * 1000;
    const coverage = coveredMm / depthMm;
    if (coverage < 0.55) {
      diagnostics.push({
        level: "warn",
        title: "下落区间覆盖不足",
        message: `当前追踪区间约 ${coveredMm.toFixed(1)} mm，仅占液体深度的 ${formatPercent(coverage)}。建议尽量观察完整下落过程，用于呈现加速、匀速和末端扰动变化。`,
      });
    }
  }
  return diagnostics;
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
    const data = await api("/api/runs");
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
  renderRecordsSummary(rows);
  el.recordsBody.innerHTML = rows.length
    ? rows.map(renderRecordRow).join("")
    : `<tr><td colspan="8">暂无真实轨迹分析记录</td></tr>`;
  syncRecordSelectionControls();
}

function renderRecordsSummary(rows) {
  if (!el.recordsSummary) return;
  const records = Array.isArray(rows) ? rows : [];
  if (!records.length) {
    el.recordsSummary.innerHTML = `
      <article>
        <span>当前库记录</span>
        <strong>0 条</strong>
      </article>
      <article>
        <span>ID 范围</span>
        <strong>--</strong>
      </article>
      <article>
        <span>录像归档</span>
        <strong>0 条</strong>
      </article>
      <p>当前数据库没有可复盘记录。若你之前测过更多数据，需要确认旧数据库或服务器数据库是否已同步到当前环境。</p>
    `;
    return;
  }
  const ids = records.map((row) => Number(row.id)).filter((id) => Number.isInteger(id));
  const minId = Math.min(...ids);
  const maxId = Math.max(...ids);
  const videoCount = records.filter((row) => row.has_video).length;
  el.recordsSummary.innerHTML = `
    <article>
      <span>当前库记录</span>
      <strong>${records.length} 条</strong>
    </article>
    <article>
      <span>ID 范围</span>
      <strong>${minId}-${maxId}</strong>
    </article>
    <article>
      <span>录像归档</span>
      <strong>${videoCount}/${records.length}</strong>
    </article>
  `;
}

function renderRecordRow(row) {
  const rowId = String(row.id);
  const checked = state.selectedRecordIds.has(rowId) ? "checked" : "";
  const hasStudentMeasurement = row.has_student_measurement === true;
  const velocityCell = hasStudentMeasurement
    ? row.terminal_velocity.toFixed(4)
    : `<span class="record-video-badge">待人工测量</span>`;
  const viscosityCell = hasStudentMeasurement
    ? row.viscosity.toFixed(3)
    : `<span class="record-video-badge">待人工测量</span>`;
  return `
    <tr>
      <td class="select-cell">
        <input class="record-select" type="checkbox" data-record-select="${row.id}" aria-label="选择记录 ${row.id}" ${checked} />
      </td>
      <td>${row.id}</td>
      <td>${escapeHtml(row.created_at.replace("T", " "))}</td>
      <td>${escapeHtml(row.liquid)}</td>
      <td>${velocityCell}</td>
      <td>${viscosityCell}</td>
      <td><span class="record-video-badge ${row.has_video ? "is-ready" : ""}">${row.has_video ? "可回放" : "无录像"}</span></td>
      <td class="record-row-actions">
        <button class="table-action" type="button" data-load-run="${row.id}">
          <img src="${assetMap.buttons.loadRecord}" alt="" />
          <span>载入复盘</span>
        </button>
        <button class="table-action" type="button" data-review-run="${row.id}">
          <img src="${assetMap.buttons.velocityCurve}" alt="" />
          <span>回顾实验</span>
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
  if (el.summarySelectedRecordsBtn) {
    el.summarySelectedRecordsBtn.disabled = selected < 2;
    const label = el.summarySelectedRecordsBtn.querySelector("span");
    if (label) label.textContent = selected >= 2 ? `汇总报告 ${selected}` : "汇总报告";
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
    if (run.video?.url) {
      showRecordedVideo(run);
    } else if (state.source === "video") {
      resetVideoPreview();
      el.videoReadinessLabel.textContent = "无历史录像";
      el.videoReadinessDetail.textContent = "这条记录没有保存摄像机视频，只能回看速度曲线、粘度结果和不确定度。";
    }
    renderRun(run);
    seedReviewAgent(run);
    showToast(`已载入记录 #${id}，可以在右侧继续问复盘问题`);
  } catch (error) {
    showToast(`载入失败：${error.message}`);
  } finally {
    setButtonLoading(activeButton, false);
  }
}

async function reviewRun(id) {
  const activeButton = el.recordsBody.querySelector(`[data-review-run="${id}"]`);
  setButtonLoading(activeButton, true, "打开中");
  try {
    const run = await api(`/api/runs/${id}`);
    state.latest = run;
    if (run.video?.url) {
      setDataSource("video");
      showRecordedVideo(run);
    } else if (state.source === "video") {
      resetVideoPreview();
      el.videoReadinessLabel.textContent = "无历史录像";
      el.videoReadinessDetail.textContent = "这条记录没有保存摄像机视频，可以回顾曲线、实验数据、不确定度和报告。";
    }
    renderRun(run);
    seedReviewAgent(run);
    switchView("workspace");
    showToast(`已打开记录 #${id} 的实验回顾`);
  } catch (error) {
    showToast(`实验回顾打开失败：${error.message}`);
  } finally {
    setButtonLoading(activeButton, false);
  }
}

function seedReviewAgent(run) {
  if (!el.chatLog || !run?.id) return;
  const result = run.result || {};
  const idealEta = idealViscosityFromRun(run);
  const parts = [
    `已载入记录 #${run.id}。`,
    `AI 终端速度 ${formatMeasurement(result.terminal_velocity, "m/s", 4)}，`,
    `理想粘滞系数 ${idealEta === null ? "--" : `${formatPaS(idealEta)} Pa·s`}，`,
    `修正粘滞系数 ${formatMeasurement(result.viscosity, "Pa·s", 4)}，`,
    `Re ${finiteNumber(result.re) === null ? "--" : Number(result.re).toFixed(3)}。`,
    "你可以直接问：为什么结果偏差大、这次匀速段是否可信、应该怎么重做更稳定。"
  ];
  el.chatLog.innerHTML = "";
  addMessage("ai", parts.join(""));
}

async function scoreAndGenerateReport() {
  const run = state.latest;
  if (!run?.id) {
    showToast("请先载入或完成一条实验记录。");
    return;
  }
  const studentV = number(el.studentV);
  const studentEta = number(el.studentEta);
  if (!Number.isFinite(studentV) || !Number.isFinite(studentEta) || studentV <= 0 || studentEta <= 0) {
    showToast("请先输入有效的人工终端速度和人工粘滞系数。");
    return;
  }
  setButtonLoading(el.scoreReportBtn, true, "评分中");
  try {
    const updated = await api(`/api/runs/${run.id}/student`, {
      method: "POST",
      body: JSON.stringify({ student_v: studentV, student_eta: studentEta }),
    });
    state.latest = updated.run;
    renderRun(updated.run);
    await loadRecords();
    showToast(`评分完成：${formatScore(updated.run.student?.score)} 分，评分表已更新。`);
  } catch (error) {
    showToast(`评分失败：${error.message}`);
  } finally {
    setButtonLoading(el.scoreReportBtn, false);
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

async function downloadSelectedSummaryReport() {
  const ids = state.records
    .map((row) => String(row.id))
    .filter((id) => state.selectedRecordIds.has(id));
  if (ids.length < 2) {
    showToast("请至少勾选 2 条实验记录，再生成汇总报告。");
    return;
  }
  setButtonLoading(el.summarySelectedRecordsBtn, true, "生成中");
  try {
    const response = await apiResponse("/api/runs/summary-report", {
      method: "POST",
      body: JSON.stringify({ ids }),
    });
    if (!response.ok) {
      let detail = `${response.status} ${response.statusText}`;
      try {
        const payload = await response.json();
        detail = payload.error || detail;
      } catch {
        detail = await response.text();
      }
      if ([404, 405, 501].includes(response.status)) {
        detail = "当前连接的后端还没有汇总报告接口，请刷新页面并确认使用本地 http://127.0.0.1:8877，或重启/同步云端服务。";
      }
      throw new Error(detail);
    }
    const markdown = await response.text();
    state.summaryReportMarkdown = markdown;
    state.summaryReportIds = ids;
    renderSummaryReportPage();
    switchView("summary-report");
    showToast(`已打开 ${ids.length} 条记录的汇总报告。`);
  } catch (error) {
    showToast(`汇总报告生成失败：${error.message}`);
  } finally {
    setButtonLoading(el.summarySelectedRecordsBtn, false);
    syncRecordSelectionControls();
  }
}

function renderSummaryReportPage() {
  if (!el.summaryReportBody) return;
  const ids = state.summaryReportIds || [];
  const markdown = state.summaryReportMarkdown || "";
  if (el.summaryReportMeta) {
    el.summaryReportMeta.textContent = ids.length
      ? `已汇总 ${ids.length} 条实验记录 · ID ${ids.join("、")}`
      : "尚未生成汇总报告";
  }
  if (el.downloadSummaryReportBtn) {
    el.downloadSummaryReportBtn.disabled = !markdown;
  }
  if (!markdown) {
    el.summaryReportBody.innerHTML = `
      <div class="summary-report-empty">
        <strong>还没有可预览的汇总报告</strong>
        <p>请先返回实验复盘模块，勾选至少 2 条实验记录，再点击“汇总报告”。</p>
      </div>
    `;
    return;
  }
  el.summaryReportBody.innerHTML = markdownReportToHtml(markdown);
}

function downloadCurrentSummaryReport() {
  const markdown = state.summaryReportMarkdown || "";
  if (!markdown) {
    showToast("当前没有可保存的汇总报告。");
    return;
  }
  const ids = state.summaryReportIds || [];
  const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `落球法AI视觉测量多次实验汇总报告_${ids.length || "多"}条.md`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  showToast("汇总报告已保存下载。");
}

function drawChart() {
  const canvas = el.chart;
  const width = canvas.width;
  const height = canvas.height;
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#fbfcfa";
  ctx.fillRect(0, 0, width, height);

  if (!state.latest) {
    ctx.fillStyle = "rgba(106, 114, 109, 0.9)";
    ctx.font = "800 22px system-ui";
    ctx.textAlign = "center";
    ctx.fillText("连接实时画面后显示曲线", width / 2, height / 2);
    return;
  }

  if (shouldLockRunResults(state.latest)) {
    ctx.save();
    ctx.fillStyle = "rgba(106, 114, 109, 0.9)";
    ctx.font = "900 24px system-ui";
    ctx.textAlign = "center";
    ctx.fillText("AI 结果待人工测量后显示", width / 2, height / 2 - 12);
    ctx.font = "700 15px system-ui";
    ctx.fillStyle = "rgba(106, 114, 109, 0.72)";
    ctx.fillText("请先填写人工 vt 和人工 η，再点击评分并生成报告", width / 2, height / 2 + 24);
    ctx.restore();
    return;
  }

  const data = state.latest.curves?.[state.chartMode] || [];
  const pad = { left: 92, right: 34, top: 44, bottom: 72 };
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

  drawScientificAxes({
    width,
    height,
    pad,
    plotW,
    plotH,
    maxT,
    minValue,
    maxValue,
    range,
    yLabel: state.chartMode === "position" ? "y / m" : "v / (m·s⁻¹)",
  });

  if (state.chartMode === "velocity") {
    const phaseSummary = estimateMotionPhases(state.latest);
    const phaseStyles = {
      accelerating: { color: "rgba(197, 128, 39, 0.14)", text: "#8a5a1e" },
      decelerating: { color: "rgba(166, 66, 66, 0.12)", text: "#8d3737" },
      stable: { color: "rgba(50, 122, 102, 0.13)", text: "#235b4c" },
      transition: { color: "rgba(82, 101, 118, 0.10)", text: "#4d6172" },
    };
    if (phaseSummary?.phases?.length) {
      ctx.save();
      phaseSummary.phases.forEach((phase) => {
        const style = phaseStyles[phase.trend] || phaseStyles.transition;
        if (!style) return;
        const startX = x(Math.max(0, Math.min(maxT, phase.startTime)));
        const endX = x(Math.max(0, Math.min(maxT, phase.endTime)));
        const bandWidth = Math.max(0, endX - startX);
        if (bandWidth <= 1) return;
        ctx.fillStyle = style.color;
        ctx.fillRect(startX, pad.top, bandWidth, plotH);
        if (bandWidth > 58) {
          ctx.fillStyle = style.text;
          ctx.font = "900 12px system-ui";
          ctx.textAlign = "center";
          ctx.fillText(phase.label, startX + bandWidth / 2, pad.top + 18);
        }
      });
      ctx.restore();
    } else if (state.latest.segment) {
      const segment = state.latest.segment;
      const startT = data[segment.start]?.t ?? 0;
      const endT = data[segment.end]?.t ?? maxT;
      ctx.fillStyle = "rgba(50, 122, 102, 0.10)";
      ctx.fillRect(x(startT), pad.top, x(endT) - x(startT), plotH);
    }
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
  ctx.font = "900 17px system-ui";
  ctx.textAlign = "left";
  ctx.fillText(state.chartMode === "position" ? "位移-时间曲线" : "速度-时间曲线", pad.left, 26);
  ctx.font = "700 13px ui-monospace, monospace";
  ctx.fillStyle = "rgba(106, 114, 109, 0.92)";
  ctx.textAlign = "right";
  ctx.fillText(`max=${formatAxisNumber(maxValue)}`, width - pad.right, 26);
  ctx.restore();
}

function drawScientificAxes({ width, height, pad, plotW, plotH, maxT, minValue, range, yLabel }) {
  ctx.save();
  ctx.strokeStyle = "rgba(32, 35, 31, 0.18)";
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(pad.left, pad.top);
  ctx.lineTo(pad.left, pad.top + plotH);
  ctx.lineTo(pad.left + plotW, pad.top + plotH);
  ctx.stroke();

  ctx.strokeStyle = "rgba(32, 35, 31, 0.075)";
  ctx.lineWidth = 1;
  ctx.font = "700 12px ui-monospace, monospace";
  ctx.fillStyle = "rgba(67, 78, 72, 0.84)";
  ctx.textBaseline = "middle";
  ctx.textAlign = "center";

  for (let index = 0; index <= 5; index += 1) {
    const ratio = index / 5;
    const x = pad.left + ratio * plotW;
    ctx.beginPath();
    ctx.moveTo(x, pad.top);
    ctx.lineTo(x, pad.top + plotH);
    ctx.stroke();
    ctx.fillText(formatAxisNumber(maxT * ratio), x, pad.top + plotH + 22);
  }

  ctx.textAlign = "right";
  for (let index = 0; index <= 5; index += 1) {
    const ratio = index / 5;
    const y = pad.top + plotH - ratio * plotH;
    const value = minValue + ratio * range;
    ctx.beginPath();
    ctx.moveTo(pad.left, y);
    ctx.lineTo(pad.left + plotW, y);
    ctx.stroke();
    ctx.fillText(formatAxisNumber(value), pad.left - 12, y);
  }

  ctx.fillStyle = "rgba(32, 35, 31, 0.78)";
  ctx.font = "900 14px system-ui";
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.fillText("t / s", pad.left + plotW / 2, height - 22);
  ctx.save();
  ctx.translate(22, pad.top + plotH / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText(yLabel, 0, 0);
  ctx.restore();
  ctx.font = "700 11px system-ui";
  ctx.textAlign = "left";
  ctx.fillStyle = "rgba(106, 114, 109, 0.76)";
  ctx.fillText("SI units", pad.left, height - 22);
  ctx.restore();
}

function formatAxisNumber(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "--";
  const abs = Math.abs(number);
  if (abs > 0 && (abs < 0.001 || abs >= 1000)) return number.toExponential(2);
  if (abs < 0.01) return number.toFixed(4);
  if (abs < 1) return number.toFixed(3);
  if (abs < 10) return number.toFixed(2);
  return number.toFixed(1);
}

function addMessage(type, text) {
  const message = document.createElement("div");
  message.className = `message ${type}`;
  message.textContent = text;
  el.chatLog.appendChild(message);
  el.chatLog.scrollTop = el.chatLog.scrollHeight;
  return message;
}

function reviewAgentContext() {
  const run = state.latest;
  if (!run?.result) {
    return {
      kind: "review",
      loaded: false,
      message: "学生尚未载入实验记录，只能回答通用误差来源和改进建议。",
    };
  }
  const result = run.result || {};
  const params = run.params || {};
  const student = run.student || {};
  const quality = run.quality || {};
  const preprocessing = quality.preprocessing || {};
  const segment = run.segment || {};
  return {
    kind: "review",
    loaded: true,
    id: run.id || null,
    source: run.source || quality.fit_method || "unknown",
    params: {
      liquid: params.liquid,
      temperature_c: params.temperature_c,
      rho_liquid: params.rho_liquid,
      eta_reference: params.eta_reference,
      radius_mm: params.radius_mm,
      rho_ball: params.rho_ball,
      tube_diameter_mm: params.tube_diameter_mm,
      liquid_depth_mm: params.liquid_depth_mm,
    },
    result: {
      terminal_velocity: result.terminal_velocity,
      ideal_viscosity: idealViscosityFromRun(run),
      corrected_viscosity: result.viscosity,
      r2: result.r2,
      re: result.re,
      tracking_confidence: result.tracking_confidence,
      wall_correction: result.wall_correction,
      reynolds_correction: result.reynolds_correction,
    },
    student: {
      terminal_velocity: student.student_v,
      viscosity: student.student_eta,
      velocity_error: student.v_error,
      viscosity_error: student.eta_error,
      viscosity_reference_basis: "ideal_stokes",
      viscosity_reference: idealViscosityFromRun(run),
      score: student.score,
    },
    quality: {
      fit_method: quality.fit_method,
      uniform_segment_cv: quality.uniform_segment_cv,
      segment_start: segment.start,
      segment_end: segment.end,
      outlier_points: preprocessing.outlier_points,
      removed_points: preprocessing.removed_points,
      static_ignore_zones: preprocessing.static_ignore_zones,
    },
    diagnostics: Array.isArray(run.diagnostics)
      ? run.diagnostics.map((item) => ({ level: item.level, title: item.title, message: item.message }))
      : [],
  };
}

function reviewAgentPrompt(question, context) {
  return [
    "你是落球法 AI 实验平台的实验记录复盘问答 agent。",
    "任务：根据学生当前载入的实验数据，回答关于实验数据、误差来源、结果可信度和改进建议的问题。",
    "回答要求：必须结合上下文中的 vt、η_ideal、η_corrected、R²、Re、壁效应、匀速段稳定性、追踪置信度、人工测量偏差或诊断项；不要泛泛而谈。",
    "评分口径：学生人工粘滞系数按理想 Stokes 公式计算，因此评分偏差只和 η_ideal 比较；η_corrected 用于解释壁效应和 Re 修正带来的系统差异。",
    "输出结构：先给一句结论，再说明主要证据，最后给 2-3 条可执行改进建议。",
    "如果没有载入记录，提醒学生先载入实验记录，再给通用建议；如果问题超出当前实验数据，主动说明需要哪些补充数据，不要用固定拒答话术。",
    `学生问题：${question}`,
    `当前实验记录上下文：${JSON.stringify(context, null, 2)}`,
  ].join("\n");
}

async function ask(question, sourceButton = null) {
  if (!question.trim()) return;
  addMessage("user", question);
  const pending = addMessage("ai pending", "正在根据实验讲义与测量规则生成答复...");
  setButtonLoading(sourceButton, true, "生成中");
  try {
    const context = reviewAgentContext();
    const data = await api("/api/assistant/ask", {
      method: "POST",
      body: JSON.stringify({
        question: reviewAgentPrompt(question, context),
        context,
      }),
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
  refreshLiquidReferenceInputs();
}

function refreshLiquidReferenceInputs() {
  const liquidName = el.liquid?.value || "";
  const reference = findStandardViscosityReference(liquidName);
  if (!reference) {
    renderStandardViscosityRange(null);
    updateAccelerationSpanHint();
    return null;
  }
  const temperature = finiteNumber(el.temperatureC?.value);
  if (temperature === null) {
    if (el.rhoLiquid) el.rhoLiquid.value = "";
    if (el.etaReference) el.etaReference.value = "";
    renderStandardViscosityRange(null);
    updateAccelerationSpanHint();
    return null;
  }
  const matched = nearestStandardViscosityPoint(reference, temperature);
  if (!matched) {
    renderStandardViscosityRange(null);
    updateAccelerationSpanHint();
    return null;
  }
  setInputValue(el.rhoLiquid, matched.densityKgM3);
  setInputValue(el.etaReference, matched.viscosityPaS);
  renderStandardViscosityRange(null);
  updateAccelerationSpanHint();
  return matched;
}

function updateAccelerationSpanHint() {
  if (!el.accelerationSpanHint) return;
  const radiusMm = number(el.radiusMm);
  const rhoBall = number(el.rhoBall);
  const rhoLiquid = number(el.rhoLiquid);
  const eta = number(el.etaReference);
  if (![radiusMm, rhoBall, rhoLiquid, eta].every((value) => Number.isFinite(value) && value > 0) || rhoBall <= rhoLiquid) {
    el.accelerationSpanHint.textContent = "--";
    return;
  }
  const radiusM = radiusMm / 1000;
  const vt = (2 * radiusM * radiusM * (rhoBall - rhoLiquid) * 9.80665) / (9 * eta);
  const tau = (2 * rhoBall * radiusM * radiusM) / (9 * eta);
  if (!Number.isFinite(vt) || !Number.isFinite(tau) || vt <= 0 || tau <= 0) {
    el.accelerationSpanHint.textContent = "--";
    return;
  }
  const t95 = -tau * Math.log(0.05);
  const y95Mm = vt * (t95 - 0.95 * tau) * 1000;
  const distanceText = y95Mm < 1 ? `${y95Mm.toFixed(2)} mm` : `${y95Mm.toFixed(1)} mm`;
  const timeText = t95 < 0.1 ? `${(t95 * 1000).toFixed(1)} ms` : `${t95.toFixed(2)} s`;
  el.accelerationSpanHint.textContent = `${distanceText} · ${timeText}`;
}

function clearExperimentInputs() {
  [el.rhoLiquid, el.etaReference, el.radiusMm, el.rhoBall, el.tubeDiameterMm, el.liquidDepthMm, el.temperatureC].forEach((input) => {
    if (input) input.value = "";
  });
  if (el.liquid) el.liquid.value = "";
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
  el.directHallBtn?.addEventListener("click", enterDashboardByTemporaryPass);
  el.quizForm.addEventListener("submit", evaluateQuiz);
  el.quizForm.addEventListener("change", updateExamProgress);
  el.quizQuestionList.addEventListener("click", (event) => {
    const button = event.target.closest("[data-quiz-help]");
    if (!button) return;
    event.preventDefault();
    openQuizQuestionDialog(button.dataset.quizHelp);
  });
  el.quizTutorSummary.addEventListener("click", (event) => {
    const button = event.target.closest("[data-quiz-help]");
    if (!button) return;
    event.preventDefault();
    openQuizQuestionDialog(button.dataset.quizHelp);
  });
  el.enterHallBtn.addEventListener("click", () => switchView("dashboard"));
  el.quizTutorForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const question = el.quizTutorInput.value.trim();
    el.quizTutorInput.value = "";
    askQuizTutor(question, el.quizTutorForm.querySelector("button[type='submit']"));
  });
  el.quizDialogForm?.addEventListener("submit", (event) => {
    event.preventDefault();
    const question = el.quizDialogInput.value.trim();
    el.quizDialogInput.value = "";
    askQuizTutor(question, el.quizDialogForm.querySelector("button[type='submit']"), state.quizDialogQuestion, "dialog");
  });
  el.closeQuizDialogBtn?.addEventListener("click", closeQuizQuestionDialog);
  el.quizQuestionDialog?.addEventListener("click", (event) => {
    if (event.target === el.quizQuestionDialog) closeQuizQuestionDialog();
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
  el.summarySelectedRecordsBtn?.addEventListener("click", downloadSelectedSummaryReport);
  el.deleteSelectedRecordsBtn?.addEventListener("click", deleteSelectedRecords);
  el.downloadSummaryReportBtn?.addEventListener("click", downloadCurrentSummaryReport);
  el.backToDiagnosisFromSummaryBtn?.addEventListener("click", () => switchView("diagnosis"));
  el.scoreReportBtn?.addEventListener("click", scoreAndGenerateReport);
  el.presetBtn.addEventListener("click", () => {
    clearExperimentInputs();
    renderStandardViscosityRange(null, "empty");
    renderUncertainty(null);
    updateAccelerationSpanHint();
    showToast("已清空样本与仪器参数，请重新选择或填写。");
  });
  el.liquid.addEventListener("change", () => applyPreset(el.liquid.value));
  el.temperatureC?.addEventListener("input", () => {
    refreshLiquidReferenceInputs();
    renderUncertainty();
  });
  [el.radiusMm, el.rhoBall, el.rhoLiquid, el.etaReference].forEach((input) => {
    input?.addEventListener("input", updateAccelerationSpanHint);
  });
  el.trajectoryInput.addEventListener("change", updateSelectedFile);
  el.videoPreview.addEventListener("loadedmetadata", handleVideoMetadataLoaded);
  el.videoPreview.addEventListener("canplay", handleVideoMetadataLoaded);
  el.videoPreview.addEventListener("error", () => {
    clearArchivedVideoLoadTimer();
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
  livePreviewFrame()?.addEventListener("wheel", handleLiveZoomWheel, { passive: false });
  document.addEventListener("fullscreenchange", handleFullscreenChange);
  el.calibrationClickLayer?.addEventListener("click", handleCalibrationClick);
  el.calibrationClickLayer?.addEventListener("pointermove", (event) => {
    const rect = el.calibrationClickLayer.getBoundingClientRect();
    const mediaPoint = layerPointToMediaNorm(event, rect);
    if (state.calibrationMode) {
      mediaPoint.xNorm = fallOffsetConfig().centerPct / 100;
    }
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
    const reviewButton = event.target.closest("[data-review-run]");
    if (reviewButton) {
      reviewRun(reviewButton.dataset.reviewRun);
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
  el.runBlindTestBtn?.addEventListener("click", runBlindTest);
  el.resetBlindTestBtn?.addEventListener("click", resetBlindTest);
  el.fillBlindFromRunBtn?.addEventListener("click", fillBlindFromLatestRun);
  document.querySelectorAll("[data-go-view]").forEach((button) => {
    button.addEventListener("click", () => {
      if (button.dataset.newExperiment === "true") {
        resetWorkspaceSession();
      }
      switchView(button.dataset.goView);
    });
  });
  [el.simRelease, el.simRefraction, el.simLighting, el.simRadiusMm, el.simTubeMm, el.simDepthMm].filter(Boolean).forEach((input) => {
    input.addEventListener("input", () => {
      updateSimulationLabels();
      if (!simulationDrop.active) drawSimulationCanvas();
    });
  });
  el.simScenario.addEventListener("change", applySimulationPreset);
  el.simTemperatureC?.addEventListener("input", () => updateSimulationReference());
  el.runSimulationBtn.addEventListener("click", runSimulation);
  document.querySelectorAll("[data-sim-chart]").forEach((button) => {
    button.addEventListener("click", () => {
      state.simulationChartMode = button.dataset.simChart === "velocity" ? "velocity" : "position";
      document.querySelectorAll("[data-sim-chart]").forEach((item) => {
        item.classList.toggle("active", item === button);
      });
      drawSimulationCanvas();
    });
  });
  el.sendSimulationToWorkbenchBtn.addEventListener("click", sendSimulationToWorkbench);
}

async function init() {
  bind();
  renderQuizQuestions();
  updateAccessState();
  applySimulationPreset();
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
