const fs = require("fs");
const path = require("path");
const {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  HeadingLevel,
  LevelFormat,
  Packer,
  PageOrientation,
  PageNumber,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  VerticalAlign,
  WidthType,
} = require("docx");

const TWO_COLUMN = process.argv.includes("--two-column");
const OUT = path.join(
  __dirname,
  "..",
  "outputs",
  TWO_COLUMN
    ? "AI+物理实验研究报告_双栏版_基于AI视觉的落球法液体粘滞系数智能测量系统.docx"
    : "AI+物理实验研究报告_基于AI视觉的落球法液体粘滞系数智能测量系统.docx",
);

const COLORS = {
  ink: "1F231F",
  muted: "56615B",
  green: "2F7664",
  pale: "EAF3EF",
  pale2: "F5F8F6",
  border: "C8D6CF",
};

const border = { style: BorderStyle.SINGLE, size: 1, color: COLORS.border };
const borders = { top: border, bottom: border, left: border, right: border };

function run(text, opts = {}) {
  return new TextRun({
    text: String(text),
    font: "Microsoft YaHei",
    size: opts.size || (TWO_COLUMN ? 20 : 22),
    bold: opts.bold || false,
    italics: opts.italics || false,
    color: opts.color || COLORS.ink,
  });
}

function p(text, opts = {}) {
  return new Paragraph({
    alignment: opts.alignment,
    spacing: { before: opts.before || 0, after: opts.after ?? 120, line: 330 },
    indent: opts.indent,
    children: [run(text, opts)],
  });
}

function h1(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    spacing: { before: TWO_COLUMN ? 220 : 300, after: TWO_COLUMN ? 120 : 160 },
    children: [run(text, { bold: true, size: TWO_COLUMN ? 26 : 30, color: COLORS.green })],
  });
}

function h2(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: TWO_COLUMN ? 160 : 220, after: 100 },
    children: [run(text, { bold: true, size: TWO_COLUMN ? 23 : 26 })],
  });
}

function bullet(text) {
  return new Paragraph({
    numbering: { reference: "bullet", level: 0 },
    spacing: { after: 80, line: 320 },
    children: [run(text)],
  });
}

function numbered(text, reference = "numbered") {
  return new Paragraph({
    numbering: { reference, level: 0 },
    spacing: { after: 80, line: 320 },
    children: [run(text)],
  });
}

function formula(text) {
  return new Paragraph({
    spacing: { before: 80, after: 120 },
    shading: { fill: "F3F7F5", type: ShadingType.CLEAR },
    border: { left: { style: BorderStyle.SINGLE, size: 10, color: COLORS.green } },
    indent: { left: 260 },
    children: [run(text, { bold: true, size: TWO_COLUMN ? 20 : 23 })],
  });
}

function cell(content, width, opts = {}) {
  const children = Array.isArray(content)
    ? content
    : [new Paragraph({
        alignment: opts.align,
        children: [run(content, { bold: opts.bold, size: opts.size || (TWO_COLUMN ? 16 : 20), color: opts.color })],
      })];
  return new TableCell({
    borders,
    width: { size: width, type: WidthType.DXA },
    shading: opts.fill ? { fill: opts.fill, type: ShadingType.CLEAR } : undefined,
    verticalAlign: VerticalAlign.CENTER,
    margins: { top: 80, bottom: 80, left: 100, right: 100 },
    children,
  });
}

function table(headers, rows, widths) {
  const columnWidths = TWO_COLUMN ? normalizeWidths(widths, 6600) : widths;
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    columnWidths,
    rows: [
      new TableRow({
        tableHeader: true,
        children: headers.map((item, index) => cell(item, columnWidths[index], {
          bold: true,
          align: AlignmentType.CENTER,
          fill: COLORS.pale,
          color: COLORS.ink,
        })),
      }),
      ...rows.map((row) => new TableRow({
        children: row.map((item, index) => cell(item, columnWidths[index], { fill: index === 0 ? COLORS.pale2 : undefined })),
      })),
    ],
  });
}

function normalizeWidths(widths, target) {
  const total = widths.reduce((sum, item) => sum + item, 0);
  return widths.map((item) => Math.max(700, Math.round((item / total) * target)));
}

const children = [];

children.push(
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 520, after: 180 },
    children: [run("AI+物理实验研究报告", { bold: true, size: 38, color: COLORS.green })],
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 180 },
    children: [run("基于AI视觉的落球法液体粘滞系数智能测量系统", { bold: true, size: 32 })],
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 520 },
    children: [run("版本日期：2026年7月11日", { size: 22, color: COLORS.muted })],
  }),
  p("合规说明：本文档不含任何单位或个人身份信息；如后续补充PPT、介绍视频或附录图片，也应保持同样的匿名要求。", { alignment: AlignmentType.CENTER, color: COLORS.muted }),
  h1("摘要"),
  p("本项目面向“AI+物理实验”任务，设计并实现一套基于AI视觉的落球法液体粘滞系数智能测量系统。系统围绕经典落球法实验中“轨迹难以完整观察、终端速度选段依赖经验、透明容器折射与壁效应难以解释、人工计时误差较大、实验复盘缺少证据链”等问题，将摄像头采集、OpenCV视觉识别、多点标定棒分段插值、速度曲线拟合、Stokes物理模型、壁效应与雷诺数修正、不确定度估计和实验复盘Agent整合为一个教学实验平台。"),
  p("与传统秒表计时和人工读数相比，本系统不是简单给出最终粘度数值，而是记录并展示小球从入液过渡到稳定平台的全过程，输出位移-时间曲线、速度-时间曲线、终端速度、理想粘滞系数、修正粘滞系数、Re、K壁、KRe、匀速段长度、追踪置信度和不确定度等信息。学生仍需完成讲义学习、准入测试、参数测量、标定点选、人工速度与粘度计算，再与AI结果比较并生成实验报告，从而训练实验设计、数据处理、误差分析和模型适用性判断能力。"),
  p("关键词：AI视觉；落球法；液体粘滞系数；OpenCV；标定棒；终端速度；不确定度；实验教学"),
);

children.push(
  h1("1 研究背景与目标"),
  p("落球法测液体粘滞系数是基础物理实验中常见的力学与流体实验。传统实验通常通过观察小球经过两条刻线的时间差来估算终端速度，再代入Stokes公式计算液体粘滞系数。该方法原理清晰、成本低，但在实际教学中存在明显痛点：小球运动过程短、人工反应时间不可忽略、学生选取匀速段时主观性强、透明量筒内的反光和折射会影响观察、壁效应和雷诺数适用条件容易被忽略，最终导致实验结果只剩一个数字，缺少对物理过程的可视化复盘。"),
  p("本项目目标是将AI技术与落球法实验结合，实现物理现象观察、物理参数测量、实验过程分析与指导。系统重点不在于让AI替代学生完成实验，而在于让AI把不可见或难以记录的过程转化为可讨论、可追溯、可复核的数据证据。"),
  h2("1.1 设计目标"),
  bullet("构建可运行的实验学习平台，包括预习准入、AI实验测量、虚拟仿真、实验记录复盘和报告导出。"),
  bullet("使用摄像头获取小球下落画面，通过OpenCV识别小球中心，自动生成轨迹和速度曲线。"),
  bullet("通过中心标定棒和分段插值建立像素坐标到真实位移的映射，减少透视、畸变和折射造成的局部误差。"),
  bullet("在Stokes理想公式基础上给出壁效应和雷诺数修正，用于解释模型适用条件。"),
  bullet("保留人工测量环节，让学生手动输入速度和粘度，再与AI理想参考值比较，形成训练闭环。"),
);

children.push(
  h1("2 AI技术在本实验中的优势与必要性"),
  p("AI在本实验中的必要性来自三个层面。第一，落球运动是连续过程，传统人工计时只截取两个刻线之间的时间，难以看到加速、稳定和末端扰动的变化；视觉AI可以从视频中逐帧提取轨迹，使物理现象从“瞬间观察”变成“曲线证据”。第二，传统方法对匀速段选择依赖经验，学生很难判断某段速度是否稳定；AI可以用速度离散度、斜率、拟合R²和追踪置信度给出可解释的候选区间。第三，教学复盘需要围绕误差来源展开，AI可以把标定、释放偏斜、反光、异常点、Re条件和壁效应等诊断项组织成可读报告，提升实验指导效率。"),
  table(
    ["AI角色", "具体实现", "相对传统方法的优势"],
    [
      ["现象观察", "摄像头采集小球下落过程，平台实时或准实时显示s-t、v-t曲线。", "完整呈现加速、平台和末端扰动，学生可以观察全过程而非只记录一个时间差。"],
      ["参数测量", "OpenCV识别小球中心，标定棒分段插值换算真实位移，稳健拟合终端速度。", "减少人工反应时间误差，降低反光坏点和漏检点对结果的影响。"],
      ["模型判据", "自动计算Re、2r/D、K壁、KRe、R²和速度离散度。", "把公式适用条件显性化，避免只套公式而忽略物理假设。"],
      ["过程指导", "预习准入、错误解析、实验复盘Agent和报告导出。", "引导学生解释偏差来源，突出实验能力训练而非AI直接给答案。"],
      ["历史复盘", "保存实验记录、视频链接和报告，支持载入旧记录进行比较。", "便于重复实验、横向比较不同液体和不同参数条件。"],
    ],
    [1900, 3600, 3860],
  ),
);

children.push(
  h1("3 实验原理与设计方案"),
  h2("3.1 落球法基本原理"),
  p("小球在液体中下落时受到重力、浮力和粘滞阻力。低雷诺数、无明显湍动且小球达到终端速度时，小球受力平衡。若忽略壁效应和惯性修正，液体粘滞系数可由Stokes理想公式计算："),
  formula("η0 = 2r²(ρs − ρl)g / (9vt)"),
  p("式中，η0为理想公式粘滞系数，r为小球半径，ρs为小球密度，ρl为液体密度，g为重力加速度，vt为终端速度。传统实验的关键难点就是准确获得vt。"),
  h2("3.2 壁效应与雷诺数修正"),
  p("真实实验中量筒半径有限，容器壁会改变液体流动状态。小球半径越大、量筒越窄、液体深度越小，壁效应越明显。系统采用下式作为壁效应修正因子："),
  formula("K壁 = (1 + 2.4r/R)(1 + 3.3r/H)"),
  p("其中R为量筒内半径，H为待测液体深度。雷诺数用于判断Stokes低速粘性流动假设是否合理："),
  formula("Re = ρl · vt · 2r / η"),
  p("当Re处于低雷诺数适用范围时，系统给出二级雷诺数修正因子："),
  formula("KRe = 1 + 3Re/16 − 19Re²/1080"),
  formula("η = η0 / (K壁 · KRe)"),
  p("本系统的评分口径仍以学生按理想公式得到的η0与AI理想参考值比较；修正后的η用于解释实验条件偏离、壁效应和Re条件，不直接替代学生的理想公式训练。"),
  h2("3.3 AI视觉测量链路"),
  numbered("固定手机或摄像头，使量筒竖直，小球下落区域处于画面中央。", "flow"),
  numbered("标注量筒左右边缘，系统生成中心线，用于判断小球是否偏离中心。", "flow"),
  numbered("把标定棒放在量筒中心，输入标定棒长度和刻度间距，按顺序点击刻度点。", "flow"),
  numbered("系统使用多点标定棒建立分段插值映射，将像素纵坐标转换为真实位移。", "flow"),
  numbered("释放小球后，OpenCV逐帧识别小球中心，输出t-y轨迹。", "flow"),
  numbered("平台对轨迹进行预处理、速度估计、匀速段搜索和稳健线性拟合，得到vt。", "flow"),
  numbered("系统计算η0、η、Re、K壁、KRe、不确定度和诊断建议，并生成报告。", "flow"),
);

children.push(
  h1("4 实验装置与系统实现"),
  h2("4.1 实验装置组成"),
  table(
    ["模块", "组成", "作用"],
    [
      ["释放与支撑", "铁架台、横杆、磁吸或夹持释放结构、小钢球。", "保证小球尽量从量筒中心静止释放，减少初速度和偏心下落。"],
      ["液体容器", "透明量筒或透明圆柱容器，记录内径D和液体深度H。", "提供可视化下落空间，便于计算壁效应和Re条件。"],
      ["标定组件", "标定棒，默认可采用300 mm长度、固定刻度间距。", "建立像素到真实位移的映射，支撑分段插值校正。"],
      ["成像组件", "手机或摄像头、三脚架或夹具、背光光源。", "获得稳定清晰的小球轮廓，降低反光、模糊和遮挡。"],
      ["计算平台", "浏览器前端、Python后端、OpenCV视觉模块、数据库记录模块。", "完成追踪、计算、可视化、报告和历史复盘。"],
    ],
    [1900, 3550, 3910],
  ),
  h2("4.2 软件系统架构"),
  p("系统采用浏览器前端与本地/服务器后端协同的结构。前端负责预习准入、参数输入、摄像头画面接入、标定点交互、曲线绘制、结果显示和实验复盘问答；后端负责视频帧解析、OpenCV小球检测、轨迹预处理、终端速度拟合、物理量计算、实验记录保存和报告生成。数据库可使用本机SQLite，也可接入云数据库实现多设备同步。"),
  table(
    ["层级", "主要功能", "实现要点"],
    [
      ["交互层", "首页准入、讲义、测试、AI实验、虚拟仿真、盲测、实验记录。", "把学习流程和实验操作结合，防止学生跳过原理直接看结果。"],
      ["视觉层", "摄像头画面、ROI、量筒边缘、标定点、小球中心识别。", "OpenCV圆形/暗色目标检测，必要时可接入跨帧跟踪。"],
      ["物理计算层", "速度曲线、匀速段、Stokes公式、壁效应、Re修正、不确定度。", "使用稳健拟合和明确物理判据，提高结果可解释性。"],
      ["数据层", "实验记录、录像归档、报告导出、历史复盘。", "保存每次实验的数据链，便于重复测量和结果追溯。"],
      ["智能指导层", "准入题反馈、实验复盘Agent、误差诊断。", "限定回答与本实验相关的问题，围绕误差和改进建议展开。"],
    ],
    [1600, 3500, 4260],
  ),
  h2("4.3 关键算法实现"),
  bullet("小球检测：对视频帧进行灰度化、增强和圆形/暗色目标检测，输出球心像素坐标和置信度。"),
  bullet("标定映射：使用中心标定棒点击点建立分段插值关系Y_real=f(y_pixel)，不要求学生输入折射率、壁厚和相机距离等难测参数。"),
  bullet("轨迹预处理：剔除无效点和明显异常点，对低置信度点降权，减小反光和短时漏检的影响。"),
  bullet("速度估计：由相邻或跨帧位移差计算速度，并使用平滑与稳健统计抑制尖峰。"),
  bullet("匀速段识别：扫描多个候选窗口，综合速度离散度、斜率、窗口长度、位置和置信度选择平台段。"),
  bullet("稳健拟合：对匀速段的y-t曲线进行带权线性拟合，斜率即终端速度vt。"),
  bullet("实验报告：自动汇总参数、曲线指标、评分结果、模型修正和误差来源，供学生复盘。"),
);

children.push(
  h1("5 实验流程与学生能力训练"),
  p("本项目强调“AI辅助实验学习”，因此平台刻意保留人工测量和人工判断环节。学生必须先阅读讲义并通过准入测试，再进入实验大厅；在AI实验中，学生需要自行测量液体深度、量筒内径、小球半径或直径、温度等参数，完成标定棒点选和释放操作，最后输入人工终端速度与人工粘滞系数。平台根据AI结果与人工结果的差异进行评分和复盘。"),
  table(
    ["实验步骤", "学生训练点", "AI辅助点"],
    [
      ["预习与准入", "理解Stokes公式、Re条件、壁效应、标定要求。", "AI助教对错题和实验相关问题进行解释。"],
      ["参数测量", "使用游标卡尺、直尺、温度计等获得实验输入量。", "平台检查单位、参数范围和物理可行性。"],
      ["画面连接", "固定相机，调整背光、曝光和对焦。", "系统提示画面接入状态和OpenCV运行状态。"],
      ["标定", "按标定棒刻度顺序点选，理解像素-长度映射。", "自动计算点数、比例和分段插值映射。"],
      ["落球测量", "静止释放小球，判断是否偏离中心或贴壁。", "自动追踪球心并绘制曲线。"],
      ["数据分析", "人工计算vt和η0，解释偏差来源。", "输出AI参考、修正项、不确定度和复盘报告。"],
    ],
    [1900, 3550, 3910],
  ),
);

children.push(
  h1("6 实验数据测量与分析"),
  h2("6.1 数据记录内容"),
  p("每次有效实验应记录以下数据：液体种类、温度、液体密度、小球半径或直径、小球密度、量筒内径、液体深度、标定棒长度、刻度间距、标定点数、视频帧率、轨迹点数、终端速度、理想粘滞系数、修正粘滞系数、Re、K壁、KRe、匀速段范围、追踪置信度、人工速度、人工粘度和相对偏差。"),
  table(
    ["字段", "含义", "用途"],
    [
      ["vt_AI", "AI由匀速段拟合得到的终端速度。", "作为AI理想公式参考的核心输入。"],
      ["η0_AI", "AI按理想Stokes公式计算的粘滞系数。", "用于与学生人工理想公式结果比较评分。"],
      ["η_corr", "计入K壁和KRe后的修正粘滞系数。", "用于复盘物理模型偏离，不作为学生评分唯一标准。"],
      ["R²、CV", "匀速段拟合优度和速度离散度。", "判断平台段是否稳定。"],
      ["Re、2r/D", "低雷诺数和容器边界判据。", "判断实验条件是否满足Stokes假设。"],
      ["uη、U(k=2)", "标准不确定度和扩展不确定度。", "量化测量可信区间。"],
    ],
    [1800, 3500, 4060],
  ),
  h2("6.2 分析方法"),
  numbered("绘制s-t曲线，检查位移是否随时间单调增加，是否出现跳点和断裂。", "analysis"),
  numbered("绘制v-t曲线，观察小球速度从过渡到稳定的过程，确认平台段是否合理。", "analysis"),
  numbered("对AI选定平台段做线性拟合，得到vt_AI和R²；若R²低或CV高，应复查追踪和选段。", "analysis"),
  numbered("按理想Stokes公式计算η0_AI，同时计算K壁、KRe和η_corr。", "analysis"),
  numbered("学生输入人工vt和η0后，平台计算相对偏差并给出评分。", "analysis"),
  numbered("结合不确定度、Re、壁效应、标定点误差和追踪置信度给出误差分析。", "analysis"),
  h2("6.3 不确定度处理"),
  p("平台的不确定度模块采用相对不确定度传播思想，考虑小球直径、匀速段距离、匀速段时间、量筒内径、液体深度和标定点选误差等项。对于AI视觉引入的附加项，本阶段保留最直接、可解释的鼠标点选标定点误差Δl标定，避免把难以测量的相机内参、玻璃壁厚和折射率强行写成伪精确输入。"),
  formula("uη/η ≈ sqrt[(2Δd/d)² + (Δt/t)² + (Δl/l)² + 修正项相关不确定度 + (Δl标定/l)²]"),
  p("最终报告应给出η ± U的表达，其中U=k·uη，通常取k=2作为扩展不确定度。"),
);

children.push(
  h1("7 性能指标与AI-传统方法对比"),
  p("为避免把调试数据误写成正式实验结论，报告建议以不少于3种液体、每种不少于5次重复测量的数据作为最终性能统计。本系统已经具备记录这些指标的能力，正式提交前可从平台实验记录中导出并替换下表中的“建议验收指标”。"),
  table(
    ["指标", "传统方法", "AI视觉方法", "评价方式"],
    [
      ["效率", "人工读刻线、计时、手算，单次复盘慢。", "一次落球后自动生成轨迹、速度曲线、粘度和报告。", "统计单次实验从释放到得到结果的时间。"],
      ["速度测量", "依赖秒表反应和两刻线选段。", "由全轨迹自动选取稳定平台段并拟合vt。", "比较重复测量的相对标准偏差。"],
      ["过程观察", "只能观察小球经过局部刻线。", "可观察完整s-t和v-t曲线。", "检查是否能识别加速段、平台段和末端扰动。"],
      ["误差诊断", "主要依赖实验者经验。", "自动输出R²、CV、Re、K壁、KRe、追踪置信度和报告。", "对比学生能否解释误差来源。"],
      ["教学效果", "学生容易只关注最终粘度数值。", "学生需要解释曲线、判据和人工-AI差异。", "通过实验报告和问答复盘评价。"],
    ],
    [1500, 2600, 3000, 2260],
  ),
  table(
    ["性能维度", "建议记录指标", "建议验收或讨论方式"],
    [
      ["识别稳定性", "有效轨迹点数、漏检点数、异常点数、平均追踪置信度。", "合格实验应有足够轨迹点，异常点占比应较低；若置信度低，应重拍。"],
      ["拟合质量", "匀速段R²、速度离散度CV、平台段长度。", "R²接近1且CV较低时，终端速度更可信。"],
      ["物理适用性", "Re、2r/D、K壁、KRe。", "Re应尽量小于1，2r/D不宜过大；否则需换小球、更大容器或高粘度液体。"],
      ["重复性", "同一液体多次测量η0和η_corr的均值、标准差、相对标准偏差。", "与传统人工方法的重复性比较。"],
      ["准确性", "与参考粘度表值或标准样品的相对误差。", "注意温度对粘度影响显著，必须记录温度。"],
      ["教学训练效果", "学生人工结果与AI结果偏差、错题情况、复盘回答质量。", "体现AI对实验学习过程的指导作用。"],
    ],
    [1800, 3900, 3660],
  ),
);

children.push(
  h1("8 AI应用局限性与风险控制"),
  bullet("数据质量依赖成像条件。透明容器、气泡、反光、阴影和过曝都会造成误识别，需要背光、固定相机和合理ROI。"),
  bullet("标定点选存在人为误差。虽然分段插值可以吸收局部非线性，但点错刻度会直接影响位移换算。"),
  bullet("AI识别结果并不等于物理真值。若Re过大、壁效应过强或小球贴壁，算法再稳定也不能保证Stokes模型成立。"),
  bullet("模型可解释性需要通过物理指标呈现。系统必须输出Re、K壁、KRe、R²、CV等可解释量，而不是只给最终粘度。"),
  bullet("手机和浏览器兼容性会影响实时性。不同设备的摄像头权限、帧率、曝光控制和性能差异可能导致结果不一致。"),
  bullet("数据需求仍然存在。若要引入深度学习检测模型，需要采集不同液体、光照、容器、小球颜色和背景条件下的数据，并进行标注和验证。"),
);

children.push(
  h1("9 创新点"),
  numbered("把落球法实验从“人工计时+手算”扩展为“视频轨迹+曲线证据+模型判据+报告复盘”的完整学习系统。", "innov"),
  numbered("采用中心标定棒多点点选和分段插值映射，避免要求学生输入难以获得的折射率、玻璃壁厚和相机内参。", "innov"),
  numbered("同时输出理想粘度和修正粘度，区分“学生公式训练”和“物理模型复盘”，避免AI直接替代学习过程。", "innov"),
  numbered("将Re、K壁、KRe、R²、CV、追踪置信度、不确定度等指标可视化，提升实验可解释性。", "innov"),
  numbered("引入预习准入、实验记录、报告导出和复盘Agent，使AI不仅用于测量，也用于过程指导。", "innov"),
  numbered("加入虚拟仿真模块，学生可在实验前调节液体、温度、量筒内径、液体深度和小球半径，理解参数对速度曲线的影响。", "innov"),
);

children.push(
  h1("10 结论与展望"),
  p("本项目围绕落球法测液体粘滞系数实验，完成了AI视觉测量平台、虚拟仿真、实验记录复盘和报告生成等模块的设计与实现。系统将摄像头采集、OpenCV追踪、标定棒分段插值、稳健拟合、Stokes公式、壁效应与雷诺数修正、不确定度估计和AI复盘指导整合到一个实验闭环中。"),
  p("从教学价值看，该系统能够把小球下落过程转化为可视化曲线，把误差来源转化为可讨论指标，把学生的人工测量结果与AI参考结果放在同一报告中比较，从而提升学生对物理模型、实验条件和数据处理的理解。"),
  p("后续工作包括：开展多液体、多温度、多小球半径的重复实验；建立标准样品对照；优化背光装置和释放机构；提高手机实时流接入稳定性；在充分数据基础上尝试YOLO等视觉模型；进一步量化标定误差、对焦误差和不同选段对粘度结果的影响。"),
);

children.push(
  h1("11 上交材料与实物装置说明"),
  h2("11.1 文档、PPT和介绍视频建议结构"),
  table(
    ["材料", "建议内容"],
    [
      ["研究报告", "按本报告结构提交，重点突出AI必要性、实验原理、系统实现、数据分析、性能指标、局限性和创新点。"],
      ["PPT", "建议控制在8-12页：问题背景、系统架构、装置照片、AI流程、公式模型、实验结果、对比指标、创新与展望。"],
      ["介绍视频", "建议3-5分钟：展示装置、标定、实时追踪、曲线输出、人工输入、报告生成和复盘问答。"],
    ],
    [1800, 7560],
  ),
  h2("11.2 实物装置规格"),
  table(
    ["项目", "建议规格"],
    [
      ["整体尺寸", "约长40-60 cm、宽25-40 cm、高60-90 cm，具体取决于铁架台和量筒高度。"],
      ["重量", "约2-5 kg，主要来自铁架台、底座、量筒和夹具。"],
      ["量筒/容器", "透明圆柱容器，建议内径35-60 mm，液体深度200-400 mm。"],
      ["标定棒", "建议长度300 mm，刻度间距可设为10-20 mm；直径不影响轴向标定，但应便于点选。"],
      ["摄像设备", "手机或USB摄像头，建议1080p及以上，尽量支持60 fps；需固定位置。"],
      ["光源", "均匀背光板或LED背光，避免正面强反光。"],
    ],
    [1900, 7460],
  ),
  h2("11.3 成本估算"),
  table(
    ["部件", "估算成本（元）", "说明"],
    [
      ["铁架台与夹具", "80-200", "可使用物理实验室常见器材。"],
      ["透明量筒/圆柱容器", "30-120", "尺寸和材质不同价格差异较大。"],
      ["小钢球与释放组件", "20-100", "磁吸释放结构可自制或简化为夹持释放。"],
      ["标定棒", "10-50", "可用带刻度细杆或自行贴刻度。"],
      ["背光光源", "30-120", "LED灯板或平板背光。"],
      ["摄像头/手机支架", "30-150", "若使用已有手机，可不计入手机成本。"],
      ["软件平台", "0-低成本", "基于浏览器、Python、OpenCV等开源/通用工具。"],
      ["合计", "约200-740", "不含已有电脑和手机。"],
    ],
    [2500, 1800, 5060],
  ),
  h2("11.4 使用条件及配套要求"),
  bullet("需要稳定桌面，避免释放和拍摄时振动。"),
  bullet("需要可控光照，推荐背光成像并避免环境光反射。"),
  bullet("需要电脑运行平台服务，浏览器访问本地或服务器地址。"),
  bullet("若使用手机摄像头，应固定手机并确保浏览器或系统能识别该摄像头。"),
  bullet("实验液体应安全、透明或半透明，避免挥发性强、腐蚀性强或难以清理的液体。"),
  bullet("正式提交的视频、PPT和报告不得出现任何单位或个人身份信息。"),
);

children.push(
  h1("12 参考文献"),
  numbered("Stokes, G. G. On the effect of the internal friction of fluids on the motion of pendulums. Transactions of the Cambridge Philosophical Society, 1851, 9: 8-106.", "refs"),
  numbered("Happel, J., Brenner, H. Low Reynolds Number Hydrodynamics. Springer, 1983.", "refs"),
  numbered("JCGM 100:2008. Evaluation of measurement data - Guide to the expression of uncertainty in measurement.", "refs"),
  numbered("Huber, P. J. Robust Estimation of a Location Parameter. The Annals of Mathematical Statistics, 1964, 35(1): 73-101.", "refs"),
  numbered("Bradski, G. The OpenCV Library. Dr. Dobb's Journal of Software Tools, 2000.", "refs"),
  numbered("OpenCV Documentation. Camera Calibration, Hough Circle Transform and Image Processing Modules.", "refs"),
  numbered("Kalman, R. E. A New Approach to Linear Filtering and Prediction Problems. Journal of Basic Engineering, 1960, 82(1): 35-45.", "refs"),
);

const footer = new Footer({
  children: [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [
        run("第 ", { size: 18, color: COLORS.muted }),
        new TextRun({ children: [PageNumber.CURRENT], size: 18, color: COLORS.muted, font: "Microsoft YaHei" }),
        run(" 页", { size: 18, color: COLORS.muted }),
      ],
    }),
  ],
});

const introChildren = children.slice(0, 8);
const bodyChildren = children.slice(8);
const sections = TWO_COLUMN
  ? [
      {
        properties: {
          page: {
            margin: { top: 1100, right: 1050, bottom: 1100, left: 1050 },
          },
        },
        footers: { default: footer },
        children: introChildren,
      },
      {
        properties: {
          page: {
            size: { orientation: PageOrientation.LANDSCAPE },
            margin: { top: 850, right: 800, bottom: 850, left: 800 },
          },
          column: { count: 2, space: 720, separate: true },
        },
        footers: { default: footer },
        children: bodyChildren,
      },
    ]
  : [
      {
        properties: {
          page: {
            margin: { top: 1200, right: 1100, bottom: 1200, left: 1100 },
          },
        },
        footers: { default: footer },
        children,
      },
    ];

const doc = new Document({
  styles: {
    default: {
      document: { run: { font: "Microsoft YaHei", size: 22, color: COLORS.ink } },
    },
    paragraphStyles: [
      {
        id: "Title",
        name: "Title",
        basedOn: "Normal",
        run: { font: "Microsoft YaHei", size: 38, bold: true, color: COLORS.green },
        paragraph: { alignment: AlignmentType.CENTER, spacing: { before: 240, after: 240 } },
      },
      {
        id: "Heading1",
        name: "Heading 1",
        basedOn: "Normal",
        next: "Normal",
        quickFormat: true,
        run: { font: "Microsoft YaHei", size: 30, bold: true, color: COLORS.green },
        paragraph: { spacing: { before: 300, after: 160 }, outlineLevel: 0 },
      },
      {
        id: "Heading2",
        name: "Heading 2",
        basedOn: "Normal",
        next: "Normal",
        quickFormat: true,
        run: { font: "Microsoft YaHei", size: 26, bold: true, color: COLORS.ink },
        paragraph: { spacing: { before: 220, after: 120 }, outlineLevel: 1 },
      },
    ],
  },
  numbering: {
    config: [
      {
        reference: "bullet",
        levels: [{ level: 0, format: LevelFormat.BULLET, text: "•", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 520, hanging: 260 } } } }],
      },
      ...["numbered", "flow", "analysis", "innov", "refs"].map((reference) => ({
        reference,
        levels: [{ level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 560, hanging: 300 } } } }],
      })),
    ],
  },
  sections,
});

fs.mkdirSync(path.dirname(OUT), { recursive: true });
Packer.toBuffer(doc).then((buffer) => {
  fs.writeFileSync(OUT, buffer);
  console.log(OUT);
});
